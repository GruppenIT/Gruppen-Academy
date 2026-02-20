import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.learning.schemas import (
    LearningActivityCreate,
    LearningActivityOut,
    LearningPathCreate,
    LearningPathOut,
    TutorMessageRequest,
    TutorSessionCreate,
    TutorSessionOut,
)
from app.learning.service import (
    add_activity,
    create_learning_path,
    create_tutor_session,
    get_learning_path,
    get_tutor_session,
    list_activities,
    list_learning_paths,
    send_tutor_message,
)
from app.users.models import User, UserRole

router = APIRouter()


# --- Learning Paths ---


@router.post("/paths", response_model=LearningPathOut, status_code=status.HTTP_201_CREATED)
async def create_new_path(
    data: LearningPathCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await create_learning_path(db, data)


@router.get("/paths", response_model=list[LearningPathOut])
async def list_all_paths(
    domain: str | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await list_learning_paths(db, domain, skip, limit)


@router.get("/paths/{path_id}", response_model=LearningPathOut)
async def get_single_path(
    path_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    path = await get_learning_path(db, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Trilha não encontrada")
    return path


# --- Activities ---


@router.post(
    "/paths/{path_id}/activities",
    response_model=LearningActivityOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_activity_to_path(
    path_id: uuid.UUID,
    data: LearningActivityCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    path = await get_learning_path(db, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Trilha não encontrada")
    return await add_activity(db, path_id, data)


@router.get("/paths/{path_id}/activities", response_model=list[LearningActivityOut])
async def list_path_activities(
    path_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await list_activities(db, path_id)


# --- Tutor Sessions ---


@router.post("/tutor/sessions", response_model=TutorSessionOut, status_code=status.HTTP_201_CREATED)
async def start_tutor_session(
    data: TutorSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await create_tutor_session(db, current_user.id, data)


@router.get("/tutor/sessions/{session_id}", response_model=TutorSessionOut)
async def get_single_tutor_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = await get_tutor_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    return session


@router.post("/tutor/sessions/{session_id}/messages", response_model=TutorSessionOut)
async def send_message_to_tutor(
    session_id: uuid.UUID,
    data: TutorMessageRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = await get_tutor_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    return await send_tutor_message(db, session, data.message)
