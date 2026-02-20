import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EvaluationStatus(str, enum.Enum):
    PENDING = "pending"
    EVALUATED = "evaluated"
    REVIEWED = "reviewed"
    SENT = "sent"


class ReportType(str, enum.Enum):
    MANAGER = "manager"
    PROFESSIONAL = "professional"


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("question_responses.id", ondelete="CASCADE"),
        unique=True, nullable=False,
    )
    score_global: Mapped[float] = mapped_column(Float, nullable=False)
    criteria: Mapped[dict] = mapped_column(JSONB, nullable=False)
    general_comment: Mapped[str] = mapped_column(Text, nullable=False)
    recommendations: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    mapped_competencies: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[EvaluationStatus] = mapped_column(
        Enum(EvaluationStatus), nullable=False, default=EvaluationStatus.PENDING
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    review_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    response: Mapped["QuestionResponse"] = relationship(back_populates="evaluation")


class AnalyticalReport(Base):
    __tablename__ = "analytical_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journey_participations.id", ondelete="CASCADE"),
        nullable=False,
    )
    report_type: Mapped[ReportType] = mapped_column(Enum(ReportType), nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
