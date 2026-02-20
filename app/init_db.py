"""Startup script: create tables and seed initial admin user."""

import asyncio
import logging

from sqlalchemy import select, text

from app.auth.utils import get_password_hash
from app.database import Base, engine, async_session
from app.users.models import User, UserRole

# Import all models so Base.metadata knows about them
from app.catalog.models import Competency, MasterGuideline, Product  # noqa: F401
from app.evaluations.models import AnalyticalReport, Evaluation  # noqa: F401
from app.gamification.models import Badge, Score, UserBadge  # noqa: F401
from app.journeys.models import Journey, JourneyParticipation, Question, QuestionResponse  # noqa: F401
from app.learning.models import LearningActivity, LearningPath, TutorSession  # noqa: F401

logger = logging.getLogger(__name__)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created/verified.")


async def seed_admin():
    async with async_session() as db:
        result = await db.execute(select(User).where(User.role == UserRole.SUPER_ADMIN))
        if result.scalars().first():
            logger.info("Super admin already exists, skipping seed.")
            return

        admin = User(
            email="admin@gruppen.com.br",
            hashed_password=get_password_hash("Admin@123"),
            full_name="Super Admin",
            role=UserRole.SUPER_ADMIN,
            department="TI",
        )
        db.add(admin)
        await db.commit()
        logger.info("Seeded super admin: admin@gruppen.com.br / Admin@123")


async def startup():
    await init_db()
    await seed_admin()


if __name__ == "__main__":
    asyncio.run(startup())
