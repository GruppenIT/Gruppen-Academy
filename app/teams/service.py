import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.teams.models import Team, team_member
from app.teams.schemas import TeamCreate, TeamUpdate
from app.users.models import User


async def create_team(db: AsyncSession, data: TeamCreate) -> Team:
    team = Team(name=data.name, description=data.description)
    if data.member_ids:
        result = await db.execute(select(User).where(User.id.in_(data.member_ids)))
        team.members = list(result.scalars().all())
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return await get_team(db, team.id)  # type: ignore[return-value]


async def get_team(db: AsyncSession, team_id: uuid.UUID) -> Team | None:
    result = await db.execute(
        select(Team).where(Team.id == team_id).options(selectinload(Team.members))
    )
    return result.scalar_one_or_none()


async def list_teams(db: AsyncSession) -> list[Team]:
    result = await db.execute(
        select(Team).options(selectinload(Team.members)).order_by(Team.name)
    )
    return list(result.scalars().all())


async def update_team(db: AsyncSession, team: Team, data: TeamUpdate) -> Team:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(team, field, value)
    await db.commit()
    await db.refresh(team)
    return team


async def set_team_members(db: AsyncSession, team: Team, member_ids: list[uuid.UUID]) -> Team:
    result = await db.execute(select(User).where(User.id.in_(member_ids)))
    team.members = list(result.scalars().all())
    await db.commit()
    return await get_team(db, team.id)  # type: ignore[return-value]


async def delete_team(db: AsyncSession, team: Team) -> None:
    await db.delete(team)
    await db.commit()
