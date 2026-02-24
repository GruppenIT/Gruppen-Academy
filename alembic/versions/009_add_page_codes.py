"""Add page_codes table for PDF scan identification

Revision ID: 009_add_page_codes
Revises: 008_ocr_batch_import
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "009_add_page_codes"
down_revision = "008_ocr_batch_import"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "page_codes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(12), unique=True, index=True, nullable=False),
        sa.Column(
            "journey_id",
            UUID(as_uuid=True),
            sa.ForeignKey("journeys.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("page_number", sa.Integer, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("page_codes")
