import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Many-to-many: Journey <-> Product
journey_product = Table(
    "journey_product",
    Base.metadata,
    Column("journey_id", UUID(as_uuid=True), ForeignKey("journeys.id", ondelete="CASCADE")),
    Column("product_id", UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE")),
)

# Many-to-many: Journey <-> Competency
journey_competency = Table(
    "journey_competency",
    Base.metadata,
    Column("journey_id", UUID(as_uuid=True), ForeignKey("journeys.id", ondelete="CASCADE")),
    Column("competency_id", UUID(as_uuid=True), ForeignKey("competencies.id", ondelete="CASCADE")),
)

# Many-to-many: Question <-> Competency
question_competency = Table(
    "question_competency",
    Base.metadata,
    Column("question_id", UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE")),
    Column("competency_id", UUID(as_uuid=True), ForeignKey("competencies.id", ondelete="CASCADE")),
)


class JourneyStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class JourneyMode(str, enum.Enum):
    SYNC = "sync"       # Presencial — PDF impresso, OCR posterior
    ASYNC = "async"     # Online — profissional responde no sistema


class QuestionType(str, enum.Enum):
    ESSAY = "essay"
    CASE_STUDY = "case_study"
    ROLEPLAY = "roleplay"
    OBJECTIVE = "objective"


class Journey(Base):
    __tablename__ = "journeys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    domain: Mapped[str] = mapped_column(String(100), nullable=False, default="vendas")
    session_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=180)
    participant_level: Mapped[str] = mapped_column(String(50), nullable=False, default="intermediario")
    mode: Mapped[JourneyMode] = mapped_column(
        Enum(JourneyMode), nullable=False, default=JourneyMode.ASYNC
    )
    status: Mapped[JourneyStatus] = mapped_column(
        Enum(JourneyStatus), nullable=False, default=JourneyStatus.DRAFT
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    questions: Mapped[list["Question"]] = relationship(back_populates="journey", cascade="all, delete-orphan")
    products = relationship("Product", secondary=journey_product)
    competencies = relationship("Competency", secondary=journey_competency)
    participations: Mapped[list["JourneyParticipation"]] = relationship(back_populates="journey")
    teams = relationship("Team", secondary="journey_teams", back_populates="journeys")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journeys.id", ondelete="CASCADE"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[QuestionType] = mapped_column(Enum(QuestionType), nullable=False, default=QuestionType.ESSAY)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    rubric: Mapped[dict | None] = mapped_column(JSONB)
    max_time_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_lines: Mapped[int] = mapped_column(Integer, default=10)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    journey: Mapped["Journey"] = relationship(back_populates="questions")
    competencies = relationship("Competency", secondary=question_competency)
    responses: Mapped[list["QuestionResponse"]] = relationship(back_populates="question")


class JourneyParticipation(Base):
    __tablename__ = "journey_participations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journeys.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_question_order: Mapped[int] = mapped_column(Integer, default=1)

    journey: Mapped["Journey"] = relationship(back_populates="participations")
    user: Mapped["User"] = relationship(back_populates="journey_participations")
    responses: Mapped[list["QuestionResponse"]] = relationship(back_populates="participation")


class QuestionResponse(Base):
    __tablename__ = "question_responses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journey_participations.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    answer_text: Mapped[str] = mapped_column(Text, nullable=False)
    ocr_source: Mapped[bool] = mapped_column(default=False)
    time_spent_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    participation: Mapped["JourneyParticipation"] = relationship(back_populates="responses")
    question: Mapped["Question"] = relationship(back_populates="responses")
    evaluation: Mapped["Evaluation | None"] = relationship(back_populates="response", uselist=False)


class OCRUploadStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    PROCESSED = "processed"
    REVIEWED = "reviewed"
    ERROR = "error"


class OCRUpload(Base):
    __tablename__ = "ocr_uploads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journey_participations.id", ondelete="CASCADE"), nullable=True
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[OCRUploadStatus] = mapped_column(
        Enum(OCRUploadStatus), nullable=False, default=OCRUploadStatus.UPLOADED
    )
    extracted_responses: Mapped[list | None] = mapped_column(JSONB)
    import_report: Mapped[dict | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    participation: Mapped["JourneyParticipation | None"] = relationship()
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by])


class PageCode(Base):
    """Short alphanumeric code printed on each PDF page for scan identification.

    Maps a human-readable code (e.g. 'A7K3MX') to the journey, user and page
    it belongs to, enabling reliable lookup even from a bad photo/scan.
    """

    __tablename__ = "page_codes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journeys.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    journey: Mapped["Journey"] = relationship()
    user: Mapped["User"] = relationship()
