import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Table, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Many-to-many: LearningPath <-> Competency
path_competency = Table(
    "path_competency",
    Base.metadata,
    Column("path_id", UUID(as_uuid=True), ForeignKey("learning_paths.id", ondelete="CASCADE")),
    Column("competency_id", UUID(as_uuid=True), ForeignKey("competencies.id", ondelete="CASCADE")),
)

# Many-to-many: LearningPath <-> Badge
learning_path_badge = Table(
    "learning_path_badges",
    Base.metadata,
    Column("path_id", UUID(as_uuid=True), ForeignKey("learning_paths.id", ondelete="CASCADE"), primary_key=True),
    Column("badge_id", UUID(as_uuid=True), ForeignKey("badges.id", ondelete="CASCADE"), primary_key=True),
)


class ActivityType(str, enum.Enum):
    QUIZ = "quiz"
    SIMULATION = "simulation"
    CASE_STUDY = "case_study"
    GUIDED_CHAT = "guided_chat"
    MICROLESSON = "microlesson"


class PathItemType(str, enum.Enum):
    TRAINING = "training"
    JOURNEY = "journey"


class LearningPath(Base):
    __tablename__ = "learning_paths"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    domain: Mapped[str] = mapped_column(String(100), nullable=False, default="vendas")
    target_role: Mapped[str] = mapped_column(String(100), nullable=False, default="vendedor")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    competencies = relationship("Competency", secondary=path_competency)
    activities: Mapped[list["LearningActivity"]] = relationship(
        back_populates="path", cascade="all, delete-orphan"
    )
    items: Mapped[list["LearningPathItem"]] = relationship(
        back_populates="path", cascade="all, delete-orphan", order_by="LearningPathItem.order"
    )
    badges = relationship("Badge", secondary=learning_path_badge)


class LearningPathItem(Base):
    __tablename__ = "learning_path_items"
    __table_args__ = (
        UniqueConstraint("path_id", "item_type", "item_id", name="uq_path_item"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    path_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False
    )
    item_type: Mapped[PathItemType] = mapped_column(Enum(PathItemType, name="pathitemtype", create_constraint=False), nullable=False)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    path: Mapped["LearningPath"] = relationship(back_populates="items")


class LearningActivity(Base):
    __tablename__ = "learning_activities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    path_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[ActivityType] = mapped_column(Enum(ActivityType), nullable=False)
    content: Mapped[dict | None] = mapped_column(JSONB)
    order: Mapped[int] = mapped_column(Integer, default=0)
    points_reward: Mapped[int] = mapped_column(Integer, default=10)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    path: Mapped["LearningPath"] = relationship(back_populates="activities")


class ActivityCompletion(Base):
    __tablename__ = "activity_completions"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_id", name="uq_user_activity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("learning_activities.id", ondelete="CASCADE"), nullable=False
    )
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    activity: Mapped["LearningActivity"] = relationship()


class TutorSession(Base):
    __tablename__ = "tutor_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    activity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("learning_activities.id", ondelete="SET NULL")
    )
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    messages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    summary: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
