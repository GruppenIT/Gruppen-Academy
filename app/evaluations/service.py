import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import MasterGuideline
from app.evaluations.models import AnalyticalReport, Evaluation, EvaluationStatus, ReportType
from app.evaluations.schemas import EvaluationResult, EvaluationReview
from app.journeys.models import Journey, JourneyParticipation, Question, QuestionResponse, journey_product
from app.llm.client import evaluate_response, generate_report
from app.teams.models import Team, team_member

# Valid status transitions
_VALID_TRANSITIONS: dict[EvaluationStatus, set[EvaluationStatus]] = {
    EvaluationStatus.PENDING: {EvaluationStatus.EVALUATED},
    EvaluationStatus.EVALUATED: {EvaluationStatus.REVIEWED},
    EvaluationStatus.REVIEWED: {EvaluationStatus.SENT, EvaluationStatus.EVALUATED},
    EvaluationStatus.SENT: set(),
}


async def _fetch_guidelines_for_question(db: AsyncSession, question_id: uuid.UUID) -> list[dict]:
    """Fetch corporate + product-specific guidelines relevant to a question's journey."""
    # Get journey_id from question
    q_result = await db.execute(select(Question.journey_id).where(Question.id == question_id))
    journey_id = q_result.scalar_one_or_none()
    if not journey_id:
        return []

    # Get product IDs linked to the journey
    jp_result = await db.execute(
        select(journey_product.c.product_id).where(journey_product.c.journey_id == journey_id)
    )
    product_ids = [row[0] for row in jp_result.all()]

    # Fetch corporate guidelines + product-specific guidelines
    conditions = [MasterGuideline.is_corporate.is_(True)]
    if product_ids:
        conditions.append(MasterGuideline.product_id.in_(product_ids))

    gl_result = await db.execute(
        select(MasterGuideline).where(or_(*conditions))
    )
    guidelines = gl_result.scalars().all()

    return [
        {
            "title": g.title,
            "content": g.content,
            "category": g.category,
            "is_corporate": g.is_corporate,
            "domain": g.domain,
        }
        for g in guidelines
    ]


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
    question = question_result.scalar_one_or_none()
    if not question:
        raise ValueError("Pergunta associada não encontrada")

    # Fetch relevant guidelines for this question's journey and products
    guidelines = await _fetch_guidelines_for_question(db, question.id)

    llm_result: EvaluationResult = await evaluate_response(
        question_text=question.text,
        answer_text=response.answer_text,
        rubric=question.rubric,
        guidelines=guidelines if guidelines else None,
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
    # Validate status transition if status is being changed
    if data.status is not None and data.status != evaluation.status:
        allowed = _VALID_TRANSITIONS.get(evaluation.status, set())
        if data.status not in allowed:
            raise ValueError(
                f"Transição inválida: {evaluation.status.value} → {data.status.value}. "
                f"Transições permitidas: {', '.join(s.value for s in allowed) or 'nenhuma'}"
            )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(evaluation, field, value)
    evaluation.reviewed_by = reviewer_id
    await db.commit()
    await db.refresh(evaluation)
    return evaluation


async def evaluate_participation_bulk(
    db: AsyncSession, participation_id: uuid.UUID
) -> list[Evaluation]:
    """Evaluate all unevaluated responses in a participation."""
    participation_result = await db.execute(
        select(JourneyParticipation)
        .options(selectinload(JourneyParticipation.journey))
        .where(JourneyParticipation.id == participation_id)
    )
    participation = participation_result.scalar_one_or_none()
    if not participation:
        raise ValueError("Participação não encontrada")

    responses_result = await db.execute(
        select(QuestionResponse).where(QuestionResponse.participation_id == participation_id)
    )
    responses = list(responses_result.scalars().all())

    if not responses:
        raise ValueError("Nenhuma resposta encontrada para esta participação")

    evaluations = []
    had_new_evaluations = False
    for resp in responses:
        # Skip already evaluated responses
        existing = await get_evaluation_by_response(db, resp.id)
        if existing:
            evaluations.append(existing)
            continue

        evaluation = await evaluate_question_response(db, resp.id)
        evaluations.append(evaluation)
        had_new_evaluations = True

    # Award performance XP when new evaluations were created
    if had_new_evaluations and evaluations:
        await _award_performance_xp(db, participation, evaluations)

    return evaluations


async def _award_performance_xp(
    db: AsyncSession,
    participation: JourneyParticipation,
    evaluations: list[Evaluation],
) -> None:
    """Award XP based on the average score_global of all evaluations.

    Formula: round(avg_score * 100) XP.
    A perfect score (1.0) yields 100 XP; 0.6 yields 60 XP.
    """
    from app.gamification.models import Score

    # Guard against duplicate award: check if performance XP already given
    existing = await db.execute(
        select(Score.id).where(
            Score.user_id == participation.user_id,
            Score.source == "journey_performance",
            Score.source_id == participation.journey_id,
        )
    )
    if existing.scalar_one_or_none():
        return

    avg_score = sum(e.score_global for e in evaluations) / len(evaluations)
    xp = round(avg_score * 100)

    if xp <= 0:
        return

    journey_title = participation.journey.title if participation.journey else "Jornada"
    score = Score(
        user_id=participation.user_id,
        points=xp,
        source="journey_performance",
        source_id=participation.journey_id,
        description=f"Desempenho na jornada: {journey_title} (média {avg_score:.0%})",
    )
    db.add(score)
    await db.commit()


async def get_participation_evaluations(
    db: AsyncSession, participation_id: uuid.UUID
) -> list[dict]:
    """Get all responses + evaluations for a participation, enriched with question data."""
    responses_result = await db.execute(
        select(QuestionResponse)
        .where(QuestionResponse.participation_id == participation_id)
        .order_by(QuestionResponse.created_at)
    )
    responses = list(responses_result.scalars().all())

    items = []
    for resp in responses:
        question_result = await db.execute(
            select(Question).where(Question.id == resp.question_id)
        )
        question = question_result.scalar_one_or_none()
        if not question:
            continue

        eval_result = await db.execute(
            select(Evaluation).where(Evaluation.response_id == resp.id)
        )
        evaluation = eval_result.scalar_one_or_none()

        items.append({
            "response_id": resp.id,
            "question_id": question.id,
            "question_text": question.text,
            "question_type": question.type.value,
            "question_order": question.order,
            "answer_text": resp.answer_text,
            "evaluation": evaluation,
        })

    return sorted(items, key=lambda x: x["question_order"])


async def list_participations_for_evaluation(
    db: AsyncSession, skip: int = 0, limit: int = 50
) -> list[dict]:
    """List all participations with evaluation summary for admin review."""
    result = await db.execute(
        select(JourneyParticipation)
        .options(selectinload(JourneyParticipation.journey), selectinload(JourneyParticipation.user))
        .order_by(JourneyParticipation.started_at.desc())
        .offset(skip)
        .limit(limit)
    )
    participations = list(result.scalars().all())

    items = []
    for p in participations:
        # Count responses
        resp_result = await db.execute(
            select(QuestionResponse.id).where(QuestionResponse.participation_id == p.id)
        )
        response_ids = [row[0] for row in resp_result.all()]
        total_responses = len(response_ids)

        # Count evaluations
        evaluated_count = 0
        if response_ids:
            eval_result = await db.execute(
                select(Evaluation).where(Evaluation.response_id.in_(response_ids))
            )
            evaluated_count = len(eval_result.scalars().all())

        # Check for existing report
        report_result = await db.execute(
            select(AnalyticalReport.id).where(AnalyticalReport.participation_id == p.id).limit(1)
        )
        has_report = report_result.scalar_one_or_none() is not None

        items.append({
            "participation_id": p.id,
            "journey_id": p.journey_id,
            "journey_title": p.journey.title if p.journey else "—",
            "user_id": p.user_id,
            "user_name": p.user.full_name if p.user else "—",
            "user_email": p.user.email if p.user else "—",
            "started_at": p.started_at.isoformat() if p.started_at else None,
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
            "total_responses": total_responses,
            "evaluated_count": evaluated_count,
            "has_report": has_report,
        })

    return items


async def get_my_participations(
    db: AsyncSession, user_id: uuid.UUID
) -> list[dict]:
    """Get all participations for a user with evaluation summary."""
    result = await db.execute(
        select(JourneyParticipation)
        .options(selectinload(JourneyParticipation.journey))
        .where(JourneyParticipation.user_id == user_id)
        .order_by(JourneyParticipation.started_at.desc())
    )
    participations = list(result.scalars().all())

    items = []
    for p in participations:
        resp_result = await db.execute(
            select(QuestionResponse.id).where(QuestionResponse.participation_id == p.id)
        )
        response_ids = [row[0] for row in resp_result.all()]

        # Calculate average score if evaluated
        avg_score = None
        evaluated_count = 0
        if response_ids:
            eval_result = await db.execute(
                select(Evaluation).where(Evaluation.response_id.in_(response_ids))
            )
            evals = list(eval_result.scalars().all())
            evaluated_count = len(evals)
            if evals:
                avg_score = sum(e.score_global for e in evals) / len(evals)

        # Check for reports
        report_result = await db.execute(
            select(AnalyticalReport)
            .where(
                AnalyticalReport.participation_id == p.id,
                AnalyticalReport.report_type == ReportType.PROFESSIONAL,
            )
            .limit(1)
        )
        report = report_result.scalar_one_or_none()

        items.append({
            "participation_id": p.id,
            "journey_id": p.journey_id,
            "journey_title": p.journey.title if p.journey else "—",
            "journey_domain": p.journey.domain if p.journey else "—",
            "started_at": p.started_at.isoformat() if p.started_at else None,
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
            "total_responses": len(response_ids),
            "evaluated_count": evaluated_count,
            "avg_score": round(avg_score, 2) if avg_score is not None else None,
            "report_id": str(report.id) if report else None,
        })

    return items


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


async def get_manager_dashboard(db: AsyncSession, manager_id: uuid.UUID) -> dict:
    """Build dashboard data for a manager: teams, members, performance summary + training metrics."""
    from app.trainings.models import EnrollmentStatus, TrainingEnrollment

    # Get teams the manager belongs to (managers are team members too)
    my_team_ids_q = select(team_member.c.team_id).where(team_member.c.user_id == manager_id)
    teams_result = await db.execute(
        select(Team)
        .where(Team.id.in_(my_team_ids_q))
        .options(selectinload(Team.members))
    )
    teams = list(teams_result.scalars().all())

    # If manager is not in any team, show all teams (fallback for admins)
    if not teams:
        teams_result = await db.execute(
            select(Team).options(selectinload(Team.members)).order_by(Team.name)
        )
        teams = list(teams_result.scalars().all())

    team_data = []
    all_member_ids = set()

    for team in teams:
        member_ids = [m.id for m in team.members]
        all_member_ids.update(member_ids)

        # Get participations for team members
        if not member_ids:
            team_data.append({
                "team_id": team.id,
                "team_name": team.name,
                "member_count": 0,
                "members": [],
                "total_participations": 0,
                "completed_participations": 0,
                "avg_score": None,
                "training_enrollments": 0,
                "training_completed": 0,
                "training_in_progress": 0,
            })
            continue

        participations_result = await db.execute(
            select(JourneyParticipation)
            .options(selectinload(JourneyParticipation.journey), selectinload(JourneyParticipation.user))
            .where(JourneyParticipation.user_id.in_(member_ids))
            .order_by(JourneyParticipation.started_at.desc())
        )
        participations = list(participations_result.scalars().all())

        total_participations = len(participations)
        completed_participations = sum(1 for p in participations if p.completed_at)

        # Fetch training enrollments for team members
        enrollments_result = await db.execute(
            select(TrainingEnrollment)
            .where(TrainingEnrollment.user_id.in_(member_ids))
        )
        enrollments = list(enrollments_result.scalars().all())

        # Build per-member enrollment lookup
        member_enrollment_map: dict[str, list] = {}
        for e in enrollments:
            uid = str(e.user_id)
            member_enrollment_map.setdefault(uid, []).append(e)

        team_training_total = len(enrollments)
        team_training_completed = sum(1 for e in enrollments if e.status == EnrollmentStatus.COMPLETED)
        team_training_in_progress = sum(1 for e in enrollments if e.status == EnrollmentStatus.IN_PROGRESS)

        # Calculate avg score across all team evaluations
        all_scores = []
        member_summaries = {}

        for p in participations:
            resp_result = await db.execute(
                select(QuestionResponse.id).where(QuestionResponse.participation_id == p.id)
            )
            response_ids = [row[0] for row in resp_result.all()]

            if response_ids:
                eval_result = await db.execute(
                    select(Evaluation.score_global).where(Evaluation.response_id.in_(response_ids))
                )
                scores = [row[0] for row in eval_result.all()]
                all_scores.extend(scores)

                user_id_str = str(p.user_id)
                if user_id_str not in member_summaries:
                    member_summaries[user_id_str] = {
                        "user_id": p.user_id,
                        "user_name": p.user.full_name if p.user else "—",
                        "user_email": p.user.email if p.user else "—",
                        "participations": 0,
                        "completed": 0,
                        "scores": [],
                    }
                member_summaries[user_id_str]["participations"] += 1
                if p.completed_at:
                    member_summaries[user_id_str]["completed"] += 1
                member_summaries[user_id_str]["scores"].extend(scores)

        # Also add members with zero participations
        for m in team.members:
            uid = str(m.id)
            if uid not in member_summaries:
                member_summaries[uid] = {
                    "user_id": m.id,
                    "user_name": m.full_name,
                    "user_email": m.email,
                    "participations": 0,
                    "completed": 0,
                    "scores": [],
                }

        # Finalize member data with training metrics
        members_list = []
        for ms in member_summaries.values():
            avg = round(sum(ms["scores"]) / len(ms["scores"]), 2) if ms["scores"] else None
            uid = str(ms["user_id"])
            user_enrollments = member_enrollment_map.get(uid, [])
            members_list.append({
                "user_id": ms["user_id"],
                "user_name": ms["user_name"],
                "user_email": ms["user_email"],
                "participations": ms["participations"],
                "completed": ms["completed"],
                "avg_score": avg,
                "training_enrollments": len(user_enrollments),
                "training_completed": sum(1 for e in user_enrollments if e.status == EnrollmentStatus.COMPLETED),
                "training_in_progress": sum(1 for e in user_enrollments if e.status == EnrollmentStatus.IN_PROGRESS),
            })

        team_avg = round(sum(all_scores) / len(all_scores), 2) if all_scores else None

        team_data.append({
            "team_id": team.id,
            "team_name": team.name,
            "member_count": len(team.members),
            "members": sorted(members_list, key=lambda x: x["avg_score"] or 0, reverse=True),
            "total_participations": total_participations,
            "completed_participations": completed_participations,
            "avg_score": team_avg,
            "training_enrollments": team_training_total,
            "training_completed": team_training_completed,
            "training_in_progress": team_training_in_progress,
        })

    # Global stats
    total_members = len(all_member_ids)
    total_teams = len(teams)

    return {
        "total_teams": total_teams,
        "total_members": total_members,
        "teams": team_data,
    }
