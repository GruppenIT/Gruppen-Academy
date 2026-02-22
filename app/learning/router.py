import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.learning.schemas import (
    ActivityCompletionOut,
    LearningActivityCreate,
    LearningActivityOut,
    LearningActivityUpdate,
    LearningPathCreate,
    LearningPathOut,
    LearningPathUpdate,
    PathProgressOut,
    SuggestedPathOut,
    TutorMessageRequest,
    TutorSessionCreate,
    TutorSessionOut,
)
from app.learning.service import (
    add_activity,
    complete_activity,
    create_learning_path,
    create_tutor_session,
    delete_activity,
    delete_learning_path,
    generate_session_summary,
    get_activity,
    get_learning_path,
    get_path_progress,
    get_tutor_session,
    list_activities,
    list_learning_paths,
    list_tutor_sessions,
    send_tutor_message,
    suggest_paths_by_gaps,
    update_activity,
    update_learning_path,
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


# NOTE: /paths/suggested-for-me MUST be before /paths/{path_id} to avoid UUID matching
@router.get("/paths/suggested-for-me", response_model=list[SuggestedPathOut])
async def get_suggested_paths(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suggest learning paths based on user's competency gaps from evaluations."""
    return await suggest_paths_by_gaps(db, current_user.id)


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


@router.patch("/paths/{path_id}", response_model=LearningPathOut)
async def update_existing_path(
    path_id: uuid.UUID,
    data: LearningPathUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    path = await get_learning_path(db, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Trilha não encontrada")
    return await update_learning_path(db, path, data)


@router.delete("/paths/{path_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_path(
    path_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    path = await get_learning_path(db, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Trilha não encontrada")
    await delete_learning_path(db, path)


@router.get("/paths/{path_id}/progress", response_model=PathProgressOut)
async def get_my_path_progress(
    path_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's progress on a learning path."""
    return await get_path_progress(db, current_user.id, path_id)


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


@router.patch("/paths/{path_id}/activities/{activity_id}", response_model=LearningActivityOut)
async def update_path_activity(
    path_id: uuid.UUID,
    activity_id: uuid.UUID,
    data: LearningActivityUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    activity = await get_activity(db, activity_id)
    if not activity or activity.path_id != path_id:
        raise HTTPException(status_code=404, detail="Atividade não encontrada nesta trilha")
    return await update_activity(db, activity, data)


@router.delete("/paths/{path_id}/activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_path_activity(
    path_id: uuid.UUID,
    activity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    activity = await get_activity(db, activity_id)
    if not activity or activity.path_id != path_id:
        raise HTTPException(status_code=404, detail="Atividade não encontrada nesta trilha")
    await delete_activity(db, activity)


@router.post(
    "/activities/{activity_id}/complete",
    response_model=ActivityCompletionOut,
    status_code=status.HTTP_201_CREATED,
)
async def complete_an_activity(
    activity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an activity as completed. Awards points automatically."""
    try:
        return await complete_activity(db, current_user.id, activity_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Tutor Sessions ---


@router.post("/tutor/sessions", response_model=TutorSessionOut, status_code=status.HTTP_201_CREATED)
async def start_tutor_session(
    data: TutorSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await create_tutor_session(db, current_user.id, data)


@router.get("/tutor/sessions", response_model=list[TutorSessionOut])
async def list_my_tutor_sessions(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List current user's tutor sessions."""
    return await list_tutor_sessions(db, current_user.id, skip, limit)


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


@router.post("/tutor/sessions/{session_id}/summary", response_model=TutorSessionOut)
async def generate_tutor_summary(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Generate a post-session summary for a tutor session."""
    session = await get_tutor_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    return await generate_session_summary(db, session)


@router.get("/tutor/suggested-topics")
async def get_suggested_topics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get dynamic topic suggestions based on user's context."""
    from sqlalchemy import select

    topics = []

    # Suggest topics from products
    try:
        from app.catalog.models import Product
        products_result = await db.execute(
            select(Product).where(Product.is_active == True).limit(4)
        )
        products = list(products_result.scalars().all())
        for p in products:
            topics.append({
                "label": f"Pitch de {p.name}",
                "topic": f"Simulação de pitch de {p.name} ({p.description[:80] if p.description else ''}) para um potencial cliente",
                "source": "product",
            })
    except Exception:
        pass

    # Suggest topics from recent evaluation gaps
    try:
        from app.evaluations.models import ResponseEvaluation
        from app.journeys.models import JourneyParticipation, QuestionResponse
        evals_result = await db.execute(
            select(ResponseEvaluation)
            .join(QuestionResponse, ResponseEvaluation.response_id == QuestionResponse.id)
            .join(JourneyParticipation, QuestionResponse.participation_id == JourneyParticipation.id)
            .where(JourneyParticipation.user_id == current_user.id)
            .order_by(ResponseEvaluation.created_at.desc())
            .limit(3)
        )
        evals = list(evals_result.scalars().all())
        for ev in evals:
            if ev.recommendations:
                rec = ev.recommendations[0] if ev.recommendations else None
                if rec:
                    topics.append({
                        "label": "Melhorar: " + rec[:30],
                        "topic": f"Praticar melhoria em: {rec}",
                        "source": "gap",
                    })
    except Exception:
        pass

    # Fallback default topics
    if len(topics) < 4:
        defaults = [
            {"label": "Objeções de preço", "topic": "Praticar respostas a objeções de preço em vendas de segurança", "source": "default"},
            {"label": "Discovery call", "topic": "Simular uma discovery call para identificar dores de segurança do cliente", "source": "default"},
            {"label": "Valor do SIEM", "topic": "Como explicar o valor de negócio do SIEM as a Service para um CFO", "source": "default"},
            {"label": "Pitch de BaaS", "topic": "Simulação de pitch do BaaS (Backup como Serviço) para um CTO", "source": "default"},
        ]
        for d in defaults:
            if len(topics) >= 6:
                break
            if not any(t["label"] == d["label"] for t in topics):
                topics.append(d)

    return topics[:8]
