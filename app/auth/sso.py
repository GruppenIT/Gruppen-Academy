"""Microsoft Entra ID (Azure AD) OIDC SSO integration.

All functions receive an `sso_config` dict loaded from the system_settings
table, so no environment variables are needed.

Expected keys in sso_config:
    sso_tenant_id, sso_client_id, sso_client_secret, sso_redirect_uri
"""

import logging
import secrets
import time
import urllib.parse

import httpx
from jose import jwt as jose_jwt
from jose import JWTError

logger = logging.getLogger(__name__)

# In-memory JWKS cache keyed by tenant_id (refreshed on cache miss)
_jwks_cache: dict[str, dict] = {}

# In-memory SSO state/nonce store with TTL for CSRF and replay protection
# Key: state string, Value: (nonce, expiry_timestamp)
_sso_pending: dict[str, tuple[str, float]] = {}
_SSO_STATE_TTL = 600  # 10 minutes


def _authority(tenant_id: str) -> str:
    return f"https://login.microsoftonline.com/{tenant_id}"


def _token_url(tenant_id: str) -> str:
    return f"{_authority(tenant_id)}/oauth2/v2.0/token"


def _authorize_url(tenant_id: str) -> str:
    return f"{_authority(tenant_id)}/oauth2/v2.0/authorize"


def _jwks_uri(tenant_id: str) -> str:
    return f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"


def _issuer(tenant_id: str) -> str:
    return f"https://login.microsoftonline.com/{tenant_id}/v2.0"


def build_authorize_url(sso_config: dict, state: str, nonce: str) -> str:
    """Build the Azure AD authorization URL for the OIDC redirect."""
    params = {
        "client_id": sso_config["sso_client_id"],
        "response_type": "code",
        "redirect_uri": sso_config["sso_redirect_uri"],
        "response_mode": "query",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
    }
    base = _authorize_url(sso_config["sso_tenant_id"])
    return f"{base}?{urllib.parse.urlencode(params)}"


def generate_state() -> str:
    """Generate a random state parameter for CSRF protection."""
    return secrets.token_urlsafe(32)


def generate_nonce() -> str:
    """Generate a random nonce for token replay protection."""
    return secrets.token_urlsafe(32)


def store_sso_state(state: str, nonce: str) -> None:
    """Store SSO state and nonce for later validation."""
    _cleanup_expired()
    _sso_pending[state] = (nonce, time.monotonic() + _SSO_STATE_TTL)


def validate_and_consume_state(state: str) -> str | None:
    """Validate SSO state and return the associated nonce. Consumes the entry."""
    _cleanup_expired()
    entry = _sso_pending.pop(state, None)
    if entry is None:
        return None
    nonce, expiry = entry
    if time.monotonic() > expiry:
        return None
    return nonce


def _cleanup_expired() -> None:
    """Remove expired entries from the pending store."""
    now = time.monotonic()
    expired = [k for k, (_, exp) in _sso_pending.items() if now > exp]
    for k in expired:
        _sso_pending.pop(k, None)


async def exchange_code_for_tokens(sso_config: dict, code: str) -> dict:
    """Exchange authorization code for tokens via Azure AD token endpoint."""
    data = {
        "client_id": sso_config["sso_client_id"],
        "client_secret": sso_config["sso_client_secret"],
        "code": code,
        "redirect_uri": sso_config["sso_redirect_uri"],
        "grant_type": "authorization_code",
        "scope": "openid email profile",
    }
    url = _token_url(sso_config["sso_tenant_id"])
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, data=data)
        resp.raise_for_status()
        return resp.json()


async def _fetch_jwks(tenant_id: str) -> dict:
    """Fetch the JWKS (JSON Web Key Set) from Azure AD."""
    url = _jwks_uri(tenant_id)
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        resp.raise_for_status()
        jwks = resp.json()
        _jwks_cache[tenant_id] = jwks
        return jwks


async def _get_jwks(tenant_id: str) -> dict:
    """Return cached JWKS or fetch fresh copy."""
    if tenant_id in _jwks_cache:
        return _jwks_cache[tenant_id]
    return await _fetch_jwks(tenant_id)


async def validate_id_token(
    sso_config: dict, id_token: str, expected_nonce: str | None = None
) -> dict:
    """Validate and decode the Azure AD id_token.

    Returns the decoded claims dict with at minimum: sub, email, name.
    """
    tenant_id = sso_config["sso_tenant_id"]
    client_id = sso_config["sso_client_id"]

    jwks = await _get_jwks(tenant_id)

    try:
        header = jose_jwt.get_unverified_header(id_token)
        kid = header.get("kid")
    except JWTError as exc:
        raise ValueError(f"Token com header inválido: {exc}") from exc

    # Find the matching key
    rsa_key = None
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            rsa_key = key
            break

    if rsa_key is None:
        # Try refreshing JWKS in case keys rotated
        jwks = await _fetch_jwks(tenant_id)
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                rsa_key = key
                break

    if rsa_key is None:
        raise ValueError("Chave de assinatura não encontrada no JWKS do Azure AD")

    try:
        claims = jose_jwt.decode(
            id_token,
            rsa_key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=_issuer(tenant_id),
            options={"verify_at_hash": False},
        )
    except JWTError as exc:
        raise ValueError(f"Token inválido: {exc}") from exc

    # Validate nonce to prevent token replay attacks
    if expected_nonce is not None:
        token_nonce = claims.get("nonce")
        if token_nonce != expected_nonce:
            raise ValueError("Nonce inválido — possível ataque de replay")

    sub = claims.get("sub")
    email = claims.get("email") or claims.get("preferred_username")
    name = claims.get("name", "")

    if not sub or not email:
        raise ValueError("Token não contém 'sub' ou 'email'")

    return {
        "sub": sub,
        "email": email.lower(),
        "name": name,
    }
