import logging
import re
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Competency, Product
from app.journeys.models import (
    Journey,
    JourneyParticipation,
    OCRUpload,
    OCRUploadStatus,
    PageCode,
    Question,
    QuestionResponse,
)
from app.journeys.qr_utils import read_codes_from_pdf_pages
from app.journeys.schemas import (
    JourneyCreate,
    JourneyUpdate,
    ParticipationCreate,
    QuestionCreate,
    QuestionUpdate,
    ResponseCreate,
)
from app.users.models import User

logger = logging.getLogger(__name__)


# --- Journey ---
async def create_journey(db: AsyncSession, data: JourneyCreate, created_by: uuid.UUID) -> Journey:
    journey = Journey(
        title=data.title,
        description=data.description,
        domain=data.domain,
        session_duration_minutes=data.session_duration_minutes,
        participant_level=data.participant_level,
        mode=data.mode,
        created_by=created_by,
    )
    if data.product_ids:
        result = await db.execute(select(Product).where(Product.id.in_(data.product_ids)))
        journey.products = list(result.scalars().all())
    if data.competency_ids:
        result = await db.execute(select(Competency).where(Competency.id.in_(data.competency_ids)))
        journey.competencies = list(result.scalars().all())
    db.add(journey)
    await db.commit()
    await db.refresh(journey)
    return journey


async def get_journey(db: AsyncSession, journey_id: uuid.UUID) -> Journey | None:
    result = await db.execute(
        select(Journey)
        .where(Journey.id == journey_id)
        .options(selectinload(Journey.questions), selectinload(Journey.products))
    )
    return result.scalar_one_or_none()


async def list_journeys(
    db: AsyncSession, skip: int = 0, limit: int = 50, domain: str | None = None
) -> list[Journey]:
    query = select(Journey)
    if domain:
        query = query.where(Journey.domain == domain)
    result = await db.execute(query.order_by(Journey.created_at.desc()).offset(skip).limit(limit))
    return list(result.scalars().all())


async def update_journey(db: AsyncSession, journey: Journey, data: JourneyUpdate) -> Journey:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(journey, field, value)
    await db.commit()
    await db.refresh(journey)
    return journey


# --- Question ---
async def add_question(db: AsyncSession, journey_id: uuid.UUID, data: QuestionCreate) -> Question:
    question = Question(
        journey_id=journey_id,
        text=data.text,
        type=data.type,
        weight=data.weight,
        rubric=data.rubric,
        max_time_seconds=data.max_time_seconds,
        expected_lines=data.expected_lines,
        order=data.order,
    )
    if data.competency_ids:
        result = await db.execute(
            select(Competency).where(Competency.id.in_(data.competency_ids))
        )
        question.competencies = list(result.scalars().all())
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


async def list_questions(db: AsyncSession, journey_id: uuid.UUID) -> list[Question]:
    result = await db.execute(
        select(Question).where(Question.journey_id == journey_id).order_by(Question.order)
    )
    return list(result.scalars().all())


# --- Participation ---
async def create_participation(db: AsyncSession, data: ParticipationCreate) -> JourneyParticipation:
    participation = JourneyParticipation(journey_id=data.journey_id, user_id=data.user_id)
    db.add(participation)
    await db.commit()
    await db.refresh(participation)
    return participation


async def get_participation(
    db: AsyncSession, participation_id: uuid.UUID
) -> JourneyParticipation | None:
    result = await db.execute(
        select(JourneyParticipation)
        .where(JourneyParticipation.id == participation_id)
        .options(selectinload(JourneyParticipation.responses))
    )
    return result.scalar_one_or_none()


async def complete_participation(
    db: AsyncSession, participation: JourneyParticipation
) -> JourneyParticipation:
    participation.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(participation)
    return participation


# --- Response ---
async def submit_response(
    db: AsyncSession, participation_id: uuid.UUID, data: ResponseCreate
) -> QuestionResponse:
    response = QuestionResponse(
        participation_id=participation_id,
        question_id=data.question_id,
        answer_text=data.answer_text,
        ocr_source=data.ocr_source,
        time_spent_seconds=data.time_spent_seconds,
    )
    db.add(response)
    await db.commit()
    await db.refresh(response)
    return response


# --- Question Update/Delete ---
async def get_question(db: AsyncSession, question_id: uuid.UUID) -> Question | None:
    result = await db.execute(select(Question).where(Question.id == question_id))
    return result.scalar_one_or_none()


async def update_question(
    db: AsyncSession, question: Question, data: QuestionUpdate
) -> Question:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(question, field, value)
    await db.commit()
    await db.refresh(question)
    return question


async def delete_question(db: AsyncSession, question: Question) -> None:
    await db.delete(question)
    await db.commit()


# --- Journey Clone ---
async def clone_journey(db: AsyncSession, journey_id: uuid.UUID, created_by: uuid.UUID) -> Journey:
    """Clone a journey with all its questions."""
    original = await get_journey(db, journey_id)
    if not original:
        raise ValueError("Jornada não encontrada")

    clone = Journey(
        title=f"{original.title} (cópia)",
        description=original.description,
        domain=original.domain,
        session_duration_minutes=original.session_duration_minutes,
        participant_level=original.participant_level,
        mode=original.mode,
        created_by=created_by,
    )
    db.add(clone)
    await db.flush()

    questions = await list_questions(db, journey_id)
    for q in questions:
        new_q = Question(
            journey_id=clone.id,
            text=q.text,
            type=q.type,
            weight=q.weight,
            rubric=q.rubric,
            max_time_seconds=q.max_time_seconds,
            expected_lines=q.expected_lines,
            order=q.order,
        )
        db.add(new_q)

    await db.commit()
    await db.refresh(clone)
    return clone


# --- OCR ---
async def create_ocr_upload(
    db: AsyncSession,
    participation_id: uuid.UUID,
    file_path: str,
    original_filename: str,
) -> OCRUpload:
    upload = OCRUpload(
        participation_id=participation_id,
        file_path=file_path,
        original_filename=original_filename,
    )
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    return upload


async def list_ocr_uploads(db: AsyncSession, skip: int = 0, limit: int = 50) -> list[OCRUpload]:
    result = await db.execute(
        select(OCRUpload).order_by(OCRUpload.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


async def get_ocr_upload(db: AsyncSession, upload_id: uuid.UUID) -> OCRUpload | None:
    result = await db.execute(select(OCRUpload).where(OCRUpload.id == upload_id))
    return result.scalar_one_or_none()


async def process_ocr_upload(db: AsyncSession, upload_id: uuid.UUID) -> OCRUpload:
    """Process an OCR upload — extract text from PDF pages.

    In production, this would use pytesseract + pdf2image or a cloud OCR API.
    Currently extracts text from PDF using PyPDF2/pdfplumber if available,
    or returns a placeholder for manual entry.
    """
    upload = await get_ocr_upload(db, upload_id)
    if not upload:
        raise ValueError("Upload não encontrado")

    upload.status = OCRUploadStatus.PROCESSING
    await db.commit()

    try:
        # Get participation questions for mapping
        participation = await get_participation(db, upload.participation_id)
        if not participation:
            raise ValueError("Participação não encontrada")

        questions = await list_questions(db, participation.journey_id)

        extracted = []
        text_content = ""

        # Extract text from PDF (supports both digital and scanned PDFs)
        page_texts = _extract_pages_text(upload.file_path)
        text_content = "\n".join(page_texts)

        if text_content.strip():
            # Simple split: divide text equally among questions
            lines = [l for l in text_content.split("\n") if l.strip()]
            lines_per_q = max(1, len(lines) // len(questions)) if questions else len(lines)

            for i, q in enumerate(questions):
                start = i * lines_per_q
                end = start + lines_per_q if i < len(questions) - 1 else len(lines)
                chunk = "\n".join(lines[start:end])
                extracted.append({
                    "question_order": q.order,
                    "question_id": str(q.id),
                    "extracted_text": chunk,
                    "confidence": 0.5,
                })
        else:
            # No text extracted — create empty placeholders for manual entry
            for q in questions:
                extracted.append({
                    "question_order": q.order,
                    "question_id": str(q.id),
                    "extracted_text": "",
                    "confidence": 0.0,
                })

        upload.extracted_responses = extracted
        upload.status = OCRUploadStatus.PROCESSED
    except Exception as e:
        upload.status = OCRUploadStatus.ERROR
        upload.error_message = str(e)

    await db.commit()
    await db.refresh(upload)
    return upload


async def review_ocr_upload(
    db: AsyncSession,
    upload_id: uuid.UUID,
    extracted_responses: list[dict],
    reviewer_id: uuid.UUID,
) -> OCRUpload:
    """Admin reviews and corrects OCR-extracted text."""
    upload = await get_ocr_upload(db, upload_id)
    if not upload:
        raise ValueError("Upload não encontrado")

    upload.extracted_responses = extracted_responses
    upload.status = OCRUploadStatus.REVIEWED
    upload.reviewed_by = reviewer_id
    await db.commit()
    await db.refresh(upload)
    return upload


async def approve_ocr_upload(
    db: AsyncSession, upload_id: uuid.UUID
) -> list[QuestionResponse]:
    """Approve OCR results and create QuestionResponses from reviewed text."""
    upload = await get_ocr_upload(db, upload_id)
    if not upload:
        raise ValueError("Upload não encontrado")
    if upload.status != OCRUploadStatus.REVIEWED:
        raise ValueError("Upload deve ser revisado antes de aprovar")
    if not upload.extracted_responses:
        raise ValueError("Nenhuma resposta extraída")

    responses = []
    for item in upload.extracted_responses:
        if not item.get("extracted_text", "").strip():
            continue
        question_id = item.get("question_id")
        if not question_id:
            continue

        # Check if response already exists for this question
        existing = await db.execute(
            select(QuestionResponse).where(
                QuestionResponse.participation_id == upload.participation_id,
                QuestionResponse.question_id == uuid.UUID(question_id),
            )
        )
        if existing.scalar_one_or_none():
            continue

        resp = QuestionResponse(
            participation_id=upload.participation_id,
            question_id=uuid.UUID(question_id),
            answer_text=item["extracted_text"],
            ocr_source=True,
        )
        db.add(resp)
        responses.append(resp)

    await db.commit()
    for r in responses:
        await db.refresh(r)
    return responses


# --- Batch OCR Import (automatic header parsing) ---


def _extract_pages_text(file_path: str) -> list[str]:
    """Extract text from each page of a PDF, returning a list of strings (one per page).

    First tries pdfplumber for digital PDFs (fast).
    If pages come back empty (scanned/image PDF), falls back to
    pytesseract + pdf2image for real OCR.
    """
    pages: list[str] = []

    # 1. Try pdfplumber (works for PDFs with a text layer)
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                pages.append(page.extract_text() or "")
    except Exception:
        pass

    # 2. If all pages are empty, the PDF is likely scanned — use OCR
    if not any(p.strip() for p in pages):
        logger.info("PDF has no text layer, falling back to OCR (pytesseract): %s", file_path)
        try:
            from pdf2image import convert_from_path
            import pytesseract

            images = convert_from_path(file_path, dpi=300)
            pages = []
            for i, img in enumerate(images):
                text = pytesseract.image_to_string(img, lang="por")
                pages.append(text)
                logger.info(
                    "OCR page %d: %d chars extracted. First 500: %s",
                    i, len(text), repr(text[:500]),
                )
        except Exception as e:
            # If OCR also fails, return empty pages so caller can handle
            if not pages:
                pages = []
            logger.error("OCR fallback failed for %s: %s", file_path, e)
    else:
        logger.info("PDF has text layer (%d pages), no OCR needed.", len(pages))

    return pages


def _parse_respondent_sections(pages_text: list[str]) -> list[dict]:
    """Parse page texts to detect respondent sections from the printed header.

    Each respondent section in the PDF starts with a header containing:
      - Journey title (bold, centered)
      - Nome: <full name>         Data: <date>
      - E-mail: <email>           Domínio: <domain>

    Returns a list of dicts, one per respondent found:
    [
        {
            "user_name": "...",
            "user_email": "...",
            "journey_title": "...",
            "page_start": 0,
            "page_end": 3,
            "pages_text": ["page0 text", "page1 text", ...]
        }
    ]
    """
    respondents: list[dict] = []
    current: dict | None = None

    for page_idx, page_text in enumerate(pages_text):
        # Detect a respondent header by looking for "Nome:" and "E-mail:" patterns
        name_match = re.search(r'Nome:\s*(.+?)(?:\s{2,}|Data:|$)', page_text, re.IGNORECASE)
        # Flexible email: grab everything after "E-mail:" up to next field or newline
        email_match = re.search(
            r'E-mail:\s*(.+?)(?:\s{2,}|Domínio:|Dominio:|Data:|\n|$)',
            page_text, re.IGNORECASE,
        )

        if name_match and email_match:
            # Close previous respondent section
            if current:
                current["page_end"] = page_idx - 1
                respondents.append(current)

            # Try to extract the journey title from lines before "Nome:"
            journey_title = _extract_journey_title(page_text)

            # Clean name: remove parenthetical suffixes like "(Gruppen it)"
            raw_name = name_match.group(1).strip()
            clean_name = re.sub(r'\s*\(.*?\)\s*$', '', raw_name).strip()

            # Clean email: fix common OCR artifacts
            raw_email = email_match.group(1).strip()
            clean_email = _fix_ocr_email(raw_email)
            logger.info(
                "Respondent found: name=%r, raw_email=%r, clean_email=%r",
                clean_name, raw_email, clean_email,
            )

            current = {
                "user_name": clean_name,
                "user_email": clean_email,
                "journey_title": journey_title,
                "page_start": page_idx,
                "page_end": page_idx,
                "pages_text": [page_text],
            }
        elif current:
            current["page_end"] = page_idx
            current["pages_text"].append(page_text)

    if current:
        respondents.append(current)

    return respondents


def _fix_ocr_email(raw: str) -> str:
    """Fix common OCR artifacts in email addresses.

    OCR frequently misreads '@' as 'Q', 'q', '0', 'O', '©', etc.
    and may introduce spaces within the address.
    """
    # First, try to find a valid email as-is
    valid = re.search(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}', raw)
    if valid:
        return valid.group(0)

    # Remove spaces (OCR often adds spurious spaces)
    no_spaces = raw.replace(' ', '')

    # Try common OCR substitutions for '@'
    for char in ['Q', 'q', '©', '®']:
        # Replace the FIRST occurrence that sits between word-like chars
        fixed = re.sub(
            r'(?<=[a-zA-Z0-9_.])' + re.escape(char) + r'(?=[a-zA-Z0-9])',
            '@',
            no_spaces,
            count=1,
        )
        valid = re.search(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}', fixed)
        if valid:
            return valid.group(0)

    # Last resort: return cleaned text without trailing dots
    return no_spaces.rstrip('.')


def _extract_journey_title(page_text: str) -> str | None:
    """Extract journey title from the header area of a page.

    The title appears before the 'Nome:' line and after 'Gruppen Academy'.
    It's the first meaningful non-metadata line.
    """
    lines = page_text.split('\n')
    skip_patterns = [
        'gruppen academy', 'nome:', 'e-mail:', 'email:', 'data:',
        'duração:', 'duracao:', 'nível:', 'nivel:', 'perguntas',
        'pergunta ', 'pagina ',
    ]
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        lower = stripped.lower()
        if any(pat in lower for pat in skip_patterns):
            continue
        # Skip very short lines (likely artifacts) or lines with only numbers
        if len(stripped) < 3 or stripped.replace(' ', '').isdigit():
            continue
        return stripped
    return None


def _extract_question_responses(
    pages_text: list[str], questions: list[Question]
) -> list[dict]:
    """Split OCR-extracted text into responses per question.

    Looks for 'Pergunta N' markers in the text to segment responses.
    Text between consecutive question markers (excluding the question text itself)
    is treated as the handwritten response.
    """
    full_text = "\n".join(pages_text)

    # Find all question markers with their positions
    pattern = re.compile(r'Pergunta\s+(\d+)\s*\(', re.IGNORECASE)
    markers = list(pattern.finditer(full_text))

    extracted = []
    for i, q in enumerate(questions):
        # The PDF prints questions as "Pergunta 1", "Pergunta 2", etc.
        # using sequential numbering (i+1), NOT q.order from the database.
        # We must match the same numbering here.
        q_number = i + 1
        marker = None
        marker_idx = None
        for mi, m in enumerate(markers):
            if int(m.group(1)) == q_number:
                marker = m
                marker_idx = mi
                break

        response_text = ""
        if marker is not None:
            start = marker.end()
            # Find the end: next question marker or end of text
            if marker_idx is not None and marker_idx + 1 < len(markers):
                end = markers[marker_idx + 1].start()
            else:
                end = len(full_text)

            chunk = full_text[start:end]
            # Remove the question text itself (first few lines are the printed question)
            # The response is whatever follows after the question text
            # Simple heuristic: remove lines that match the question text
            response_lines = []
            q_text_lower = q.text.lower().strip()
            found_q_text = False
            for line in chunk.split('\n'):
                stripped = line.strip()
                if not stripped:
                    continue
                # Skip metadata lines
                if re.match(r'^(Dissertativa|Estudo de Caso|Roleplay|Objetiva)', stripped, re.IGNORECASE):
                    continue
                if re.match(r'^Peso:', stripped, re.IGNORECASE):
                    continue
                # Check if this line is part of the question text
                if not found_q_text and stripped.lower() in q_text_lower:
                    found_q_text = True
                    continue
                if not found_q_text and q_text_lower.startswith(stripped.lower()):
                    found_q_text = True
                    continue
                response_lines.append(stripped)

            response_text = "\n".join(response_lines).strip()

        extracted.append({
            "question_order": q.order if q.order > 0 else i + 1,
            "question_id": str(q.id),
            "extracted_text": response_text,
            "confidence": 0.5 if response_text else 0.0,
        })

    return extracted


async def _find_journey_by_title(db: AsyncSession, title: str) -> Journey | None:
    """Find a journey by exact or fuzzy title match."""
    # Exact match first
    result = await db.execute(
        select(Journey).where(Journey.title == title)
    )
    journey = result.scalar_one_or_none()
    if journey:
        return journey

    # Case-insensitive match
    result = await db.execute(
        select(Journey).where(Journey.title.ilike(title))
    )
    journey = result.scalar_one_or_none()
    if journey:
        return journey

    # Partial match (title contains the search term)
    result = await db.execute(
        select(Journey).where(Journey.title.ilike(f"%{title}%"))
    )
    matches = list(result.scalars().all())
    if len(matches) == 1:
        return matches[0]

    return None


async def _find_user_by_email_or_name(db: AsyncSession, email: str, name: str) -> User | None:
    """Find a user by email (primary) or name (fallback)."""
    # Email match (most reliable)
    result = await db.execute(
        select(User).where(User.email.ilike(email))
    )
    user = result.scalar_one_or_none()
    if user:
        return user

    # Fallback: name match
    if name:
        result = await db.execute(
            select(User).where(User.full_name.ilike(name))
        )
        user = result.scalar_one_or_none()
        if user:
            return user

    return None


async def _find_or_create_participation(
    db: AsyncSession, journey_id: uuid.UUID, user_id: uuid.UUID
) -> JourneyParticipation:
    """Find an existing participation or create a new one."""
    result = await db.execute(
        select(JourneyParticipation).where(
            JourneyParticipation.journey_id == journey_id,
            JourneyParticipation.user_id == user_id,
        )
    )
    participation = result.scalar_one_or_none()
    if participation:
        return participation

    participation = JourneyParticipation(journey_id=journey_id, user_id=user_id)
    db.add(participation)
    await db.flush()
    return participation


async def _lookup_page_code(db: AsyncSession, code: str) -> PageCode | None:
    """Look up a PageCode by its short code string."""
    result = await db.execute(select(PageCode).where(PageCode.code == code))
    return result.scalar_one_or_none()


async def _process_via_page_codes(
    db: AsyncSession,
    file_path: str,
    original_filename: str,
    page_codes: list[str | None],
    report: dict,
) -> dict:
    """Process a scanned PDF using page codes (from QR or OCR).

    Looks up each code in the page_codes table to get journey/user/page,
    then groups pages by user and extracts responses.
    """
    report["total_pages"] = len(page_codes)

    # Extract text from pages for response content
    pages_text = _extract_pages_text(file_path)

    # Resolve codes → PageCode records and group by (journey_id, user_id)
    user_pages: dict[tuple[uuid.UUID, uuid.UUID], list[tuple[int, str]]] = defaultdict(list)
    journey_id = None
    resolved_count = 0

    for idx, code in enumerate(page_codes):
        if code is None:
            continue
        pc = await _lookup_page_code(db, code)
        if pc is None:
            logger.warning("Page code '%s' (page %d) not found in database", code, idx)
            report["failures"].append({
                "message": f"Código '{code}' (pág. {idx + 1}) não encontrado no banco",
            })
            continue

        resolved_count += 1
        if journey_id is None:
            journey_id = pc.journey_id
        page_text = pages_text[idx] if idx < len(pages_text) else ""
        user_pages[(pc.journey_id, pc.user_id)].append((pc.page_number, page_text))

    logger.info(
        "Page code resolution: %d/%d codes resolved",
        resolved_count, len([c for c in page_codes if c]),
    )

    if not journey_id:
        report["failures"].append({
            "message": "Códigos detectados mas nenhum encontrado no banco de dados",
            "details": "O PDF pode ter sido gerado por outra instância ou os códigos foram expirados.",
        })
        return report

    # Load journey
    journey = await get_journey(db, journey_id)
    report["journey_id"] = str(journey_id)
    if journey:
        report["journey_title"] = journey.title
    else:
        report["failures"].append({
            "message": f"Jornada com ID {journey_id} não encontrada no banco de dados",
        })
        return report

    questions = await list_questions(db, journey_id)
    report["total_respondents_found"] = len(user_pages)
    logger.info(
        "Page code processing: journey=%s, %d respondents detected",
        journey.title, len(user_pages),
    )

    for (j_id, u_id), pages in user_pages.items():
        result = await db.execute(select(User).where(User.id == u_id))
        user = result.scalar_one_or_none()

        user_entry = {
            "user_name": user.full_name if user else str(u_id),
            "user_email": user.email if user else "",
            "participation_id": None,
            "ocr_upload_id": None,
            "status": "ok",
        }

        if not user:
            user_entry["status"] = "not_found"
            report["failures"].append({
                "message": f"Usuário com ID {u_id} não encontrado",
            })
            report["users_imported"].append(user_entry)
            continue

        participation = await _find_or_create_participation(db, j_id, user.id)
        user_entry["participation_id"] = str(participation.id)

        pages.sort(key=lambda x: x[0])
        all_pages_text = [text for _, text in pages]
        extracted = _extract_question_responses(all_pages_text, questions)

        upload = OCRUpload(
            participation_id=participation.id,
            file_path=file_path,
            original_filename=f"{original_filename} [{user.full_name}]",
            status=OCRUploadStatus.PROCESSED,
            extracted_responses=extracted,
        )
        db.add(upload)
        await db.flush()

        user_entry["ocr_upload_id"] = str(upload.id)
        report["ocr_upload_ids"].append(str(upload.id))
        report["users_imported"].append(user_entry)

    await db.commit()

    for uid_str in report["ocr_upload_ids"]:
        upload = await get_ocr_upload(db, uuid.UUID(uid_str))
        if upload:
            upload.import_report = report
    await db.commit()

    return report


async def process_ocr_batch(
    db: AsyncSession,
    file_path: str,
    original_filename: str,
) -> dict:
    """Process a scanned PDF: detect QR codes (primary) or parse OCR headers
    (fallback) to identify journey & respondents, create participations and
    OCR uploads automatically.

    Returns an import report dict.
    """
    report = {
        "journey_title": None,
        "journey_id": None,
        "users_imported": [],
        "failures": [],
        "total_pages": 0,
        "total_respondents_found": 0,
        "ocr_upload_ids": [],
    }

    # ── Strategy 1: Try page code detection (QR + OCR of printed code) ──
    page_codes = read_codes_from_pdf_pages(file_path)
    code_hits = [c for c in page_codes if c is not None]
    logger.info(
        "process_ocr_batch: page code detection found %d/%d pages with codes",
        len(code_hits), len(page_codes),
    )

    if code_hits:
        return await _process_via_page_codes(
            db, file_path, original_filename, page_codes, report,
        )

    # ── Strategy 2: Fallback to OCR text + header parsing ──
    logger.info("process_ocr_batch: no QR codes found, falling back to OCR header parsing")

    # 1. Extract text from PDF pages
    pages_text = _extract_pages_text(file_path)
    report["total_pages"] = len(pages_text)

    has_text = any(p.strip() for p in pages_text) if pages_text else False
    logger.info(
        "process_ocr_batch: %d pages, has_text=%s", len(pages_text), has_text,
    )

    if not pages_text or not has_text:
        report["failures"].append({
            "message": "Não foi possível extrair texto do PDF",
            "details": "Verifique se o PDF contém texto ou tente um scanner com OCR embutido.",
        })
        upload = OCRUpload(
            file_path=file_path,
            original_filename=original_filename,
            status=OCRUploadStatus.ERROR,
            error_message="Não foi possível extrair texto do PDF",
            import_report=report,
        )
        db.add(upload)
        await db.commit()
        await db.refresh(upload)
        report["ocr_upload_ids"].append(str(upload.id))
        return report

    # 2. Parse headers to find respondent sections
    logger.info(
        "process_ocr_batch: calling _parse_respondent_sections with %d pages",
        len(pages_text),
    )
    for idx, pt in enumerate(pages_text):
        logger.info("  page %d preview (%d chars): %s", idx, len(pt), repr(pt[:300]))
    respondent_sections = _parse_respondent_sections(pages_text)
    report["total_respondents_found"] = len(respondent_sections)
    logger.info("process_ocr_batch: found %d respondents", len(respondent_sections))

    if not respondent_sections:
        report["failures"].append({
            "message": "Nenhum respondente identificado no cabeçalho do PDF",
            "details": "O PDF deve conter cabeçalhos com 'Nome:' e 'E-mail:' para identificação automática.",
        })
        upload = OCRUpload(
            file_path=file_path,
            original_filename=original_filename,
            status=OCRUploadStatus.ERROR,
            error_message="Nenhum respondente identificado no cabeçalho",
            import_report=report,
        )
        db.add(upload)
        await db.commit()
        await db.refresh(upload)
        report["ocr_upload_ids"].append(str(upload.id))
        return report

    # 3. Identify the journey
    journey_title = respondent_sections[0].get("journey_title")
    report["journey_title"] = journey_title

    journey = None
    if journey_title:
        journey = await _find_journey_by_title(db, journey_title)

    if journey:
        report["journey_id"] = str(journey.id)
    else:
        report["failures"].append({
            "message": f"Jornada não encontrada: '{journey_title or '(não identificada)'}'",
            "details": "Verifique se a jornada está cadastrada no sistema com o mesmo título.",
        })

    # 4. Process each respondent
    for section in respondent_sections:
        user_name = section["user_name"]
        user_email = section["user_email"]

        user_entry = {
            "user_name": user_name,
            "user_email": user_email,
            "participation_id": None,
            "ocr_upload_id": None,
            "status": "ok",
        }

        # Find user
        user = await _find_user_by_email_or_name(db, user_email, user_name)
        if not user:
            user_entry["status"] = "not_found"
            report["failures"].append({
                "message": f"Usuário não encontrado: {user_name} ({user_email})",
                "details": "Cadastre o usuário no sistema antes de importar.",
            })
            report["users_imported"].append(user_entry)
            continue

        if not journey:
            user_entry["status"] = "no_journey"
            report["failures"].append({
                "message": f"Não foi possível vincular {user_name} — jornada não identificada",
            })
            report["users_imported"].append(user_entry)
            continue

        # Find or create participation
        participation = await _find_or_create_participation(db, journey.id, user.id)
        user_entry["participation_id"] = str(participation.id)

        # Load journey questions
        questions = await list_questions(db, journey.id)

        # Extract responses for this respondent's pages
        extracted = _extract_question_responses(section["pages_text"], questions)

        # Create OCR upload for this respondent
        upload = OCRUpload(
            participation_id=participation.id,
            file_path=file_path,
            original_filename=f"{original_filename} [{user_name}]",
            status=OCRUploadStatus.PROCESSED,
            extracted_responses=extracted,
        )
        db.add(upload)
        await db.flush()

        user_entry["ocr_upload_id"] = str(upload.id)
        user_entry["status"] = "ok"
        report["ocr_upload_ids"].append(str(upload.id))
        report["users_imported"].append(user_entry)

    # Save import report on all created uploads
    await db.commit()

    # Update import_report on all uploads
    for uid_str in report["ocr_upload_ids"]:
        upload = await get_ocr_upload(db, uuid.UUID(uid_str))
        if upload:
            upload.import_report = report
    await db.commit()

    return report
