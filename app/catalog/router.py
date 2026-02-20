import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_role
from app.catalog.schemas import (
    CompetencyCreate,
    CompetencyOut,
    CompetencyUpdate,
    MasterGuidelineCreate,
    MasterGuidelineOut,
    MasterGuidelineUpdate,
    ProductCreate,
    ProductOut,
    ProductReorderItem,
    ProductUpdate,
)
from app.catalog.service import (
    create_competency,
    create_master_guideline,
    create_product,
    get_competency,
    get_master_guideline,
    get_product,
    link_product_competency,
    list_competencies,
    list_master_guidelines,
    list_products,
    reorder_products,
    update_competency,
    update_master_guideline,
    update_product,
)
from app.database import get_db
from app.users.models import User, UserRole

router = APIRouter()

# --- Products ---


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_new_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await create_product(db, data)


@router.get("/products", response_model=list[ProductOut])
async def list_all_products(
    skip: int = 0,
    limit: int = 50,
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
):
    return await list_products(db, skip, limit, include_inactive=include_inactive)


@router.get("/products/{product_id}", response_model=ProductOut)
async def get_single_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    product = await get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return product


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_existing_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    product = await get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return await update_product(db, product, data)


@router.put("/products/reorder", status_code=204)
async def reorder_all_products(
    items: list[ProductReorderItem],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    await reorder_products(db, [(item.id, item.priority) for item in items])


@router.post("/products/{product_id}/competencies/{competency_id}", status_code=204)
async def link_competency_to_product(
    product_id: uuid.UUID,
    competency_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    try:
        await link_product_competency(db, product_id, competency_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Competencies ---


@router.post("/competencies", response_model=CompetencyOut, status_code=status.HTTP_201_CREATED)
async def create_new_competency(
    data: CompetencyCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await create_competency(db, data)


@router.get("/competencies", response_model=list[CompetencyOut])
async def list_all_competencies(
    domain: str | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    return await list_competencies(db, domain, skip, limit)


@router.get("/competencies/{competency_id}", response_model=CompetencyOut)
async def get_single_competency(competency_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    competency = await get_competency(db, competency_id)
    if not competency:
        raise HTTPException(status_code=404, detail="Competência não encontrada")
    return competency


@router.patch("/competencies/{competency_id}", response_model=CompetencyOut)
async def update_existing_competency(
    competency_id: uuid.UUID,
    data: CompetencyUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    competency = await get_competency(db, competency_id)
    if not competency:
        raise HTTPException(status_code=404, detail="Competência não encontrada")
    return await update_competency(db, competency, data)


# --- Master Guidelines ---


@router.post("/guidelines", response_model=MasterGuidelineOut, status_code=status.HTTP_201_CREATED)
async def create_new_guideline(
    data: MasterGuidelineCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    return await create_master_guideline(db, data)


@router.get("/guidelines", response_model=list[MasterGuidelineOut])
async def list_all_guidelines(
    product_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    return await list_master_guidelines(db, product_id, skip, limit)


@router.get("/guidelines/{guideline_id}", response_model=MasterGuidelineOut)
async def get_single_guideline(guideline_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    guideline = await get_master_guideline(db, guideline_id)
    if not guideline:
        raise HTTPException(status_code=404, detail="Orientação não encontrada")
    return guideline


@router.patch("/guidelines/{guideline_id}", response_model=MasterGuidelineOut)
async def update_existing_guideline(
    guideline_id: uuid.UUID,
    data: MasterGuidelineUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    guideline = await get_master_guideline(db, guideline_id)
    if not guideline:
        raise HTTPException(status_code=404, detail="Orientação não encontrada")
    return await update_master_guideline(db, guideline, data)
