import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.gamification.schemas import (
    BadgeCreate,
    BadgeOut,
    ScoreCreate,
    ScoreOut,
    UserBadgeOut,
    UserPointsSummary,
)
from app.gamification.service import (
    add_score,
    award_badge,
    create_badge,
    get_leaderboard,
    get_user_badges,
    get_user_points,
    get_user_scores,
    list_badges,
)
from app.users.models import User, UserRole

router = APIRouter()


# --- Scores ---


@router.post("/scores", response_model=ScoreOut, status_code=status.HTTP_201_CREATED)
async def create_score(
    data: ScoreCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await add_score(db, data)


@router.get("/scores/me", response_model=UserPointsSummary)
async def get_my_points(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_user_points(db, current_user.id)


@router.get("/scores/me/history", response_model=list[ScoreOut])
async def get_my_score_history(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_user_scores(db, current_user.id, skip, limit)


@router.get("/scores/{user_id}", response_model=UserPointsSummary)
async def get_user_score_summary(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)),
):
    return await get_user_points(db, user_id)


@router.get("/leaderboard", response_model=list[UserPointsSummary])
async def get_leaderboard_view(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await get_leaderboard(db, limit)


# --- Badges ---


@router.post("/badges", response_model=BadgeOut, status_code=status.HTTP_201_CREATED)
async def create_new_badge(
    data: BadgeCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await create_badge(db, data)


@router.get("/badges", response_model=list[BadgeOut])
async def list_all_badges(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await list_badges(db)


@router.post("/badges/{badge_id}/award/{user_id}", response_model=UserBadgeOut, status_code=status.HTTP_201_CREATED)
async def award_badge_to_user(
    badge_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    try:
        return await award_badge(db, user_id, badge_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/badges/me", response_model=list[UserBadgeOut])
async def get_my_badges(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_user_badges(db, current_user.id)
