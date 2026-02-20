import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.users.models import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.PROFESSIONAL
    department: str | None = None


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
