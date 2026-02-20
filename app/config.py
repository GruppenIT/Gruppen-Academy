from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = "production"
    app_debug: bool = False
    app_secret_key: str = "change-me"

    database_url: str = "postgresql+asyncpg://gruppen:gruppen@db:5432/gruppen_academy"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    cors_origins: list[str] = ["https://academy.gruppen.com.br"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
