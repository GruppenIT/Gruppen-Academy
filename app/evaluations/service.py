import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.evaluations.models import AnalyticalReport, Evaluation, EvaluationStatus, ReportType
from app.evaluations.schemas import EvaluationResult, EvaluationReview
from app.journeys.models import JourneyParticipation, Question, QuestionResponse
from app.llm.client import evaluate_response, generate_report


async def evaluate_question_response(db: AsyncSession, response_id: uuid.UUID) -> Evaluation:
    result = await db.execute(
        select(QuestionResponse).where(QuestionResponse.id == response_id)
    )
    response = result.scalar_one_or_none()
    if not response:
        raise ValueError("Resposta não encontrada")

    question_result = await db.execute(
        select(Question).where(Question.id == response.question_id)
    )
    question = question_result.scalar_one()

    llm_result: EvaluationResult = await evaluate_response(
        question_text=question.text,
        answer_text=response.answer_text,
        rubric=question.rubric,
    )

    evaluation = Evaluation(
        response_id=response_id,
        score_global=llm_result.score_global,
        criteria={"criterios": [c.model_dump() for c in llm_result.criterios]},
        general_comment=llm_result.comentario_geral,
        recommendations=llm_result.recomendacoes,
        mapped_competencies=llm_result.competencias_mapeadas,
        status=EvaluationStatus.EVALUATED,
    )
    db.add(evaluation)
    await db.commit()
    await db.refresh(evaluation)
    return evaluation


async def get_evaluation(db: AsyncSession, evaluation_id: uuid.UUID) -> Evaluation | None:
    result = await db.execute(select(Evaluation).where(Evaluation.id == evaluation_id))
    return result.scalar_one_or_none()


async def get_evaluation_by_response(db: AsyncSession, response_id: uuid.UUID) -> Evaluation | None:
    result = await db.execute(
        select(Evaluation).where(Evaluation.response_id == response_id)
    )
    return result.scalar_one_or_none()


async def review_evaluation(
    db: AsyncSession, evaluation: Evaluation, data: EvaluationReview, reviewer_id: uuid.UUID
) -> Evaluation:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(evaluation, field, value)
    evaluation.reviewed_by = reviewer_id
    await db.commit()
    await db.refresh(evaluation)
    return evaluation


async def generate_analytical_report(
    db: AsyncSession, participation_id: uuid.UUID, report_type: ReportType
) -> AnalyticalReport:
    participation_result = await db.execute(
        select(JourneyParticipation).where(JourneyParticipation.id == participation_id)
    )
    participation = participation_result.scalar_one_or_none()
    if not participation:
        raise ValueError("Participação não encontrada")

    responses_result = await db.execute(
        select(QuestionResponse).where(QuestionResponse.participation_id == participation_id)
    )
    responses = list(responses_result.scalars().all())

    evaluations = []
    for resp in responses:
        eval_result = await db.execute(
            select(Evaluation).where(Evaluation.response_id == resp.id)
        )
        ev = eval_result.scalar_one_or_none()
        if ev:
            evaluations.append(ev)

    report_content = await generate_report(
        evaluations=evaluations,
        report_type=report_type.value,
    )

    report = AnalyticalReport(
        participation_id=participation_id,
        report_type=report_type,
        content=report_content,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report
