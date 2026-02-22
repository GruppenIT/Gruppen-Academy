import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Competency, Product
from app.journeys.models import Journey, JourneyParticipation, OCRUpload, OCRUploadStatus, Question, QuestionResponse
from app.journeys.schemas import (
    JourneyCreate,
    JourneyUpdate,
    ParticipationCreate,
    QuestionCreate,
    QuestionUpdate,
    ResponseCreate,
)


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

        # Try to extract text from PDF
        try:
            import pdfplumber
            with pdfplumber.open(upload.file_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text() or ""
                    text_content += page_text + "\n"
        except ImportError:
            try:
                from PyPDF2 import PdfReader
                reader = PdfReader(upload.file_path)
                for page in reader.pages:
                    page_text = page.extract_text() or ""
                    text_content += page_text + "\n"
            except ImportError:
                text_content = ""

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
