import uuid
from datetime import date, timedelta

from sqlalchemy import cast, func, select, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.gamification.models import Badge, Score, UserBadge
from app.gamification.schemas import BadgeCreate, ScoreCreate, UserPointsSummary
from app.journeys.models import JourneyParticipation
from app.learning.models import ActivityCompletion, TutorSession
from app.trainings.models import EnrollmentStatus, TrainingEnrollment
from app.users.models import User


# --- Scores ---
async def add_score(db: AsyncSession, data: ScoreCreate, *, commit: bool = True) -> Score:
    score = Score(**data.model_dump())
    db.add(score)
    if commit:
        await db.commit()
        await db.refresh(score)
    return score


async def get_user_points(db: AsyncSession, user_id: uuid.UUID) -> UserPointsSummary:
    result = await db.execute(
        select(
            func.coalesce(func.sum(Score.points), 0).label("total"),
            func.count(Score.id).label("count"),
        ).where(Score.user_id == user_id)
    )
    row = result.one()
    # Fetch user name
    user_result = await db.execute(select(User.full_name).where(User.id == user_id))
    user_row = user_result.one_or_none()
    return UserPointsSummary(
        user_id=user_id,
        full_name=user_row.full_name if user_row else None,
        total_points=row.total,
        scores_count=row.count,
    )


async def get_user_scores(
    db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 50
) -> list[Score]:
    result = await db.execute(
        select(Score)
        .where(Score.user_id == user_id)
        .order_by(Score.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_leaderboard(db: AsyncSession, limit: int = 20) -> list[UserPointsSummary]:
    result = await db.execute(
        select(
            Score.user_id,
            User.full_name,
            func.sum(Score.points).label("total"),
            func.count(Score.id).label("count"),
        )
        .join(User, Score.user_id == User.id)
        .group_by(Score.user_id, User.full_name)
        .order_by(func.sum(Score.points).desc())
        .limit(limit)
    )
    return [
        UserPointsSummary(
            user_id=row.user_id,
            full_name=row.full_name,
            total_points=row.total,
            scores_count=row.count,
        )
        for row in result.all()
    ]


# --- Badges ---
async def create_badge(db: AsyncSession, data: BadgeCreate) -> Badge:
    badge = Badge(**data.model_dump())
    db.add(badge)
    await db.commit()
    await db.refresh(badge)
    return badge


async def list_badges(db: AsyncSession) -> list[Badge]:
    result = await db.execute(select(Badge))
    return list(result.scalars().all())


async def award_badge(db: AsyncSession, user_id: uuid.UUID, badge_id: uuid.UUID) -> UserBadge:
    existing = await db.execute(
        select(UserBadge).where(UserBadge.user_id == user_id, UserBadge.badge_id == badge_id)
    )
    if existing.scalar_one_or_none():
        raise ValueError("Badge já concedido a este usuário")
    user_badge = UserBadge(user_id=user_id, badge_id=badge_id)
    db.add(user_badge)
    await db.commit()
    await db.refresh(user_badge)
    return user_badge


async def get_user_badges(db: AsyncSession, user_id: uuid.UUID) -> list[UserBadge]:
    result = await db.execute(select(UserBadge).where(UserBadge.user_id == user_id))
    return list(result.scalars().all())


# --- Streak ---
async def get_user_streak(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Calculate user's current and longest streak of consecutive active days.
    A day counts as active if the user earned any score on that day.
    """
    result = await db.execute(
        select(cast(Score.created_at, Date).label("day"))
        .where(Score.user_id == user_id)
        .group_by("day")
        .order_by("day")
    )
    days = [row.day for row in result.all()]

    if not days:
        return {"current_streak": 0, "longest_streak": 0, "total_active_days": 0}

    # Calculate streaks
    current_streak = 1
    longest_streak = 1
    streak = 1

    for i in range(1, len(days)):
        if days[i] - days[i - 1] == timedelta(days=1):
            streak += 1
            longest_streak = max(longest_streak, streak)
        else:
            streak = 1

    # Check if current streak is still active (last active day is today or yesterday)
    today = date.today()
    if days[-1] >= today - timedelta(days=1):
        current_streak = streak
    else:
        current_streak = 0

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "total_active_days": len(days),
    }


# --- Auto-Badge Check ---
async def check_and_award_badges(
    db: AsyncSession, user_id: uuid.UUID, *, commit: bool = True
) -> list[UserBadge]:
    """Check all badge criteria and award any newly earned badges.
    Called after scoring events.
    """
    # Get user's total points
    points_summary = await get_user_points(db, user_id)
    total_points = points_summary.total_points

    # Get badges user already has
    existing = await db.execute(
        select(UserBadge.badge_id).where(UserBadge.user_id == user_id)
    )
    existing_badge_ids = {row[0] for row in existing.all()}

    # Get all badges
    badges_result = await db.execute(select(Badge))
    all_badges = list(badges_result.scalars().all())

    awarded = []
    for badge in all_badges:
        if badge.id in existing_badge_ids:
            continue

        # Check points_threshold criterion
        if badge.points_threshold and total_points >= badge.points_threshold:
            user_badge = UserBadge(user_id=user_id, badge_id=badge.id)
            db.add(user_badge)
            awarded.append(user_badge)
            continue

        # Check criteria-based badges (streak, journey count, activity count, etc.)
        earned = await _check_criteria(db, user_id, badge.criteria, total_points)
        if earned:
            user_badge = UserBadge(user_id=user_id, badge_id=badge.id)
            db.add(user_badge)
            awarded.append(user_badge)

    if awarded and commit:
        await db.commit()
        for ub in awarded:
            await db.refresh(ub)

    return awarded


async def _check_criteria(
    db: AsyncSession, user_id: uuid.UUID, criteria: str, total_points: int
) -> bool:
    """Evaluate a criteria string. Supports simple rules like:
    - 'journeys>=5' : completed at least 5 journeys
    - 'activities>=10' : completed at least 10 activities
    - 'streak>=7' : current streak of 7+ days
    - 'tutor_sessions>=3' : at least 3 tutor sessions
    """
    criteria = criteria.strip().lower()

    if criteria.startswith("journeys>="):
        threshold = int(criteria.split(">=")[1])
        result = await db.execute(
            select(func.count(JourneyParticipation.id)).where(
                JourneyParticipation.user_id == user_id,
                JourneyParticipation.completed_at.isnot(None),
            )
        )
        return result.scalar_one() >= threshold

    if criteria.startswith("activities>="):
        threshold = int(criteria.split(">=")[1])
        result = await db.execute(
            select(func.count(ActivityCompletion.id)).where(
                ActivityCompletion.user_id == user_id
            )
        )
        return result.scalar_one() >= threshold

    if criteria.startswith("streak>="):
        threshold = int(criteria.split(">=")[1])
        streak_data = await get_user_streak(db, user_id)
        return streak_data["current_streak"] >= threshold

    if criteria.startswith("tutor_sessions>="):
        threshold = int(criteria.split(">=")[1])
        result = await db.execute(
            select(func.count(TutorSession.id)).where(
                TutorSession.user_id == user_id
            )
        )
        return result.scalar_one() >= threshold

    if criteria.startswith("trainings>="):
        threshold = int(criteria.split(">=")[1])
        result = await db.execute(
            select(func.count(TrainingEnrollment.id)).where(
                TrainingEnrollment.user_id == user_id,
                TrainingEnrollment.status == EnrollmentStatus.COMPLETED,
            )
        )
        return result.scalar_one() >= threshold

    if criteria.startswith("trilha:"):
        # Badge awarded via learning path completion — managed by learning service
        # _check_criteria is not the right place; handled by check_path_badges_for_user
        return False

    # Unknown criteria — don't auto-award
    return False
