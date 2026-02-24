"""Add certificate_settings and certificates tables

Revision ID: 015_add_certificates
Revises: 014_learning_path_teams
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "015_add_certificates"
down_revision = "014_learning_path_teams"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text("SELECT 1 FROM information_schema.tables WHERE table_name = :t"),
        {"t": name},
    )
    return result.scalar() is not None


def upgrade() -> None:
    if not _table_exists("certificate_settings"):
        op.create_table(
            "certificate_settings",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("logo_path", sa.String(500), nullable=True),
            sa.Column("logo_original_filename", sa.String(255), nullable=True),
            sa.Column("company_name", sa.String(255), nullable=False, server_default="Gruppen"),
            sa.Column("signer_name", sa.String(255), nullable=False, server_default=""),
            sa.Column("signer_title", sa.String(255), nullable=False, server_default=""),
            sa.Column("signature_style", sa.String(50), nullable=False, server_default="line"),
            sa.Column("signature_image_path", sa.String(500), nullable=True),
            sa.Column("extra_text", sa.Text, nullable=True),
            sa.Column("primary_color", sa.String(20), nullable=False, server_default="#1e40af"),
            sa.Column("secondary_color", sa.String(20), nullable=False, server_default="#1e3a5f"),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _table_exists("certificates"):
        op.create_table(
            "certificates",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "enrollment_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("training_enrollments.id", ondelete="CASCADE"),
                unique=True,
                nullable=False,
            ),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "training_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("trainings.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("certificate_number", sa.String(50), unique=True, nullable=False),
            sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("snapshot", postgresql.JSONB, nullable=True),
        )
        op.create_index("ix_certificates_user_id", "certificates", ["user_id"])
        op.create_index("ix_certificates_training_id", "certificates", ["training_id"])


def downgrade() -> None:
    op.drop_table("certificates")
    op.drop_table("certificate_settings")
