"""Add SSO fields to users table

Revision ID: 004_sso_fields
Revises: 003_settings
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "004_sso_fields"
down_revision = "003_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=True)
    op.add_column("users", sa.Column("sso_provider", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("sso_sub", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "sso_sub")
    op.drop_column("users", "sso_provider")
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=False)
