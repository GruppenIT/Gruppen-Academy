import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.config import settings
from app.database import get_db
from app.trainings.models import ModuleContentType, TrainingStatus
from app.trainings.schemas import (
    EnrollmentDetailOut,
    ModuleCreate,
    ModuleDetailOut,
    ModuleOut,
    ModuleProgressOut,
    ModuleUpdate,
    MyTrainingSummary,
    PendingItem,
    PublishRequest,
    QuizAttemptOut,
    QuizAttemptSubmit,
    QuizCreate,
    QuizOut,
    QuizQuestionCreate,
    QuizQuestionOut,
    QuizQuestionUpdate,
    TrainingCreate,
    TrainingDetailOut,
    TrainingOut,
    TrainingProgressModule,
    TrainingProgressOut,
    TrainingUpdate,
)
from app.trainings.service import (
    add_module,
    add_quiz_question,
    archive_training,
    create_or_update_quiz,
    create_training,
    delete_module,
    delete_quiz_question,
    get_enrollment_for_user,
    get_module,
    get_module_progress_for_enrollment,
    get_module_quiz,
    get_my_enrollments,
    get_pending_enrollments,
    get_quiz_question,
    get_training,
    get_training_enrollments,
    list_modules,
    list_trainings,
    mark_content_viewed,
    publish_training,
    submit_quiz_attempt,
    update_module,
    update_quiz_question,
    update_training,
)
from app.users.models import User, UserRole

router = APIRouter()


# ──────────────────────────────────────────────
# Training CRUD (Admin)
# ──────────────────────────────────────────────


@router.post("", response_model=TrainingOut, status_code=status.HTTP_201_CREATED)
async def create_training_endpoint(
    data: TrainingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await create_training(db, data, current_user.id)
    return training


@router.get("", response_model=list[TrainingOut])
async def list_trainings_endpoint(
    skip: int = 0,
    limit: int = 50,
    domain: str | None = None,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ts = None
    if status_filter:
        try:
            ts = TrainingStatus(status_filter.lower())
        except ValueError:
            pass
    trainings = await list_trainings(db, skip=skip, limit=limit, domain=domain, status=ts)
    return trainings


@router.get("/{training_id}", response_model=TrainingDetailOut)
async def get_training_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    return training


@router.put("/{training_id}", response_model=TrainingOut)
async def update_training_endpoint(
    training_id: uuid.UUID,
    data: TrainingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    try:
        updated = await update_training(db, training, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return updated


@router.patch("/{training_id}/publish", response_model=TrainingOut)
async def publish_training_endpoint(
    training_id: uuid.UUID,
    data: PublishRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    try:
        published = await publish_training(db, training, data.team_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return published


@router.patch("/{training_id}/archive", response_model=TrainingOut)
async def archive_training_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    try:
        archived = await archive_training(db, training)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return archived


# ──────────────────────────────────────────────
# Module CRUD (Admin)
# ──────────────────────────────────────────────


@router.get("/{training_id}/modules", response_model=list[ModuleOut])
async def list_modules_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    modules = await list_modules(db, training_id)
    return modules


@router.get(
    "/{training_id}/modules/{module_id}", response_model=ModuleDetailOut
)
async def get_module_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    return module


@router.post(
    "/{training_id}/modules",
    response_model=ModuleOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_module_endpoint(
    training_id: uuid.UUID,
    data: ModuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Não é possível adicionar módulos a treinamentos publicados.",
        )
    module = await add_module(db, training_id, data)
    return module


@router.put(
    "/{training_id}/modules/{module_id}", response_model=ModuleOut
)
async def update_module_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    data: ModuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Não é possível editar módulos de treinamentos publicados.",
        )
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    updated = await update_module(db, module, data)
    return updated


@router.delete(
    "/{training_id}/modules/{module_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_module_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Não é possível remover módulos de treinamentos publicados.",
        )
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    # Prevent deleting the only module
    modules = await list_modules(db, training_id)
    if len(modules) <= 1:
        raise HTTPException(
            status_code=400,
            detail="O treinamento precisa ter pelo menos 1 módulo.",
        )
    await delete_module(db, module)


# ──────────────────────────────────────────────
# Module File Upload (Admin)
# ──────────────────────────────────────────────

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/msword",
    "application/zip",
    "application/x-zip-compressed",
}

MIME_TO_CONTENT_TYPE = {
    "application/pdf": ModuleContentType.DOCUMENT,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ModuleContentType.DOCUMENT,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ModuleContentType.DOCUMENT,
    "application/vnd.ms-powerpoint": ModuleContentType.DOCUMENT,
    "application/msword": ModuleContentType.DOCUMENT,
    "application/zip": ModuleContentType.SCORM,
    "application/x-zip-compressed": ModuleContentType.SCORM,
}


@router.post(
    "/{training_id}/modules/{module_id}/upload",
    response_model=ModuleOut,
)
async def upload_module_file(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Treinamento não está em rascunho.")
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    # Validate file type
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de arquivo não suportado: {content_type}. "
                   f"Aceitos: PDF, PPTX, DOCX, ZIP (SCORM).",
        )

    # Validate size
    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo excede o limite de {settings.max_upload_size_mb}MB.",
        )

    # Save file
    upload_dir = os.path.join(settings.upload_dir, "trainings", str(training_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_ext = os.path.splitext(file.filename or "file")[1]
    saved_filename = f"{module_id}{file_ext}"
    file_path = os.path.join(upload_dir, saved_filename)

    with open(file_path, "wb") as f:
        f.write(content)

    # Update module
    module.file_path = file_path
    module.original_filename = file.filename
    module.mime_type = content_type
    module.content_type = MIME_TO_CONTENT_TYPE.get(content_type, ModuleContentType.DOCUMENT)

    await db.commit()
    await db.refresh(module)
    return module


@router.get("/{training_id}/modules/{module_id}/file")
async def serve_module_file(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    if not module.file_path or not os.path.isfile(module.file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    return FileResponse(
        path=module.file_path,
        filename=module.original_filename or "file",
        media_type=module.mime_type or "application/octet-stream",
    )


# ──────────────────────────────────────────────
# Quiz CRUD (Admin)
# ──────────────────────────────────────────────


@router.post(
    "/{training_id}/modules/{module_id}/quiz",
    response_model=QuizOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_quiz_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    data: QuizCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Não é possível editar quizzes de treinamentos publicados.",
        )
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    quiz = await create_or_update_quiz(db, module_id, data)
    return quiz


@router.get(
    "/{training_id}/modules/{module_id}/quiz", response_model=QuizOut | None
)
async def get_quiz_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    quiz = await get_module_quiz(db, module_id)
    return quiz


@router.post(
    "/{training_id}/modules/{module_id}/quiz/questions",
    response_model=QuizQuestionOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_quiz_question_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    data: QuizQuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Treinamento não está em rascunho.")
    quiz = await get_module_quiz(db, module_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz não encontrado. Crie o quiz primeiro.")
    question = await add_quiz_question(db, quiz.id, data)
    return question


@router.put(
    "/{training_id}/modules/{module_id}/quiz/questions/{question_id}",
    response_model=QuizQuestionOut,
)
async def update_quiz_question_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    question_id: uuid.UUID,
    data: QuizQuestionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Treinamento não está em rascunho.")
    question = await get_quiz_question(db, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")
    updated = await update_quiz_question(db, question, data)
    return updated


@router.delete(
    "/{training_id}/modules/{module_id}/quiz/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_quiz_question_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Treinamento não está em rascunho.")
    question = await get_quiz_question(db, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")
    await delete_quiz_question(db, question)


# ──────────────────────────────────────────────
# Enrollments (Admin / Manager)
# ──────────────────────────────────────────────


@router.get("/{training_id}/enrollments", response_model=list[EnrollmentDetailOut])
async def list_enrollments_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    enrollments = await get_training_enrollments(db, training_id)
    result = []
    for e in enrollments:
        result.append(
            EnrollmentDetailOut(
                id=e.id,
                training_id=e.training_id,
                user_id=e.user_id,
                status=e.status,
                current_module_order=e.current_module_order,
                enrolled_at=e.enrolled_at,
                completed_at=e.completed_at,
                user_name=e.user.full_name if e.user else None,
                user_email=e.user.email if e.user else None,
                training_title=training.title,
            )
        )
    return result


# ──────────────────────────────────────────────
# Professional: My Trainings
# ──────────────────────────────────────────────


@router.get("/my/trainings", response_model=list[MyTrainingSummary])
async def my_trainings_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollments = await get_my_enrollments(db, current_user.id)
    result = []
    for e in enrollments:
        training = e.training
        modules = training.modules if training else []
        completed_ids = {
            p.module_id for p in (e.module_progress or []) if p.completed_at
        }
        result.append(
            MyTrainingSummary(
                enrollment_id=e.id,
                training_id=e.training_id,
                training_title=training.title if training else "",
                training_description=training.description if training else None,
                domain=training.domain if training else "",
                estimated_duration_minutes=training.estimated_duration_minutes if training else 0,
                xp_reward=training.xp_reward if training else 0,
                status=e.status,
                total_modules=len(modules),
                completed_modules=len(completed_ids),
                enrolled_at=e.enrolled_at,
                completed_at=e.completed_at,
            )
        )
    return result


@router.get("/my/pending", response_model=list[PendingItem])
async def my_pending_trainings_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollments = await get_pending_enrollments(db, current_user.id)
    result = []
    for e in enrollments:
        training = e.training
        modules = training.modules if training else []
        completed_ids = {
            p.module_id for p in (e.module_progress or []) if p.completed_at
        }
        total = len(modules)
        done = len(completed_ids)
        status_label = "Novo" if e.status.value == "pending" else "Em andamento"
        detail = f"{done}/{total} módulos" if total > 0 else "Sem módulos"
        result.append(
            PendingItem(
                type="training",
                id=str(e.training_id),
                title=training.title if training else "",
                description=training.description if training else None,
                status_label=status_label,
                detail=detail,
            )
        )
    return result


@router.get("/my/trainings/{training_id}/progress", response_model=TrainingProgressOut)
async def training_progress_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment = await get_enrollment_for_user(db, training_id, current_user.id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")

    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")

    modules = await list_modules(db, training_id)
    progress_list = await get_module_progress_for_enrollment(db, enrollment.id)
    progress_map = {p.module_id: p for p in progress_list}

    completed_ids = {
        p.module_id for p in progress_list if p.completed_at
    }

    module_items = []
    for i, mod in enumerate(modules):
        prog = progress_map.get(mod.id)
        content_viewed = prog.content_viewed if prog else False
        quiz_score = prog.quiz_score if prog else None
        quiz_passed = False
        if prog and prog.quiz_attempts:
            quiz_passed = any(a.passed for a in prog.quiz_attempts)
        completed = mod.id in completed_ids

        # Lock logic: first module always unlocked; others require previous module completed
        locked = False
        if i > 0:
            prev_mod = modules[i - 1]
            if prev_mod.id not in completed_ids:
                locked = True

        module_items.append(
            TrainingProgressModule(
                module_id=mod.id,
                title=mod.title,
                description=mod.description,
                order=mod.order,
                content_type=mod.content_type,
                original_filename=mod.original_filename,
                has_quiz=mod.has_quiz,
                quiz_required_to_advance=mod.quiz_required_to_advance,
                xp_reward=mod.xp_reward,
                content_viewed=content_viewed,
                quiz_passed=quiz_passed,
                quiz_score=quiz_score,
                completed=completed,
                locked=locked,
            )
        )

    return TrainingProgressOut(
        enrollment_id=enrollment.id,
        training_id=training.id,
        training_title=training.title,
        status=enrollment.status,
        total_modules=len(modules),
        completed_modules=len(completed_ids),
        xp_reward=training.xp_reward,
        modules=module_items,
    )


@router.post(
    "/my/trainings/{training_id}/modules/{module_id}/view",
    response_model=ModuleProgressOut,
)
async def view_module_content_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment = await get_enrollment_for_user(db, training_id, current_user.id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    progress = await mark_content_viewed(db, enrollment, module)
    return progress


@router.post(
    "/my/trainings/{training_id}/modules/{module_id}/quiz/attempt",
    response_model=QuizAttemptOut,
)
async def submit_quiz_attempt_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    data: QuizAttemptSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment = await get_enrollment_for_user(db, training_id, current_user.id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    if not module.has_quiz:
        raise HTTPException(status_code=400, detail="Este módulo não possui quiz.")

    try:
        attempt = await submit_quiz_attempt(db, enrollment, module, data.answers)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return attempt
