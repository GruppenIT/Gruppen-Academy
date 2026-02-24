"""Add logo_height to certificate_settings

Revision ID: 016_cert_logo_height
Revises: 015_add_certificates
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = "016_cert_logo_height"
down_revision = "015_add_certificates"
branch_labels = None
depends_on = None


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
    if not _column_exists("certificate_settings", "logo_height"):
        op.add_column(
            "certificate_settings",
            sa.Column("logo_height", sa.Integer, nullable=False, server_default="56"),
        )


def downgrade() -> None:
    op.drop_column("certificate_settings", "logo_height")
