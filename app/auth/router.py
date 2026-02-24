import logging
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.blacklist import revoke_token
from app.auth.dependencies import get_current_user
from app.auth.schemas import LoginRequest, SSOAuthorizeResponse, SSOCallbackRequest, TokenResponse
from app.auth.service import create_access_token, decode_access_token
from app.config import settings as app_settings
from app.auth.sso import (
    build_authorize_url,
    exchange_code_for_tokens,
    generate_nonce,
    generate_state,
    store_sso_state,
    validate_and_consume_state,
    validate_id_token,
)
from app.auth.utils import get_password_hash, verify_password
from app.database import get_db
from app.settings.service import get_sso_config
from app.users.models import User, UserRole
from app.users.service import get_user_by_email

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Simple in-memory rate limiter for login ---
_login_attempts: dict[str, list[float]] = defaultdict(list)
_MAX_LOGIN_ATTEMPTS = 5
_LOGIN_WINDOW_SECONDS = 300  # 5 minutes


def _check_rate_limit(key: str) -> None:
    """Raise 429 if too many login attempts from this key."""
    now = time.monotonic()
    attempts = _login_attempts[key]
    _login_attempts[key] = [t for t in attempts if now - t < _LOGIN_WINDOW_SECONDS]
    if len(_login_attempts[key]) >= _MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de login. Aguarde alguns minutos.",
        )


def _record_attempt(key: str) -> None:
    _login_attempts[key].append(time.monotonic())


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set an HttpOnly secure cookie containing the JWT."""
    response.set_cookie(
        key=app_settings.cookie_name,
        value=token,
        httponly=True,
        secure=app_settings.cookie_secure,
        samesite=app_settings.cookie_samesite,
        max_age=app_settings.jwt_access_token_expire_minutes * 60,
        path="/",
        domain=app_settings.cookie_domain,
    )


def _clear_auth_cookie(response: Response) -> None:
    """Clear the auth cookie."""
    response.delete_cookie(
        key=app_settings.cookie_name,
        path="/",
        domain=app_settings.cookie_domain,
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{data.email}"
    _check_rate_limit(rate_key)

    user = await get_user_by_email(db, data.email)

    # Timing-safe: always hash even if user not found to prevent timing attacks
    if not user or not user.hashed_password:
        get_password_hash("dummy-password-to-prevent-timing-attack")
        _record_attempt(rate_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
        )
    if not verify_password(data.password, user.hashed_password):
        _record_attempt(rate_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo",
        )

    logger.info("Login bem-sucedido: user_id=%s, ip=%s", user.id, client_ip)
    token = create_access_token(subject=str(user.id))
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.get("/sso/check")
async def sso_check(db: AsyncSession = Depends(get_db)):
    """Public endpoint: check if SSO is enabled (used by login page)."""
    sso_cfg = await get_sso_config(db)
    enabled = (
        sso_cfg.get("sso_enabled") == "true"
        and bool(sso_cfg.get("sso_client_id"))
        and bool(sso_cfg.get("sso_tenant_id"))
    )
    return {"enabled": enabled}


@router.get("/sso/authorize", response_model=SSOAuthorizeResponse)
async def sso_authorize(db: AsyncSession = Depends(get_db)):
    """Return the Azure AD authorization URL for OIDC login.

    The frontend should redirect the user to `authorize_url`.
    After login, Azure AD redirects back with a `code` and `state`.
    """
    sso_cfg = await get_sso_config(db)
    if sso_cfg.get("sso_enabled") != "true":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="SSO não está habilitado. Ative nas Configurações do sistema.",
        )
    if not sso_cfg.get("sso_client_id") or not sso_cfg.get("sso_tenant_id"):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="SSO não configurado. Preencha Tenant ID e Client ID nas Configurações.",
        )
    state = generate_state()
    nonce = generate_nonce()
    # Store state+nonce server-side for validation on callback
    store_sso_state(state, nonce)
    url = build_authorize_url(sso_cfg, state=state, nonce=nonce)
    return SSOAuthorizeResponse(authorize_url=url, state=state)


@router.post("/sso/callback", response_model=TokenResponse)
async def sso_callback(data: SSOCallbackRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Exchange the Azure AD authorization code for tokens and authenticate the user.

    Flow:
    1. Validate state parameter (CSRF protection).
    2. Exchange `code` for tokens at Azure AD token endpoint.
    3. Validate the `id_token` using Azure AD JWKS + nonce.
    4. Find or create the user in the local database.
    5. Return a local JWT access token.
    """
    sso_cfg = await get_sso_config(db)
    if sso_cfg.get("sso_enabled") != "true":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="SSO não está habilitado.",
        )

    # 1. Validate state and recover nonce
    expected_nonce = validate_and_consume_state(data.state)
    if expected_nonce is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estado de autenticação inválido ou expirado. Tente novamente.",
        )

    # 2. Exchange code for tokens
    try:
        token_response = await exchange_code_for_tokens(sso_cfg, data.code)
    except Exception as exc:
        logger.error("Falha ao trocar código por tokens: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Falha ao autenticar com Azure AD. Código inválido ou expirado.",
        ) from exc

    id_token = token_response.get("id_token")
    if not id_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Azure AD não retornou id_token.",
        )

    # 3. Validate id_token with nonce
    try:
        claims = await validate_id_token(sso_cfg, id_token, expected_nonce=expected_nonce)
    except ValueError as exc:
        logger.error("Falha ao validar id_token: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação inválido. Tente novamente.",
        ) from exc

    azure_sub = claims["sub"]
    email = claims["email"]
    name = claims["name"]

    # 3. Find or create local user
    user = await get_user_by_email(db, email)

    if user is None:
        # Auto-provision new SSO user as professional
        user = User(
            email=email,
            full_name=name or email.split("@")[0],
            role=UserRole.PROFESSIONAL,
            sso_provider="azure_ad",
            sso_sub=azure_sub,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info("Novo usuário criado via SSO: %s", email)
    else:
        # Link SSO info if not already linked
        if not user.sso_provider:
            user.sso_provider = "azure_ad"
            user.sso_sub = azure_sub
            await db.commit()

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo",
        )

    # 4. Issue local JWT
    token = create_access_token(subject=str(user.id))
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response):
    """Revoke the current JWT and clear the auth cookie."""
    # Best-effort: try to blacklist the token so it can't be reused
    cookie_token = request.cookies.get(app_settings.cookie_name)
    if cookie_token:
        try:
            payload = decode_access_token(cookie_token)
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                await revoke_token(jti, int(exp))
        except Exception:
            pass  # Token may already be invalid — still clear the cookie
    _clear_auth_cookie(response)
