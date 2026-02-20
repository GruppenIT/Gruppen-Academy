import uuid

from pydantic import BaseModel


# --- Competency Suggestions ---
class CompetencySuggestion(BaseModel):
    name: str
    description: str
    type: str  # HARD or SOFT
    domain: str
    rationale: str


class CompetencySuggestResponse(BaseModel):
    suggestions: list[CompetencySuggestion]


class CompetencyBulkCreateItem(BaseModel):
    name: str
    description: str
    type: str
    domain: str


class CompetencyBulkCreateRequest(BaseModel):
    items: list[CompetencyBulkCreateItem]


# --- Guideline Suggestions ---
class GuidelineSuggestion(BaseModel):
    title: str
    content: str
    category: str
    product_id: str
    rationale: str


class GuidelineSuggestResponse(BaseModel):
    suggestions: list[GuidelineSuggestion]


class GuidelineBulkCreateItem(BaseModel):
    product_id: uuid.UUID
    title: str
    content: str
    category: str


class GuidelineBulkCreateRequest(BaseModel):
    items: list[GuidelineBulkCreateItem]


# --- Journey AI Generation ---
class JourneyGenerateRequest(BaseModel):
    title: str
    domain: str = "vendas"
    session_duration_minutes: int = 180
    participant_level: str = "intermediario"
    product_ids: list[uuid.UUID]
    description: str | None = None


class GeneratedQuestion(BaseModel):
    text: str
    type: str
    weight: float
    expected_lines: int
    rubric: dict | None = None
    competency_tags: list[str] = []


class JourneyGenerateResponse(BaseModel):
    journey_id: str
    questions: list[GeneratedQuestion]
