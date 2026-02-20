import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Competency, MasterGuideline, Product
from app.catalog.schemas import (
    CompetencyCreate,
    CompetencyUpdate,
    MasterGuidelineCreate,
    MasterGuidelineUpdate,
    ProductCreate,
    ProductUpdate,
)


# --- Product ---
async def create_product(db: AsyncSession, data: ProductCreate) -> Product:
    product = Product(**data.model_dump())
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


async def get_product(db: AsyncSession, product_id: uuid.UUID) -> Product | None:
    result = await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.competencies), selectinload(Product.master_guidelines))
    )
    return result.scalar_one_or_none()


async def list_products(
    db: AsyncSession, skip: int = 0, limit: int = 50, include_inactive: bool = False
) -> list[Product]:
    query = select(Product)
    if not include_inactive:
        query = query.where(Product.is_active)
    query = query.order_by(Product.priority.asc(), Product.name.asc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def reorder_products(
    db: AsyncSession, items: list[tuple[uuid.UUID, int]]
) -> None:
    for product_id, priority in items:
        result = await db.execute(select(Product).where(Product.id == product_id))
        product = result.scalar_one_or_none()
        if product:
            product.priority = priority
    await db.commit()


async def update_product(db: AsyncSession, product: Product, data: ProductUpdate) -> Product:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    await db.commit()
    await db.refresh(product)
    return product


# --- Competency ---
async def create_competency(db: AsyncSession, data: CompetencyCreate) -> Competency:
    competency = Competency(**data.model_dump())
    db.add(competency)
    await db.commit()
    await db.refresh(competency)
    return competency


async def list_competencies(
    db: AsyncSession, domain: str | None = None, skip: int = 0, limit: int = 50
) -> list[Competency]:
    query = select(Competency).where(Competency.is_active)
    if domain:
        query = query.where(Competency.domain == domain)
    result = await db.execute(query.offset(skip).limit(limit))
    return list(result.scalars().all())


async def get_competency(db: AsyncSession, competency_id: uuid.UUID) -> Competency | None:
    result = await db.execute(select(Competency).where(Competency.id == competency_id))
    return result.scalar_one_or_none()


async def update_competency(
    db: AsyncSession, competency: Competency, data: CompetencyUpdate
) -> Competency:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(competency, field, value)
    await db.commit()
    await db.refresh(competency)
    return competency


# --- Master Guideline ---
async def create_master_guideline(db: AsyncSession, data: MasterGuidelineCreate) -> MasterGuideline:
    guideline = MasterGuideline(**data.model_dump())
    db.add(guideline)
    await db.commit()
    await db.refresh(guideline)
    return guideline


async def list_master_guidelines(
    db: AsyncSession,
    product_id: uuid.UUID | None = None,
    corporate_only: bool = False,
    include_corporate: bool = True,
    skip: int = 0,
    limit: int = 50,
) -> list[MasterGuideline]:
    query = select(MasterGuideline)
    if corporate_only:
        query = query.where(MasterGuideline.is_corporate.is_(True))
    elif product_id:
        if include_corporate:
            from sqlalchemy import or_
            query = query.where(
                or_(
                    MasterGuideline.product_id == product_id,
                    MasterGuideline.is_corporate.is_(True),
                )
            )
        else:
            query = query.where(MasterGuideline.product_id == product_id)
    result = await db.execute(query.offset(skip).limit(limit))
    return list(result.scalars().all())


async def get_master_guideline(
    db: AsyncSession, guideline_id: uuid.UUID
) -> MasterGuideline | None:
    result = await db.execute(select(MasterGuideline).where(MasterGuideline.id == guideline_id))
    return result.scalar_one_or_none()


async def update_master_guideline(
    db: AsyncSession, guideline: MasterGuideline, data: MasterGuidelineUpdate
) -> MasterGuideline:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(guideline, field, value)
    await db.commit()
    await db.refresh(guideline)
    return guideline


# --- Link Product <-> Competency ---
async def link_product_competency(
    db: AsyncSession, product_id: uuid.UUID, competency_id: uuid.UUID
) -> Product:
    product = await get_product(db, product_id)
    competency = await get_competency(db, competency_id)
    if not product or not competency:
        raise ValueError("Produto ou competência não encontrado")
    if competency not in product.competencies:
        product.competencies.append(competency)
        await db.commit()
        await db.refresh(product)
    return product
