"""JWT token blacklist backed by Redis.

Each revoked token is stored as a key ``revoked:<jti>`` with a TTL equal to
the remaining lifetime of the token.  Once the token would have expired
naturally, Redis automatically evicts the key — keeping the blacklist lean.
"""

import logging
from datetime import datetime, timezone

from app.redis import get_redis

logger = logging.getLogger(__name__)

_KEY_PREFIX = "revoked:"


async def revoke_token(jti: str, exp: int) -> None:
    """Add a token's JTI to the blacklist.

    Args:
        jti: The unique JWT ID (``jti`` claim).
        exp: The token expiration as a Unix timestamp (``exp`` claim).
    """
    ttl = exp - int(datetime.now(timezone.utc).timestamp())
    if ttl <= 0:
        return  # Already expired — nothing to blacklist

    r = await get_redis()
    await r.setex(f"{_KEY_PREFIX}{jti}", ttl, "1")
    logger.info("Token revogado: jti=%s, ttl=%ds", jti, ttl)


async def is_token_revoked(jti: str) -> bool:
    """Check whether a token has been revoked."""
    r = await get_redis()
    return await r.exists(f"{_KEY_PREFIX}{jti}") > 0
