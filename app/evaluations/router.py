import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.evaluations.schemas import (
    EvaluateResponseRequest,
    EvaluationOut,
    EvaluationReview,
    GenerateReportRequest,
    ReportOut,
)
from app.evaluations.service import (
    evaluate_question_response,
    generate_analytical_report,
    get_evaluation,
    get_evaluation_by_response,
    review_evaluation,
)
from app.users.models import User, UserRole

router = APIRouter()


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
    return await review_evaluation(db, evaluation, data, current_user.id)


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
