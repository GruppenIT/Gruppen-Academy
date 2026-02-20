import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.journeys.schemas import (
    JourneyCreate,
    JourneyOut,
    JourneyUpdate,
    ParticipationCreate,
    ParticipationOut,
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
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await list_journeys(db, skip, limit)


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
