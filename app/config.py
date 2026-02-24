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
    jwt_algorithm: str = "RS256"
    jwt_access_token_expire_minutes: int = 30

    # RSA keys for RS256 — PEM content or file paths
    jwt_private_key: str = ""  # PEM-encoded RSA private key (for signing)
    jwt_public_key: str = ""   # PEM-encoded RSA public key (for verification)

    cors_origins: list[str] = ["https://academy.gruppen.com.br", "http://localhost:3000"]

    upload_dir: str = "/data/uploads"
    max_upload_size_mb: int = 50

    # Cookie settings for JWT HttpOnly cookie
    cookie_name: str = "access_token"
    cookie_secure: bool = True  # False for local dev without HTTPS
    cookie_samesite: str = "lax"
    cookie_domain: str | None = None  # None = current domain only

    # Idle timeout — enforced by the frontend; backend JWT expiry is the hard limit
    idle_timeout_minutes: int = 15

    # Redis (used for token blacklist)
    redis_url: str = "redis://redis:6379/0"

    # Admin seed password — MUST be overridden via env var in production
    admin_seed_password: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def _resolve_rsa_keys(self) -> None:
        """Load RSA keys from file paths if they point to files, or auto-generate for dev."""
        import os

        # If the value looks like a file path, read its content
        for attr in ("jwt_private_key", "jwt_public_key"):
            val = getattr(self, attr)
            if val and not val.startswith("-----") and os.path.isfile(val):
                with open(val) as f:
                    object.__setattr__(self, attr, f.read())

        # In non-production without keys, auto-generate an ephemeral pair
        if self.jwt_algorithm == "RS256" and not self.jwt_private_key:
            if self.app_env == "production":
                raise ValueError(
                    "RS256 requer JWT_PRIVATE_KEY e JWT_PUBLIC_KEY em produção. "
                    "Gere com: python -m app.auth.generate_keys"
                )
            from cryptography.hazmat.primitives.asymmetric import rsa
            from cryptography.hazmat.primitives import serialization

            logger.warning(
                "SEGURANÇA: Gerando par RSA efêmero para desenvolvimento. "
                "Configure JWT_PRIVATE_KEY e JWT_PUBLIC_KEY para produção."
            )
            private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            object.__setattr__(
                self,
                "jwt_private_key",
                private_key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.PKCS8,
                    serialization.NoEncryption(),
                ).decode(),
            )
            object.__setattr__(
                self,
                "jwt_public_key",
                private_key.public_key()
                .public_bytes(
                    serialization.Encoding.PEM,
                    serialization.PublicFormat.SubjectPublicKeyInfo,
                )
                .decode(),
            )

    def validate_secrets(self) -> None:
        """Raise if running with insecure default secrets."""
        insecure = []
        if self.app_secret_key == _INSECURE_DEFAULT:
            insecure.append("APP_SECRET_KEY")
        # jwt_secret_key only matters for HS256
        if self.jwt_algorithm == "HS256" and self.jwt_secret_key == _INSECURE_DEFAULT:
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
            if self.jwt_algorithm == "HS256" and len(self.jwt_secret_key) < _MIN_SECRET_LENGTH:
                raise ValueError(
                    f"JWT_SECRET_KEY deve ter no mínimo {_MIN_SECRET_LENGTH} caracteres."
                )
            if len(self.app_secret_key) < _MIN_SECRET_LENGTH:
                raise ValueError(
                    f"APP_SECRET_KEY deve ter no mínimo {_MIN_SECRET_LENGTH} caracteres."
                )

        # Resolve RSA keys (load from file or auto-generate for dev)
        self._resolve_rsa_keys()


settings = Settings()
