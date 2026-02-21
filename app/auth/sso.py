"""Microsoft Entra ID (Azure AD) OIDC SSO integration."""

import logging
import secrets
import urllib.parse

import httpx
from jose import jwt as jose_jwt
from jose import JWTError

from app.config import settings

logger = logging.getLogger(__name__)

# In-memory JWKS cache (refreshed on startup or on cache miss)
_jwks_cache: dict | None = None


def build_authorize_url(state: str, nonce: str) -> str:
    """Build the Azure AD authorization URL for the OIDC redirect."""
    params = {
        "client_id": settings.azure_ad_client_id,
        "response_type": "code",
        "redirect_uri": settings.azure_ad_redirect_uri,
        "response_mode": "query",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
    }
    return f"{settings.azure_ad_authorize_url}?{urllib.parse.urlencode(params)}"


def generate_state() -> str:
    """Generate a random state parameter for CSRF protection."""
    return secrets.token_urlsafe(32)


def generate_nonce() -> str:
    """Generate a random nonce for token replay protection."""
    return secrets.token_urlsafe(32)


async def exchange_code_for_tokens(code: str) -> dict:
    """Exchange authorization code for tokens via Azure AD token endpoint."""
    data = {
        "client_id": settings.azure_ad_client_id,
        "client_secret": settings.azure_ad_client_secret,
        "code": code,
        "redirect_uri": settings.azure_ad_redirect_uri,
        "grant_type": "authorization_code",
        "scope": "openid email profile",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(settings.azure_ad_token_url, data=data)
        resp.raise_for_status()
        return resp.json()


async def _fetch_jwks() -> dict:
    """Fetch the JWKS (JSON Web Key Set) from Azure AD."""
    global _jwks_cache
    async with httpx.AsyncClient() as client:
        resp = await client.get(settings.azure_ad_jwks_uri)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        return _jwks_cache


async def _get_jwks() -> dict:
    """Return cached JWKS or fetch fresh copy."""
    if _jwks_cache is not None:
        return _jwks_cache
    return await _fetch_jwks()


async def validate_id_token(id_token: str) -> dict:
    """Validate and decode the Azure AD id_token.

    Returns the decoded claims dict with at minimum: sub, email, name.
    """
    # Get signing keys from Azure AD
    jwks = await _get_jwks()

    try:
        # Decode the token header to find the key ID
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
        jwks = await _fetch_jwks()
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
            audience=settings.azure_ad_client_id,
            issuer=settings.azure_ad_issuer,
            options={"verify_at_hash": False},
        )
    except JWTError as exc:
        raise ValueError(f"Token inválido: {exc}") from exc

    # Extract user info from claims
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
