import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CertificateSettings(Base):
    """Singleton-like settings for certificate customization.

    Only one row should exist (enforced by application logic).
    """

    __tablename__ = "certificate_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    logo_path: Mapped[str | None] = mapped_column(String(500))
    logo_original_filename: Mapped[str | None] = mapped_column(String(255))
    company_name: Mapped[str] = mapped_column(
        String(255), nullable=False, default="Gruppen"
    )
    signer_name: Mapped[str] = mapped_column(
        String(255), nullable=False, default=""
    )
    signer_title: Mapped[str] = mapped_column(
        String(255), nullable=False, default=""
    )
    signature_style: Mapped[str] = mapped_column(
        String(50), nullable=False, default="line"
    )  # line, typed, image
    signature_image_path: Mapped[str | None] = mapped_column(String(500))
    extra_text: Mapped[str | None] = mapped_column(Text)
    primary_color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#1e40af"
    )
    secondary_color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#1e3a5f"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Certificate(Base):
    """Issued certificate for a completed training enrollment."""

    __tablename__ = "certificates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_enrollments.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    training_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trainings.id", ondelete="CASCADE"),
        nullable=False,
    )
    certificate_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Snapshot of settings at issuance time
    snapshot: Mapped[dict | None] = mapped_column(JSONB)

    enrollment = relationship("TrainingEnrollment", foreign_keys=[enrollment_id])
    user = relationship("User", foreign_keys=[user_id])
    training = relationship("Training", foreign_keys=[training_id])
