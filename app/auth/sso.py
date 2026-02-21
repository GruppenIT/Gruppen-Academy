"""Microsoft Entra ID (Azure AD) OIDC SSO integration.

All functions receive an `sso_config` dict loaded from the system_settings
table, so no environment variables are needed.

Expected keys in sso_config:
    sso_tenant_id, sso_client_id, sso_client_secret, sso_redirect_uri
"""

import logging
import secrets
import urllib.parse

import httpx
from jose import jwt as jose_jwt
from jose import JWTError

logger = logging.getLogger(__name__)

# In-memory JWKS cache keyed by tenant_id (refreshed on cache miss)
_jwks_cache: dict[str, dict] = {}


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


async def validate_id_token(sso_config: dict, id_token: str) -> dict:
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
