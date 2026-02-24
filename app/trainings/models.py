import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
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

# Many-to-many: Training <-> Product
training_product = Table(
    "training_products",
    Base.metadata,
    Column(
        "training_id",
        UUID(as_uuid=True),
        ForeignKey("trainings.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "product_id",
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# Many-to-many: Training <-> Competency
training_competency = Table(
    "training_competencies",
    Base.metadata,
    Column(
        "training_id",
        UUID(as_uuid=True),
        ForeignKey("trainings.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "competency_id",
        UUID(as_uuid=True),
        ForeignKey("competencies.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# Many-to-many: Training <-> Team
training_team = Table(
    "training_teams",
    Base.metadata,
    Column(
        "training_id",
        UUID(as_uuid=True),
        ForeignKey("trainings.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "team_id",
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# Many-to-many: QuizQuestion <-> Competency
quiz_question_competency = Table(
    "quiz_question_competencies",
    Base.metadata,
    Column(
        "quiz_question_id",
        UUID(as_uuid=True),
        ForeignKey("quiz_questions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "competency_id",
        UUID(as_uuid=True),
        ForeignKey("competencies.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class TrainingStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ModuleContentType(str, enum.Enum):
    DOCUMENT = "document"
    SCORM = "scorm"
    AI_GENERATED = "ai_generated"
    RICH_TEXT = "rich_text"


class QuizQuestionType(str, enum.Enum):
    MULTIPLE_CHOICE = "multiple_choice"
    TRUE_FALSE = "true_false"
    ESSAY = "essay"


class EnrollmentStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class Training(Base):
    __tablename__ = "trainings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    domain: Mapped[str] = mapped_column(String(100), nullable=False, default="vendas")
    participant_level: Mapped[str] = mapped_column(
        String(50), nullable=False, default="intermediario"
    )
    status: Mapped[TrainingStatus] = mapped_column(
        Enum(TrainingStatus), nullable=False, default=TrainingStatus.DRAFT
    )
    estimated_duration_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60
    )
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    cover_image_path: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    modules: Mapped[list["TrainingModule"]] = relationship(
        back_populates="training",
        cascade="all, delete-orphan",
        order_by="TrainingModule.order",
    )
    final_quiz: Mapped["TrainingQuiz | None"] = relationship(
        back_populates="training", uselist=False, cascade="all, delete-orphan"
    )
    products = relationship("Product", secondary=training_product)
    competencies = relationship("Competency", secondary=training_competency)
    teams = relationship("Team", secondary=training_team, back_populates="trainings")
    enrollments: Mapped[list["TrainingEnrollment"]] = relationship(
        back_populates="training", cascade="all, delete-orphan"
    )


class TrainingModule(Base):
    __tablename__ = "training_modules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    training_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trainings.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_type: Mapped[ModuleContentType | None] = mapped_column(
        Enum(ModuleContentType)
    )
    content_data: Mapped[dict | None] = mapped_column(JSONB)
    file_path: Mapped[str | None] = mapped_column(String(500))
    original_filename: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(100))
    has_quiz: Mapped[bool] = mapped_column(Boolean, default=False)
    quiz_required_to_advance: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_download: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    preview_file_path: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    training: Mapped["Training"] = relationship(back_populates="modules")
    quiz: Mapped["ModuleQuiz | None"] = relationship(
        back_populates="module", uselist=False, cascade="all, delete-orphan"
    )


class ModuleQuiz(Base):
    __tablename__ = "module_quizzes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    module_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_modules.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Quiz")
    passing_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    module: Mapped["TrainingModule"] = relationship(back_populates="quiz")
    questions: Mapped[list["QuizQuestion"]] = relationship(
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="QuizQuestion.order",
    )


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    quiz_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("module_quizzes.id", ondelete="CASCADE"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[QuizQuestionType] = mapped_column(
        Enum(QuizQuestionType), nullable=False, default=QuizQuestionType.MULTIPLE_CHOICE
    )
    options: Mapped[list | None] = mapped_column(JSONB)
    correct_answer: Mapped[str | None] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    quiz: Mapped["ModuleQuiz"] = relationship(back_populates="questions")
    competencies = relationship("Competency", secondary=quiz_question_competency)


# --- Training-level Final Quiz ---

class TrainingQuiz(Base):
    __tablename__ = "training_quizzes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    training_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trainings.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(
        String(255), nullable=False, default="Avaliação Final"
    )
    passing_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    training: Mapped["Training"] = relationship(back_populates="final_quiz")
    questions: Mapped[list["TrainingQuizQuestion"]] = relationship(
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="TrainingQuizQuestion.order",
    )


class TrainingQuizQuestion(Base):
    __tablename__ = "training_quiz_questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    quiz_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_quizzes.id", ondelete="CASCADE"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[QuizQuestionType] = mapped_column(
        Enum(QuizQuestionType), nullable=False, default=QuizQuestionType.MULTIPLE_CHOICE
    )
    options: Mapped[list | None] = mapped_column(JSONB)
    correct_answer: Mapped[str | None] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    quiz: Mapped["TrainingQuiz"] = relationship(back_populates="questions")


class TrainingQuizAttempt(Base):
    __tablename__ = "training_quiz_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_enrollments.id", ondelete="CASCADE"),
        nullable=False,
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    enrollment: Mapped["TrainingEnrollment"] = relationship(
        back_populates="training_quiz_attempts"
    )


class TrainingEnrollment(Base):
    __tablename__ = "training_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    training_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trainings.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[EnrollmentStatus] = mapped_column(
        Enum(EnrollmentStatus), nullable=False, default=EnrollmentStatus.PENDING
    )
    current_module_order: Mapped[int] = mapped_column(Integer, default=1)
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    quiz_unlocked_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    quiz_unlocked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    training: Mapped["Training"] = relationship(back_populates="enrollments")
    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    module_progress: Mapped[list["ModuleProgress"]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )
    training_quiz_attempts: Mapped[list["TrainingQuizAttempt"]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )


class ModuleProgress(Base):
    __tablename__ = "module_progress"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_enrollments.id", ondelete="CASCADE"),
        nullable=False,
    )
    module_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_modules.id", ondelete="CASCADE"),
        nullable=False,
    )
    content_viewed: Mapped[bool] = mapped_column(Boolean, default=False)
    quiz_score: Mapped[float | None] = mapped_column(Float)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    enrollment: Mapped["TrainingEnrollment"] = relationship(
        back_populates="module_progress"
    )
    module: Mapped["TrainingModule"] = relationship()
    quiz_attempts: Mapped[list["QuizAttempt"]] = relationship(
        back_populates="module_progress", cascade="all, delete-orphan"
    )


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    module_progress_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("module_progress.id", ondelete="CASCADE"),
        nullable=False,
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    module_progress: Mapped["ModuleProgress"] = relationship(
        back_populates="quiz_attempts"
    )
