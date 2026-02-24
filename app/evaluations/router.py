import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.evaluations.schemas import (
    BulkEvaluateRequest,
    EvaluateResponseRequest,
    EvaluationOut,
    EvaluationReview,
    GenerateReportRequest,
    ParticipationEvaluationSummary,
    ParticipationResponseDetail,
    ReportOut,
    UserParticipationSummary,
)
from app.llm.client import LLMResponseError
from app.evaluations.service import (
    evaluate_participation_bulk,
    evaluate_question_response,
    generate_analytical_report,
    get_evaluation,
    get_evaluation_by_response,
    get_manager_dashboard,
    get_my_participations,
    get_participation_evaluations,
    list_participations_for_evaluation,
    review_evaluation,
)
from app.users.models import User, UserRole

router = APIRouter()


@router.get("/dashboard/manager")
async def manager_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Get manager dashboard data: teams, members, performance."""
    return await get_manager_dashboard(db, current_user.id)


@router.post("/evaluate", response_model=EvaluationOut, status_code=status.HTTP_201_CREATED)
async def evaluate_response(
    data: EvaluateResponseRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    existing = await get_evaluation_by_response(db, data.response_id)
    if existing:
        raise HTTPException(status_code=400, detail="Resposta já avaliada")
    try:
        return await evaluate_question_response(db, data.response_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except LLMResponseError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/evaluate-bulk", response_model=list[EvaluationOut], status_code=status.HTTP_201_CREATED)
async def evaluate_bulk(
    data: BulkEvaluateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Evaluate all unevaluated responses in a participation at once."""
    try:
        return await evaluate_participation_bulk(db, data.participation_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except LLMResponseError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/participations", response_model=list[ParticipationEvaluationSummary])
async def list_participations(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)),
):
    """List all participations with evaluation status summary."""
    return await list_participations_for_evaluation(db, skip, limit)


@router.get("/participations/{participation_id}/details", response_model=list[ParticipationResponseDetail])
async def get_participation_details(
    participation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)),
):
    """Get all responses + evaluations for a specific participation."""
    try:
        return await get_participation_evaluations(db, participation_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/my/participations", response_model=list[UserParticipationSummary])
async def get_my_journey_participations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's participations with evaluation summary."""
    return await get_my_participations(db, current_user.id)


@router.get("/my/participations/{participation_id}/details", response_model=list[ParticipationResponseDetail])
async def get_my_participation_details(
    participation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detailed evaluation results for a user's own participation."""
    from app.journeys.models import JourneyParticipation
    from sqlalchemy import select

    # Verify the participation belongs to the current user
    result = await db.execute(
        select(JourneyParticipation).where(JourneyParticipation.id == participation_id)
    )
    participation = result.scalar_one_or_none()
    if not participation or participation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Participação não encontrada")

    return await get_participation_evaluations(db, participation_id)


@router.get("/{evaluation_id}", response_model=EvaluationOut)
async def get_single_evaluation(
    evaluation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    evaluation = await get_evaluation(db, evaluation_id)
    if not evaluation:
        raise HTTPException(status_code=404, detail="Avaliação não encontrada")
    return evaluation


@router.patch("/{evaluation_id}/review", response_model=EvaluationOut)
async def review_existing_evaluation(
    evaluation_id: uuid.UUID,
    data: EvaluationReview,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    evaluation = await get_evaluation(db, evaluation_id)
    if not evaluation:
        raise HTTPException(status_code=404, detail="Avaliação não encontrada")
    try:
        return await review_evaluation(db, evaluation, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reports", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def create_report(
    data: GenerateReportRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)),
):
    try:
        return await generate_analytical_report(db, data.participation_id, data.report_type)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except LLMResponseError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/reports/{report_id}", response_model=ReportOut)
async def get_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get a specific report by ID."""
    from app.evaluations.models import AnalyticalReport
    from sqlalchemy import select

    result = await db.execute(
        select(AnalyticalReport).where(AnalyticalReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return report
