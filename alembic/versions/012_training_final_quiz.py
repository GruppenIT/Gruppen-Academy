"""Add training final quiz, remove module xp_reward

Revision ID: 012_training_final_quiz
Revises: 011_allow_download_preview
Create Date: 2026-02-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "012_training_final_quiz"
down_revision = "011_allow_download_preview"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- training_quizzes (1:1 with training) ---
    op.create_table(
        "training_quizzes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "training_id",
            UUID(as_uuid=True),
            sa.ForeignKey("trainings.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False, server_default="Avaliação Final"),
        sa.Column("passing_score", sa.Float, nullable=False, server_default="0.7"),
        sa.Column("max_attempts", sa.Integer, nullable=False, server_default="3"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- training_quiz_questions ---
    op.create_table(
        "training_quiz_questions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "quiz_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_quizzes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column(
            "type",
            sa.Enum("multiple_choice", "true_false", "essay", name="quizquestiontype", create_type=False),
            nullable=False,
            server_default="multiple_choice",
        ),
        sa.Column("options", JSONB),
        sa.Column("correct_answer", sa.Text),
        sa.Column("explanation", sa.Text),
        sa.Column("weight", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- training_quiz_attempts ---
    op.create_table(
        "training_quiz_attempts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "enrollment_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_enrollments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("score", sa.Float, nullable=False),
        sa.Column("answers", JSONB, nullable=False),
        sa.Column("passed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )

    # --- Add unlock fields to training_enrollments ---
    op.add_column(
        "training_enrollments",
        sa.Column("quiz_unlocked_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "training_enrollments",
        sa.Column("quiz_unlocked_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- Remove xp_reward from training_modules ---
    op.drop_column("training_modules", "xp_reward")


def downgrade() -> None:
    # Restore xp_reward on training_modules
    op.add_column(
        "training_modules",
        sa.Column("xp_reward", sa.Integer, nullable=False, server_default="20"),
    )

    # Drop unlock columns
    op.drop_column("training_enrollments", "quiz_unlocked_at")
    op.drop_column("training_enrollments", "quiz_unlocked_by")

    # Drop new tables
    op.drop_table("training_quiz_attempts")
    op.drop_table("training_quiz_questions")
    op.drop_table("training_quizzes")
