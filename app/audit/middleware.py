"""Middleware that automatically writes audit log entries for mutating API requests.

Logs POST/PUT/PATCH/DELETE requests to /api/ paths. The middleware captures
the response status and, when available, the authenticated user from
request.state (set by auth dependencies).
"""

import logging
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import async_session
from app.audit.service import write_audit_log

logger = logging.getLogger(__name__)

_AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Only audit mutating API calls
        if request.method not in _AUDITED_METHODS or not request.url.path.startswith("/api/"):
            return await call_next(request)

        response = await call_next(request)

        # Fire-and-forget: write audit entry in its own session so we never
        # block or break the request pipeline.
        try:
            user_id: uuid.UUID | None = None
            user_email: str | None = None
            # Auth dependencies set request.state.user when available
            user = getattr(request.state, "user", None)
            if user:
                user_id = user.id
                user_email = user.email

            ip = request.client.host if request.client else None
            ua = request.headers.get("user-agent", "")[:512]

            async with async_session() as db:
                await write_audit_log(
                    db,
                    action=_derive_action(request),
                    user_id=user_id,
                    user_email=user_email,
                    ip_address=ip,
                    user_agent=ua,
                    method=request.method,
                    path=request.url.path[:500],
                    status_code=response.status_code,
                )
        except Exception:
            logger.exception("Failed to write audit log for %s %s", request.method, request.url.path)

        return response


def _derive_action(request: Request) -> str:
    """Derive a human-readable action name from the request."""
    path = request.url.path
    method = request.method

    # Map well-known paths to semantic action names
    action_map = {
        ("POST", "/api/auth/login"): "auth.login",
        ("POST", "/api/auth/logout"): "auth.logout",
        ("POST", "/api/auth/sso/callback"): "auth.sso_login",
        ("POST", "/api/users"): "user.create",
        ("POST", "/api/journeys"): "journey.create",
        ("POST", "/api/catalog"): "catalog.create",
        ("POST", "/api/settings"): "settings.update",
    }

    key = (method, path)
    if key in action_map:
        return action_map[key]

    # Generic: "post./api/users/{id}" -> "users.update" etc.
    segments = [s for s in path.split("/") if s and s != "api"]
    resource = segments[0] if segments else "unknown"
    verb_map = {"POST": "create", "PUT": "update", "PATCH": "update", "DELETE": "delete"}
    return f"{resource}.{verb_map.get(method, method.lower())}"
