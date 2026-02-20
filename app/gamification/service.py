import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.gamification.models import Badge, Score, UserBadge
from app.gamification.schemas import BadgeCreate, ScoreCreate, UserPointsSummary


# --- Scores ---
async def add_score(db: AsyncSession, data: ScoreCreate) -> Score:
    score = Score(**data.model_dump())
    db.add(score)
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
    return UserPointsSummary(user_id=user_id, total_points=row.total, scores_count=row.count)


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
            func.sum(Score.points).label("total"),
            func.count(Score.id).label("count"),
        )
        .group_by(Score.user_id)
        .order_by(func.sum(Score.points).desc())
        .limit(limit)
    )
    return [
        UserPointsSummary(user_id=row.user_id, total_points=row.total, scores_count=row.count)
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
