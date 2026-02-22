import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.audit.middleware import AuditLogMiddleware
from app.auth.router import router as auth_router
from app.catalog.router import router as catalog_router
from app.config import settings
from app.copilot.router import router as copilot_router
from app.evaluations.router import router as evaluations_router
from app.gamification.router import router as gamification_router
from app.init_db import startup as init_startup
from app.redis import close_redis
from app.journeys.router import router as journeys_router
from app.learning.router import router as learning_router
from app.settings.router import router as settings_router
from app.teams.router import router as teams_router
from app.trainings.router import router as trainings_router
from app.users.router import router as users_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# --- Security Headers Middleware ---


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if settings.app_env == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; font-src 'self'; connect-src 'self'"
            )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_secrets()
    logger.info("CORS origins: %s", settings.cors_origins)
    await init_startup()
    yield
    await close_redis()


# Disable interactive docs in production
_docs_url = "/docs" if settings.app_env != "production" else None
_redoc_url = "/redoc" if settings.app_env != "production" else None

app = FastAPI(
    title="Gruppen Academy",
    description="Plataforma interna de aprendizagem corporativa da Gruppen",
    version="0.1.0",
    root_path="",
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
)

# Security headers must be added first (outermost middleware)
app.add_middleware(SecurityHeadersMiddleware)

# Audit log for mutating API requests (runs after auth, before response)
app.add_middleware(AuditLogMiddleware)

cors_origins = list(settings.cors_origins)
# Only include localhost in non-production environments
if settings.app_env != "production":
    for origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
        if origin not in cors_origins:
            cors_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
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
app.include_router(trainings_router, prefix="/api/trainings", tags=["trainings"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
