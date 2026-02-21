import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.teams.schemas import TeamCreate, TeamOut, TeamUpdate
from app.teams.service import (
    create_team,
    delete_team,
    get_team,
    list_teams,
    set_team_members,
    update_team,
)
from app.users.models import User, UserRole

router = APIRouter()


@router.get("", response_model=list[TeamOut])
async def list_all_teams(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await list_teams(db)


@router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
async def create_new_team(
    data: TeamCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await create_team(db, data)


@router.get("/{team_id}", response_model=TeamOut)
async def get_single_team(
    team_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    team = await get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Equipe não encontrada")
    return team


@router.patch("/{team_id}", response_model=TeamOut)
async def update_existing_team(
    team_id: uuid.UUID,
    data: TeamUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    team = await get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Equipe não encontrada")
    return await update_team(db, team, data)


@router.put("/{team_id}/members", response_model=TeamOut)
async def replace_team_members(
    team_id: uuid.UUID,
    member_ids: list[uuid.UUID],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    team = await get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Equipe não encontrada")
    return await set_team_members(db, team, member_ids)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_team(
    team_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    team = await get_team(db, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Equipe não encontrada")
    await delete_team(db, team)
