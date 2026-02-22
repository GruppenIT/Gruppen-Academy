import logging

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

_INSECURE_DEFAULT = "change-me"


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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def validate_secrets(self) -> None:
        """Raise if running in production with insecure default secrets."""
        if self.app_env == "production":
            insecure = []
            if self.app_secret_key == _INSECURE_DEFAULT:
                insecure.append("APP_SECRET_KEY")
            if self.jwt_secret_key == _INSECURE_DEFAULT:
                insecure.append("JWT_SECRET_KEY")
            if insecure:
                raise ValueError(
                    f"Secrets inseguros em produção — configure: {', '.join(insecure)}"
                )


settings = Settings()
