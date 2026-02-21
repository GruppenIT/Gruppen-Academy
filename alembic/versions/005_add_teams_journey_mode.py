"""Add teams, journey mode, question max_time_seconds

Revision ID: 005_teams_mode
Revises: 004_sso_fields
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "005_teams_mode"
down_revision = "004_sso_fields"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"),
        {"t": table_name},
    )
    return result.scalar()


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c)"),
        {"t": table_name, "c": column_name},
    )
    return result.scalar()


def _type_exists(conn, type_name: str) -> bool:
    result = conn.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = :t)"),
        {"t": type_name},
    )
    return result.scalar()


def upgrade() -> None:
    conn = op.get_bind()

    # --- Teams table ---
    if not _table_exists(conn, "teams"):
        op.create_table(
            "teams",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    # --- Team members (many-to-many) ---
    if not _table_exists(conn, "team_members"):
        op.create_table(
            "team_members",
            sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        )

    # --- Journey <-> Team (many-to-many) ---
    if not _table_exists(conn, "journey_teams"):
        op.create_table(
            "journey_teams",
            sa.Column("journey_id", UUID(as_uuid=True), sa.ForeignKey("journeys.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
        )

    # --- Journey mode column ---
    if not _type_exists(conn, "journeymode"):
        op.execute("CREATE TYPE journeymode AS ENUM ('sync', 'async')")
    if not _column_exists(conn, "journeys", "mode"):
        op.add_column("journeys", sa.Column("mode", sa.Enum("sync", "async", name="journeymode"), nullable=False, server_default="async"))

    # --- Question max_time_seconds ---
    if not _column_exists(conn, "questions", "max_time_seconds"):
        op.add_column("questions", sa.Column("max_time_seconds", sa.Integer, nullable=True))

    # --- Participation current_question_order ---
    if not _column_exists(conn, "journey_participations", "current_question_order"):
        op.add_column("journey_participations", sa.Column("current_question_order", sa.Integer, nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("journey_participations", "current_question_order")
    op.drop_column("questions", "max_time_seconds")
    op.drop_column("journeys", "mode")
    op.execute("DROP TYPE IF EXISTS journeymode")
    op.drop_table("journey_teams")
    op.drop_table("team_members")
    op.drop_table("teams")
