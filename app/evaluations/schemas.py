import uuid
from datetime import datetime

from pydantic import BaseModel

from app.evaluations.models import EvaluationStatus, ReportType


class CriterionResult(BaseModel):
    nome: str
    peso: float
    nota: float
    comentario: str


class EvaluationResult(BaseModel):
    score_global: float
    criterios: list[CriterionResult]
    comentario_geral: str
    recomendacoes: list[str]
    competencias_mapeadas: list[str]


class EvaluationOut(BaseModel):
    id: uuid.UUID
    response_id: uuid.UUID
    score_global: float
    criteria: dict
    general_comment: str
    recommendations: list
    mapped_competencies: list
    status: EvaluationStatus
    reviewed_by: uuid.UUID | None
    review_notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EvaluationReview(BaseModel):
    status: EvaluationStatus | None = None
    review_notes: str | None = None
    score_global: float | None = None
    general_comment: str | None = None


class EvaluateResponseRequest(BaseModel):
    response_id: uuid.UUID


class BulkEvaluateRequest(BaseModel):
    participation_id: uuid.UUID


class GenerateReportRequest(BaseModel):
    participation_id: uuid.UUID
    report_type: ReportType = ReportType.PROFESSIONAL


class ReportOut(BaseModel):
    id: uuid.UUID
    participation_id: uuid.UUID
    report_type: ReportType
    content: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class ParticipationEvaluationSummary(BaseModel):
    participation_id: uuid.UUID
    journey_id: uuid.UUID
    journey_title: str
    user_id: uuid.UUID
    user_name: str
    user_email: str
    started_at: str | None
    completed_at: str | None
    total_responses: int
    evaluated_count: int
    has_report: bool


class ParticipationResponseDetail(BaseModel):
    response_id: uuid.UUID
    question_id: uuid.UUID
    question_text: str
    question_type: str
    question_order: int
    answer_text: str
    evaluation: EvaluationOut | None


class UserParticipationSummary(BaseModel):
    participation_id: uuid.UUID
    journey_id: uuid.UUID
    journey_title: str
    journey_domain: str
    started_at: str | None
    completed_at: str | None
    total_responses: int
    evaluated_count: int
    avg_score: float | None
    report_id: str | None
