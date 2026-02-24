"""Add learning_path_items and learning_path_badges tables

Revision ID: 013_learning_path_items_badges
Revises: 012_training_final_quiz
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "013_learning_path_items_badges"
down_revision = "012_training_final_quiz"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text("SELECT 1 FROM information_schema.tables WHERE table_name = :t"),
        {"t": name},
    )
    return result.scalar() is not None


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.scalar() is not None


def upgrade() -> None:
    # Enum for item type
    pathitemtype = postgresql.ENUM("training", "journey", name="pathitemtype", create_type=False)
    pathitemtype.create(op.get_bind(), checkfirst=True)

    if not _table_exists("learning_path_items"):
        op.create_table(
            "learning_path_items",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("path_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False),
            sa.Column("item_type", pathitemtype, nullable=False),
            sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("order", sa.Integer, nullable=False, server_default="0"),
            sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("path_id", "item_type", "item_id", name="uq_path_item"),
        )

    if not _table_exists("learning_path_badges"):
        op.create_table(
            "learning_path_badges",
            sa.Column("path_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("learning_paths.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("badge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("badges.id", ondelete="CASCADE"), primary_key=True),
        )

    # Add created_by to learning_paths
    if not _column_exists("learning_paths", "created_by"):
        op.add_column("learning_paths", sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("learning_paths", "created_by")
    op.drop_table("learning_path_badges")
    op.drop_table("learning_path_items")
    op.execute("DROP TYPE IF EXISTS pathitemtype")
