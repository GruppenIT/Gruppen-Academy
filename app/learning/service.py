import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Competency
from app.learning.models import LearningActivity, LearningPath, TutorSession
from app.learning.schemas import LearningActivityCreate, LearningPathCreate, TutorSessionCreate
from app.llm.client import tutor_chat
from app.llm.prompts import TUTOR_SYSTEM_PROMPT


# --- Learning Path ---
async def create_learning_path(db: AsyncSession, data: LearningPathCreate) -> LearningPath:
    path = LearningPath(
        title=data.title,
        description=data.description,
        domain=data.domain,
        target_role=data.target_role,
    )
    if data.competency_ids:
        result = await db.execute(
            select(Competency).where(Competency.id.in_(data.competency_ids))
        )
        path.competencies = list(result.scalars().all())
    db.add(path)
    await db.commit()
    await db.refresh(path)
    return path


async def list_learning_paths(
    db: AsyncSession, domain: str | None = None, skip: int = 0, limit: int = 50
) -> list[LearningPath]:
    query = select(LearningPath).where(LearningPath.is_active)
    if domain:
        query = query.where(LearningPath.domain == domain)
    result = await db.execute(query.offset(skip).limit(limit))
    return list(result.scalars().all())


async def get_learning_path(db: AsyncSession, path_id: uuid.UUID) -> LearningPath | None:
    result = await db.execute(
        select(LearningPath)
        .where(LearningPath.id == path_id)
        .options(selectinload(LearningPath.activities))
    )
    return result.scalar_one_or_none()


# --- Learning Activity ---
async def add_activity(
    db: AsyncSession, path_id: uuid.UUID, data: LearningActivityCreate
) -> LearningActivity:
    activity = LearningActivity(path_id=path_id, **data.model_dump())
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


async def list_activities(db: AsyncSession, path_id: uuid.UUID) -> list[LearningActivity]:
    result = await db.execute(
        select(LearningActivity)
        .where(LearningActivity.path_id == path_id)
        .order_by(LearningActivity.order)
    )
    return list(result.scalars().all())


# --- Tutor Session ---
async def create_tutor_session(
    db: AsyncSession, user_id: uuid.UUID, data: TutorSessionCreate
) -> TutorSession:
    session = TutorSession(user_id=user_id, topic=data.topic, activity_id=data.activity_id, messages=[])
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_tutor_session(db: AsyncSession, session_id: uuid.UUID) -> TutorSession | None:
    result = await db.execute(select(TutorSession).where(TutorSession.id == session_id))
    return result.scalar_one_or_none()


async def send_tutor_message(
    db: AsyncSession, session: TutorSession, user_message: str
) -> TutorSession:
    messages = list(session.messages)
    messages.append({"role": "user", "content": user_message})

    system_context = f"{TUTOR_SYSTEM_PROMPT}\n\nTópico da sessão: {session.topic}"

    api_messages = [{"role": m["role"], "content": m["content"]} for m in messages]
    assistant_reply = await tutor_chat(messages=api_messages, system_context=system_context)

    messages.append({"role": "assistant", "content": assistant_reply})
    session.messages = messages
    await db.commit()
    await db.refresh(session)
    return session
