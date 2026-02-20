import uuid
from datetime import datetime

from pydantic import BaseModel

from app.learning.models import ActivityType


# --- Learning Path ---
class LearningPathCreate(BaseModel):
    title: str
    description: str | None = None
    domain: str = "vendas"
    target_role: str = "vendedor"
    competency_ids: list[uuid.UUID] = []


class LearningPathOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    domain: str
    target_role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Learning Activity ---
class LearningActivityCreate(BaseModel):
    title: str
    description: str | None = None
    type: ActivityType
    content: dict | None = None
    order: int = 0
    points_reward: int = 10


class LearningActivityOut(BaseModel):
    id: uuid.UUID
    path_id: uuid.UUID
    title: str
    description: str | None
    type: ActivityType
    content: dict | None
    order: int
    points_reward: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Tutor Session ---
class TutorSessionCreate(BaseModel):
    topic: str
    activity_id: uuid.UUID | None = None


class TutorMessageRequest(BaseModel):
    message: str


class TutorSessionOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    activity_id: uuid.UUID | None
    topic: str
    messages: list
    summary: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}
