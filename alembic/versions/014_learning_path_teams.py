"""Add learning_path_teams many-to-many table

Revision ID: 014_learning_path_teams
Revises: 013_learning_path_items_badges
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "014_learning_path_teams"
down_revision = "013_learning_path_items_badges"
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
    if not _table_exists("learning_path_teams"):
        op.create_table(
            "learning_path_teams",
            sa.Column("path_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("learning_paths.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("team_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
        )


def downgrade() -> None:
    op.drop_table("learning_path_teams")
