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
