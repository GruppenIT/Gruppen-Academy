import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.certificates.models import Certificate, CertificateSettings
from app.certificates.schemas import CertificateSettingsUpdate, CertificateViewOut
from app.trainings.models import EnrollmentStatus, TrainingEnrollment


def _generate_certificate_number() -> str:
    """Generate a unique certificate number: GA-YYYYMMDD-XXXX."""
    now = datetime.now(timezone.utc)
    short_id = uuid.uuid4().hex[:8].upper()
    return f"GA-{now.strftime('%Y%m%d')}-{short_id}"


async def get_or_create_settings(db: AsyncSession) -> CertificateSettings:
    result = await db.execute(select(CertificateSettings).limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = CertificateSettings(
            company_name="Gruppen",
            signer_name="",
            signer_title="",
            signature_style="line",
            primary_color="#1e40af",
            secondary_color="#1e3a5f",
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


async def update_settings(
    db: AsyncSession, data: CertificateSettingsUpdate
) -> CertificateSettings:
    settings = await get_or_create_settings(db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    await db.commit()
    await db.refresh(settings)
    return settings


async def update_logo_path(
    db: AsyncSession, logo_path: str, original_filename: str
) -> CertificateSettings:
    settings = await get_or_create_settings(db)
    settings.logo_path = logo_path
    settings.logo_original_filename = original_filename
    await db.commit()
    await db.refresh(settings)
    return settings


async def update_signature_image_path(
    db: AsyncSession, path: str
) -> CertificateSettings:
    settings = await get_or_create_settings(db)
    settings.signature_image_path = path
    await db.commit()
    await db.refresh(settings)
    return settings


async def issue_certificate(
    db: AsyncSession, enrollment_id: uuid.UUID, user_id: uuid.UUID
) -> Certificate:
    # Check if certificate already exists
    result = await db.execute(
        select(Certificate).where(Certificate.enrollment_id == enrollment_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    # Validate enrollment is completed and belongs to user
    result = await db.execute(
        select(TrainingEnrollment)
        .options(joinedload(TrainingEnrollment.training))
        .where(
            TrainingEnrollment.id == enrollment_id,
            TrainingEnrollment.user_id == user_id,
        )
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment:
        raise ValueError("Inscrição não encontrada.")
    if enrollment.status != EnrollmentStatus.COMPLETED:
        raise ValueError("O treinamento ainda não foi concluído.")

    # Take snapshot of current settings
    settings = await get_or_create_settings(db)
    snapshot = {
        "company_name": settings.company_name,
        "signer_name": settings.signer_name,
        "signer_title": settings.signer_title,
        "signature_style": settings.signature_style,
        "signature_image_path": settings.signature_image_path,
        "logo_path": settings.logo_path,
        "extra_text": settings.extra_text,
        "primary_color": settings.primary_color,
        "secondary_color": settings.secondary_color,
    }

    cert = Certificate(
        enrollment_id=enrollment_id,
        user_id=user_id,
        training_id=enrollment.training_id,
        certificate_number=_generate_certificate_number(),
        snapshot=snapshot,
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return cert


async def get_certificate_by_id(
    db: AsyncSession, certificate_id: uuid.UUID
) -> Certificate | None:
    result = await db.execute(
        select(Certificate)
        .options(
            joinedload(Certificate.user),
            joinedload(Certificate.training),
            joinedload(Certificate.enrollment),
        )
        .where(Certificate.id == certificate_id)
    )
    return result.scalar_one_or_none()


async def get_certificate_view(
    db: AsyncSession, certificate_id: uuid.UUID
) -> CertificateViewOut | None:
    cert = await get_certificate_by_id(db, certificate_id)
    if not cert:
        return None

    # Use snapshot settings (frozen at issuance time)
    snap = cert.snapshot or {}

    logo_url = None
    if snap.get("logo_path"):
        logo_url = f"/api/certificates/files/logo/{cert.id}"

    sig_url = None
    if snap.get("signature_image_path"):
        sig_url = f"/api/certificates/files/signature/{cert.id}"

    return CertificateViewOut(
        id=cert.id,
        certificate_number=cert.certificate_number,
        issued_at=cert.issued_at,
        user_name=cert.user.full_name if cert.user else "—",
        training_title=cert.training.title if cert.training else "—",
        training_domain=cert.training.domain if cert.training else "",
        training_duration_minutes=(
            cert.training.estimated_duration_minutes if cert.training else 0
        ),
        completed_at=cert.enrollment.completed_at if cert.enrollment else None,
        company_name=snap.get("company_name", "Gruppen"),
        signer_name=snap.get("signer_name", ""),
        signer_title=snap.get("signer_title", ""),
        signature_style=snap.get("signature_style", "line"),
        signature_image_url=sig_url,
        logo_url=logo_url,
        extra_text=snap.get("extra_text"),
        primary_color=snap.get("primary_color", "#1e40af"),
        secondary_color=snap.get("secondary_color", "#1e3a5f"),
    )


async def get_user_certificates(
    db: AsyncSession, user_id: uuid.UUID
) -> list[Certificate]:
    result = await db.execute(
        select(Certificate)
        .options(joinedload(Certificate.training))
        .where(Certificate.user_id == user_id)
        .order_by(Certificate.issued_at.desc())
    )
    return list(result.scalars().unique().all())


async def get_certificate_by_enrollment(
    db: AsyncSession, enrollment_id: uuid.UUID
) -> Certificate | None:
    result = await db.execute(
        select(Certificate).where(Certificate.enrollment_id == enrollment_id)
    )
    return result.scalar_one_or_none()
