import logging

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

_INSECURE_DEFAULT = "change-me"
_MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    app_env: str = "production"
    app_debug: bool = False
    app_secret_key: str = _INSECURE_DEFAULT

    database_url: str = "postgresql+asyncpg://gruppen:gruppen@db:5432/gruppen_academy"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    jwt_secret_key: str = _INSECURE_DEFAULT
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    cors_origins: list[str] = ["https://academy.gruppen.com.br", "http://localhost:3000"]

    upload_dir: str = "/tmp/gruppen-academy-uploads"
    max_upload_size_mb: int = 50

    # Admin seed password — MUST be overridden via env var in production
    admin_seed_password: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def validate_secrets(self) -> None:
        """Raise if running with insecure default secrets."""
        insecure = []
        if self.app_secret_key == _INSECURE_DEFAULT:
            insecure.append("APP_SECRET_KEY")
        if self.jwt_secret_key == _INSECURE_DEFAULT:
            insecure.append("JWT_SECRET_KEY")
        if insecure:
            if self.app_env == "production":
                raise ValueError(
                    f"Secrets inseguros em produção — configure: {', '.join(insecure)}"
                )
            logger.warning(
                "SEGURANÇA: Usando secrets padrão inseguros (%s). "
                "Configure variáveis de ambiente antes de ir para produção.",
                ", ".join(insecure),
            )

        # Validate minimum length for secrets in production
        if self.app_env == "production":
            if len(self.jwt_secret_key) < _MIN_SECRET_LENGTH:
                raise ValueError(
                    f"JWT_SECRET_KEY deve ter no mínimo {_MIN_SECRET_LENGTH} caracteres."
                )
            if len(self.app_secret_key) < _MIN_SECRET_LENGTH:
                raise ValueError(
                    f"APP_SECRET_KEY deve ter no mínimo {_MIN_SECRET_LENGTH} caracteres."
                )


settings = Settings()
