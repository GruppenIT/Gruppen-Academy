import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt

from app.config import settings


def _signing_key() -> str:
    """Return the key used to *sign* tokens (private key for RS256, secret for HS256)."""
    if settings.jwt_algorithm == "RS256":
        return settings.jwt_private_key
    return settings.jwt_secret_key


def _verification_key() -> str:
    """Return the key used to *verify* tokens (public key for RS256, secret for HS256)."""
    if settings.jwt_algorithm == "RS256":
        return settings.jwt_public_key
    return settings.jwt_secret_key


def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    return jwt.encode(payload, _signing_key(), algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, _verification_key(), algorithms=[settings.jwt_algorithm])
    if payload.get("type") != "access":
        raise ValueError("Token type inválido")
    return payload
