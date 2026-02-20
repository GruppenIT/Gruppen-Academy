from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.catalog.router import router as catalog_router
from app.config import settings
from app.evaluations.router import router as evaluations_router
from app.gamification.router import router as gamification_router
from app.journeys.router import router as journeys_router
from app.learning.router import router as learning_router
from app.users.router import router as users_router

app = FastAPI(
    title="Gruppen Academy",
    description="Plataforma interna de aprendizagem corporativa da Gruppen",
    version="0.1.0",
    root_path="",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/users", tags=["users"])
app.include_router(catalog_router, prefix="/api/catalog", tags=["catalog"])
app.include_router(journeys_router, prefix="/api/journeys", tags=["journeys"])
app.include_router(evaluations_router, prefix="/api/evaluations", tags=["evaluations"])
app.include_router(learning_router, prefix="/api/learning", tags=["learning"])
app.include_router(gamification_router, prefix="/api/gamification", tags=["gamification"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
