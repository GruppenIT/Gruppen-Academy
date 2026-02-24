import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import AuditLog

logger = logging.getLogger(__name__)


async def write_audit_log(
    db: AsyncSession,
    *,
    action: str,
    user_id: uuid.UUID | None = None,
    user_email: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    detail: dict | None = None,
    method: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
) -> AuditLog:
    """Persist an audit log entry."""
    entry = AuditLog(
        action=action,
        user_id=user_id,
        user_email=user_email,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        user_agent=user_agent,
        detail=detail,
        method=method,
        path=path,
        status_code=status_code,
    )
    db.add(entry)
    await db.commit()
    logger.info(
        "audit: action=%s user=%s resource=%s/%s ip=%s",
        action,
        user_email or user_id,
        resource_type,
        resource_id,
        ip_address,
    )
    return entry
