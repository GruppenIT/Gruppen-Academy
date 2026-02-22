import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.config import settings
from app.database import get_db

logger = logging.getLogger(__name__)
from app.journeys.schemas import (
    AsyncAnswerSubmit,
    AsyncQuestionOut,
    JourneyCreate,
    JourneyOut,
    JourneyUpdate,
    OCRReviewRequest,
    OCRUploadOut,
    ParticipationCreate,
    ParticipationOut,
    ParticipationStatusOut,
    QuestionCreate,
    QuestionOut,
    QuestionUpdate,
    ResponseCreate,
    ResponseOut,
)
from app.journeys.service import (
    add_question,
    approve_ocr_upload,
    clone_journey,
    complete_participation,
    create_journey,
    create_ocr_upload,
    create_participation,
    delete_question,
    get_journey,
    get_ocr_upload,
    get_participation,
    get_question,
    list_journeys,
    list_ocr_uploads,
    list_questions,
    process_ocr_upload,
    review_ocr_upload,
    submit_response,
    update_journey,
    update_question,
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


# NOTE: /my/available MUST be before /{journey_id} to avoid FastAPI matching "my" as UUID
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
    team_ids_q = select(team_member.c.team_id).where(team_member.c.user_id == current_user.id)

    # Find journey IDs assigned to those teams
    journey_ids_q = select(journey_team.c.journey_id).where(journey_team.c.team_id.in_(team_ids_q))

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


# --- OCR Upload (Sync Journeys) ---
# NOTE: /ocr-uploads MUST be before /{journey_id} to avoid FastAPI matching "ocr-uploads" as UUID


@router.post(
    "/participations/{participation_id}/ocr-upload",
    response_model=OCRUploadOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_ocr_pdf(
    participation_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Upload a scanned PDF for OCR processing."""
    participation = await get_participation(db, participation_id)
    if not participation:
        raise HTTPException(status_code=404, detail="Participação não encontrada")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Apenas arquivos PDF são aceitos")

    # Ensure upload directory exists
    upload_dir = os.path.join(settings.upload_dir, "ocr")
    os.makedirs(upload_dir, exist_ok=True)

    # Read and validate file content
    content = await file.read()

    # Enforce file size limit
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo excede o limite de {settings.max_upload_size_mb}MB",
        )

    # Validate PDF magic bytes (%PDF-)
    if not content[:5].startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Arquivo não é um PDF válido")

    # Save file with UUID name (prevents path traversal)
    file_id = str(uuid.uuid4())
    file_path = os.path.join(upload_dir, f"{file_id}.pdf")
    with open(file_path, "wb") as f:
        f.write(content)

    return await create_ocr_upload(db, participation_id, file_path, file.filename)


@router.get("/ocr-uploads", response_model=list[OCRUploadOut])
async def list_all_ocr_uploads(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """List all OCR uploads for admin review."""
    return await list_ocr_uploads(db, skip, limit)


@router.get("/ocr-uploads/{upload_id}", response_model=OCRUploadOut)
async def get_single_ocr_upload(
    upload_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    upload = await get_ocr_upload(db, upload_id)
    if not upload:
        raise HTTPException(status_code=404, detail="Upload não encontrado")
    return upload


@router.post("/ocr-uploads/{upload_id}/process", response_model=OCRUploadOut)
async def process_single_ocr_upload(
    upload_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Trigger OCR processing on an uploaded PDF."""
    try:
        return await process_ocr_upload(db, upload_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/ocr-uploads/{upload_id}/review", response_model=OCRUploadOut)
async def review_single_ocr_upload(
    upload_id: uuid.UUID,
    data: OCRReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Admin reviews and corrects OCR-extracted text before approval."""
    try:
        return await review_ocr_upload(
            db, upload_id,
            [r.model_dump(mode="json") for r in data.extracted_responses],
            current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/ocr-uploads/{upload_id}/approve", response_model=list[ResponseOut])
async def approve_single_ocr_upload(
    upload_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Approve reviewed OCR text and create QuestionResponses."""
    try:
        return await approve_ocr_upload(db, upload_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)),
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


# --- PDF Generation (Sync Journeys) ---


@router.get("/{journey_id}/print-pdf")
async def print_journey_pdf(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Generate a printable PDF for a sync journey, with pages repeated per user."""
    from app.journeys.pdf import generate_journey_pdf

    try:
        pdf_bytes = await generate_journey_pdf(db, journey_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Erro ao gerar PDF: %s", e)
        raise HTTPException(status_code=500, detail="Erro interno ao gerar PDF.")

    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="jornada-{journey_id}.pdf"'},
    )


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


@router.patch("/{journey_id}/questions/{question_id}", response_model=QuestionOut)
async def update_journey_question(
    journey_id: uuid.UUID,
    question_id: uuid.UUID,
    data: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    question = await get_question(db, question_id)
    if not question or question.journey_id != journey_id:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada nesta jornada")
    return await update_question(db, question, data)


@router.delete("/{journey_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_journey_question(
    journey_id: uuid.UUID,
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    question = await get_question(db, question_id)
    if not question or question.journey_id != journey_id:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada nesta jornada")
    await delete_question(db, question)


# --- Journey Clone ---


@router.post("/{journey_id}/clone", response_model=JourneyOut, status_code=status.HTTP_201_CREATED)
async def clone_existing_journey(
    journey_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Clone a journey with all its questions."""
    try:
        return await clone_journey(db, journey_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


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
    current_user: User = Depends(get_current_user),
):
    participation = await get_participation(db, participation_id)
    if not participation:
        raise HTTPException(status_code=404, detail="Participação não encontrada")
    if participation.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão para esta participação")
    return await submit_response(db, participation_id, data)


# --- Async Journey Flow (professional) ---


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
        time_spent_seconds=data.time_spent_seconds,
    )
    db.add(response)

    # Advance to next question
    answered_count = len(answered_question_ids) + 1
    if answered_count >= len(questions):
        # All questions answered - mark complete
        participation.completed_at = datetime.now(tz.utc)
        participation.current_question_order = current_order

        # Auto-award points for journey completion
        from app.gamification.models import Score
        score = Score(
            user_id=current_user.id,
            points=50,  # base points for completing a journey
            source="journey_completion",
            source_id=journey_id,
            description=f"Completou jornada: {journey.title}",
        )
        db.add(score)
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
