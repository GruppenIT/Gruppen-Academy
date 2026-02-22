"""Add trainings module: trainings, modules, quizzes, enrollments, progress

Revision ID: 010_add_trainings
Revises: 009_add_page_codes
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "010_add_trainings"
down_revision = "009_add_page_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- trainings ---
    op.create_table(
        "trainings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("domain", sa.String(100), nullable=False, server_default="vendas"),
        sa.Column("participant_level", sa.String(50), nullable=False, server_default="intermediario"),
        sa.Column(
            "status",
            sa.Enum("draft", "published", "archived", name="trainingstatus"),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("estimated_duration_minutes", sa.Integer, nullable=False, server_default="60"),
        sa.Column("xp_reward", sa.Integer, nullable=False, server_default="100"),
        sa.Column("cover_image_path", sa.String(500)),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- training_products (M:N) ---
    op.create_table(
        "training_products",
        sa.Column("training_id", UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
    )

    # --- training_competencies (M:N) ---
    op.create_table(
        "training_competencies",
        sa.Column("training_id", UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("competency_id", UUID(as_uuid=True), sa.ForeignKey("competencies.id", ondelete="CASCADE"), primary_key=True),
    )

    # --- training_teams (M:N) ---
    op.create_table(
        "training_teams",
        sa.Column("training_id", UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
    )

    # --- training_modules ---
    op.create_table(
        "training_modules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("order", sa.Integer, nullable=False, server_default="1"),
        sa.Column(
            "content_type",
            sa.Enum("document", "scorm", "ai_generated", "rich_text", name="modulecontenttype"),
        ),
        sa.Column("content_data", JSONB),
        sa.Column("file_path", sa.String(500)),
        sa.Column("original_filename", sa.String(255)),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("has_quiz", sa.Boolean, server_default="false"),
        sa.Column("quiz_required_to_advance", sa.Boolean, server_default="false"),
        sa.Column("xp_reward", sa.Integer, nullable=False, server_default="20"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- module_quizzes ---
    op.create_table(
        "module_quizzes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("module_id", UUID(as_uuid=True), sa.ForeignKey("training_modules.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False, server_default="Quiz"),
        sa.Column("passing_score", sa.Float, nullable=False, server_default="0.7"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- quiz_questions ---
    op.create_table(
        "quiz_questions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("quiz_id", UUID(as_uuid=True), sa.ForeignKey("module_quizzes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column(
            "type",
            sa.Enum("multiple_choice", "true_false", "essay", name="quizquestiontype"),
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

    # --- quiz_question_competencies (M:N) ---
    op.create_table(
        "quiz_question_competencies",
        sa.Column("quiz_question_id", UUID(as_uuid=True), sa.ForeignKey("quiz_questions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("competency_id", UUID(as_uuid=True), sa.ForeignKey("competencies.id", ondelete="CASCADE"), primary_key=True),
    )

    # --- training_enrollments ---
    op.create_table(
        "training_enrollments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("training_id", UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "in_progress", "completed", name="enrollmentstatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("current_module_order", sa.Integer, server_default="1"),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )

    # --- module_progress ---
    op.create_table(
        "module_progress",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("enrollment_id", UUID(as_uuid=True), sa.ForeignKey("training_enrollments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("module_id", UUID(as_uuid=True), sa.ForeignKey("training_modules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content_viewed", sa.Boolean, server_default="false"),
        sa.Column("quiz_score", sa.Float),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )

    # --- quiz_attempts ---
    op.create_table(
        "quiz_attempts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("module_progress_id", UUID(as_uuid=True), sa.ForeignKey("module_progress.id", ondelete="CASCADE"), nullable=False),
        sa.Column("score", sa.Float, nullable=False),
        sa.Column("answers", JSONB, nullable=False),
        sa.Column("passed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("quiz_attempts")
    op.drop_table("module_progress")
    op.drop_table("training_enrollments")
    op.drop_table("quiz_question_competencies")
    op.drop_table("quiz_questions")
    op.drop_table("module_quizzes")
    op.drop_table("training_modules")
    op.drop_table("training_teams")
    op.drop_table("training_competencies")
    op.drop_table("training_products")
    op.drop_table("trainings")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS trainingstatus")
    op.execute("DROP TYPE IF EXISTS modulecontenttype")
    op.execute("DROP TYPE IF EXISTS quizquestiontype")
    op.execute("DROP TYPE IF EXISTS enrollmentstatus")
