import uuid
from datetime import datetime

from pydantic import BaseModel


class CertificateSettingsOut(BaseModel):
    id: uuid.UUID
    logo_path: str | None
    logo_original_filename: str | None
    logo_height: int
    company_name: str
    signer_name: str
    signer_title: str
    signature_style: str
    signature_image_path: str | None
    extra_text: str | None
    primary_color: str
    secondary_color: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class CertificateSettingsUpdate(BaseModel):
    company_name: str | None = None
    signer_name: str | None = None
    signer_title: str | None = None
    signature_style: str | None = None
    extra_text: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    logo_height: int | None = None


class CertificateOut(BaseModel):
    id: uuid.UUID
    enrollment_id: uuid.UUID
    user_id: uuid.UUID
    training_id: uuid.UUID
    certificate_number: str
    issued_at: datetime
    training_title: str | None = None
    user_name: str | None = None

    model_config = {"from_attributes": True}


class CertificateViewOut(BaseModel):
    """Full data needed to render the certificate in the browser."""

    id: uuid.UUID
    certificate_number: str
    issued_at: datetime
    user_name: str
    training_title: str
    training_domain: str
    training_duration_minutes: int
    completed_at: datetime | None
    company_name: str
    signer_name: str
    signer_title: str
    signature_style: str
    signature_image_url: str | None
    logo_url: str | None
    logo_height: int
    extra_text: str | None
    primary_color: str
    secondary_color: str
