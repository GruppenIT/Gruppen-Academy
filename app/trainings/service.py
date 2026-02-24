import logging
import os
import shutil
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

from app.catalog.models import Competency, Product
from app.teams.models import Team
from app.trainings.models import (
    EnrollmentStatus,
    ModuleProgress,
    ModuleQuiz,
    QuizAttempt,
    QuizQuestion,
    Training,
    TrainingEnrollment,
    TrainingModule,
    TrainingQuiz,
    TrainingQuizAttempt,
    TrainingQuizQuestion,
    TrainingStatus,
)
from app.gamification.schemas import ScoreCreate
from app.gamification.service import add_score, check_and_award_badges
from app.trainings.schemas import (
    ModuleCreate,
    ModuleUpdate,
    QuizCreate,
    QuizQuestionCreate,
    QuizQuestionUpdate,
    QuizUpdate,
    TrainingCreate,
    TrainingQuizCreate,
    TrainingQuizQuestionCreate,
    TrainingQuizQuestionUpdate,
    TrainingQuizUpdate,
    TrainingUpdate,
)
from app.trainings.models import ModuleContentType


# --- Training CRUD ---


async def create_training(
    db: AsyncSession, data: TrainingCreate, created_by: uuid.UUID
) -> Training:
    training = Training(
        title=data.title,
        description=data.description,
        domain=data.domain,
        participant_level=data.participant_level,
        estimated_duration_minutes=data.estimated_duration_minutes,
        xp_reward=data.xp_reward,
        created_by=created_by,
    )
    if data.product_ids:
        result = await db.execute(
            select(Product).where(Product.id.in_(data.product_ids))
        )
        training.products = list(result.scalars().all())
    if data.competency_ids:
        result = await db.execute(
            select(Competency).where(Competency.id.in_(data.competency_ids))
        )
        training.competencies = list(result.scalars().all())

    db.add(training)
    await db.flush()

    # Auto-create Module 1
    module1 = TrainingModule(
        training_id=training.id,
        title="Módulo 1",
        order=1,
    )
    db.add(module1)

    await db.commit()
    await db.refresh(training)
    return training


async def import_scorm_training(
    db: AsyncSession,
    created_by: uuid.UUID,
    title: str,
    description: str | None,
    domain: str,
    participant_level: str,
    estimated_duration_minutes: int,
    xp_reward: int,
    scorm_items: list[dict],
) -> Training:
    """Create a training with modules pre-populated from SCORM manifest items."""
    training = Training(
        title=title,
        description=description,
        domain=domain,
        participant_level=participant_level,
        estimated_duration_minutes=estimated_duration_minutes,
        xp_reward=xp_reward,
        created_by=created_by,
    )
    db.add(training)
    await db.flush()

    for i, item in enumerate(scorm_items, start=1):
        module = TrainingModule(
            training_id=training.id,
            title=item["title"],
            order=i,
            content_type=ModuleContentType.SCORM,
            content_data={
                "entry_point": item.get("entry_point"),
                "extract_dir": item["extract_dir"],
                "scorm_version": "auto",
            },
        )
        db.add(module)

    await db.commit()
    await db.refresh(training)
    return training


async def get_training(db: AsyncSession, training_id: uuid.UUID) -> Training | None:
    result = await db.execute(
        select(Training)
        .where(Training.id == training_id)
        .options(
            selectinload(Training.modules).selectinload(TrainingModule.quiz).selectinload(ModuleQuiz.questions),
            selectinload(Training.final_quiz).selectinload(TrainingQuiz.questions),
            selectinload(Training.products),
            selectinload(Training.competencies),
            selectinload(Training.teams),
        )
    )
    return result.scalar_one_or_none()


async def list_trainings(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    domain: str | None = None,
    status: TrainingStatus | None = None,
) -> list[Training]:
    query = select(Training)
    if domain:
        query = query.where(Training.domain == domain)
    if status:
        query = query.where(Training.status == status)
    result = await db.execute(
        query.order_by(Training.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


async def update_training(
    db: AsyncSession, training: Training, data: TrainingUpdate
) -> Training:
    if training.status != TrainingStatus.DRAFT:
        raise ValueError(
            "Treinamentos publicados ou arquivados não podem ser editados. "
            "Arquive e crie um novo."
        )
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(training, field, value)
    await db.commit()
    await db.refresh(training)
    return training


async def publish_training(
    db: AsyncSession, training: Training, team_ids: list[uuid.UUID]
) -> Training:
    if training.status != TrainingStatus.DRAFT:
        raise ValueError("Apenas treinamentos em rascunho podem ser publicados.")

    # Validate: at least 1 module
    modules = await list_modules(db, training.id)
    if not modules:
        raise ValueError("O treinamento precisa ter pelo menos 1 módulo.")

    # Validate: modules with quiz must have at least 1 question
    for mod in modules:
        if mod.has_quiz:
            quiz = await get_module_quiz(db, mod.id)
            if not quiz or not quiz.questions:
                raise ValueError(
                    f"O módulo '{mod.title}' tem quiz habilitado mas sem perguntas."
                )

    # Validate: final quiz (if exists) must have at least 1 question
    final_quiz = await get_training_quiz(db, training.id)
    if final_quiz and not final_quiz.questions:
        raise ValueError("A avaliação final está configurada mas sem perguntas.")

    # Validate: at least 1 team
    if not team_ids:
        raise ValueError("Selecione pelo menos uma equipe.")

    # Link teams
    result = await db.execute(select(Team).where(Team.id.in_(team_ids)))
    teams = list(result.scalars().all())
    if len(teams) != len(team_ids):
        raise ValueError("Uma ou mais equipes não foram encontradas.")
    training.teams = teams

    # Change status
    training.status = TrainingStatus.PUBLISHED
    await db.flush()

    # Create enrollments for all team members
    enrolled_user_ids: set[uuid.UUID] = set()
    for team in teams:
        # Eagerly load members
        team_with_members = await db.execute(
            select(Team).where(Team.id == team.id).options(selectinload(Team.members))
        )
        team_obj = team_with_members.scalar_one()
        for member in team_obj.members:
            if member.id not in enrolled_user_ids:
                enrollment = TrainingEnrollment(
                    training_id=training.id,
                    user_id=member.id,
                )
                db.add(enrollment)
                enrolled_user_ids.add(member.id)

    await db.commit()
    await db.refresh(training)
    return training


async def archive_training(db: AsyncSession, training: Training) -> Training:
    if training.status == TrainingStatus.ARCHIVED:
        raise ValueError("Treinamento já está arquivado.")
    training.status = TrainingStatus.ARCHIVED
    await db.commit()
    await db.refresh(training)
    return training


async def hard_delete_training(
    db: AsyncSession, training_id: uuid.UUID, upload_dir: str
) -> dict:
    """Permanently delete a training, reversing all XP and cleaning up files."""
    from app.gamification.models import Score, UserBadge
    from app.gamification.service import check_and_award_badges

    training = await get_training(db, training_id)
    if not training:
        raise ValueError("Treinamento não encontrado.")

    # 1. Collect affected user IDs (before cascade wipes enrollments)
    enrollment_result = await db.execute(
        select(TrainingEnrollment.user_id).where(
            TrainingEnrollment.training_id == training_id
        )
    )
    affected_user_ids = list({row[0] for row in enrollment_result.all()})

    # 2. Delete scores related to this training
    from sqlalchemy import or_

    xp_filter = (Score.source == "training") & (Score.source_id == training_id)

    xp_result = await db.execute(
        select(func.coalesce(func.sum(Score.points), 0)).where(xp_filter)
    )
    total_xp_reversed = xp_result.scalar_one()

    await db.execute(sa_delete(Score).where(xp_filter))

    # 3. Delete the training (CASCADE handles modules, enrollments, progress, etc.)
    await db.delete(training)
    await db.flush()

    # 4. Re-check badges for affected users (some may lose eligibility)
    for user_id in affected_user_ids:
        existing_badges = await db.execute(
            select(UserBadge).where(UserBadge.user_id == user_id)
        )
        from app.gamification.models import Badge

        for ub in existing_badges.scalars().all():
            badge = await db.get(Badge, ub.badge_id)
            if not badge:
                continue
            from app.gamification.service import _check_criteria, get_user_points

            pts = await get_user_points(db, user_id)
            if badge.points_threshold and pts.total_points < badge.points_threshold:
                await db.delete(ub)
                continue
            if badge.criteria:
                still_earned = await _check_criteria(
                    db, user_id, badge.criteria, pts.total_points
                )
                if not still_earned and not (
                    badge.points_threshold and pts.total_points >= badge.points_threshold
                ):
                    await db.delete(ub)

    await db.commit()

    # 5. Clean up uploaded files (non-critical, log errors)
    training_files_dir = os.path.join(upload_dir, "trainings", str(training_id))
    if os.path.isdir(training_files_dir):
        try:
            shutil.rmtree(training_files_dir)
        except OSError:
            logger.warning("Failed to remove training files at %s", training_files_dir)

    return {
        "deleted": True,
        "affected_users": len(affected_user_ids),
        "xp_reversed": total_xp_reversed,
    }


# --- Module CRUD ---


async def list_modules(
    db: AsyncSession, training_id: uuid.UUID
) -> list[TrainingModule]:
    result = await db.execute(
        select(TrainingModule)
        .where(TrainingModule.training_id == training_id)
        .order_by(TrainingModule.order)
    )
    return list(result.scalars().all())


async def get_module(
    db: AsyncSession, module_id: uuid.UUID
) -> TrainingModule | None:
    result = await db.execute(
        select(TrainingModule)
        .where(TrainingModule.id == module_id)
        .options(
            selectinload(TrainingModule.quiz).selectinload(ModuleQuiz.questions)
        )
    )
    return result.scalar_one_or_none()


async def add_module(
    db: AsyncSession, training_id: uuid.UUID, data: ModuleCreate
) -> TrainingModule:
    # Auto-assign order if not provided
    order = data.order
    if order is None:
        result = await db.execute(
            select(func.coalesce(func.max(TrainingModule.order), 0)).where(
                TrainingModule.training_id == training_id
            )
        )
        order = result.scalar_one() + 1

    module = TrainingModule(
        training_id=training_id,
        title=data.title,
        description=data.description,
        order=order,
        content_type=data.content_type,
        content_data=data.content_data,
        has_quiz=data.has_quiz,
        quiz_required_to_advance=data.quiz_required_to_advance,
    )
    db.add(module)
    await db.commit()
    await db.refresh(module)
    return module


async def update_module(
    db: AsyncSession, module: TrainingModule, data: ModuleUpdate
) -> TrainingModule:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(module, field, value)
    await db.commit()
    await db.refresh(module)
    return module


async def delete_module(db: AsyncSession, module: TrainingModule) -> None:
    await db.delete(module)
    await db.commit()


# --- Module Quiz CRUD ---


async def get_module_quiz(
    db: AsyncSession, module_id: uuid.UUID
) -> ModuleQuiz | None:
    result = await db.execute(
        select(ModuleQuiz)
        .where(ModuleQuiz.module_id == module_id)
        .options(selectinload(ModuleQuiz.questions))
        .limit(1)
    )
    return result.scalars().first()


async def create_or_update_quiz(
    db: AsyncSession, module_id: uuid.UUID, data: QuizCreate
) -> ModuleQuiz:
    existing = await get_module_quiz(db, module_id)
    if existing:
        existing.title = data.title
        existing.passing_score = data.passing_score
        quiz = existing
    else:
        quiz = ModuleQuiz(
            module_id=module_id,
            title=data.title,
            passing_score=data.passing_score,
        )
        db.add(quiz)
        await db.flush()

    # Update has_quiz on module
    module = await get_module(db, module_id)
    if module:
        module.has_quiz = True

    # Replace questions if provided
    if data.questions:
        # Delete existing questions
        if existing and existing.questions:
            for q in existing.questions:
                await db.delete(q)
            await db.flush()

        for q_data in data.questions:
            question = QuizQuestion(
                quiz_id=quiz.id,
                text=q_data.text,
                type=q_data.type,
                options=q_data.options,
                correct_answer=q_data.correct_answer,
                explanation=q_data.explanation,
                weight=q_data.weight,
                order=q_data.order,
            )
            if q_data.competency_ids:
                result = await db.execute(
                    select(Competency).where(
                        Competency.id.in_(q_data.competency_ids)
                    )
                )
                question.competencies = list(result.scalars().all())
            db.add(question)

    await db.commit()
    await db.refresh(quiz)
    return quiz


async def add_quiz_question(
    db: AsyncSession, quiz_id: uuid.UUID, data: QuizQuestionCreate
) -> QuizQuestion:
    # Auto-assign order
    result = await db.execute(
        select(func.coalesce(func.max(QuizQuestion.order), 0)).where(
            QuizQuestion.quiz_id == quiz_id
        )
    )
    order = data.order or (result.scalar_one() + 1)

    question = QuizQuestion(
        quiz_id=quiz_id,
        text=data.text,
        type=data.type,
        options=data.options,
        correct_answer=data.correct_answer,
        explanation=data.explanation,
        weight=data.weight,
        order=order,
    )
    if data.competency_ids:
        res = await db.execute(
            select(Competency).where(Competency.id.in_(data.competency_ids))
        )
        question.competencies = list(res.scalars().all())
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


async def update_quiz_question(
    db: AsyncSession, question: QuizQuestion, data: QuizQuestionUpdate
) -> QuizQuestion:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(question, field, value)
    await db.commit()
    await db.refresh(question)
    return question


async def delete_quiz_question(db: AsyncSession, question: QuizQuestion) -> None:
    await db.delete(question)
    await db.commit()


async def get_quiz_question(
    db: AsyncSession, question_id: uuid.UUID
) -> QuizQuestion | None:
    result = await db.execute(
        select(QuizQuestion).where(QuizQuestion.id == question_id)
    )
    return result.scalar_one_or_none()


# --- Training Final Quiz CRUD ---


async def get_training_quiz(
    db: AsyncSession, training_id: uuid.UUID
) -> TrainingQuiz | None:
    result = await db.execute(
        select(TrainingQuiz)
        .where(TrainingQuiz.training_id == training_id)
        .options(selectinload(TrainingQuiz.questions))
        .limit(1)
    )
    return result.scalars().first()


async def create_or_update_training_quiz(
    db: AsyncSession, training_id: uuid.UUID, data: TrainingQuizCreate
) -> TrainingQuiz:
    existing = await get_training_quiz(db, training_id)
    if existing:
        existing.title = data.title
        existing.passing_score = data.passing_score
        existing.max_attempts = data.max_attempts
        quiz = existing
    else:
        quiz = TrainingQuiz(
            training_id=training_id,
            title=data.title,
            passing_score=data.passing_score,
            max_attempts=data.max_attempts,
        )
        db.add(quiz)

    await db.commit()
    await db.refresh(quiz)
    return quiz


async def add_training_quiz_question(
    db: AsyncSession, quiz_id: uuid.UUID, data: TrainingQuizQuestionCreate
) -> TrainingQuizQuestion:
    result = await db.execute(
        select(func.coalesce(func.max(TrainingQuizQuestion.order), 0)).where(
            TrainingQuizQuestion.quiz_id == quiz_id
        )
    )
    order = data.order or (result.scalar_one() + 1)

    question = TrainingQuizQuestion(
        quiz_id=quiz_id,
        text=data.text,
        type=data.type,
        options=data.options,
        correct_answer=data.correct_answer,
        explanation=data.explanation,
        weight=data.weight,
        order=order,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


async def update_training_quiz_question(
    db: AsyncSession, question: TrainingQuizQuestion, data: TrainingQuizQuestionUpdate
) -> TrainingQuizQuestion:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(question, field, value)
    await db.commit()
    await db.refresh(question)
    return question


async def delete_training_quiz_question(
    db: AsyncSession, question: TrainingQuizQuestion
) -> None:
    await db.delete(question)
    await db.commit()


async def get_training_quiz_question(
    db: AsyncSession, question_id: uuid.UUID
) -> TrainingQuizQuestion | None:
    result = await db.execute(
        select(TrainingQuizQuestion).where(TrainingQuizQuestion.id == question_id)
    )
    return result.scalar_one_or_none()


# --- Enrollment queries ---


async def get_training_enrollments(
    db: AsyncSession, training_id: uuid.UUID
) -> list[TrainingEnrollment]:
    result = await db.execute(
        select(TrainingEnrollment)
        .where(TrainingEnrollment.training_id == training_id)
        .options(
            selectinload(TrainingEnrollment.user),
            selectinload(TrainingEnrollment.training_quiz_attempts),
        )
    )
    return list(result.scalars().all())


# --- Professional: My Trainings ---


async def get_my_enrollments(
    db: AsyncSession, user_id: uuid.UUID
) -> list[TrainingEnrollment]:
    result = await db.execute(
        select(TrainingEnrollment)
        .where(TrainingEnrollment.user_id == user_id)
        .options(
            selectinload(TrainingEnrollment.training).selectinload(Training.modules),
            selectinload(TrainingEnrollment.training).selectinload(Training.final_quiz),
            selectinload(TrainingEnrollment.module_progress),
        )
        .order_by(TrainingEnrollment.enrolled_at.desc())
    )
    return list(result.scalars().all())


async def get_pending_enrollments(
    db: AsyncSession, user_id: uuid.UUID
) -> list[TrainingEnrollment]:
    result = await db.execute(
        select(TrainingEnrollment)
        .where(
            TrainingEnrollment.user_id == user_id,
            TrainingEnrollment.status.in_([
                EnrollmentStatus.PENDING,
                EnrollmentStatus.IN_PROGRESS,
            ]),
        )
        .options(
            selectinload(TrainingEnrollment.training).selectinload(Training.modules),
            selectinload(TrainingEnrollment.module_progress),
        )
        .order_by(TrainingEnrollment.enrolled_at.desc())
    )
    return list(result.scalars().all())


async def get_enrollment_for_user(
    db: AsyncSession, training_id: uuid.UUID, user_id: uuid.UUID
) -> TrainingEnrollment | None:
    result = await db.execute(
        select(TrainingEnrollment)
        .where(
            TrainingEnrollment.training_id == training_id,
            TrainingEnrollment.user_id == user_id,
        )
        .options(
            selectinload(TrainingEnrollment.module_progress),
            selectinload(TrainingEnrollment.training_quiz_attempts),
        )
        .limit(1)
    )
    return result.scalars().first()


async def get_or_create_module_progress(
    db: AsyncSession, enrollment_id: uuid.UUID, module_id: uuid.UUID
) -> ModuleProgress:
    result = await db.execute(
        select(ModuleProgress).where(
            ModuleProgress.enrollment_id == enrollment_id,
            ModuleProgress.module_id == module_id,
        )
        .limit(1)
    )
    progress = result.scalars().first()
    if not progress:
        progress = ModuleProgress(
            enrollment_id=enrollment_id,
            module_id=module_id,
            started_at=datetime.now(timezone.utc),
        )
        db.add(progress)
        await db.flush()
    return progress


async def mark_content_viewed(
    db: AsyncSession, enrollment: TrainingEnrollment, module: TrainingModule
) -> ModuleProgress:
    # Update enrollment status to IN_PROGRESS if PENDING
    if enrollment.status == EnrollmentStatus.PENDING:
        enrollment.status = EnrollmentStatus.IN_PROGRESS

    progress = await get_or_create_module_progress(db, enrollment.id, module.id)
    progress.content_viewed = True
    if not progress.started_at:
        progress.started_at = datetime.now(timezone.utc)

    # If no quiz required, mark module as completed
    if not module.has_quiz or not module.quiz_required_to_advance:
        if not progress.completed_at:
            progress.completed_at = datetime.now(timezone.utc)
            await _check_training_completion(db, enrollment)

    await db.commit()
    await db.refresh(progress)
    return progress


async def submit_quiz_attempt(
    db: AsyncSession,
    enrollment: TrainingEnrollment,
    module: TrainingModule,
    answers: dict,
) -> QuizAttempt:
    logger.info("submit_quiz_attempt: start enrollment=%s module=%s", enrollment.id, module.id)

    # Update enrollment status to IN_PROGRESS if PENDING
    if enrollment.status == EnrollmentStatus.PENDING:
        enrollment.status = EnrollmentStatus.IN_PROGRESS

    progress = await get_or_create_module_progress(db, enrollment.id, module.id)
    logger.info("submit_quiz_attempt: progress=%s", progress.id)

    # Get quiz with questions
    quiz = await get_module_quiz(db, module.id)
    if not quiz or not quiz.questions:
        raise ValueError("Este módulo não possui quiz.")
    logger.info("submit_quiz_attempt: quiz=%s questions=%d", quiz.id, len(quiz.questions))

    # Grade the quiz
    score, graded_answers = _grade_quiz(quiz.questions, answers)
    passed = score >= quiz.passing_score
    logger.info("submit_quiz_attempt: score=%.2f passed=%s", score, passed)

    attempt = QuizAttempt(
        module_progress_id=progress.id,
        score=score,
        answers=graded_answers,
        passed=passed,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(attempt)

    # Update progress
    progress.quiz_score = score
    if passed and not progress.completed_at:
        progress.completed_at = datetime.now(timezone.utc)

    logger.info("submit_quiz_attempt: flushing")
    await db.flush()

    logger.info("submit_quiz_attempt: checking training completion")
    await _check_training_completion(db, enrollment)

    logger.info("submit_quiz_attempt: committing")
    await db.commit()

    logger.info("submit_quiz_attempt: refreshing attempt")
    await db.refresh(attempt)

    logger.info("submit_quiz_attempt: done attempt=%s", attempt.id)
    return attempt


def _grade_quiz(questions, answers: dict) -> tuple[float, dict]:
    """Grade a quiz and return (score, graded_answers)."""
    total_weight = 0.0
    earned_weight = 0.0
    graded_answers: dict = {}

    for question in questions:
        q_id = str(question.id)
        user_answer = answers.get(q_id, "")
        is_correct = False

        if question.type.value in ("multiple_choice", "true_false"):
            is_correct = (
                str(user_answer).strip().lower()
                == str(question.correct_answer or "").strip().lower()
            )

        graded_answers[q_id] = {
            "user_answer": user_answer,
            "correct_answer": question.correct_answer,
            "is_correct": is_correct,
            "explanation": question.explanation,
        }

        total_weight += question.weight
        if is_correct:
            earned_weight += question.weight

    score = earned_weight / total_weight if total_weight > 0 else 0.0
    return score, graded_answers


# --- Training Final Quiz Attempt ---


async def submit_training_quiz_attempt(
    db: AsyncSession,
    enrollment: TrainingEnrollment,
    answers: dict,
) -> TrainingQuizAttempt:
    """Submit an attempt for the training-level final quiz."""
    logger.info("submit_training_quiz_attempt: enrollment=%s", enrollment.id)

    # Get the final quiz
    quiz = await get_training_quiz(db, enrollment.training_id)
    if not quiz or not quiz.questions:
        raise ValueError("Este treinamento não possui avaliação final.")

    # Check all modules are completed
    modules = await list_modules(db, enrollment.training_id)
    if modules:
        result = await db.execute(
            select(ModuleProgress).where(
                ModuleProgress.enrollment_id == enrollment.id,
                ModuleProgress.completed_at.isnot(None),
            )
        )
        completed_ids = {p.module_id for p in result.scalars().all()}
        if not all(m.id in completed_ids for m in modules):
            raise ValueError("Complete todos os módulos antes de realizar a avaliação final.")

    # Check attempts limit
    existing_attempts = await get_training_quiz_attempts(db, enrollment.id)
    attempts_used = len(existing_attempts)

    if quiz.max_attempts > 0 and attempts_used >= quiz.max_attempts:
        # Check if manager unlocked retry
        if not enrollment.quiz_unlocked_at or (
            existing_attempts
            and existing_attempts[0].completed_at
            and enrollment.quiz_unlocked_at < existing_attempts[0].completed_at
        ):
            raise ValueError(
                "Você esgotou suas tentativas. Solicite liberação ao seu gestor."
            )
        # Manager unlocked — reset the unlock flag after this attempt
        enrollment.quiz_unlocked_at = None
        enrollment.quiz_unlocked_by = None

    # Grade
    score, graded_answers = _grade_quiz(quiz.questions, answers)
    passed = score >= quiz.passing_score
    logger.info("submit_training_quiz_attempt: score=%.2f passed=%s", score, passed)

    attempt = TrainingQuizAttempt(
        enrollment_id=enrollment.id,
        score=score,
        answers=graded_answers,
        passed=passed,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    await db.flush()

    if passed and enrollment.status != EnrollmentStatus.COMPLETED:
        enrollment.status = EnrollmentStatus.COMPLETED
        enrollment.completed_at = datetime.now(timezone.utc)

        # XP proportional to score: xp_reward * score
        training_result = await db.execute(
            select(Training).where(Training.id == enrollment.training_id)
        )
        training = training_result.scalar_one_or_none()
        if training and training.xp_reward > 0:
            xp_earned = round(training.xp_reward * score)
            logger.info("submit_training_quiz_attempt: awarding XP=%d (%.0f%% of %d)",
                        xp_earned, score * 100, training.xp_reward)
            await add_score(
                db,
                ScoreCreate(
                    user_id=enrollment.user_id,
                    points=xp_earned,
                    source="training",
                    source_id=training.id,
                    description=f"Treinamento concluído: {training.title} (nota {score:.0%})",
                ),
                commit=False,
            )
        await check_and_award_badges(db, enrollment.user_id, commit=False)

    await db.commit()
    await db.refresh(attempt)
    return attempt


async def get_training_quiz_attempts(
    db: AsyncSession, enrollment_id: uuid.UUID
) -> list[TrainingQuizAttempt]:
    result = await db.execute(
        select(TrainingQuizAttempt)
        .where(TrainingQuizAttempt.enrollment_id == enrollment_id)
        .order_by(TrainingQuizAttempt.started_at.desc())
    )
    return list(result.scalars().all())


async def unlock_quiz_retry(
    db: AsyncSession, enrollment_id: uuid.UUID, manager_id: uuid.UUID
) -> TrainingEnrollment:
    """Manager unlocks a new quiz attempt for an enrolled user."""
    result = await db.execute(
        select(TrainingEnrollment).where(TrainingEnrollment.id == enrollment_id)
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment:
        raise ValueError("Inscrição não encontrada.")

    enrollment.quiz_unlocked_by = manager_id
    enrollment.quiz_unlocked_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(enrollment)
    return enrollment


async def _check_training_completion(
    db: AsyncSession, enrollment: TrainingEnrollment
) -> None:
    """Check if all modules are completed and handle training completion.

    - If training has a final quiz: do NOT mark as completed (quiz handles that)
    - If training has NO final quiz: mark as completed and award full XP

    NOTE: This function does NOT commit.
    """
    modules = await list_modules(db, enrollment.training_id)
    if not modules:
        return

    # Reload progress
    result = await db.execute(
        select(ModuleProgress).where(
            ModuleProgress.enrollment_id == enrollment.id,
            ModuleProgress.completed_at.isnot(None),
        )
    )
    completed_progress = list(result.scalars().all())
    completed_module_ids = {p.module_id for p in completed_progress}

    all_completed = all(m.id in completed_module_ids for m in modules)
    logger.info("_check_training_completion: modules=%d completed=%d all_completed=%s enrollment_status=%s",
                len(modules), len(completed_module_ids), all_completed, enrollment.status.value)

    if all_completed and enrollment.status != EnrollmentStatus.COMPLETED:
        # Check if training has a final quiz
        final_quiz = await get_training_quiz(db, enrollment.training_id)
        if final_quiz and final_quiz.questions:
            # Don't complete — user must pass the final quiz first
            logger.info("_check_training_completion: final quiz exists, not completing yet")
        else:
            # No final quiz — complete and award full XP
            enrollment.status = EnrollmentStatus.COMPLETED
            enrollment.completed_at = datetime.now(timezone.utc)

            training_result = await db.execute(
                select(Training).where(Training.id == enrollment.training_id)
            )
            training = training_result.scalar_one_or_none()
            if training and training.xp_reward > 0:
                logger.info("_check_training_completion: awarding training XP=%d", training.xp_reward)
                await add_score(
                    db,
                    ScoreCreate(
                        user_id=enrollment.user_id,
                        points=training.xp_reward,
                        source="training",
                        source_id=training.id,
                        description=f"Treinamento concluído: {training.title}",
                    ),
                    commit=False,
                )
            await check_and_award_badges(db, enrollment.user_id, commit=False)

    # Update current_module_order
    enrollment.current_module_order = len(completed_module_ids) + 1


async def get_module_progress_for_enrollment(
    db: AsyncSession, enrollment_id: uuid.UUID
) -> list[ModuleProgress]:
    result = await db.execute(
        select(ModuleProgress)
        .where(ModuleProgress.enrollment_id == enrollment_id)
        .options(selectinload(ModuleProgress.quiz_attempts))
    )
    return list(result.scalars().all())


async def get_quiz_attempts(
    db: AsyncSession, module_progress_id: uuid.UUID
) -> list[QuizAttempt]:
    result = await db.execute(
        select(QuizAttempt)
        .where(QuizAttempt.module_progress_id == module_progress_id)
        .order_by(QuizAttempt.started_at.desc())
    )
    return list(result.scalars().all())
