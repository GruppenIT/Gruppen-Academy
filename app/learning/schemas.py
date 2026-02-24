import uuid
from datetime import datetime

from pydantic import BaseModel

from app.learning.models import ActivityType, PathItemType


# --- Learning Path ---
class LearningPathCreate(BaseModel):
    title: str
    description: str | None = None
    domain: str = "vendas"
    target_role: str = "vendedor"
    competency_ids: list[uuid.UUID] = []


class LearningPathUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    domain: str | None = None
    target_role: str | None = None
    is_active: bool | None = None


class PathItemOut(BaseModel):
    id: uuid.UUID
    path_id: uuid.UUID
    item_type: PathItemType
    item_id: uuid.UUID
    order: int
    added_at: datetime
    # Populated by service
    item_title: str | None = None
    item_status: str | None = None

    model_config = {"from_attributes": True}


class BadgeOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    icon: str | None

    model_config = {"from_attributes": True}


class PathTeamOut(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class LearningPathOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    domain: str
    target_role: str
    is_active: bool
    created_at: datetime
    items: list[PathItemOut] = []
    badges: list[BadgeOut] = []
    teams: list[PathTeamOut] = []

    model_config = {"from_attributes": True}


# --- Path Item CRUD ---
class PathItemCreate(BaseModel):
    item_type: PathItemType
    item_id: uuid.UUID
    order: int = 0


class PathItemReorder(BaseModel):
    item_ids: list[uuid.UUID]


# --- Path Badges ---
class PathBadgeUpdate(BaseModel):
    badge_ids: list[uuid.UUID]


# --- Path Teams ---
class PathTeamUpdate(BaseModel):
    team_ids: list[uuid.UUID]


# --- Path Completion (for user) ---
class PathItemCompletionStatus(BaseModel):
    item_id: uuid.UUID
    item_type: PathItemType
    item_title: str | None = None
    completed: bool


class PathCompletionOut(BaseModel):
    path_id: uuid.UUID
    path_title: str
    total_items: int
    completed_items: int
    progress_percent: int
    completed: bool
    items: list[PathItemCompletionStatus]
    badges_earned: list[BadgeOut] = []


# --- Learning Activity ---
class LearningActivityCreate(BaseModel):
    title: str
    description: str | None = None
    type: ActivityType
    content: dict | None = None
    order: int = 0
    points_reward: int = 10


class LearningActivityUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    type: ActivityType | None = None
    content: dict | None = None
    order: int | None = None
    points_reward: int | None = None


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


# --- Activity Completion ---
class ActivityCompletionOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    activity_id: uuid.UUID
    completed_at: datetime

    model_config = {"from_attributes": True}


# --- Path Progress (old activities-based) ---
class ActivityProgressItem(BaseModel):
    activity_id: uuid.UUID
    title: str
    description: str | None
    type: str
    order: int
    points_reward: int
    completed: bool


class PathProgressOut(BaseModel):
    total_activities: int
    completed_activities: int
    progress_percent: int
    activities: list[ActivityProgressItem]


# --- Gap Suggestion ---
class SuggestedPathOut(BaseModel):
    path_id: uuid.UUID
    title: str
    description: str | None
    domain: str
    target_role: str
    relevance: str
    matching_competencies: list[str]


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
