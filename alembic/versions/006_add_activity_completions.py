"""Add activity_completions table

Revision ID: 006_activity_completions
Revises: 005_teams_mode
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "006_activity_completions"
down_revision = "005_teams_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "activity_completions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("activity_id", UUID(as_uuid=True), sa.ForeignKey("learning_activities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_activity_completions_user_activity", "activity_completions", ["user_id", "activity_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_activity_completions_user_activity", table_name="activity_completions")
    op.drop_table("activity_completions")
