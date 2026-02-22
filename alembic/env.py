import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.database import Base

# Import all models so Alembic can detect them
from app.audit.models import AuditLog  # noqa: F401
from app.catalog.models import Competency, MasterGuideline, Product  # noqa: F401
from app.evaluations.models import AnalyticalReport, Evaluation  # noqa: F401
from app.gamification.models import Badge, Score, UserBadge  # noqa: F401
from app.journeys.models import Journey, JourneyParticipation, Question, QuestionResponse  # noqa: F401
from app.learning.models import ActivityCompletion, LearningActivity, LearningPath, TutorSession  # noqa: F401
from app.settings.models import SystemSetting  # noqa: F401
from app.users.models import User  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
