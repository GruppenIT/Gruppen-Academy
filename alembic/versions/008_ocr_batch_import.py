"""Make ocr_uploads.participation_id nullable and add import_report

Revision ID: 008_ocr_batch_import
Revises: 007_audit_logs
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "008_ocr_batch_import"
down_revision = "007_audit_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "ocr_uploads",
        "participation_id",
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.add_column("ocr_uploads", sa.Column("import_report", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("ocr_uploads", "import_report")
    op.alter_column(
        "ocr_uploads",
        "participation_id",
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=False,
    )
