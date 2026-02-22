import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.journeys.models import JourneyMode, JourneyStatus, OCRUploadStatus, QuestionType


# --- Journey ---
class JourneyCreate(BaseModel):
    title: str
    description: str | None = None
    domain: str = "vendas"
    session_duration_minutes: int = 180
    participant_level: str = "intermediario"
    mode: JourneyMode = JourneyMode.ASYNC
    product_ids: list[uuid.UUID] = []
    competency_ids: list[uuid.UUID] = []

    @field_validator("mode", mode="before")
    @classmethod
    def normalize_mode(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class JourneyUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    domain: str | None = None
    mode: JourneyMode | None = None
    status: JourneyStatus | None = None
    session_duration_minutes: int | None = None
    participant_level: str | None = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v

    @field_validator("mode", mode="before")
    @classmethod
    def normalize_mode(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class JourneyOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    domain: str
    mode: JourneyMode
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
    max_time_seconds: int | None = None
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
    max_time_seconds: int | None
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
    time_spent_seconds: int | None = None


class ResponseOut(BaseModel):
    id: uuid.UUID
    participation_id: uuid.UUID
    question_id: uuid.UUID
    answer_text: str
    ocr_source: bool
    time_spent_seconds: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Async Participation Flow ---
class AsyncQuestionOut(BaseModel):
    """Single question shown to the professional during async participation."""
    question_id: uuid.UUID
    text: str
    type: QuestionType
    order: int
    max_time_seconds: int | None
    expected_lines: int
    total_questions: int
    current_number: int
    already_answered: bool = False


class AsyncAnswerSubmit(BaseModel):
    answer_text: str
    time_spent_seconds: int | None = None


class ParticipationStatusOut(BaseModel):
    participation_id: uuid.UUID
    journey_id: uuid.UUID
    journey_title: str
    mode: str
    total_questions: int
    answered_questions: int
    current_question_order: int
    completed: bool
    started_at: datetime


# --- AI Generation Request ---
class GenerateQuestionsRequest(BaseModel):
    product_ids: list[uuid.UUID]
    competency_ids: list[uuid.UUID]
    session_duration_minutes: int = 180
    participant_level: str = "intermediario"
    domain: str = "vendas"
    num_questions: int | None = None


# --- Question Update ---
class QuestionUpdate(BaseModel):
    text: str | None = None
    type: QuestionType | None = None
    weight: float | None = None
    rubric: dict | None = None
    max_time_seconds: int | None = None
    expected_lines: int | None = None
    order: int | None = None

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


# --- OCR Upload ---
class OCRExtractedResponse(BaseModel):
    question_order: int
    question_id: uuid.UUID | None = None
    extracted_text: str
    confidence: float | None = None


class OCRUploadOut(BaseModel):
    id: uuid.UUID
    participation_id: uuid.UUID | None
    original_filename: str
    status: OCRUploadStatus
    extracted_responses: list[dict] | None
    import_report: dict | None = None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OCRReviewRequest(BaseModel):
    extracted_responses: list[OCRExtractedResponse]


class OCRImportedUser(BaseModel):
    user_name: str
    user_email: str
    participation_id: str | None = None
    ocr_upload_id: str | None = None
    status: str = "ok"  # "ok", "created", "not_found"


class OCRImportFailure(BaseModel):
    message: str
    details: str | None = None


class OCRImportReport(BaseModel):
    journey_title: str | None = None
    journey_id: str | None = None
    users_imported: list[OCRImportedUser] = []
    failures: list[OCRImportFailure] = []
    total_pages: int = 0
    total_respondents_found: int = 0
    ocr_upload_ids: list[str] = []
