import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

from app.users.models import UserRole

_PASSWORD_MIN_LENGTH = 10
_PASSWORD_PATTERN = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[\]{};:'\",.<>?/\\|`~]).+$"
)


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.PROFESSIONAL
    department: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < _PASSWORD_MIN_LENGTH:
            raise ValueError(f"Senha deve ter no mínimo {_PASSWORD_MIN_LENGTH} caracteres")
        if not _PASSWORD_PATTERN.match(v):
            raise ValueError(
                "Senha deve conter pelo menos: 1 maiúscula, 1 minúscula, "
                "1 número e 1 caractere especial"
            )
        return v


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < _PASSWORD_MIN_LENGTH:
            raise ValueError(f"Senha deve ter no mínimo {_PASSWORD_MIN_LENGTH} caracteres")
        if not _PASSWORD_PATTERN.match(v):
            raise ValueError(
                "Senha deve conter pelo menos: 1 maiúscula, 1 minúscula, "
                "1 número e 1 caractere especial"
            )
        return v


class UserUpdate(BaseModel):
    full_name: str | None = None
    department: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    department: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
