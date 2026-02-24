import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.certificates.schemas import (
    CertificateOut,
    CertificateSettingsOut,
    CertificateSettingsUpdate,
    CertificateViewOut,
)
from app.certificates.service import (
    get_certificate_by_enrollment,
    get_certificate_view,
    get_or_create_settings,
    get_user_certificates,
    issue_certificate,
    update_logo_path,
    update_settings,
    update_signature_image_path,
)
from app.config import settings as app_settings
from app.database import get_db
from app.users.models import User, UserRole

router = APIRouter()

_CERT_UPLOAD_DIR = os.path.join(app_settings.upload_dir, "certificates")
_ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/svg+xml"}
_MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB


def _ensure_upload_dir() -> str:
    os.makedirs(_CERT_UPLOAD_DIR, exist_ok=True)
    return _CERT_UPLOAD_DIR


# ── Admin: Certificate Settings ──────────────────────────────────────


@router.get("/settings", response_model=CertificateSettingsOut)
async def get_certificate_settings(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await get_or_create_settings(db)


@router.put("/settings", response_model=CertificateSettingsOut)
async def update_certificate_settings(
    data: CertificateSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await update_settings(db, data)


@router.post("/settings/logo", response_model=CertificateSettingsOut)
async def upload_logo(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de imagem não suportado. Use PNG, JPEG, WebP ou SVG.",
        )
    content = await file.read()
    if len(content) > _MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Imagem muito grande. Máximo 5 MB.",
        )
    upload_dir = _ensure_upload_dir()
    ext = (file.filename or "logo.png").rsplit(".", 1)[-1] if file.filename else "png"
    filename = f"logo.{ext}"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)
    return await update_logo_path(db, filepath, file.filename or filename)


@router.post("/settings/signature-image", response_model=CertificateSettingsOut)
async def upload_signature_image(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de imagem não suportado. Use PNG, JPEG, WebP ou SVG.",
        )
    content = await file.read()
    if len(content) > _MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Imagem muito grande. Máximo 5 MB.",
        )
    upload_dir = _ensure_upload_dir()
    ext = (file.filename or "sig.png").rsplit(".", 1)[-1] if file.filename else "png"
    filename = f"signature.{ext}"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)
    return await update_signature_image_path(db, filepath)


# ── Public: Serve uploaded files (used by certificate viewer) ────────


@router.get("/settings/logo-file")
async def serve_logo(
    db: AsyncSession = Depends(get_db),
):
    settings = await get_or_create_settings(db)
    if not settings.logo_path or not os.path.isfile(settings.logo_path):
        raise HTTPException(status_code=404, detail="Logo não encontrado.")
    return FileResponse(settings.logo_path)


@router.get("/settings/signature-file")
async def serve_signature(
    db: AsyncSession = Depends(get_db),
):
    settings = await get_or_create_settings(db)
    if not settings.signature_image_path or not os.path.isfile(
        settings.signature_image_path
    ):
        raise HTTPException(status_code=404, detail="Assinatura não encontrada.")
    return FileResponse(settings.signature_image_path)


# ── Public: Serve certificate files (logo/signature from snapshot) ───


@router.get("/files/logo/{certificate_id}")
async def serve_certificate_logo(
    certificate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    from app.certificates.service import get_certificate_by_id

    cert = await get_certificate_by_id(db, certificate_id)
    if not cert or not cert.snapshot:
        raise HTTPException(status_code=404)
    logo_path = cert.snapshot.get("logo_path")
    if not logo_path or not os.path.isfile(logo_path):
        raise HTTPException(status_code=404)
    return FileResponse(logo_path)


@router.get("/files/signature/{certificate_id}")
async def serve_certificate_signature(
    certificate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    from app.certificates.service import get_certificate_by_id

    cert = await get_certificate_by_id(db, certificate_id)
    if not cert or not cert.snapshot:
        raise HTTPException(status_code=404)
    sig_path = cert.snapshot.get("signature_image_path")
    if not sig_path or not os.path.isfile(sig_path):
        raise HTTPException(status_code=404)
    return FileResponse(sig_path)


# ── Professional: Issue & view certificates ──────────────────────────


@router.post("/issue/{enrollment_id}", response_model=CertificateOut)
async def issue_my_certificate(
    enrollment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        cert = await issue_certificate(db, enrollment_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return CertificateOut(
        id=cert.id,
        enrollment_id=cert.enrollment_id,
        user_id=cert.user_id,
        training_id=cert.training_id,
        certificate_number=cert.certificate_number,
        issued_at=cert.issued_at,
    )


@router.get("/my", response_model=list[CertificateOut])
async def list_my_certificates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    certs = await get_user_certificates(db, current_user.id)
    result = []
    for c in certs:
        result.append(
            CertificateOut(
                id=c.id,
                enrollment_id=c.enrollment_id,
                user_id=c.user_id,
                training_id=c.training_id,
                certificate_number=c.certificate_number,
                issued_at=c.issued_at,
                training_title=c.training.title if c.training else None,
            )
        )
    return result


@router.get("/enrollment/{enrollment_id}", response_model=CertificateOut | None)
async def get_certificate_for_enrollment(
    enrollment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cert = await get_certificate_by_enrollment(db, enrollment_id)
    if not cert:
        return None
    if cert.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    return CertificateOut(
        id=cert.id,
        enrollment_id=cert.enrollment_id,
        user_id=cert.user_id,
        training_id=cert.training_id,
        certificate_number=cert.certificate_number,
        issued_at=cert.issued_at,
    )


@router.get("/{certificate_id}/view", response_model=CertificateViewOut)
async def view_certificate(
    certificate_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint to view/print a certificate. No auth required for sharing."""
    view = await get_certificate_view(db, certificate_id)
    if not view:
        raise HTTPException(status_code=404, detail="Certificado não encontrado.")
    return view
