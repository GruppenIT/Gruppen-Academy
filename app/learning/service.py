import uuid

from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Competency
from app.learning.models import (
    ActivityCompletion,
    LearningActivity,
    LearningPath,
    LearningPathItem,
    PathItemType,
    TutorSession,
    learning_path_badge,
    learning_path_team,
    path_competency,
)
from app.learning.schemas import (
    LearningActivityCreate,
    LearningActivityUpdate,
    LearningPathCreate,
    LearningPathUpdate,
    PathItemCreate,
    TutorSessionCreate,
)
from app.llm.client import tutor_chat
from app.llm.prompts import TUTOR_SYSTEM_PROMPT


# --- Learning Path ---
async def create_learning_path(
    db: AsyncSession, data: LearningPathCreate, created_by: uuid.UUID | None = None
) -> LearningPath:
    path = LearningPath(
        title=data.title,
        description=data.description,
        domain=data.domain,
        target_role=data.target_role,
        created_by=created_by,
    )
    if data.competency_ids:
        result = await db.execute(
            select(Competency).where(Competency.id.in_(data.competency_ids))
        )
        path.competencies = list(result.scalars().all())
    db.add(path)
    await db.commit()
    # Re-query with eager loading so items/badges are available for serialization
    return await get_learning_path(db, path.id)  # type: ignore[return-value]


async def list_learning_paths(
    db: AsyncSession,
    domain: str | None = None,
    skip: int = 0,
    limit: int = 50,
    active_only: bool = True,
) -> list[LearningPath]:
    query = select(LearningPath).options(
        selectinload(LearningPath.items),
        selectinload(LearningPath.badges),
        selectinload(LearningPath.teams),
    )
    if active_only:
        query = query.where(LearningPath.is_active)
    if domain:
        query = query.where(LearningPath.domain == domain)
    result = await db.execute(query.offset(skip).limit(limit))
    return list(result.scalars().unique().all())


async def get_learning_path(db: AsyncSession, path_id: uuid.UUID) -> LearningPath | None:
    result = await db.execute(
        select(LearningPath)
        .where(LearningPath.id == path_id)
        .options(
            selectinload(LearningPath.activities),
            selectinload(LearningPath.items),
            selectinload(LearningPath.badges),
            selectinload(LearningPath.teams),
        )
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


# --- Learning Path Update/Delete ---
async def update_learning_path(
    db: AsyncSession, path: LearningPath, data: LearningPathUpdate
) -> LearningPath:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(path, field, value)
    await db.commit()
    # Re-query with eager loading so items/badges are available for serialization
    return await get_learning_path(db, path.id)  # type: ignore[return-value]


async def delete_learning_path(db: AsyncSession, path: LearningPath) -> None:
    await db.delete(path)
    await db.commit()


# --- Activity Update/Delete ---
async def get_activity(db: AsyncSession, activity_id: uuid.UUID) -> LearningActivity | None:
    result = await db.execute(select(LearningActivity).where(LearningActivity.id == activity_id))
    return result.scalar_one_or_none()


async def update_activity(
    db: AsyncSession, activity: LearningActivity, data: LearningActivityUpdate
) -> LearningActivity:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(activity, field, value)
    await db.commit()
    await db.refresh(activity)
    return activity


async def delete_activity(db: AsyncSession, activity: LearningActivity) -> None:
    await db.delete(activity)
    await db.commit()


# --- Gap-based Path Suggestions ---
async def suggest_paths_by_gaps(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Suggest learning paths based on user's weak competencies from evaluations."""
    from app.evaluations.models import Evaluation
    from app.journeys.models import JourneyParticipation, QuestionResponse

    # Get user's evaluations with low scores
    evals_result = await db.execute(
        select(Evaluation)
        .join(QuestionResponse, Evaluation.response_id == QuestionResponse.id)
        .join(JourneyParticipation, QuestionResponse.participation_id == JourneyParticipation.id)
        .where(JourneyParticipation.user_id == user_id)
        .order_by(Evaluation.created_at.desc())
        .limit(20)
    )
    evaluations = list(evals_result.scalars().all())

    if not evaluations:
        return []

    # Collect weak competencies (from mapped_competencies of low-scoring evaluations)
    weak_competencies: set[str] = set()
    for ev in evaluations:
        if ev.score_global < 0.6 and ev.mapped_competencies:
            for comp in ev.mapped_competencies:
                weak_competencies.add(comp.lower().strip())

    if not weak_competencies:
        # No clear gaps — suggest paths for lowest-scoring competencies
        for ev in sorted(evaluations, key=lambda e: e.score_global)[:5]:
            if ev.mapped_competencies:
                for comp in ev.mapped_competencies:
                    weak_competencies.add(comp.lower().strip())

    if not weak_competencies:
        return []

    # Find learning paths linked to competencies matching the weak areas
    paths_result = await db.execute(
        select(LearningPath)
        .where(LearningPath.is_active)
        .options(selectinload(LearningPath.competencies))
    )
    all_paths = list(paths_result.scalars().all())

    suggestions = []
    for path in all_paths:
        matching = []
        for comp in path.competencies:
            comp_name = comp.name.lower().strip()
            for weak in weak_competencies:
                if weak in comp_name or comp_name in weak:
                    matching.append(comp.name)
                    break

        if matching:
            suggestions.append({
                "path_id": path.id,
                "title": path.title,
                "description": path.description,
                "domain": path.domain,
                "target_role": path.target_role,
                "relevance": f"Cobre {len(matching)} competência(s) com gap identificado",
                "matching_competencies": matching,
            })

    # Also suggest paths matching recommendations text
    if not suggestions:
        all_recs: list[str] = []
        for ev in evaluations:
            if ev.recommendations:
                all_recs.extend(ev.recommendations[:2])

        for path in all_paths:
            title_lower = path.title.lower()
            desc_lower = (path.description or "").lower()
            for rec in all_recs:
                rec_lower = rec.lower()
                if any(word in title_lower or word in desc_lower
                       for word in rec_lower.split() if len(word) > 4):
                    suggestions.append({
                        "path_id": path.id,
                        "title": path.title,
                        "description": path.description,
                        "domain": path.domain,
                        "target_role": path.target_role,
                        "relevance": "Relacionada a recomendações de melhoria",
                        "matching_competencies": [],
                    })
                    break

    # Deduplicate
    seen = set()
    unique = []
    for s in suggestions:
        if s["path_id"] not in seen:
            seen.add(s["path_id"])
            unique.append(s)

    return unique[:10]


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


# --- Path Items (Training/Journey grouping) ---


async def add_path_item(
    db: AsyncSession, path_id: uuid.UUID, data: PathItemCreate
) -> LearningPathItem:
    item = LearningPathItem(
        path_id=path_id,
        item_type=data.item_type,
        item_id=data.item_id,
        order=data.order,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    # Re-evaluate badges for all users who may have completed this path
    await _revoke_path_badges_if_needed(db, path_id)

    return item


async def remove_path_item(db: AsyncSession, item: LearningPathItem) -> None:
    path_id = item.path_id
    await db.delete(item)
    await db.commit()
    # After removing an item, users might now qualify for the badge
    await _check_and_award_path_badges(db, path_id)


async def reorder_path_items(
    db: AsyncSession, path_id: uuid.UUID, item_ids: list[uuid.UUID]
) -> list[LearningPathItem]:
    for idx, item_id in enumerate(item_ids):
        result = await db.execute(
            select(LearningPathItem).where(
                LearningPathItem.id == item_id,
                LearningPathItem.path_id == path_id,
            )
        )
        item = result.scalar_one_or_none()
        if item:
            item.order = idx
    await db.commit()
    result = await db.execute(
        select(LearningPathItem)
        .where(LearningPathItem.path_id == path_id)
        .order_by(LearningPathItem.order)
    )
    return list(result.scalars().all())


async def update_path_badges(
    db: AsyncSession, path_id: uuid.UUID, badge_ids: list[uuid.UUID]
) -> None:
    """Set the badges linked to a learning path."""
    from app.gamification.models import Badge

    # Clear existing
    await db.execute(
        sa_delete(learning_path_badge).where(learning_path_badge.c.path_id == path_id)
    )

    if badge_ids:
        badges_result = await db.execute(
            select(Badge).where(Badge.id.in_(badge_ids))
        )
        badges = list(badges_result.scalars().all())

        path = await get_learning_path(db, path_id)
        if path:
            path.badges = badges

    await db.commit()

    # Re-evaluate badge awards for this path
    await _check_and_award_path_badges(db, path_id)


# --- Path Teams ---


async def update_path_teams(
    db: AsyncSession, path_id: uuid.UUID, team_ids: list[uuid.UUID]
) -> None:
    """Set the teams linked to a learning path."""
    from app.teams.models import Team

    # Clear existing
    await db.execute(
        sa_delete(learning_path_team).where(learning_path_team.c.path_id == path_id)
    )

    if team_ids:
        teams_result = await db.execute(
            select(Team).where(Team.id.in_(team_ids))
        )
        teams = list(teams_result.scalars().all())

        path = await get_learning_path(db, path_id)
        if path:
            path.teams = teams

    await db.commit()


async def list_my_learning_paths(
    db: AsyncSession, user_id: uuid.UUID
) -> list[LearningPath]:
    """List learning paths assigned to teams the user belongs to."""
    from app.teams.models import team_member

    # Get user's team IDs
    team_ids_result = await db.execute(
        select(team_member.c.team_id).where(team_member.c.user_id == user_id)
    )
    user_team_ids = [row[0] for row in team_ids_result.all()]

    if not user_team_ids:
        return []

    # Get active paths assigned to any of the user's teams
    query = (
        select(LearningPath)
        .join(learning_path_team, LearningPath.id == learning_path_team.c.path_id)
        .where(
            learning_path_team.c.team_id.in_(user_team_ids),
            LearningPath.is_active,
        )
        .options(
            selectinload(LearningPath.items),
            selectinload(LearningPath.badges),
            selectinload(LearningPath.teams),
        )
        .distinct()
    )
    result = await db.execute(query)
    return list(result.scalars().unique().all())


async def get_path_items_enriched(
    db: AsyncSession, path_id: uuid.UUID
) -> list[dict]:
    """Get path items with title and status info resolved from trainings/journeys."""
    result = await db.execute(
        select(LearningPathItem)
        .where(LearningPathItem.path_id == path_id)
        .order_by(LearningPathItem.order)
    )
    items = list(result.scalars().all())

    from app.journeys.models import Journey
    from app.trainings.models import Training

    enriched = []
    for item in items:
        title = None
        status = None
        if item.item_type == PathItemType.TRAINING:
            t_result = await db.execute(
                select(Training.title, Training.status).where(Training.id == item.item_id)
            )
            row = t_result.one_or_none()
            if row:
                title, status = row.title, row.status.value
        elif item.item_type == PathItemType.JOURNEY:
            j_result = await db.execute(
                select(Journey.title, Journey.status).where(Journey.id == item.item_id)
            )
            row = j_result.one_or_none()
            if row:
                title, status = row.title, row.status.value

        enriched.append({
            "id": item.id,
            "path_id": item.path_id,
            "item_type": item.item_type,
            "item_id": item.item_id,
            "order": item.order,
            "added_at": item.added_at,
            "item_title": title,
            "item_status": status,
        })

    return enriched


# --- Path Completion ---


async def get_path_completion(
    db: AsyncSession, user_id: uuid.UUID, path_id: uuid.UUID
) -> dict:
    """Check user's completion of a learning path (items-based)."""
    from app.journeys.models import JourneyParticipation
    from app.trainings.models import EnrollmentStatus, TrainingEnrollment

    path = await get_learning_path(db, path_id)
    if not path:
        return {"path_id": path_id, "path_title": "", "total_items": 0,
                "completed_items": 0, "progress_percent": 0, "completed": False,
                "items": [], "badges_earned": []}

    items = path.items
    if not items:
        return {"path_id": path_id, "path_title": path.title, "total_items": 0,
                "completed_items": 0, "progress_percent": 0, "completed": False,
                "items": [], "badges_earned": []}

    from app.journeys.models import Journey
    from app.trainings.models import Training

    item_statuses = []
    completed_count = 0

    for item in items:
        completed = False
        title = None

        if item.item_type == PathItemType.TRAINING:
            # Check TrainingEnrollment.status == COMPLETED
            t_result = await db.execute(
                select(Training.title).where(Training.id == item.item_id)
            )
            row = t_result.one_or_none()
            title = row.title if row else None

            enroll_result = await db.execute(
                select(TrainingEnrollment).where(
                    TrainingEnrollment.training_id == item.item_id,
                    TrainingEnrollment.user_id == user_id,
                    TrainingEnrollment.status == EnrollmentStatus.COMPLETED,
                )
            )
            if enroll_result.scalar_one_or_none():
                completed = True

        elif item.item_type == PathItemType.JOURNEY:
            j_result = await db.execute(
                select(Journey.title).where(Journey.id == item.item_id)
            )
            row = j_result.one_or_none()
            title = row.title if row else None

            part_result = await db.execute(
                select(JourneyParticipation).where(
                    JourneyParticipation.journey_id == item.item_id,
                    JourneyParticipation.user_id == user_id,
                    JourneyParticipation.completed_at.isnot(None),
                )
            )
            if part_result.scalar_one_or_none():
                completed = True

        if completed:
            completed_count += 1

        item_statuses.append({
            "item_id": item.item_id,
            "item_type": item.item_type,
            "item_title": title,
            "completed": completed,
        })

    total = len(items)
    progress = round((completed_count / total) * 100) if total > 0 else 0
    all_completed = completed_count == total

    # Check which path badges the user has earned
    badges_earned = []
    if path.badges:
        from app.gamification.models import UserBadge
        for badge in path.badges:
            ub_result = await db.execute(
                select(UserBadge).where(
                    UserBadge.user_id == user_id,
                    UserBadge.badge_id == badge.id,
                )
            )
            if ub_result.scalar_one_or_none():
                badges_earned.append({
                    "id": badge.id,
                    "name": badge.name,
                    "description": badge.description,
                    "icon": badge.icon,
                })

    return {
        "path_id": path_id,
        "path_title": path.title,
        "total_items": total,
        "completed_items": completed_count,
        "progress_percent": progress,
        "completed": all_completed,
        "items": item_statuses,
        "badges_earned": badges_earned,
    }


# --- Badge Award/Revoke for Paths ---


async def _get_all_users_with_path_items(
    db: AsyncSession, path_id: uuid.UUID
) -> set[uuid.UUID]:
    """Get all users who have enrollment/participation in any item of this path."""
    result = await db.execute(
        select(LearningPathItem).where(LearningPathItem.path_id == path_id)
    )
    items = list(result.scalars().all())

    user_ids: set[uuid.UUID] = set()

    from app.journeys.models import JourneyParticipation
    from app.trainings.models import TrainingEnrollment

    for item in items:
        if item.item_type == PathItemType.TRAINING:
            enroll_result = await db.execute(
                select(TrainingEnrollment.user_id).where(
                    TrainingEnrollment.training_id == item.item_id,
                )
            )
            user_ids.update(row[0] for row in enroll_result.all())
        elif item.item_type == PathItemType.JOURNEY:
            part_result = await db.execute(
                select(JourneyParticipation.user_id).where(
                    JourneyParticipation.journey_id == item.item_id,
                )
            )
            user_ids.update(row[0] for row in part_result.all())

    return user_ids


async def _is_path_completed_by_user(
    db: AsyncSession, user_id: uuid.UUID, path_id: uuid.UUID
) -> bool:
    """Check if a user has completed all items in a path."""
    completion = await get_path_completion(db, user_id, path_id)
    return completion["completed"]


async def _check_and_award_path_badges(
    db: AsyncSession, path_id: uuid.UUID
) -> None:
    """Check all relevant users and award badges for completed paths."""
    from app.gamification.models import UserBadge

    path = await get_learning_path(db, path_id)
    if not path or not path.badges:
        return

    user_ids = await _get_all_users_with_path_items(db, path_id)

    for uid in user_ids:
        completed = await _is_path_completed_by_user(db, uid, path_id)
        if completed:
            for badge in path.badges:
                existing = await db.execute(
                    select(UserBadge).where(
                        UserBadge.user_id == uid,
                        UserBadge.badge_id == badge.id,
                    )
                )
                if not existing.scalar_one_or_none():
                    db.add(UserBadge(user_id=uid, badge_id=badge.id))

    await db.commit()


async def _revoke_path_badges_if_needed(
    db: AsyncSession, path_id: uuid.UUID
) -> None:
    """When a new item is added, revoke badges from users who haven't completed it."""
    from app.gamification.models import UserBadge

    path = await get_learning_path(db, path_id)
    if not path or not path.badges:
        return

    badge_ids = [b.id for b in path.badges]

    # Find all users who have any of these badges
    ub_result = await db.execute(
        select(UserBadge).where(UserBadge.badge_id.in_(badge_ids))
    )
    user_badges = list(ub_result.scalars().all())

    for ub in user_badges:
        completed = await _is_path_completed_by_user(db, ub.user_id, path_id)
        if not completed:
            await db.delete(ub)

    await db.commit()


async def check_path_badges_for_user(
    db: AsyncSession, user_id: uuid.UUID
) -> list:
    """Called after a user completes a training or journey.
    Checks all active paths and awards/maintains badges.
    """
    from app.gamification.models import UserBadge

    paths_result = await db.execute(
        select(LearningPath)
        .where(LearningPath.is_active)
        .options(
            selectinload(LearningPath.items),
            selectinload(LearningPath.badges),
        )
    )
    paths = list(paths_result.scalars().unique().all())

    awarded = []
    for path in paths:
        if not path.badges or not path.items:
            continue
        completed = await _is_path_completed_by_user(db, user_id, path.id)
        if completed:
            for badge in path.badges:
                existing = await db.execute(
                    select(UserBadge).where(
                        UserBadge.user_id == user_id,
                        UserBadge.badge_id == badge.id,
                    )
                )
                if not existing.scalar_one_or_none():
                    ub = UserBadge(user_id=user_id, badge_id=badge.id)
                    db.add(ub)
                    awarded.append(ub)

    if awarded:
        await db.commit()

    return awarded


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
