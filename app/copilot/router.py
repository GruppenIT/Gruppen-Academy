import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_role
from app.catalog.models import Competency, MasterGuideline, Product
from app.catalog.schemas import CompetencyCreate, MasterGuidelineCreate
from app.catalog.service import create_competency, create_master_guideline, list_products
from app.copilot.schemas import (
    CompetencyBulkCreateRequest,
    CompetencySuggestResponse,
    GeneratedQuestion,
    GuidelineBulkCreateRequest,
    GuidelineSuggestResponse,
    JourneyGenerateRequest,
    JourneyGenerateResponse,
)
from app.database import get_db
from app.journeys.models import QuestionType
from app.journeys.schemas import JourneyCreate, QuestionCreate
from app.journeys.service import add_question, create_journey
from app.llm.client import generate_questions, suggest_competencies, suggest_guidelines
from app.users.models import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Competency Copilot ---


@router.post("/suggest-competencies", response_model=CompetencySuggestResponse)
async def copilot_suggest_competencies(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Analyze products and existing competencies to suggest new ones."""
    # Fetch all products
    products_result = await db.execute(
        select(Product).where(Product.is_active).order_by(Product.priority)
    )
    products = list(products_result.scalars().all())

    if not products:
        raise HTTPException(status_code=400, detail="Nenhum produto cadastrado para análise.")

    # Fetch existing competencies
    comps_result = await db.execute(select(Competency).where(Competency.is_active))
    existing = list(comps_result.scalars().all())

    products_data = [
        {
            "name": p.name,
            "description": p.description,
            "target_persona": p.target_persona,
            "common_pain_points": p.common_pain_points,
            "differentials": p.differentials,
            "technology": p.technology,
        }
        for p in products
    ]

    existing_data = [
        {"name": c.name, "description": c.description, "type": c.type.value.upper(), "domain": c.domain}
        for c in existing
    ]

    suggestions = await suggest_competencies(products_data, existing_data)
    return CompetencySuggestResponse(suggestions=suggestions)


@router.post("/create-competencies-bulk", status_code=201)
async def copilot_create_competencies_bulk(
    data: CompetencyBulkCreateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Bulk-create competencies from copilot suggestions."""
    created = []
    for item in data.items:
        comp = await create_competency(
            db,
            CompetencyCreate(
                name=item.name,
                description=item.description,
                type=item.type,
                domain=item.domain,
            ),
        )
        created.append({"id": str(comp.id), "name": comp.name})
    return {"created": created, "count": len(created)}


# --- Guideline Copilot ---


@router.post("/suggest-guidelines", response_model=GuidelineSuggestResponse)
async def copilot_suggest_guidelines(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Analyze products and suggest new master guidelines."""
    products_result = await db.execute(
        select(Product).where(Product.is_active).order_by(Product.priority)
    )
    products = list(products_result.scalars().all())

    if not products:
        raise HTTPException(status_code=400, detail="Nenhum produto cadastrado para análise.")

    guides_result = await db.execute(select(MasterGuideline))
    existing = list(guides_result.scalars().all())

    products_data = [
        {
            "id": str(p.id),
            "name": p.name,
            "description": p.description,
            "target_persona": p.target_persona,
            "common_pain_points": p.common_pain_points,
            "typical_objections": p.typical_objections,
            "differentials": p.differentials,
            "technology": p.technology,
        }
        for p in products
    ]

    existing_data = [
        {
            "title": g.title,
            "category": g.category,
            "product_id": str(g.product_id) if g.product_id else None,
            "is_corporate": g.is_corporate,
        }
        for g in existing
    ]

    suggestions = await suggest_guidelines(products_data, existing_data)
    return GuidelineSuggestResponse(suggestions=suggestions)


@router.post("/create-guidelines-bulk", status_code=201)
async def copilot_create_guidelines_bulk(
    data: GuidelineBulkCreateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Bulk-create guidelines from copilot suggestions."""
    created = []
    for item in data.items:
        guide = await create_master_guideline(
            db,
            MasterGuidelineCreate(
                product_id=item.product_id,
                title=item.title,
                content=item.content,
                category=item.category,
                is_corporate=item.is_corporate,
            ),
        )
        created.append({"id": str(guide.id), "title": guide.title})
    return {"created": created, "count": len(created)}


# --- Journey AI Generation ---


QUESTION_TYPE_MAP = {
    "essay": QuestionType.ESSAY,
    "case_study": QuestionType.CASE_STUDY,
    "roleplay": QuestionType.ROLEPLAY,
    "objective": QuestionType.OBJECTIVE,
}


@router.post("/generate-journey", response_model=JourneyGenerateResponse)
async def copilot_generate_journey(
    data: JourneyGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Create a journey and generate questions via AI based on selected products."""
    # Fetch selected products
    products_result = await db.execute(
        select(Product).where(Product.id.in_(data.product_ids))
    )
    products = list(products_result.scalars().all())

    if not products:
        raise HTTPException(status_code=400, detail="Nenhum produto encontrado para os IDs informados.")

    # Fetch competencies filtered by the journey's domain
    comps_result = await db.execute(
        select(Competency).where(Competency.is_active, Competency.domain == data.domain)
    )
    competencies = list(comps_result.scalars().all())

    # Fetch relevant master guidelines: corporate + product-specific + domain-scoped
    from sqlalchemy import or_, and_
    guidelines_result = await db.execute(
        select(MasterGuideline).where(
            or_(
                MasterGuideline.is_corporate.is_(True),
                MasterGuideline.product_id.in_(data.product_ids),
                and_(
                    MasterGuideline.domain == data.domain,
                    MasterGuideline.domain.isnot(None),
                ),
            )
        )
    )
    guidelines = list(guidelines_result.scalars().all())

    products_data = [
        {
            "name": p.name,
            "description": p.description,
            "target_persona": p.target_persona,
            "common_pain_points": p.common_pain_points,
            "typical_objections": p.typical_objections,
            "differentials": p.differentials,
            "technology": p.technology,
        }
        for p in products
    ]

    competencies_data = [
        {"name": c.name, "description": c.description, "type": c.type.value.upper(), "domain": c.domain}
        for c in competencies
    ]

    guidelines_data = [
        {
            "title": g.title,
            "content": g.content,
            "category": g.category,
            "is_corporate": g.is_corporate,
            "domain": g.domain,
            "product": next((p.name for p in products if p.id == g.product_id), "Corporativa")
            if g.product_id else "Corporativa",
        }
        for g in guidelines
    ]

    # Generate questions via LLM
    raw_questions = await generate_questions(
        products=products_data,
        competencies=competencies_data,
        guidelines=guidelines_data,
        session_duration_minutes=data.session_duration_minutes,
        participant_level=data.participant_level,
        domain=data.domain,
    )

    # Create the journey
    journey = await create_journey(
        db,
        JourneyCreate(
            title=data.title,
            description=data.description,
            domain=data.domain,
            session_duration_minutes=data.session_duration_minutes,
            participant_level=data.participant_level,
            product_ids=data.product_ids,
        ),
        current_user.id,
    )

    # Save generated questions to the journey
    saved_questions: list[GeneratedQuestion] = []
    for i, q in enumerate(raw_questions):
        q_type_str = q.get("type", "essay").lower()
        q_type = QUESTION_TYPE_MAP.get(q_type_str, QuestionType.ESSAY)

        await add_question(
            db,
            journey.id,
            QuestionCreate(
                text=q.get("text", ""),
                type=q_type,
                weight=q.get("weight", 1.0),
                rubric=q.get("rubric"),
                expected_lines=q.get("expected_lines", 10),
                order=i + 1,
            ),
        )

        saved_questions.append(
            GeneratedQuestion(
                text=q.get("text", ""),
                type=q_type_str,
                weight=q.get("weight", 1.0),
                expected_lines=q.get("expected_lines", 10),
                rubric=q.get("rubric"),
                competency_tags=q.get("competency_tags", []),
            )
        )

    return JourneyGenerateResponse(
        journey_id=str(journey.id),
        questions=saved_questions,
    )
