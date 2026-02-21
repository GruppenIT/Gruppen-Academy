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

    cors_origins: list[str] = ["https://academy.gruppen.com.br", "http://localhost:3000"]

    # Azure AD / Microsoft Entra ID OIDC settings
    azure_ad_tenant_id: str = ""
    azure_ad_client_id: str = ""
    azure_ad_client_secret: str = ""
    azure_ad_redirect_uri: str = "http://localhost:3000/auth/callback"

    @property
    def azure_ad_authority(self) -> str:
        return f"https://login.microsoftonline.com/{self.azure_ad_tenant_id}"

    @property
    def azure_ad_token_url(self) -> str:
        return f"{self.azure_ad_authority}/oauth2/v2.0/token"

    @property
    def azure_ad_authorize_url(self) -> str:
        return f"{self.azure_ad_authority}/oauth2/v2.0/authorize"

    @property
    def azure_ad_jwks_uri(self) -> str:
        return f"https://login.microsoftonline.com/{self.azure_ad_tenant_id}/discovery/v2.0/keys"

    @property
    def azure_ad_issuer(self) -> str:
        return f"https://login.microsoftonline.com/{self.azure_ad_tenant_id}/v2.0"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
