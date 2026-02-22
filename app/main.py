import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.catalog.router import router as catalog_router
from app.config import settings
from app.copilot.router import router as copilot_router
from app.evaluations.router import router as evaluations_router
from app.gamification.router import router as gamification_router
from app.init_db import startup as init_startup
from app.journeys.router import router as journeys_router
from app.learning.router import router as learning_router
from app.settings.router import router as settings_router
from app.teams.router import router as teams_router
from app.users.router import router as users_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_secrets()
    logger.info("CORS origins: %s", settings.cors_origins)
    await init_startup()
    yield


app = FastAPI(
    title="Gruppen Academy",
    description="Plataforma interna de aprendizagem corporativa da Gruppen",
    version="0.1.0",
    root_path="",
    lifespan=lifespan,
)

cors_origins = list(settings.cors_origins)
# Ensure common local dev origins are included
for origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
    if origin not in cors_origins:
        cors_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
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
app.include_router(copilot_router, prefix="/api/copilot", tags=["copilot"])
app.include_router(teams_router, prefix="/api/teams", tags=["teams"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
