import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.journeys.models import JourneyStatus, QuestionType


# --- Journey ---
class JourneyCreate(BaseModel):
    title: str
    description: str | None = None
    domain: str = "vendas"
    session_duration_minutes: int = 180
    participant_level: str = "intermediario"
    product_ids: list[uuid.UUID] = []
    competency_ids: list[uuid.UUID] = []


class JourneyUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    domain: str | None = None
    status: JourneyStatus | None = None
    session_duration_minutes: int | None = None
    participant_level: str | None = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class JourneyOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    domain: str
    session_duration_minutes: int
    participant_level: str
    status: JourneyStatus
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Question ---
class QuestionCreate(BaseModel):
    text: str
    type: QuestionType = QuestionType.ESSAY
    weight: float = 1.0
    rubric: dict | None = None
    expected_lines: int = 10
    order: int = 0
    competency_ids: list[uuid.UUID] = []

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class QuestionOut(BaseModel):
    id: uuid.UUID
    journey_id: uuid.UUID
    text: str
    type: QuestionType
    weight: float
    rubric: dict | None
    expected_lines: int
    order: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Journey Participation ---
class ParticipationCreate(BaseModel):
    journey_id: uuid.UUID
    user_id: uuid.UUID


class ParticipationOut(BaseModel):
    id: uuid.UUID
    journey_id: uuid.UUID
    user_id: uuid.UUID
    started_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


# --- Question Response ---
class ResponseCreate(BaseModel):
    question_id: uuid.UUID
    answer_text: str
    ocr_source: bool = False


class ResponseOut(BaseModel):
    id: uuid.UUID
    participation_id: uuid.UUID
    question_id: uuid.UUID
    answer_text: str
    ocr_source: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- AI Generation Request ---
class GenerateQuestionsRequest(BaseModel):
    product_ids: list[uuid.UUID]
    competency_ids: list[uuid.UUID]
    session_duration_minutes: int = 180
    participant_level: str = "intermediario"
    domain: str = "vendas"
    num_questions: int | None = None
