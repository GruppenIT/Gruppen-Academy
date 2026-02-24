"""Add is_corporate to master_guidelines and make product_id nullable

Revision ID: 001_corporate
Revises:
Create Date: 2026-02-20
"""

from alembic import op
import sqlalchemy as sa

revision = "001_corporate"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make product_id nullable and change ondelete to SET NULL
    op.alter_column(
        "master_guidelines",
        "product_id",
        existing_type=sa.dialects.postgresql.UUID(),
        nullable=True,
    )

    # Add is_corporate column
    op.add_column(
        "master_guidelines",
        sa.Column("is_corporate", sa.Boolean(), server_default="false", nullable=False),
    )

    # Drop old FK and recreate with SET NULL
    op.drop_constraint(
        "master_guidelines_product_id_fkey",
        "master_guidelines",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "master_guidelines_product_id_fkey",
        "master_guidelines",
        "products",
        ["product_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Revert FK to CASCADE
    op.drop_constraint(
        "master_guidelines_product_id_fkey",
        "master_guidelines",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "master_guidelines_product_id_fkey",
        "master_guidelines",
        "products",
        ["product_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Remove is_corporate column
    op.drop_column("master_guidelines", "is_corporate")

    # Make product_id non-nullable again
    op.alter_column(
        "master_guidelines",
        "product_id",
        existing_type=sa.dialects.postgresql.UUID(),
        nullable=False,
    )
