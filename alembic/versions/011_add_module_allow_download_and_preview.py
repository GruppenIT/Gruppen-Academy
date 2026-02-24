"""Add allow_download and preview_file_path to training_modules

Revision ID: 011_allow_download_preview
Revises: 010_add_trainings
"""

from alembic import op
import sqlalchemy as sa

revision = "011_allow_download_preview"
down_revision = "010_add_trainings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "training_modules",
        sa.Column("allow_download", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "training_modules",
        sa.Column("preview_file_path", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("training_modules", "preview_file_path")
    op.drop_column("training_modules", "allow_download")
