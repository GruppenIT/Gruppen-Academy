from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.settings.models import SystemSetting

# Default settings that are created on first access
DEFAULTS: dict[str, tuple[str, str]] = {
    "timezone": ("America/Sao_Paulo", "Fuso horário padrão do sistema"),
    "sso_enabled": ("false", "Autenticação SSO (Microsoft Entra ID) habilitada"),
    "sso_tenant_id": ("", "Microsoft Entra ID - Directory (Tenant) ID"),
    "sso_client_id": ("", "Microsoft Entra ID - Application (Client) ID"),
    "sso_client_secret": ("", "Microsoft Entra ID - Client Secret"),
    "sso_redirect_uri": ("", "URL de callback após login (ex: https://academy.gruppen.com.br/auth/callback)"),
}


async def get_all_settings(db: AsyncSession) -> list[SystemSetting]:
    result = await db.execute(select(SystemSetting).order_by(SystemSetting.key))
    settings = list(result.scalars().all())

    existing_keys = {s.key for s in settings}
    for key, (default_value, description) in DEFAULTS.items():
        if key not in existing_keys:
            setting = SystemSetting(key=key, value=default_value, description=description)
            db.add(setting)
            settings.append(setting)

    if len(existing_keys) < len(DEFAULTS):
        await db.commit()

    return settings


async def get_setting(db: AsyncSession, key: str) -> SystemSetting | None:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()

    if setting is None and key in DEFAULTS:
        default_value, description = DEFAULTS[key]
        setting = SystemSetting(key=key, value=default_value, description=description)
        db.add(setting)
        await db.commit()
        await db.refresh(setting)

    return setting


async def update_setting(db: AsyncSession, key: str, value: str) -> SystemSetting:
    setting = await get_setting(db, key)
    if setting is None:
        setting = SystemSetting(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
    await db.commit()
    await db.refresh(setting)
    return setting


async def update_settings_bulk(db: AsyncSession, updates: dict[str, str]) -> list[SystemSetting]:
    for key, value in updates.items():
        await update_setting(db, key, value)
    return await get_all_settings(db)


async def get_sso_config(db: AsyncSession) -> dict[str, str]:
    """Load SSO configuration from system_settings as a flat dict."""
    sso_keys = ["sso_enabled", "sso_tenant_id", "sso_client_id", "sso_client_secret", "sso_redirect_uri"]
    config = {}
    for key in sso_keys:
        setting = await get_setting(db, key)
        config[key] = setting.value if setting else ""
    return config
