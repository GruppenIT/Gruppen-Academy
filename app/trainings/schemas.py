import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.trainings.models import (
    EnrollmentStatus,
    ModuleContentType,
    QuizQuestionType,
    TrainingStatus,
)


# --- Training ---
class TrainingCreate(BaseModel):
    title: str
    description: str | None = None
    domain: str = "vendas"
    participant_level: str = "intermediario"
    estimated_duration_minutes: int = 60
    xp_reward: int = 100
    product_ids: list[uuid.UUID] = []
    competency_ids: list[uuid.UUID] = []


class TrainingUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    domain: str | None = None
    participant_level: str | None = None
    estimated_duration_minutes: int | None = None
    xp_reward: int | None = None

    @field_validator("domain", mode="before")
    @classmethod
    def normalize_domain(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class TrainingOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    domain: str
    participant_level: str
    status: TrainingStatus
    estimated_duration_minutes: int
    xp_reward: int
    cover_image_path: str | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TrainingDetailOut(TrainingOut):
    modules: list["ModuleOut"] = []


# --- Training Module ---
class ModuleCreate(BaseModel):
    title: str
    description: str | None = None
    order: int | None = None
    content_type: ModuleContentType | None = None
    content_data: dict | None = None
    has_quiz: bool = False
    quiz_required_to_advance: bool = False
    xp_reward: int = 20

    @field_validator("content_type", mode="before")
    @classmethod
    def normalize_content_type(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class ModuleUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    order: int | None = None
    content_type: ModuleContentType | None = None
    content_data: dict | None = None
    has_quiz: bool | None = None
    quiz_required_to_advance: bool | None = None
    xp_reward: int | None = None

    @field_validator("content_type", mode="before")
    @classmethod
    def normalize_content_type(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class ModuleOut(BaseModel):
    id: uuid.UUID
    training_id: uuid.UUID
    title: str
    description: str | None
    order: int
    content_type: ModuleContentType | None
    content_data: dict | None
    file_path: str | None
    original_filename: str | None
    mime_type: str | None
    has_quiz: bool
    quiz_required_to_advance: bool
    xp_reward: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ModuleDetailOut(ModuleOut):
    quiz: "QuizOut | None" = None


# --- Quiz ---
class QuizCreate(BaseModel):
    title: str = "Quiz"
    passing_score: float = 0.7
    questions: list["QuizQuestionCreate"] = []


class QuizUpdate(BaseModel):
    title: str | None = None
    passing_score: float | None = None


class QuizOut(BaseModel):
    id: uuid.UUID
    module_id: uuid.UUID
    title: str
    passing_score: float
    created_at: datetime
    questions: list["QuizQuestionOut"] = []

    model_config = {"from_attributes": True}


# --- Quiz Question ---
class QuizQuestionCreate(BaseModel):
    text: str
    type: QuizQuestionType = QuizQuestionType.MULTIPLE_CHOICE
    options: list[dict] | None = None
    correct_answer: str | None = None
    explanation: str | None = None
    weight: float = 1.0
    order: int = 0
    competency_ids: list[uuid.UUID] = []

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class QuizQuestionUpdate(BaseModel):
    text: str | None = None
    type: QuizQuestionType | None = None
    options: list[dict] | None = None
    correct_answer: str | None = None
    explanation: str | None = None
    weight: float | None = None
    order: int | None = None

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class QuizQuestionOut(BaseModel):
    id: uuid.UUID
    quiz_id: uuid.UUID
    text: str
    type: QuizQuestionType
    options: list[dict] | None
    correct_answer: str | None
    explanation: str | None
    weight: float
    order: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Enrollment ---
class EnrollmentOut(BaseModel):
    id: uuid.UUID
    training_id: uuid.UUID
    user_id: uuid.UUID
    status: EnrollmentStatus
    current_module_order: int
    enrolled_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class EnrollmentDetailOut(EnrollmentOut):
    user_name: str | None = None
    user_email: str | None = None
    training_title: str | None = None


# --- Module Progress ---
class ModuleProgressOut(BaseModel):
    id: uuid.UUID
    enrollment_id: uuid.UUID
    module_id: uuid.UUID
    content_viewed: bool
    quiz_score: float | None
    started_at: datetime | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}


# --- Quiz Attempt ---
class QuizAttemptSubmit(BaseModel):
    answers: dict


class QuizAttemptOut(BaseModel):
    id: uuid.UUID
    module_progress_id: uuid.UUID
    score: float
    answers: dict
    passed: bool
    started_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


# --- Publish Request ---
class PublishRequest(BaseModel):
    team_ids: list[uuid.UUID]


# --- Professional views ---
class MyTrainingSummary(BaseModel):
    enrollment_id: uuid.UUID
    training_id: uuid.UUID
    training_title: str
    training_description: str | None
    domain: str
    estimated_duration_minutes: int
    xp_reward: int
    status: EnrollmentStatus
    total_modules: int
    completed_modules: int
    enrolled_at: datetime
    completed_at: datetime | None


class TrainingProgressModule(BaseModel):
    module_id: uuid.UUID
    title: str
    description: str | None
    order: int
    content_type: ModuleContentType | None
    original_filename: str | None
    has_quiz: bool
    quiz_required_to_advance: bool
    xp_reward: int
    content_viewed: bool
    quiz_passed: bool
    quiz_score: float | None
    completed: bool
    locked: bool


class TrainingProgressOut(BaseModel):
    enrollment_id: uuid.UUID
    training_id: uuid.UUID
    training_title: str
    status: EnrollmentStatus
    total_modules: int
    completed_modules: int
    xp_reward: int
    modules: list[TrainingProgressModule]


class PendingItem(BaseModel):
    type: str  # "training" or "journey"
    id: str
    title: str
    description: str | None = None
    status_label: str
    detail: str


class ScormStatusUpdate(BaseModel):
    lesson_status: str  # "completed", "passed", "failed", "incomplete", "not attempted"
    score_raw: float | None = None
    score_max: float | None = None
