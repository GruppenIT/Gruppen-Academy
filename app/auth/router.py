import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.schemas import LoginRequest, SSOAuthorizeResponse, SSOCallbackRequest, TokenResponse
from app.auth.service import create_access_token
from app.auth.sso import (
    build_authorize_url,
    exchange_code_for_tokens,
    generate_nonce,
    generate_state,
    validate_id_token,
)
from app.auth.utils import verify_password
from app.database import get_db
from app.settings.service import get_sso_config
from app.users.models import User, UserRole
from app.users.service import get_user_by_email

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, data.email)
    if not user or not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo",
        )
    token = create_access_token(subject=str(user.id))
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
    url = build_authorize_url(sso_cfg, state=state, nonce=nonce)
    return SSOAuthorizeResponse(authorize_url=url, state=state)


@router.post("/sso/callback", response_model=TokenResponse)
async def sso_callback(data: SSOCallbackRequest, db: AsyncSession = Depends(get_db)):
    """Exchange the Azure AD authorization code for tokens and authenticate the user.

    Flow:
    1. Exchange `code` for tokens at Azure AD token endpoint.
    2. Validate the `id_token` using Azure AD JWKS.
    3. Find or create the user in the local database.
    4. Return a local JWT access token.
    """
    sso_cfg = await get_sso_config(db)
    if sso_cfg.get("sso_enabled") != "true":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="SSO não está habilitado.",
        )

    # 1. Exchange code for tokens
    try:
        token_response = await exchange_code_for_tokens(sso_cfg, data.code)
    except Exception as exc:
        logger.error("Falha ao trocar código por tokens: %s", exc)
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

    # 2. Validate id_token
    try:
        claims = await validate_id_token(sso_cfg, id_token)
    except ValueError as exc:
        logger.error("Falha ao validar id_token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token inválido: {exc}",
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
    return TokenResponse(access_token=token)
