from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_role
from app.database import get_db
from app.settings.schemas import SettingOut, SettingsBulkUpdate
from app.settings.service import get_all_settings, update_settings_bulk
from app.users.models import UserRole

router = APIRouter()

# Keys whose values should be masked in API responses
_SENSITIVE_KEYS = {"sso_client_secret"}


def _mask_sensitive(settings: list) -> list[SettingOut]:
    """Return settings with sensitive values partially masked."""
    result = []
    for s in settings:
        value = s.value if hasattr(s, "value") else s.get("value", "")
        key = s.key if hasattr(s, "key") else s.get("key", "")
        desc = s.description if hasattr(s, "description") else s.get("description")
        if key in _SENSITIVE_KEYS and value:
            # Show only last 4 chars
            masked = "*" * max(0, len(value) - 4) + value[-4:] if len(value) > 4 else "****"
            result.append(SettingOut(key=key, value=masked, description=desc))
        else:
            result.append(SettingOut(key=key, value=value, description=desc))
    return result


@router.get("", response_model=list[SettingOut])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    settings = await get_all_settings(db)
    return _mask_sensitive(settings)


@router.put("", response_model=list[SettingOut])
async def bulk_update_settings(
    payload: SettingsBulkUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await update_settings_bulk(db, payload.settings)
