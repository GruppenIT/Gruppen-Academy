import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.catalog.models import CompetencyType


# --- Product ---
class ProductCreate(BaseModel):
    name: str
    description: str
    target_persona: str | None = None
    common_pain_points: str | None = None
    typical_objections: str | None = None
    differentials: str | None = None
    technology: str | None = None
    priority: int = 0


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    target_persona: str | None = None
    common_pain_points: str | None = None
    typical_objections: str | None = None
    differentials: str | None = None
    technology: str | None = None
    priority: int | None = None
    is_active: bool | None = None


class ProductOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    target_persona: str | None
    common_pain_points: str | None
    typical_objections: str | None
    differentials: str | None
    technology: str | None
    priority: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductReorderItem(BaseModel):
    id: uuid.UUID
    priority: int


# --- Competency ---
class CompetencyCreate(BaseModel):
    name: str
    description: str
    type: CompetencyType
    domain: str = "vendas"

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class CompetencyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    type: CompetencyType | None = None
    domain: str | None = None
    is_active: bool | None = None

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.lower()
        return v


class CompetencyOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    type: CompetencyType
    domain: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Master Guideline ---
class MasterGuidelineCreate(BaseModel):
    product_id: uuid.UUID | None = None
    title: str
    content: str
    category: str
    is_corporate: bool = False
    domain: str | None = None


class MasterGuidelineUpdate(BaseModel):
    product_id: uuid.UUID | None = None
    title: str | None = None
    content: str | None = None
    category: str | None = None
    is_corporate: bool | None = None
    domain: str | None = None


class MasterGuidelineOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID | None
    title: str
    content: str
    category: str
    is_corporate: bool
    domain: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
