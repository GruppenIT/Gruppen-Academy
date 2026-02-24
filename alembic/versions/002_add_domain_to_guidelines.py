"""Add domain column to master_guidelines

Revision ID: 002_domain
Revises: 001_corporate
Create Date: 2026-02-20
"""

from alembic import op
import sqlalchemy as sa

revision = "002_domain"
down_revision = "001_corporate"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "master_guidelines",
        sa.Column("domain", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("master_guidelines", "domain")
