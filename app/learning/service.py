import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Competency
from app.learning.models import ActivityCompletion, LearningActivity, LearningPath, TutorSession
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


# --- Activity Completion ---
async def complete_activity(
    db: AsyncSession, user_id: uuid.UUID, activity_id: uuid.UUID
) -> ActivityCompletion:
    """Mark an activity as completed for a user. Idempotent."""
    # Check if already completed
    existing = await db.execute(
        select(ActivityCompletion).where(
            ActivityCompletion.user_id == user_id,
            ActivityCompletion.activity_id == activity_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Atividade já concluída")

    # Verify activity exists
    activity_result = await db.execute(
        select(LearningActivity).where(LearningActivity.id == activity_id)
    )
    activity = activity_result.scalar_one_or_none()
    if not activity:
        raise ValueError("Atividade não encontrada")

    completion = ActivityCompletion(user_id=user_id, activity_id=activity_id)
    db.add(completion)

    # Auto-award points
    from app.gamification.models import Score
    score = Score(
        user_id=user_id,
        points=activity.points_reward,
        source="activity_completion",
        source_id=activity_id,
        description=f"Completou atividade: {activity.title}",
    )
    db.add(score)

    await db.commit()
    await db.refresh(completion)
    return completion


async def get_path_progress(
    db: AsyncSession, user_id: uuid.UUID, path_id: uuid.UUID
) -> dict:
    """Calculate user's progress on a learning path."""
    # Get all activities in path
    activities_result = await db.execute(
        select(LearningActivity)
        .where(LearningActivity.path_id == path_id)
        .order_by(LearningActivity.order)
    )
    activities = list(activities_result.scalars().all())
    total = len(activities)

    if total == 0:
        return {"total_activities": 0, "completed_activities": 0, "progress_percent": 0, "activities": []}

    # Get completions for this user
    activity_ids = [a.id for a in activities]
    completions_result = await db.execute(
        select(ActivityCompletion.activity_id).where(
            ActivityCompletion.user_id == user_id,
            ActivityCompletion.activity_id.in_(activity_ids),
        )
    )
    completed_ids = {row[0] for row in completions_result.all()}

    activities_data = []
    for a in activities:
        activities_data.append({
            "activity_id": a.id,
            "title": a.title,
            "description": a.description,
            "type": a.type.value,
            "order": a.order,
            "points_reward": a.points_reward,
            "completed": a.id in completed_ids,
        })

    completed_count = len(completed_ids)
    progress_percent = round((completed_count / total) * 100) if total > 0 else 0

    return {
        "total_activities": total,
        "completed_activities": completed_count,
        "progress_percent": progress_percent,
        "activities": activities_data,
    }


async def list_tutor_sessions(
    db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 20
) -> list[TutorSession]:
    """List tutor sessions for a user."""
    result = await db.execute(
        select(TutorSession)
        .where(TutorSession.user_id == user_id)
        .order_by(TutorSession.updated_at.desc())
        .offset(skip)
        .limit(limit)
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

    # Build rich context for the tutor
    system_context = await _build_tutor_context(db, session)

    api_messages = [{"role": m["role"], "content": m["content"]} for m in messages]
    assistant_reply = await tutor_chat(messages=api_messages, system_context=system_context)

    messages.append({"role": "assistant", "content": assistant_reply})
    session.messages = messages

    # Award points for tutor usage (every 5 user messages = 5 pts)
    user_msg_count = sum(1 for m in messages if m["role"] == "user")
    if user_msg_count > 0 and user_msg_count % 5 == 0:
        from app.gamification.models import Score
        score = Score(
            user_id=session.user_id,
            points=5,
            source="tutor_usage",
            source_id=session.id,
            description=f"Prática no tutor IA: {session.topic}",
        )
        db.add(score)

    await db.commit()
    await db.refresh(session)
    return session


async def generate_session_summary(
    db: AsyncSession, session: TutorSession
) -> TutorSession:
    """Generate a post-session summary for a tutor session."""
    if not session.messages:
        return session

    from app.llm.client import generate_tutor_summary

    user_messages = [m for m in session.messages if m["role"] == "user"]
    if len(user_messages) < 2:
        return session

    summary = await generate_tutor_summary(session.messages, session.topic)
    session.summary = summary

    # Award completion points for substantial sessions (5+ user messages)
    if len(user_messages) >= 5:
        from app.gamification.models import Score
        existing = await db.execute(
            select(Score).where(
                Score.user_id == session.user_id,
                Score.source == "tutor_session_complete",
                Score.source_id == session.id,
            )
        )
        if not existing.scalar_one_or_none():
            score = Score(
                user_id=session.user_id,
                points=15,
                source="tutor_session_complete",
                source_id=session.id,
                description=f"Sessão de tutor concluída: {session.topic}",
            )
            db.add(score)

    await db.commit()
    await db.refresh(session)
    return session


async def _build_tutor_context(db: AsyncSession, session: TutorSession) -> str:
    """Build rich context for the tutor including user profile, gaps, and guidelines."""
    context_parts = [TUTOR_SYSTEM_PROMPT]
    context_parts.append(f"\nTópico da sessão: {session.topic}")

    # Fetch user profile
    from app.users.models import User
    user_result = await db.execute(select(User).where(User.id == session.user_id))
    user = user_result.scalar_one_or_none()
    if user:
        context_parts.append(f"\nPerfil do profissional: {user.full_name}, departamento: {user.department or 'não informado'}")

    # Fetch recent evaluation gaps if available
    try:
        from app.evaluations.models import ResponseEvaluation
        from app.journeys.models import JourneyParticipation, QuestionResponse
        evals_result = await db.execute(
            select(ResponseEvaluation)
            .join(QuestionResponse, ResponseEvaluation.response_id == QuestionResponse.id)
            .join(JourneyParticipation, QuestionResponse.participation_id == JourneyParticipation.id)
            .where(JourneyParticipation.user_id == session.user_id)
            .order_by(ResponseEvaluation.created_at.desc())
            .limit(5)
        )
        recent_evals = list(evals_result.scalars().all())
        if recent_evals:
            recommendations = []
            for ev in recent_evals:
                if ev.recommendations:
                    recommendations.extend(ev.recommendations[:2])
            if recommendations:
                context_parts.append(
                    f"\nÁreas de melhoria identificadas em avaliações recentes:\n- "
                    + "\n- ".join(recommendations[:6])
                )
    except Exception:
        pass  # Graceful fallback if evaluation tables not accessible

    # Fetch relevant guidelines
    try:
        from app.catalog.models import MasterGuideline
        guidelines_result = await db.execute(
            select(MasterGuideline).where(MasterGuideline.is_corporate == True).limit(3)
        )
        guidelines = list(guidelines_result.scalars().all())
        if guidelines:
            guidelines_text = "; ".join(f"{g.title}: {g.content[:200]}" for g in guidelines)
            context_parts.append(f"\nOrientações corporativas relevantes: {guidelines_text}")
    except Exception:
        pass

    return "\n".join(context_parts)
