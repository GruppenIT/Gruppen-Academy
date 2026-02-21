from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_role
from app.database import get_db
from app.settings.schemas import SettingOut, SettingsBulkUpdate
from app.settings.service import get_all_settings, update_settings_bulk
from app.users.models import UserRole

router = APIRouter()


@router.get("", response_model=list[SettingOut])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await get_all_settings(db)


@router.put("", response_model=list[SettingOut])
async def bulk_update_settings(
    payload: SettingsBulkUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await update_settings_bulk(db, payload.settings)
