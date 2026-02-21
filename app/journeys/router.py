import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.journeys.schemas import (
    AsyncAnswerSubmit,
    AsyncQuestionOut,
    JourneyCreate,
    JourneyOut,
    JourneyUpdate,
    ParticipationCreate,
    ParticipationOut,
    ParticipationStatusOut,
    QuestionCreate,
    QuestionOut,
    ResponseCreate,
    ResponseOut,
)
from app.journeys.service import (
    add_question,
    complete_participation,
    create_journey,
    create_participation,
    get_journey,
    get_participation,
    list_journeys,
    list_questions,
    submit_response,
    update_journey,
)
from app.teams.service import get_team
from app.users.models import User, UserRole

router = APIRouter()


# --- Journey CRUD ---


@router.post("", response_model=JourneyOut, status_code=status.HTTP_201_CREATED)
async def create_new_journey(
    data: JourneyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await create_journey(db, data, current_user.id)


@router.get("", response_model=list[JourneyOut])
async def list_all_journeys(
    skip: int = 0,
    limit: int = 50,
    domain: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await list_journeys(db, skip, limit, domain=domain)


@router.get("/{journey_id}", response_model=JourneyOut)
async def get_single_journey(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    journey = await get_journey(db, journey_id)
    if not journey:
        raise HTTPException(status_code=404, detail="Jornada não encontrada")
    return journey


@router.patch("/{journey_id}", response_model=JourneyOut)
async def update_existing_journey(
    journey_id: uuid.UUID,
    data: JourneyUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    journey = await get_journey(db, journey_id)
    if not journey:
        raise HTTPException(status_code=404, detail="Jornada não encontrada")
    return await update_journey(db, journey, data)


# --- Team Assignment ---


@router.put("/{journey_id}/teams", response_model=list[str])
async def assign_teams_to_journey(
    journey_id: uuid.UUID,
    team_ids: list[uuid.UUID],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Replace the set of teams assigned to this journey."""
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from app.journeys.models import Journey
    from app.teams.models import Team

    result = await db.execute(
        select(Journey).where(Journey.id == journey_id).options(selectinload(Journey.teams))
    )
    journey = result.scalar_one_or_none()
    if not journey:
        raise HTTPException(status_code=404, detail="Jornada não encontrada")

    teams_result = await db.execute(select(Team).where(Team.id.in_(team_ids)))
    journey.teams = list(teams_result.scalars().all())
    await db.commit()
    return [str(t.id) for t in journey.teams]


@router.get("/{journey_id}/teams")
async def list_journey_teams(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List teams assigned to this journey."""
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from app.journeys.models import Journey

    result = await db.execute(
        select(Journey).where(Journey.id == journey_id).options(selectinload(Journey.teams))
    )
    journey = result.scalar_one_or_none()
    if not journey:
        raise HTTPException(status_code=404, detail="Jornada não encontrada")
    return [{"id": str(t.id), "name": t.name} for t in journey.teams]


# --- Questions ---


@router.post("/{journey_id}/questions", response_model=QuestionOut, status_code=status.HTTP_201_CREATED)
async def add_question_to_journey(
    journey_id: uuid.UUID,
    data: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    journey = await get_journey(db, journey_id)
    if not journey:
        raise HTTPException(status_code=404, detail="Jornada não encontrada")
    return await add_question(db, journey_id, data)


@router.get("/{journey_id}/questions", response_model=list[QuestionOut])
async def list_journey_questions(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await list_questions(db, journey_id)


# --- Participations ---


@router.post("/participations", response_model=ParticipationOut, status_code=status.HTTP_201_CREATED)
async def create_new_participation(
    data: ParticipationCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)),
):
    return await create_participation(db, data)


@router.post("/participations/{participation_id}/complete", response_model=ParticipationOut)
async def mark_participation_complete(
    participation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)),
):
    participation = await get_participation(db, participation_id)
    if not participation:
        raise HTTPException(status_code=404, detail="Participação não encontrada")
    return await complete_participation(db, participation)


# --- Responses ---


@router.post(
    "/participations/{participation_id}/responses",
    response_model=ResponseOut,
    status_code=status.HTTP_201_CREATED,
)
async def submit_question_response(
    participation_id: uuid.UUID,
    data: ResponseCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    participation = await get_participation(db, participation_id)
    if not participation:
        raise HTTPException(status_code=404, detail="Participação não encontrada")
    return await submit_response(db, participation_id, data)


# --- Async Journey Flow (professional) ---


@router.get("/my/available", response_model=list[JourneyOut])
async def list_my_available_journeys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List async published journeys assigned to teams the current user belongs to."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.journeys.models import Journey, JourneyMode, JourneyStatus
    from app.teams.models import team_member, journey_team

    # Find team IDs for this user
    from sqlalchemy import select as sa_select
    team_ids_q = sa_select(team_member.c.team_id).where(team_member.c.user_id == current_user.id)

    # Find journey IDs assigned to those teams
    journey_ids_q = sa_select(journey_team.c.journey_id).where(journey_team.c.team_id.in_(team_ids_q))

    result = await db.execute(
        select(Journey)
        .where(
            Journey.id.in_(journey_ids_q),
            Journey.status == JourneyStatus.PUBLISHED,
            Journey.mode == JourneyMode.ASYNC,
        )
        .order_by(Journey.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{journey_id}/start", response_model=ParticipationStatusOut)
async def start_async_journey(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start (or resume) an async journey. Creates participation if needed."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.journeys.models import Journey, JourneyMode, JourneyStatus, JourneyParticipation

    journey = await get_journey(db, journey_id)
    if not journey:
        raise HTTPException(status_code=404, detail="Jornada não encontrada")
    if journey.status != JourneyStatus.PUBLISHED:
        raise HTTPException(status_code=400, detail="Jornada não está publicada")
    if journey.mode != JourneyMode.ASYNC:
        raise HTTPException(status_code=400, detail="Esta jornada é presencial")

    # Check existing participation
    result = await db.execute(
        select(JourneyParticipation)
        .where(JourneyParticipation.journey_id == journey_id, JourneyParticipation.user_id == current_user.id)
        .options(selectinload(JourneyParticipation.responses))
    )
    participation = result.scalar_one_or_none()

    if not participation:
        participation = JourneyParticipation(journey_id=journey_id, user_id=current_user.id)
        db.add(participation)
        await db.commit()
        await db.refresh(participation)

    questions = await list_questions(db, journey_id)
    answered = len(participation.responses) if participation.responses else 0

    return ParticipationStatusOut(
        participation_id=participation.id,
        journey_id=journey_id,
        journey_title=journey.title,
        mode=journey.mode.value,
        total_questions=len(questions),
        answered_questions=answered,
        current_question_order=participation.current_question_order,
        completed=participation.completed_at is not None,
        started_at=participation.started_at,
    )


@router.get("/{journey_id}/current-question", response_model=AsyncQuestionOut)
async def get_current_question(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current (next unanswered) question for this async journey."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.journeys.models import JourneyParticipation

    result = await db.execute(
        select(JourneyParticipation)
        .where(JourneyParticipation.journey_id == journey_id, JourneyParticipation.user_id == current_user.id)
        .options(selectinload(JourneyParticipation.responses))
    )
    participation = result.scalar_one_or_none()
    if not participation:
        raise HTTPException(status_code=404, detail="Participação não encontrada. Inicie a jornada primeiro.")
    if participation.completed_at:
        raise HTTPException(status_code=400, detail="Jornada já concluída")

    questions = await list_questions(db, journey_id)
    if not questions:
        raise HTTPException(status_code=400, detail="Jornada sem perguntas")

    answered_question_ids = {r.question_id for r in (participation.responses or [])}
    current_order = participation.current_question_order

    # Find the question at current_order
    question = None
    for q in questions:
        if q.order == current_order:
            question = q
            break

    if question is None:
        # Fallback: find first unanswered
        for q in questions:
            if q.id not in answered_question_ids:
                question = q
                break

    if question is None:
        raise HTTPException(status_code=400, detail="Todas as perguntas foram respondidas")

    return AsyncQuestionOut(
        question_id=question.id,
        text=question.text,
        type=question.type,
        order=question.order,
        max_time_seconds=question.max_time_seconds,
        expected_lines=question.expected_lines,
        total_questions=len(questions),
        current_number=current_order,
        already_answered=question.id in answered_question_ids,
    )


@router.post("/{journey_id}/answer", response_model=ParticipationStatusOut)
async def submit_async_answer(
    journey_id: uuid.UUID,
    data: AsyncAnswerSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit answer for the current question and advance to the next."""
    from datetime import datetime, timezone as tz
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.journeys.models import JourneyParticipation, QuestionResponse

    journey = await get_journey(db, journey_id)
    if not journey:
        raise HTTPException(status_code=404, detail="Jornada não encontrada")

    result = await db.execute(
        select(JourneyParticipation)
        .where(JourneyParticipation.journey_id == journey_id, JourneyParticipation.user_id == current_user.id)
        .options(selectinload(JourneyParticipation.responses))
    )
    participation = result.scalar_one_or_none()
    if not participation:
        raise HTTPException(status_code=404, detail="Participação não encontrada")
    if participation.completed_at:
        raise HTTPException(status_code=400, detail="Jornada já concluída")

    questions = await list_questions(db, journey_id)
    current_order = participation.current_question_order

    # Find the current question
    question = None
    for q in questions:
        if q.order == current_order:
            question = q
            break
    if question is None:
        raise HTTPException(status_code=400, detail="Pergunta atual não encontrada")

    # Check if already answered
    answered_question_ids = {r.question_id for r in (participation.responses or [])}
    if question.id in answered_question_ids:
        raise HTTPException(status_code=400, detail="Pergunta já respondida")

    # Save response
    response = QuestionResponse(
        participation_id=participation.id,
        question_id=question.id,
        answer_text=data.answer_text,
        ocr_source=False,
    )
    db.add(response)

    # Advance to next question
    answered_count = len(answered_question_ids) + 1
    if answered_count >= len(questions):
        # All questions answered - mark complete
        participation.completed_at = datetime.now(tz.utc)
        participation.current_question_order = current_order
    else:
        # Find next unanswered question order
        for q in questions:
            if q.order > current_order and q.id not in answered_question_ids:
                participation.current_question_order = q.order
                break

    await db.commit()

    return ParticipationStatusOut(
        participation_id=participation.id,
        journey_id=journey_id,
        journey_title=journey.title,
        mode=journey.mode.value,
        total_questions=len(questions),
        answered_questions=answered_count,
        current_question_order=participation.current_question_order,
        completed=participation.completed_at is not None,
        started_at=participation.started_at,
    )
