import uuid
from datetime import datetime

from pydantic import BaseModel


class TeamCreate(BaseModel):
    name: str
    description: str | None = None
    member_ids: list[uuid.UUID] = []


class TeamUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class TeamMemberOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    department: str | None

    model_config = {"from_attributes": True}


class TeamOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    members: list[TeamMemberOut] = []

    model_config = {"from_attributes": True}
