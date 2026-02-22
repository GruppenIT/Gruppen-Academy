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
    ModuleUpdate,
    PublishRequest,
    QuizCreate,
    QuizOut,
    QuizQuestionCreate,
    QuizQuestionOut,
    QuizQuestionUpdate,
    TrainingCreate,
    TrainingDetailOut,
    TrainingOut,
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
    get_module,
    get_module_quiz,
    get_quiz_question,
    get_training,
    get_training_enrollments,
    list_modules,
    list_trainings,
    publish_training,
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
