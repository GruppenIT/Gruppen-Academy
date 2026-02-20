import uuid
from datetime import datetime

from pydantic import BaseModel

from app.catalog.models import CompetencyType


# --- Product ---
class ProductCreate(BaseModel):
    name: str
    description: str
    target_persona: str | None = None
    common_pain_points: str | None = None
    typical_objections: str | None = None
    differentials: str | None = None
    priority: int = 0


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    target_persona: str | None = None
    common_pain_points: str | None = None
    typical_objections: str | None = None
    differentials: str | None = None
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


class CompetencyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    type: CompetencyType | None = None
    domain: str | None = None
    is_active: bool | None = None


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
    product_id: uuid.UUID
    title: str
    content: str
    category: str


class MasterGuidelineUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None


class MasterGuidelineOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    title: str
    content: str
    category: str
    created_at: datetime

    model_config = {"from_attributes": True}
