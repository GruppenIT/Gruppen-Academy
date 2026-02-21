"""Add teams, journey mode, question max_time_seconds

Revision ID: 005_teams_mode
Revises: 004_add_sso_fields_to_users
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "005_teams_mode"
down_revision = "004_add_sso_fields_to_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Teams table ---
    op.create_table(
        "teams",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- Team members (many-to-many) ---
    op.create_table(
        "team_members",
        sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )

    # --- Journey <-> Team (many-to-many) ---
    op.create_table(
        "journey_teams",
        sa.Column("journey_id", UUID(as_uuid=True), sa.ForeignKey("journeys.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
    )

    # --- Journey mode column ---
    op.execute("CREATE TYPE journeymode AS ENUM ('sync', 'async')")
    op.add_column("journeys", sa.Column("mode", sa.Enum("sync", "async", name="journeymode"), nullable=False, server_default="async"))

    # --- Question max_time_seconds ---
    op.add_column("questions", sa.Column("max_time_seconds", sa.Integer, nullable=True))

    # --- Participation current_question_order ---
    op.add_column("journey_participations", sa.Column("current_question_order", sa.Integer, nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("journey_participations", "current_question_order")
    op.drop_column("questions", "max_time_seconds")
    op.drop_column("journeys", "mode")
    op.execute("DROP TYPE journeymode")
    op.drop_table("journey_teams")
    op.drop_table("team_members")
    op.drop_table("teams")
