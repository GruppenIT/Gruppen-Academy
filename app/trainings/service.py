import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Competency, Product
from app.teams.models import Team
from app.trainings.models import (
    ModuleQuiz,
    QuizQuestion,
    Training,
    TrainingEnrollment,
    TrainingModule,
    TrainingStatus,
)
from app.trainings.schemas import (
    ModuleCreate,
    ModuleUpdate,
    QuizCreate,
    QuizQuestionCreate,
    QuizQuestionUpdate,
    QuizUpdate,
    TrainingCreate,
    TrainingUpdate,
)


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


async def get_training(db: AsyncSession, training_id: uuid.UUID) -> Training | None:
    result = await db.execute(
        select(Training)
        .where(Training.id == training_id)
        .options(
            selectinload(Training.modules).selectinload(TrainingModule.quiz).selectinload(ModuleQuiz.questions),
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
        xp_reward=data.xp_reward,
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


# --- Quiz CRUD ---


async def get_module_quiz(
    db: AsyncSession, module_id: uuid.UUID
) -> ModuleQuiz | None:
    result = await db.execute(
        select(ModuleQuiz)
        .where(ModuleQuiz.module_id == module_id)
        .options(selectinload(ModuleQuiz.questions))
    )
    return result.scalar_one_or_none()


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


# --- Enrollment queries ---


async def get_training_enrollments(
    db: AsyncSession, training_id: uuid.UUID
) -> list[TrainingEnrollment]:
    result = await db.execute(
        select(TrainingEnrollment)
        .where(TrainingEnrollment.training_id == training_id)
        .options(selectinload(TrainingEnrollment.user))
    )
    return list(result.scalars().all())
