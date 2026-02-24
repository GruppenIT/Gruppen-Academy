import uuid
from datetime import datetime

from pydantic import BaseModel


# --- Score ---
class ScoreCreate(BaseModel):
    user_id: uuid.UUID
    points: int
    source: str
    source_id: uuid.UUID | None = None
    description: str | None = None


class ScoreOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    points: int
    source: str
    source_id: uuid.UUID | None
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserPointsSummary(BaseModel):
    user_id: uuid.UUID
    total_points: int
    scores_count: int
    full_name: str | None = None


# --- Badge ---
class BadgeCreate(BaseModel):
    name: str
    description: str
    icon: str | None = None
    criteria: str
    points_threshold: int | None = None


class BadgeOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    icon: str | None
    criteria: str
    points_threshold: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserBadgeOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    badge_id: uuid.UUID
    earned_at: datetime

    model_config = {"from_attributes": True}
