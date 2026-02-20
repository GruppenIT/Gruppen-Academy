import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Competency, Product
from app.journeys.models import Journey, JourneyParticipation, Question, QuestionResponse
from app.journeys.schemas import (
    JourneyCreate,
    JourneyUpdate,
    ParticipationCreate,
    QuestionCreate,
    ResponseCreate,
)


# --- Journey ---
async def create_journey(db: AsyncSession, data: JourneyCreate, created_by: uuid.UUID) -> Journey:
    journey = Journey(
        title=data.title,
        description=data.description,
        domain=data.domain,
        session_duration_minutes=data.session_duration_minutes,
        participant_level=data.participant_level,
        created_by=created_by,
    )
    if data.product_ids:
        result = await db.execute(select(Product).where(Product.id.in_(data.product_ids)))
        journey.products = list(result.scalars().all())
    if data.competency_ids:
        result = await db.execute(select(Competency).where(Competency.id.in_(data.competency_ids)))
        journey.competencies = list(result.scalars().all())
    db.add(journey)
    await db.commit()
    await db.refresh(journey)
    return journey


async def get_journey(db: AsyncSession, journey_id: uuid.UUID) -> Journey | None:
    result = await db.execute(
        select(Journey)
        .where(Journey.id == journey_id)
        .options(selectinload(Journey.questions), selectinload(Journey.products))
    )
    return result.scalar_one_or_none()


async def list_journeys(
    db: AsyncSession, skip: int = 0, limit: int = 50, domain: str | None = None
) -> list[Journey]:
    query = select(Journey)
    if domain:
        query = query.where(Journey.domain == domain)
    result = await db.execute(query.order_by(Journey.created_at.desc()).offset(skip).limit(limit))
    return list(result.scalars().all())


async def update_journey(db: AsyncSession, journey: Journey, data: JourneyUpdate) -> Journey:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(journey, field, value)
    await db.commit()
    await db.refresh(journey)
    return journey


# --- Question ---
async def add_question(db: AsyncSession, journey_id: uuid.UUID, data: QuestionCreate) -> Question:
    question = Question(
        journey_id=journey_id,
        text=data.text,
        type=data.type,
        weight=data.weight,
        rubric=data.rubric,
        expected_lines=data.expected_lines,
        order=data.order,
    )
    if data.competency_ids:
        result = await db.execute(
            select(Competency).where(Competency.id.in_(data.competency_ids))
        )
        question.competencies = list(result.scalars().all())
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


async def list_questions(db: AsyncSession, journey_id: uuid.UUID) -> list[Question]:
    result = await db.execute(
        select(Question).where(Question.journey_id == journey_id).order_by(Question.order)
    )
    return list(result.scalars().all())


# --- Participation ---
async def create_participation(db: AsyncSession, data: ParticipationCreate) -> JourneyParticipation:
    participation = JourneyParticipation(journey_id=data.journey_id, user_id=data.user_id)
    db.add(participation)
    await db.commit()
    await db.refresh(participation)
    return participation


async def get_participation(
    db: AsyncSession, participation_id: uuid.UUID
) -> JourneyParticipation | None:
    result = await db.execute(
        select(JourneyParticipation)
        .where(JourneyParticipation.id == participation_id)
        .options(selectinload(JourneyParticipation.responses))
    )
    return result.scalar_one_or_none()


async def complete_participation(
    db: AsyncSession, participation: JourneyParticipation
) -> JourneyParticipation:
    participation.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(participation)
    return participation


# --- Response ---
async def submit_response(
    db: AsyncSession, participation_id: uuid.UUID, data: ResponseCreate
) -> QuestionResponse:
    response = QuestionResponse(
        participation_id=participation_id,
        question_id=data.question_id,
        answer_text=data.answer_text,
        ocr_source=data.ocr_source,
    )
    db.add(response)
    await db.commit()
    await db.refresh(response)
    return response
