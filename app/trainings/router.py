import logging
import os
import uuid

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from app.auth.dependencies import get_current_user, require_role
from app.config import settings
from app.database import get_db
from app.trainings.models import ModuleContentType, TrainingStatus

logger = logging.getLogger(__name__)
from app.trainings.schemas import (
    EnrollmentDetailOut,
    FinalQuizProgress,
    GenerateQuizRequest,
    ModuleCreate,
    ModuleDetailOut,
    ModuleOut,
    ModuleProgressOut,
    ModuleUpdate,
    MyTrainingSummary,
    PendingItem,
    PublishRequest,
    QuizAttemptOut,
    QuizAttemptSubmit,
    QuizCreate,
    QuizOut,
    QuizQuestionCreate,
    QuizQuestionOut,
    QuizQuestionUpdate,
    ScormStatusUpdate,
    UserEnrollmentSummary,
    TrainingCreate,
    TrainingDetailOut,
    TrainingOut,
    TrainingProgressModule,
    TrainingProgressOut,
    TrainingQuizAttemptOut,
    TrainingQuizAttemptSubmit,
    TrainingQuizCreate,
    TrainingQuizOut,
    TrainingQuizQuestionCreate,
    TrainingQuizQuestionOut,
    TrainingQuizQuestionUpdate,
    TrainingQuizUpdate,
    TrainingUpdate,
)
from app.trainings.service import (
    add_module,
    add_quiz_question,
    add_training_quiz_question,
    archive_training,
    create_or_update_quiz,
    create_or_update_training_quiz,
    create_training,
    delete_module,
    delete_quiz_question,
    delete_training_quiz_question,
    get_enrollment_for_user,
    get_module,
    get_module_progress_for_enrollment,
    get_module_quiz,
    get_my_enrollments,
    get_or_create_module_progress,
    get_pending_enrollments,
    get_quiz_attempts,
    get_quiz_question,
    get_training,
    get_training_enrollments,
    get_training_quiz,
    get_training_quiz_attempts,
    get_training_quiz_question,
    hard_delete_training,
    import_scorm_training,
    list_modules,
    list_trainings,
    mark_content_viewed,
    publish_training,
    submit_quiz_attempt,
    submit_training_quiz_attempt,
    get_user_enrollments_for_manager,
    reset_enrollment,
    unlock_quiz_retry,
    update_module,
    update_quiz_question,
    update_training,
    update_training_quiz_question,
)
from app.users.models import User, UserRole

router = APIRouter()


# ──────────────────────────────────────────────
# Training CRUD (Admin)
# ──────────────────────────────────────────────


@router.post("", response_model=TrainingOut, status_code=status.HTTP_201_CREATED)
async def create_training_endpoint(
    data: TrainingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await create_training(db, data, current_user.id)
    return training


def _parse_scorm_manifest(extract_dir: str) -> tuple[str | None, list[dict]]:
    """Parse imsmanifest.xml and return (course_title, items).

    Each item is a dict with 'title', 'entry_point'.  For single-SCO packages
    there will be exactly one item.
    """
    import xml.etree.ElementTree as ET

    manifest_path = os.path.join(extract_dir, "imsmanifest.xml")
    if not os.path.isfile(manifest_path):
        return None, []

    try:
        tree = ET.parse(manifest_path)
        root = tree.getroot()
    except ET.ParseError:
        return None, []

    # Namespace handling
    ns = ""
    if root.tag.startswith("{"):
        ns = root.tag.split("}")[0] + "}"

    # Build resource map: identifier -> href
    resource_map: dict[str, str] = {}
    for res in root.iter(f"{ns}resource"):
        rid = res.get("identifier", "")
        href = res.get("href", "")
        if rid and href:
            resource_map[rid] = href

    # Get course title from organization
    course_title: str | None = None
    items: list[dict] = []

    for org in root.iter(f"{ns}organization"):
        org_title_el = org.find(f"{ns}title")
        if org_title_el is not None and org_title_el.text:
            course_title = org_title_el.text.strip()

        for item in org.iter(f"{ns}item"):
            item_title_el = item.find(f"{ns}title")
            item_title = item_title_el.text.strip() if item_title_el is not None and item_title_el.text else None
            identifierref = item.get("identifierref", "")
            entry_point = resource_map.get(identifierref)

            # Only include items that reference a resource (leaf items / SCOs)
            if entry_point and item_title:
                items.append({
                    "title": item_title,
                    "entry_point": entry_point,
                })
        break  # use first organization only

    # Fallback: if no items found but resources exist, use first resource
    if not items and resource_map:
        first_href = next(iter(resource_map.values()))
        items.append({
            "title": course_title or "Módulo SCORM",
            "entry_point": first_href,
        })

    # Fallback for entry_point: look for index.html
    if not items:
        for candidate in ["index.html", "index.htm", "launch.html"]:
            if os.path.isfile(os.path.join(extract_dir, candidate)):
                items.append({
                    "title": course_title or "Módulo SCORM",
                    "entry_point": candidate,
                })
                break

    # Deep fallback: first .html file
    if not items:
        for root_dir, _dirs, files in os.walk(extract_dir):
            for f in files:
                if f.lower().endswith((".html", ".htm")):
                    items.append({
                        "title": course_title or "Módulo SCORM",
                        "entry_point": os.path.relpath(os.path.join(root_dir, f), extract_dir),
                    })
                    break
            if items:
                break

    return course_title, items


@router.post("/import-scorm", response_model=TrainingDetailOut, status_code=status.HTTP_201_CREATED)
async def import_scorm_endpoint(
    file: UploadFile = File(...),
    title: str = Form(""),
    description: str = Form(""),
    domain: str = Form("vendas"),
    participant_level: str = Form("intermediario"),
    estimated_duration_minutes: int = Form(60),
    xp_reward: int = Form(100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    """Import a SCORM .zip package as a new training.

    Parses imsmanifest.xml to discover course title and SCO items, then creates
    a Training with one module per SCO.
    """
    import shutil
    import zipfile

    # Validate file type
    content_type = file.content_type or ""
    if content_type not in ("application/zip", "application/x-zip-compressed"):
        raise HTTPException(
            status_code=400,
            detail="Apenas arquivos .zip são aceitos para importação SCORM.",
        )

    # Read and validate size
    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo excede o limite de {settings.max_upload_size_mb}MB.",
        )

    # Create a temporary training ID for file storage
    training_id_temp = uuid.uuid4()
    upload_dir = os.path.join(settings.upload_dir, "trainings", str(training_id_temp))
    os.makedirs(upload_dir, exist_ok=True)

    # Save zip file
    zip_filename = f"scorm_import.zip"
    zip_path = os.path.join(upload_dir, zip_filename)
    with open(zip_path, "wb") as f:
        f.write(content)

    # Validate and extract zip
    extract_dir = os.path.join(upload_dir, "scorm_import")
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    except zipfile.BadZipFile:
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Arquivo ZIP inválido.")

    # Parse manifest
    course_title, items = _parse_scorm_manifest(extract_dir)
    if not items:
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail="Pacote SCORM inválido: não foi possível identificar conteúdo "
                   "(imsmanifest.xml ausente ou sem recursos).",
        )

    # Use manifest title as fallback
    final_title = title.strip() or course_title or "Treinamento SCORM"
    final_description = description.strip() or None

    # Prepare items with extract_dir
    for item in items:
        item["extract_dir"] = extract_dir

    # Create training + modules via service
    training = await import_scorm_training(
        db=db,
        created_by=current_user.id,
        title=final_title,
        description=final_description,
        domain=domain,
        participant_level=participant_level,
        estimated_duration_minutes=estimated_duration_minutes,
        xp_reward=xp_reward,
        scorm_items=items,
    )

    # Rename upload dir to match actual training ID
    final_upload_dir = os.path.join(settings.upload_dir, "trainings", str(training.id))
    if str(training_id_temp) != str(training.id):
        try:
            os.rename(upload_dir, final_upload_dir)
        except OSError:
            # If rename fails (cross-device), copy instead
            shutil.copytree(upload_dir, final_upload_dir, dirs_exist_ok=True)
            shutil.rmtree(upload_dir, ignore_errors=True)

        # Update extract_dir in all modules
        new_extract_dir = os.path.join(final_upload_dir, "scorm_import")
        modules = await list_modules(db, training.id)
        for mod in modules:
            if mod.content_data and mod.content_data.get("extract_dir"):
                mod.content_data = {
                    **mod.content_data,
                    "extract_dir": new_extract_dir,
                }
        await db.commit()

    # Reload with full relations
    training = await get_training(db, training.id)
    return training


@router.get("", response_model=list[TrainingOut])
async def list_trainings_endpoint(
    skip: int = 0,
    limit: int = 50,
    domain: str | None = None,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ts = None
    if status_filter:
        try:
            ts = TrainingStatus(status_filter.lower())
        except ValueError:
            pass
    trainings = await list_trainings(db, skip=skip, limit=limit, domain=domain, status=ts)
    return trainings


@router.get("/{training_id}", response_model=TrainingDetailOut)
async def get_training_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    return training


@router.put("/{training_id}", response_model=TrainingOut)
async def update_training_endpoint(
    training_id: uuid.UUID,
    data: TrainingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    try:
        updated = await update_training(db, training, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return updated


@router.patch("/{training_id}/publish", response_model=TrainingOut)
async def publish_training_endpoint(
    training_id: uuid.UUID,
    data: PublishRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    try:
        published = await publish_training(db, training, data.team_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return published


@router.patch("/{training_id}/archive", response_model=TrainingOut)
async def archive_training_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    try:
        archived = await archive_training(db, training)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return archived


@router.delete("/{training_id}", status_code=status.HTTP_200_OK)
async def delete_training_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    """Hard delete a training, reversing all XP and removing all related data."""
    try:
        result = await hard_delete_training(db, training_id, settings.upload_dir)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result


# ──────────────────────────────────────────────
# Module CRUD (Admin)
# ──────────────────────────────────────────────


@router.get("/{training_id}/modules", response_model=list[ModuleOut])
async def list_modules_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    modules = await list_modules(db, training_id)
    return modules


@router.get(
    "/{training_id}/modules/{module_id}", response_model=ModuleDetailOut
)
async def get_module_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    return module


@router.post(
    "/{training_id}/modules",
    response_model=ModuleOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_module_endpoint(
    training_id: uuid.UUID,
    data: ModuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Não é possível adicionar módulos a treinamentos publicados.",
        )
    module = await add_module(db, training_id, data)
    return module


@router.put(
    "/{training_id}/modules/{module_id}", response_model=ModuleOut
)
async def update_module_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    data: ModuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Não é possível editar módulos de treinamentos publicados.",
        )
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    updated = await update_module(db, module, data)
    return updated


@router.delete(
    "/{training_id}/modules/{module_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_module_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Não é possível remover módulos de treinamentos publicados.",
        )
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    # Prevent deleting the only module
    modules = await list_modules(db, training_id)
    if len(modules) <= 1:
        raise HTTPException(
            status_code=400,
            detail="O treinamento precisa ter pelo menos 1 módulo.",
        )
    await delete_module(db, module)


# ──────────────────────────────────────────────
# Module File Upload (Admin)
# ──────────────────────────────────────────────

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/msword",
    "application/zip",
    "application/x-zip-compressed",
}

MIME_TO_CONTENT_TYPE = {
    "application/pdf": ModuleContentType.DOCUMENT,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ModuleContentType.DOCUMENT,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ModuleContentType.DOCUMENT,
    "application/vnd.ms-powerpoint": ModuleContentType.DOCUMENT,
    "application/msword": ModuleContentType.DOCUMENT,
    "application/zip": ModuleContentType.SCORM,
    "application/x-zip-compressed": ModuleContentType.SCORM,
}


@router.post(
    "/{training_id}/modules/{module_id}/upload",
    response_model=ModuleOut,
)
async def upload_module_file(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    file: UploadFile = File(...),
    allow_download: bool = Form(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Treinamento não está em rascunho.")
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    # Validate file type
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de arquivo não suportado: {content_type}. "
                   f"Aceitos: PDF, PPTX, DOCX, ZIP (SCORM).",
        )

    # Validate size
    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo excede o limite de {settings.max_upload_size_mb}MB.",
        )

    # Save file
    upload_dir = os.path.join(settings.upload_dir, "trainings", str(training_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_ext = os.path.splitext(file.filename or "file")[1]
    saved_filename = f"{module_id}{file_ext}"
    file_path = os.path.join(upload_dir, saved_filename)

    with open(file_path, "wb") as f:
        f.write(content)

    # Update module
    module.file_path = file_path
    module.original_filename = file.filename
    module.mime_type = content_type
    module.content_type = MIME_TO_CONTENT_TYPE.get(content_type, ModuleContentType.DOCUMENT)
    module.allow_download = allow_download

    # SCORM: extract zip and detect entry point
    if module.content_type == ModuleContentType.SCORM:
        scorm_data = _extract_scorm_package(file_path, upload_dir, str(module_id))
        module.content_data = scorm_data

    # Generate PDF preview for non-PDF documents (PPTX, DOCX, etc.)
    module.preview_file_path = None
    if module.content_type == ModuleContentType.DOCUMENT and not content_type.endswith("/pdf"):
        preview_path = _convert_to_pdf_preview(file_path, upload_dir, str(module_id))
        if preview_path:
            module.preview_file_path = preview_path

    await db.commit()
    await db.refresh(module)
    return module


def _extract_text_from_reference(raw_bytes: bytes, filename: str) -> str | None:
    """Extract text content from a reference file based on its type.

    Supports .txt, .md (UTF-8 decode), .pdf (pdfplumber), and .docx (ZIP/XML).
    Returns up to 15 000 characters of extracted text, or None on failure.
    """
    MAX_CHARS = 15_000

    if filename.endswith((".txt", ".md")):
        text = raw_bytes.decode("utf-8", errors="replace")
        return text[:MAX_CHARS] if text.strip() else None

    if filename.endswith(".pdf"):
        import io
        import tempfile

        # pdfplumber needs a file path or file-like object
        try:
            import pdfplumber

            with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
                parts: list[str] = []
                total = 0
                for page in pdf.pages:
                    page_text = page.extract_text() or ""
                    parts.append(page_text)
                    total += len(page_text)
                    if total >= MAX_CHARS:
                        break
            text = "\n".join(parts)
            return text[:MAX_CHARS] if text.strip() else None
        except Exception:
            # Fallback: try OCR if pdfplumber gets no text (scanned PDF)
            try:
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                    tmp.write(raw_bytes)
                    tmp_path = tmp.name
                from pdf2image import convert_from_path
                import pytesseract

                images = convert_from_path(tmp_path, dpi=200)
                parts = []
                total = 0
                for img in images:
                    page_text = pytesseract.image_to_string(img, lang="por")
                    parts.append(page_text)
                    total += len(page_text)
                    if total >= MAX_CHARS:
                        break
                text = "\n".join(parts)
                return text[:MAX_CHARS] if text.strip() else None
            except Exception:
                return None
            finally:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

    if filename.endswith(".docx"):
        import io
        import zipfile as zf
        import xml.etree.ElementTree as ET

        try:
            with zf.ZipFile(io.BytesIO(raw_bytes)) as docx_zip:
                xml_content = docx_zip.read("word/document.xml")
            tree = ET.fromstring(xml_content)
            ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            parts = []
            for paragraph in tree.iter(f"{{{ns}}}p"):
                p_texts = []
                for t_elem in paragraph.iter(f"{{{ns}}}t"):
                    if t_elem.text:
                        p_texts.append(t_elem.text)
                if p_texts:
                    parts.append("".join(p_texts))
            text = "\n".join(parts)
            return text[:MAX_CHARS] if text.strip() else None
        except Exception:
            return None

    # Unknown file type — try plain text as last resort
    try:
        text = raw_bytes.decode("utf-8", errors="replace")
        return text[:MAX_CHARS] if text.strip() else None
    except Exception:
        return None


def _extract_scorm_package(zip_path: str, upload_dir: str, module_id: str) -> dict:
    """Extract a SCORM .zip and detect the entry point from imsmanifest.xml."""
    import shutil
    import zipfile
    import xml.etree.ElementTree as ET

    extract_dir = os.path.join(upload_dir, f"scorm_{module_id}")
    # Clean previous extraction
    if os.path.exists(extract_dir):
        shutil.rmtree(extract_dir)
    os.makedirs(extract_dir, exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    except zipfile.BadZipFile:
        logger.warning("SCORM upload is not a valid zip: %s", zip_path)
        return {"error": "Arquivo ZIP inválido", "entry_point": None, "extract_dir": extract_dir}

    # Try to find entry point from imsmanifest.xml
    entry_point = None
    manifest_path = os.path.join(extract_dir, "imsmanifest.xml")
    if os.path.isfile(manifest_path):
        try:
            tree = ET.parse(manifest_path)
            root = tree.getroot()
            # SCORM namespace handling
            ns = ""
            if root.tag.startswith("{"):
                ns = root.tag.split("}")[0] + "}"
            # Find first resource with href
            for resource in root.iter(f"{ns}resource"):
                href = resource.get("href")
                if href:
                    entry_point = href
                    break
        except ET.ParseError:
            logger.warning("Failed to parse imsmanifest.xml for module %s", module_id)

    # Fallback: look for index.html
    if not entry_point:
        for candidate in ["index.html", "index.htm", "launch.html"]:
            if os.path.isfile(os.path.join(extract_dir, candidate)):
                entry_point = candidate
                break

    # Deep fallback: find first .html file
    if not entry_point:
        for root_dir, _dirs, files in os.walk(extract_dir):
            for f in files:
                if f.lower().endswith((".html", ".htm")):
                    entry_point = os.path.relpath(os.path.join(root_dir, f), extract_dir)
                    break
            if entry_point:
                break

    return {
        "entry_point": entry_point,
        "extract_dir": extract_dir,
        "scorm_version": "auto",
    }


def _convert_to_pdf_preview(file_path: str, upload_dir: str, module_id: str) -> str | None:
    """Convert PPTX/DOCX to PDF using LibreOffice for inline preview."""
    import subprocess
    import tempfile

    # LibreOffice needs a writable HOME for its user profile.
    # The container runs as 'appuser' which may not have a home directory.
    # Use a unique temp profile per conversion to avoid lock conflicts.
    lo_env = {**os.environ, "HOME": "/tmp"}
    profile_dir = tempfile.mkdtemp(prefix="lo_profile_")

    try:
        result = subprocess.run(
            [
                "libreoffice", "--headless", "--norestore",
                f"-env:UserInstallation=file://{profile_dir}",
                "--convert-to", "pdf",
                "--outdir", upload_dir, file_path,
            ],
            capture_output=True,
            timeout=120,
            env=lo_env,
        )
        if result.returncode != 0:
            logger.warning(
                "LibreOffice conversion failed for %s (rc=%d): stderr=%s stdout=%s",
                file_path, result.returncode,
                result.stderr.decode(errors="replace"),
                result.stdout.decode(errors="replace"),
            )
            return None

        # LibreOffice outputs {original_name}.pdf in the outdir
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        pdf_path = os.path.join(upload_dir, f"{base_name}.pdf")
        if os.path.isfile(pdf_path):
            logger.info("PDF preview generated: %s", pdf_path)
            return pdf_path
        logger.warning("PDF preview not found after conversion: %s", pdf_path)
        return None
    except FileNotFoundError:
        logger.info("LibreOffice not available — skipping PDF preview generation")
        return None
    except subprocess.TimeoutExpired:
        logger.warning("LibreOffice conversion timed out for %s", file_path)
        return None
    except Exception as e:
        logger.warning("Error converting to PDF preview: %s", e)
        return None
    finally:
        import shutil
        shutil.rmtree(profile_dir, ignore_errors=True)


@router.get("/{training_id}/modules/{module_id}/preview")
async def serve_module_preview(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serve the PDF preview of a PPTX/DOCX module for inline viewing.

    If preview_file_path is not set, attempts on-demand conversion.
    For PDF files, serves the original directly.
    """
    _PREVIEW_FALLBACK_HTML = (
        '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
        '<body style="display:flex;flex-direction:column;align-items:center;'
        'justify-content:center;height:100vh;margin:0;font-family:system-ui,sans-serif;'
        'color:#6b7280;background:#f9fafb">'
        '<svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"'
        ' viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2'
        ' 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>'
        '<p style="margin:12px 0 4px;font-size:15px;font-weight:500">%s</p>'
        '<p style="font-size:13px;color:#9ca3af">%s</p>'
        '</body></html>'
    )

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        return Response(
            content=_PREVIEW_FALLBACK_HTML % ("Módulo não encontrado", ""),
            media_type="text/html",
        )
    if not module.file_path or not os.path.isfile(module.file_path):
        return Response(
            content=_PREVIEW_FALLBACK_HTML % (
                "Arquivo não encontrado",
                "Use o botão &ldquo;Baixar arquivo&rdquo; acima, se disponível.",
            ),
            media_type="text/html",
        )

    # PDF files: serve original directly
    if module.mime_type == "application/pdf":
        return FileResponse(
            path=module.file_path,
            media_type="application/pdf",
        )

    # Non-PDF: try cached preview first
    if module.preview_file_path and os.path.isfile(module.preview_file_path):
        return FileResponse(
            path=module.preview_file_path,
            media_type="application/pdf",
        )

    # On-demand conversion for existing files without preview
    upload_dir = os.path.dirname(module.file_path)
    preview_path = _convert_to_pdf_preview(module.file_path, upload_dir, str(module.id))
    if preview_path:
        # Cache the path for next time
        module.preview_file_path = preview_path
        await db.commit()
        return FileResponse(
            path=preview_path,
            media_type="application/pdf",
        )

    return Response(
        content=_PREVIEW_FALLBACK_HTML % (
            module.original_filename or "Documento",
            "Visualização não disponível. Use o botão &ldquo;Baixar arquivo&rdquo; acima.",
        ),
        media_type="text/html",
    )


@router.get("/{training_id}/modules/{module_id}/scorm-launch")
async def scorm_launch(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serve an HTML wrapper that provides a minimal SCORM 1.2 API and loads the content."""
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    if module.content_type != ModuleContentType.SCORM or not module.content_data:
        raise HTTPException(status_code=404, detail="Módulo não é SCORM")

    entry_point = module.content_data.get("entry_point")
    if not entry_point:
        raise HTTPException(status_code=404, detail="SCORM entry point não encontrado")

    scorm_base = f"/api/trainings/{training_id}/modules/{module_id}/scorm"
    content_url = f"{scorm_base}/{entry_point}"

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SCORM Player</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: 100%; height: 100%; overflow: hidden; }}
  iframe {{ width: 100%; height: 100%; border: none; }}
</style>
</head><body>
<script>
// Minimal SCORM 1.2 API wrapper
var _scormData = {{
  "cmi.core.lesson_status": "not attempted",
  "cmi.core.score.raw": "",
  "cmi.core.score.max": "100",
  "cmi.core.student_name": "{current_user.full_name or ''}",
  "cmi.core.student_id": "{current_user.id}",
}};
var API = {{
  LMSInitialize: function() {{ return "true"; }},
  LMSFinish: function() {{
    _notifyParent();
    return "true";
  }},
  LMSGetValue: function(key) {{ return _scormData[key] || ""; }},
  LMSSetValue: function(key, val) {{
    _scormData[key] = val;
    if (key === "cmi.core.lesson_status" || key === "cmi.core.score.raw") {{
      _notifyParent();
    }}
    return "true";
  }},
  LMSCommit: function() {{
    _notifyParent();
    return "true";
  }},
  LMSGetLastError: function() {{ return "0"; }},
  LMSGetErrorString: function() {{ return "No error"; }},
  LMSGetDiagnostic: function() {{ return ""; }},
}};
// SCORM 2004 alias
var API_1484_11 = {{
  Initialize: API.LMSInitialize,
  Terminate: API.LMSFinish,
  GetValue: API.LMSGetValue,
  SetValue: API.LMSSetValue,
  Commit: API.LMSCommit,
  GetLastError: API.LMSGetLastError,
  GetErrorString: API.LMSGetErrorString,
  GetDiagnostic: API.LMSGetDiagnostic,
}};
function _notifyParent() {{
  try {{
    window.parent.postMessage({{
      type: "scorm_status",
      lesson_status: _scormData["cmi.core.lesson_status"],
      score_raw: _scormData["cmi.core.score.raw"] ? parseFloat(_scormData["cmi.core.score.raw"]) : null,
      score_max: _scormData["cmi.core.score.max"] ? parseFloat(_scormData["cmi.core.score.max"]) : null,
    }}, "*");
  }} catch(e) {{}}
}}
</script>
<iframe src="{content_url}"></iframe>
</body></html>"""

    return Response(content=html, media_type="text/html")


@router.get("/{training_id}/modules/{module_id}/scorm/{file_path:path}")
async def serve_scorm_file(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    file_path: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serve extracted SCORM static files."""
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    if module.content_type != ModuleContentType.SCORM or not module.content_data:
        raise HTTPException(status_code=404, detail="Módulo não é SCORM")

    extract_dir = module.content_data.get("extract_dir", "")
    if not extract_dir or not os.path.isdir(extract_dir):
        raise HTTPException(status_code=404, detail="Conteúdo SCORM não encontrado")

    # Prevent path traversal
    full_path = os.path.normpath(os.path.join(extract_dir, file_path))
    if not full_path.startswith(os.path.normpath(extract_dir)):
        raise HTTPException(status_code=403, detail="Acesso negado")

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    import mimetypes
    mime_type, _ = mimetypes.guess_type(full_path)

    return FileResponse(
        path=full_path,
        media_type=mime_type or "application/octet-stream",
    )


@router.get("/{training_id}/modules/{module_id}/file")
async def serve_module_file(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    if not module.file_path or not os.path.isfile(module.file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    # Admins always can download; professionals need allow_download
    is_admin = current_user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)
    if not is_admin and not module.allow_download:
        raise HTTPException(status_code=403, detail="Download não permitido para este conteúdo.")

    return FileResponse(
        path=module.file_path,
        filename=module.original_filename or "file",
        media_type=module.mime_type or "application/octet-stream",
    )


# ──────────────────────────────────────────────
# Quiz CRUD (Admin)
# ──────────────────────────────────────────────


@router.post(
    "/{training_id}/modules/{module_id}/quiz",
    response_model=QuizOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_quiz_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    data: QuizCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Não é possível editar quizzes de treinamentos publicados.",
        )
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    quiz = await create_or_update_quiz(db, module_id, data)
    return quiz


@router.get(
    "/{training_id}/modules/{module_id}/quiz", response_model=QuizOut | None
)
async def get_quiz_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    quiz = await get_module_quiz(db, module_id)
    return quiz


@router.post(
    "/{training_id}/modules/{module_id}/quiz/questions",
    response_model=QuizQuestionOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_quiz_question_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    data: QuizQuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Treinamento não está em rascunho.")
    quiz = await get_module_quiz(db, module_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz não encontrado. Crie o quiz primeiro.")
    question = await add_quiz_question(db, quiz.id, data)
    return question


@router.put(
    "/{training_id}/modules/{module_id}/quiz/questions/{question_id}",
    response_model=QuizQuestionOut,
)
async def update_quiz_question_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    question_id: uuid.UUID,
    data: QuizQuestionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Treinamento não está em rascunho.")
    question = await get_quiz_question(db, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")
    updated = await update_quiz_question(db, question, data)
    return updated


@router.delete(
    "/{training_id}/modules/{module_id}/quiz/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_quiz_question_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Treinamento não está em rascunho.")
    question = await get_quiz_question(db, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")
    await delete_quiz_question(db, question)


# ──────────────────────────────────────────────
# Enrollments (Admin / Manager)
# ──────────────────────────────────────────────


@router.get("/{training_id}/enrollments", response_model=list[EnrollmentDetailOut])
async def list_enrollments_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
    ),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    enrollments = await get_training_enrollments(db, training_id)
    final_quiz = training.final_quiz if training else None
    result = []
    for e in enrollments:
        attempts_used = len(e.training_quiz_attempts) if e.training_quiz_attempts else 0
        passed = any(a.passed for a in (e.training_quiz_attempts or []))
        quiz_blocked = (
            bool(final_quiz)
            and final_quiz.max_attempts > 0
            and attempts_used >= final_quiz.max_attempts
            and not passed
            and not (
                e.quiz_unlocked_at
                and (not e.training_quiz_attempts or e.quiz_unlocked_at > e.training_quiz_attempts[0].completed_at)
            )
        )
        result.append(
            EnrollmentDetailOut(
                id=e.id,
                training_id=e.training_id,
                user_id=e.user_id,
                status=e.status,
                current_module_order=e.current_module_order,
                enrolled_at=e.enrolled_at,
                completed_at=e.completed_at,
                user_name=e.user.full_name if e.user else None,
                user_email=e.user.email if e.user else None,
                training_title=training.title,
                quiz_blocked=quiz_blocked,
                quiz_attempts_used=attempts_used,
            )
        )
    return result


# ──────────────────────────────────────────────
# AI Generation (Admin)
# ──────────────────────────────────────────────


@router.post("/{training_id}/modules/{module_id}/generate-content")
async def generate_module_content_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    orientation: str = Form(""),
    content_length: str = Form("normal"),
    reference_file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Generate AI content for a training module as a SCORM package.

    The AI generates structured educational content which is then rendered into
    a self-contained HTML page with the Gruppen Academy brand colours and
    wrapped in a SCORM 1.2 package so it can be played in the platform's SCORM
    launcher.

    Parameters
    ----------
    content_length : str
        Controls the depth of the generated content.
        One of ``curto``, ``normal``, ``extendido``.
    """
    from app.llm.client import generate_training_content
    from app.trainings.scorm_builder import build_scorm_from_ai_content

    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível gerar conteúdo em rascunho.")

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    # Validate content_length
    valid_lengths = {"curto", "normal", "extendido"}
    cl = (content_length or "normal").lower()
    if cl not in valid_lengths:
        cl = "normal"

    # Extract text from reference file if provided
    reference_text = None
    if reference_file:
        try:
            raw_bytes = await reference_file.read()
            filename = (reference_file.filename or "").lower()
            reference_text = _extract_text_from_reference(raw_bytes, filename)
        except Exception:
            logger.warning("Failed to extract text from reference file: %s", reference_file.filename)
            reference_text = None

    try:
        result = await generate_training_content(
            module_title=module.title,
            training_title=training.title,
            domain=training.domain,
            participant_level=training.participant_level,
            orientation=orientation or None,
            reference_text=reference_text,
            content_length=cl,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Erro na geração de conteúdo via IA: %s", e)
        raise HTTPException(status_code=502, detail="Erro ao comunicar com o serviço de IA.")

    # Build SCORM package from the AI-generated content
    upload_dir = os.path.join(settings.upload_dir, "trainings", str(training_id))
    os.makedirs(upload_dir, exist_ok=True)

    scorm_content_data = build_scorm_from_ai_content(
        content=result,
        output_dir=upload_dir,
        module_id=str(module_id),
        training_title=training.title,
        module_title=module.title,
    )

    # Save as SCORM module so it uses the iframe player
    await update_module(
        db,
        module,
        ModuleUpdate(
            content_type=ModuleContentType.SCORM,
            content_data=scorm_content_data,
        ),
    )

    return result


@router.post("/{training_id}/modules/{module_id}/update-content")
async def update_module_content_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Save manually edited content and rebuild the SCORM package."""
    from app.trainings.scorm_builder import build_scorm_from_ai_content

    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível editar conteúdo em rascunho.")

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    # Merge updated fields with existing content_data
    current = dict(module.content_data or {})
    if "title" in body:
        current["title"] = body["title"]
    if "sections" in body:
        current["sections"] = body["sections"]
    if "summary" in body:
        current["summary"] = body["summary"]
    if "key_concepts" in body:
        current["key_concepts"] = body["key_concepts"]

    # Rebuild SCORM package
    upload_dir = os.path.join(settings.upload_dir, "trainings", str(training_id))
    os.makedirs(upload_dir, exist_ok=True)

    scorm_content_data = build_scorm_from_ai_content(
        content=current,
        output_dir=upload_dir,
        module_id=str(module_id),
        training_title=training.title,
        module_title=module.title,
    )

    # Preserve videos if present
    if current.get("videos"):
        scorm_content_data["videos"] = current["videos"]

    await update_module(
        db,
        module,
        ModuleUpdate(
            content_type=ModuleContentType.SCORM,
            content_data=scorm_content_data,
        ),
    )

    return scorm_content_data


@router.post("/{training_id}/modules/{module_id}/edit-content-ai")
async def edit_module_content_ai_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Edit module content using AI based on admin instructions."""
    from app.llm.client import edit_training_content
    from app.trainings.scorm_builder import build_scorm_from_ai_content

    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível editar conteúdo em rascunho.")

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    if not module.content_data:
        raise HTTPException(status_code=400, detail="O módulo não possui conteúdo para editar.")

    edit_prompt = body.get("prompt", "").strip()
    if not edit_prompt:
        raise HTTPException(status_code=400, detail="Informe as instruções de edição.")

    # Build current content dict for the LLM
    current = {
        "title": module.content_data.get("title", module.title),
        "sections": module.content_data.get("sections", []),
        "summary": module.content_data.get("summary", ""),
        "key_concepts": module.content_data.get("key_concepts", []),
        "estimated_reading_minutes": module.content_data.get("estimated_reading_minutes", 5),
    }

    try:
        result = await edit_training_content(
            current_content=current,
            edit_prompt=edit_prompt,
            training_title=training.title,
            module_title=module.title,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Erro na edição de conteúdo via IA: %s", e)
        raise HTTPException(status_code=502, detail="Erro ao comunicar com o serviço de IA.")

    # Rebuild SCORM package
    upload_dir = os.path.join(settings.upload_dir, "trainings", str(training_id))
    os.makedirs(upload_dir, exist_ok=True)

    scorm_content_data = build_scorm_from_ai_content(
        content=result,
        output_dir=upload_dir,
        module_id=str(module_id),
        training_title=training.title,
        module_title=module.title,
    )

    # Preserve videos
    if module.content_data.get("videos"):
        scorm_content_data["videos"] = module.content_data["videos"]

    await update_module(
        db,
        module,
        ModuleUpdate(
            content_type=ModuleContentType.SCORM,
            content_data=scorm_content_data,
        ),
    )

    return result


@router.post("/{training_id}/modules/{module_id}/generate-quiz")
async def generate_module_quiz_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    body: GenerateQuizRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Generate quiz questions based on module content using AI."""
    from app.llm.client import generate_training_quiz

    if body is None:
        body = GenerateQuizRequest()

    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível gerar quiz em rascunho.")

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    # Collect content text for the LLM
    content_text = _extract_module_content_text(module)

    if not content_text.strip():
        raise HTTPException(
            status_code=400,
            detail="O módulo precisa ter conteúdo para gerar o quiz.",
        )

    try:
        raw_questions = await generate_training_quiz(
            module_title=module.title,
            content_text=content_text[:10000],
            participant_level=training.participant_level,
            num_questions=body.num_questions,
            difficulty=body.difficulty,
            orientation=body.orientation,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Erro na geração de quiz via IA: %s", e)
        raise HTTPException(status_code=502, detail="Erro ao comunicar com o serviço de IA.")

    # Create or update quiz
    quiz = await create_or_update_quiz(
        db,
        module_id,
        QuizCreate(title="Quiz", passing_score=0.7),
    )

    # Add generated questions
    saved = []
    for i, q in enumerate(raw_questions):
        question = await add_quiz_question(
            db,
            quiz.id,
            QuizQuestionCreate(
                text=q.get("text", ""),
                type=q.get("type", "multiple_choice"),
                options=q.get("options"),
                correct_answer=q.get("correct_answer"),
                explanation=q.get("explanation"),
                weight=q.get("weight", 1.0),
                order=i + 1,
            ),
        )
        saved.append(QuizQuestionOut.model_validate(question))

    # Enable quiz on module
    await update_module(db, module, ModuleUpdate(has_quiz=True))

    return {"quiz_id": str(quiz.id), "questions_count": len(saved), "questions": saved}


def _extract_module_content_text(module) -> str:
    """Extract text content from a module for AI processing."""
    content_text = ""
    if module.content_data:
        sections = module.content_data.get("sections", [])
        for sec in sections:
            content_text += f"## {sec.get('heading', '')}\n{sec.get('content', '')}\n\n"
        if not content_text:
            content_text = str(module.content_data)
    return content_text


# ──────────────────────────────────────────────
# Training Final Quiz (Admin)
# ──────────────────────────────────────────────


@router.post("/{training_id}/quiz", response_model=TrainingQuizOut, status_code=status.HTTP_201_CREATED)
async def create_training_quiz_endpoint(
    training_id: uuid.UUID,
    data: TrainingQuizCreate = Body(default=TrainingQuizCreate()),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível editar quiz em rascunho.")
    quiz = await create_or_update_training_quiz(db, training_id, data)
    return quiz


@router.get("/{training_id}/quiz", response_model=TrainingQuizOut | None)
async def get_training_quiz_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quiz = await get_training_quiz(db, training_id)
    return quiz


@router.put("/{training_id}/quiz", response_model=TrainingQuizOut)
async def update_training_quiz_endpoint(
    training_id: uuid.UUID,
    data: TrainingQuizUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível editar quiz em rascunho.")
    quiz = await get_training_quiz(db, training_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Avaliação final não encontrada")
    if data.title is not None:
        quiz.title = data.title
    if data.passing_score is not None:
        quiz.passing_score = data.passing_score
    if data.max_attempts is not None:
        quiz.max_attempts = data.max_attempts
    await db.commit()
    await db.refresh(quiz)
    return quiz


@router.delete("/{training_id}/quiz", status_code=status.HTTP_204_NO_CONTENT)
async def delete_training_quiz_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível editar quiz em rascunho.")
    quiz = await get_training_quiz(db, training_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Avaliação final não encontrada")
    await db.delete(quiz)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{training_id}/quiz/questions", response_model=TrainingQuizQuestionOut, status_code=status.HTTP_201_CREATED)
async def add_training_quiz_question_endpoint(
    training_id: uuid.UUID,
    data: TrainingQuizQuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível editar quiz em rascunho.")
    quiz = await get_training_quiz(db, training_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Crie a avaliação final antes de adicionar perguntas.")
    question = await add_training_quiz_question(db, quiz.id, data)
    return question


@router.put("/{training_id}/quiz/questions/{question_id}", response_model=TrainingQuizQuestionOut)
async def update_training_quiz_question_endpoint(
    training_id: uuid.UUID,
    question_id: uuid.UUID,
    data: TrainingQuizQuestionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível editar quiz em rascunho.")
    question = await get_training_quiz_question(db, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")
    question = await update_training_quiz_question(db, question, data)
    return question


@router.delete("/{training_id}/quiz/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_training_quiz_question_endpoint(
    training_id: uuid.UUID,
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível editar quiz em rascunho.")
    question = await get_training_quiz_question(db, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Pergunta não encontrada")
    await delete_training_quiz_question(db, question)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{training_id}/quiz/generate")
async def generate_training_quiz_endpoint(
    training_id: uuid.UUID,
    body: GenerateQuizRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Generate final quiz questions based on ALL modules content using AI."""
    from app.llm.client import generate_training_quiz as llm_generate

    if body is None:
        body = GenerateQuizRequest()

    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")
    if training.status != TrainingStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Só é possível gerar quiz em rascunho.")

    # Collect content from ALL modules
    modules = await list_modules(db, training_id)
    all_content = ""
    for mod in modules:
        mod_full = await get_module(db, mod.id)
        if mod_full:
            text = _extract_module_content_text(mod_full)
            if text.strip():
                all_content += f"\n# {mod_full.title}\n{text}\n"

    if not all_content.strip():
        raise HTTPException(
            status_code=400,
            detail="Os módulos precisam ter conteúdo para gerar a avaliação final.",
        )

    try:
        raw_questions = await llm_generate(
            module_title=f"Avaliação Final - {training.title}",
            content_text=all_content[:20000],
            participant_level=training.participant_level,
            num_questions=body.num_questions,
            difficulty=body.difficulty,
            orientation=body.orientation,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Erro na geração de quiz final via IA: %s", e)
        raise HTTPException(status_code=502, detail="Erro ao comunicar com o serviço de IA.")

    # Create or update final quiz
    quiz = await create_or_update_training_quiz(
        db, training_id, TrainingQuizCreate(title="Avaliação Final", passing_score=0.7),
    )

    # Add generated questions
    saved = []
    for i, q in enumerate(raw_questions):
        question = await add_training_quiz_question(
            db,
            quiz.id,
            TrainingQuizQuestionCreate(
                text=q.get("text", ""),
                type=q.get("type", "multiple_choice"),
                options=q.get("options"),
                correct_answer=q.get("correct_answer"),
                explanation=q.get("explanation"),
                weight=q.get("weight", 1.0),
                order=i + 1,
            ),
        )
        saved.append(TrainingQuizQuestionOut.model_validate(question))

    return {"quiz_id": str(quiz.id), "questions_count": len(saved), "questions": saved}


# ──────────────────────────────────────────────
# Manager: Unlock Quiz Retry
# ──────────────────────────────────────────────


@router.post("/{training_id}/enrollments/{enrollment_id}/unlock-quiz", response_model=EnrollmentDetailOut)
async def unlock_quiz_endpoint(
    training_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)),
):
    """Manager unlocks a new final quiz attempt for an enrolled user."""
    try:
        enrollment = await unlock_quiz_retry(db, enrollment_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return EnrollmentDetailOut(
        id=enrollment.id,
        training_id=enrollment.training_id,
        user_id=enrollment.user_id,
        status=enrollment.status,
        current_module_order=enrollment.current_module_order,
        enrolled_at=enrollment.enrolled_at,
        completed_at=enrollment.completed_at,
    )


# ──────────────────────────────────────────────
# Manager: User Training History
# ──────────────────────────────────────────────


@router.get("/manager/users/{user_id}/enrollments", response_model=list[UserEnrollmentSummary])
async def get_user_enrollments_endpoint(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)),
):
    """Manager views a specific user's training enrollment history."""
    enrollments = await get_user_enrollments_for_manager(db, user_id)
    result = []
    for e in enrollments:
        training = e.training
        modules = training.modules if training else []
        completed_ids = {
            p.module_id for p in (e.module_progress or []) if p.completed_at
        }
        result.append(
            UserEnrollmentSummary(
                enrollment_id=e.id,
                training_id=e.training_id,
                training_title=training.title if training else "",
                domain=training.domain if training else "",
                status=e.status,
                total_modules=len(modules),
                completed_modules=len(completed_ids),
                enrolled_at=e.enrolled_at,
                completed_at=e.completed_at,
            )
        )
    return result


@router.post(
    "/{training_id}/enrollments/{enrollment_id}/reset",
    response_model=EnrollmentDetailOut,
)
async def reset_enrollment_endpoint(
    training_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)),
):
    """Manager resets an enrollment so the user can redo the training."""
    try:
        enrollment = await reset_enrollment(db, enrollment_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if enrollment.training_id != training_id:
        raise HTTPException(status_code=400, detail="Enrollment does not belong to this training")

    return EnrollmentDetailOut(
        id=enrollment.id,
        training_id=enrollment.training_id,
        user_id=enrollment.user_id,
        status=enrollment.status,
        current_module_order=enrollment.current_module_order,
        enrolled_at=enrollment.enrolled_at,
        completed_at=enrollment.completed_at,
    )


# ──────────────────────────────────────────────
# Professional: My Trainings
# ──────────────────────────────────────────────


@router.get("/my/trainings", response_model=list[MyTrainingSummary])
async def my_trainings_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollments = await get_my_enrollments(db, current_user.id)
    result = []
    for e in enrollments:
        training = e.training
        modules = training.modules if training else []
        completed_ids = {
            p.module_id for p in (e.module_progress or []) if p.completed_at
        }
        has_final_quiz = bool(training and training.final_quiz and training.final_quiz.questions)
        result.append(
            MyTrainingSummary(
                enrollment_id=e.id,
                training_id=e.training_id,
                training_title=training.title if training else "",
                training_description=training.description if training else None,
                domain=training.domain if training else "",
                estimated_duration_minutes=training.estimated_duration_minutes if training else 0,
                xp_reward=training.xp_reward if training else 0,
                status=e.status,
                total_modules=len(modules),
                completed_modules=len(completed_ids),
                enrolled_at=e.enrolled_at,
                completed_at=e.completed_at,
                has_final_quiz=has_final_quiz,
            )
        )
    return result


@router.get("/my/pending", response_model=list[PendingItem])
async def my_pending_trainings_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollments = await get_pending_enrollments(db, current_user.id)
    result = []
    for e in enrollments:
        training = e.training
        modules = training.modules if training else []
        completed_ids = {
            p.module_id for p in (e.module_progress or []) if p.completed_at
        }
        total = len(modules)
        done = len(completed_ids)
        status_label = "Novo" if e.status.value == "pending" else "Em andamento"
        detail = f"{done}/{total} módulos" if total > 0 else "Sem módulos"
        result.append(
            PendingItem(
                type="training",
                id=str(e.training_id),
                title=training.title if training else "",
                description=training.description if training else None,
                status_label=status_label,
                detail=detail,
            )
        )
    return result


@router.get("/my/trainings/{training_id}/progress", response_model=TrainingProgressOut)
async def training_progress_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment = await get_enrollment_for_user(db, training_id, current_user.id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")

    training = await get_training(db, training_id)
    if not training:
        raise HTTPException(status_code=404, detail="Treinamento não encontrado")

    modules = await list_modules(db, training_id)
    progress_list = await get_module_progress_for_enrollment(db, enrollment.id)
    progress_map = {p.module_id: p for p in progress_list}

    completed_ids = {
        p.module_id for p in progress_list if p.completed_at
    }

    module_items = []
    for i, mod in enumerate(modules):
        prog = progress_map.get(mod.id)
        content_viewed = prog.content_viewed if prog else False
        quiz_score = prog.quiz_score if prog else None
        quiz_passed = False
        if prog and prog.quiz_attempts:
            quiz_passed = any(a.passed for a in prog.quiz_attempts)
        completed = mod.id in completed_ids

        # Lock logic: first module always unlocked; others require previous module completed
        locked = False
        if i > 0:
            prev_mod = modules[i - 1]
            if prev_mod.id not in completed_ids:
                locked = True

        module_items.append(
            TrainingProgressModule(
                module_id=mod.id,
                title=mod.title,
                description=mod.description,
                order=mod.order,
                content_type=mod.content_type,
                original_filename=mod.original_filename,
                mime_type=mod.mime_type,
                has_quiz=mod.has_quiz,
                quiz_required_to_advance=mod.quiz_required_to_advance,
                allow_download=mod.allow_download,
                content_viewed=content_viewed,
                quiz_passed=quiz_passed,
                quiz_score=quiz_score,
                completed=completed,
                locked=locked,
            )
        )

    # Build final quiz progress
    final_quiz_progress = FinalQuizProgress()
    final_quiz = await get_training_quiz(db, training_id)
    all_modules_done = all(m.id in completed_ids for m in modules) if modules else True
    if final_quiz and final_quiz.questions:
        quiz_attempts = await get_training_quiz_attempts(db, enrollment.id)
        attempts_used = len(quiz_attempts)
        best_score = max((a.score for a in quiz_attempts), default=None)
        passed = any(a.passed for a in quiz_attempts)
        blocked = (
            final_quiz.max_attempts > 0
            and attempts_used >= final_quiz.max_attempts
            and not passed
            and not (
                enrollment.quiz_unlocked_at
                and (not quiz_attempts or enrollment.quiz_unlocked_at > quiz_attempts[0].completed_at)
            )
        )
        final_quiz_progress = FinalQuizProgress(
            has_quiz=True,
            unlocked=all_modules_done,
            passing_score=final_quiz.passing_score,
            max_attempts=final_quiz.max_attempts,
            attempts_used=attempts_used,
            best_score=best_score,
            passed=passed,
            blocked=blocked,
            quiz_id=final_quiz.id,
            questions_count=len(final_quiz.questions),
        )

    return TrainingProgressOut(
        enrollment_id=enrollment.id,
        training_id=training.id,
        training_title=training.title,
        status=enrollment.status,
        total_modules=len(modules),
        completed_modules=len(completed_ids),
        xp_reward=training.xp_reward,
        modules=module_items,
        final_quiz=final_quiz_progress,
    )


@router.post(
    "/my/trainings/{training_id}/modules/{module_id}/view",
    response_model=ModuleProgressOut,
)
async def view_module_content_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment = await get_enrollment_for_user(db, training_id, current_user.id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    progress = await mark_content_viewed(db, enrollment, module)
    return progress


@router.post(
    "/my/trainings/{training_id}/modules/{module_id}/quiz/attempt",
    response_model=QuizAttemptOut,
)
async def submit_quiz_attempt_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    data: QuizAttemptSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment = await get_enrollment_for_user(db, training_id, current_user.id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    if not module.has_quiz:
        raise HTTPException(status_code=400, detail="Este módulo não possui quiz.")

    try:
        attempt = await submit_quiz_attempt(db, enrollment, module, data.answers)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as exc:
        logger.exception("Error submitting quiz attempt for training=%s module=%s user=%s",
                         training_id, module_id, current_user.id)
        raise HTTPException(
            status_code=500,
            detail=f"Erro interno ao processar tentativa de quiz: {type(exc).__name__}: {exc}",
        )
    return attempt


@router.get(
    "/my/trainings/{training_id}/modules/{module_id}/quiz/attempts",
    response_model=list[QuizAttemptOut],
)
async def list_quiz_attempts_endpoint(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all quiz attempts for a module by the current user."""
    enrollment = await get_enrollment_for_user(db, training_id, current_user.id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")

    progress = await get_or_create_module_progress(db, enrollment.id, module.id)
    attempts = await get_quiz_attempts(db, progress.id)
    return attempts


@router.post(
    "/my/trainings/{training_id}/modules/{module_id}/scorm-status",
    response_model=ModuleProgressOut,
)
async def update_scorm_status(
    training_id: uuid.UUID,
    module_id: uuid.UUID,
    data: ScormStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Receive SCORM runtime status (lesson_status, score) and update module progress."""
    enrollment = await get_enrollment_for_user(db, training_id, current_user.id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")

    module = await get_module(db, module_id)
    if not module or module.training_id != training_id:
        raise HTTPException(status_code=404, detail="Módulo não encontrado")
    if module.content_type != ModuleContentType.SCORM:
        raise HTTPException(status_code=400, detail="Módulo não é SCORM")

    # Mark content as viewed if SCORM reports completion
    completed_statuses = {"completed", "passed"}
    if data.lesson_status.lower() in completed_statuses:
        progress = await mark_content_viewed(db, enrollment, module)
        # Save SCORM score if provided
        if data.score_raw is not None:
            score_max = data.score_max or 100.0
            normalized = data.score_raw / score_max if score_max > 0 else 0.0
            progress.quiz_score = normalized
            await db.commit()
            await db.refresh(progress)
        return progress

    # For non-complete statuses, still create/update progress
    progress = await get_or_create_module_progress(db, enrollment.id, module.id)
    if data.score_raw is not None:
        score_max = data.score_max or 100.0
        progress.quiz_score = data.score_raw / score_max if score_max > 0 else 0.0
        await db.commit()
        await db.refresh(progress)
    return progress


# ──────────────────────────────────────────────
# Professional: Training Final Quiz
# ──────────────────────────────────────────────


@router.post(
    "/my/trainings/{training_id}/quiz/attempt",
    response_model=TrainingQuizAttemptOut,
)
async def submit_training_quiz_attempt_endpoint(
    training_id: uuid.UUID,
    data: TrainingQuizAttemptSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment = await get_enrollment_for_user(db, training_id, current_user.id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")

    try:
        attempt = await submit_training_quiz_attempt(db, enrollment, data.answers)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as exc:
        logger.exception("Error submitting training quiz attempt for training=%s user=%s",
                         training_id, current_user.id)
        raise HTTPException(
            status_code=500,
            detail=f"Erro interno ao processar tentativa: {type(exc).__name__}: {exc}",
        )
    return attempt


@router.get(
    "/my/trainings/{training_id}/quiz/attempts",
    response_model=list[TrainingQuizAttemptOut],
)
async def list_training_quiz_attempts_endpoint(
    training_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment = await get_enrollment_for_user(db, training_id, current_user.id)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")
    attempts = await get_training_quiz_attempts(db, enrollment.id)
    return attempts
