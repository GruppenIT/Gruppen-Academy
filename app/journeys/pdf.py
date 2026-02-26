"""PDF generation for sync/presential journeys."""

import io
import uuid
from datetime import datetime, timezone

from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.journeys.models import Journey, PageCode, Question
from app.journeys.qr_utils import (
    draw_corner_markers,
    generate_code,
    generate_qr_image,
)
from app.teams.models import Team, journey_team, team_member
from app.users.models import User

Q_TYPE_LABELS = {
    "ESSAY": "Dissertativa",
    "CASE_STUDY": "Estudo de Caso",
    "ROLEPLAY": "Roleplay",
    "OBJECTIVE": "Objetiva",
}

DEJAVU_DIR = "/usr/share/fonts/truetype/dejavu"


class JourneyPDF(FPDF):
    """Custom PDF for journey printing with QR codes and fiducial markers."""

    def __init__(self, journey_title: str):
        super().__init__()
        self.journey_title = journey_title
        self.add_font("DejaVu", "", f"{DEJAVU_DIR}/DejaVuSans.ttf", uni=True)
        self.add_font("DejaVu", "B", f"{DEJAVU_DIR}/DejaVuSans-Bold.ttf", uni=True)

        # Current page code (set per-page before add_page)
        self._page_code: str | None = None

        # Pending context switch (applied in header, so footer of previous
        # page still uses the OLD code)
        self._pending_code: str | None = None

        # QR image cache: code -> png bytes
        self._qr_cache: dict[str, bytes] = {}

    def set_page_code(self, code: str):
        """Queue a page code for the next page.

        Applied in header() so that footer() of the previous page still
        draws with its own code.
        """
        self._pending_code = code

    def _apply_pending_code(self):
        """Apply queued code (called at the start of header)."""
        if self._pending_code is not None:
            self._page_code = self._pending_code
            self._pending_code = None

    def header(self):
        self._apply_pending_code()

        # Fiducial corner markers for deskewing
        draw_corner_markers(self, margin=5.0)

        self.set_font("DejaVu", "B", 10)
        self.set_text_color(100, 100, 100)
        self.set_xy(self.l_margin, 12)
        self.cell(0, 6, "Gruppen Academy", align="L")

        # Page code in top-right corner (large, OCR-friendly)
        if self._page_code:
            self.set_font("DejaVu", "B", 12)
            self.set_text_color(60, 60, 60)
            self.set_xy(self.w - self.r_margin - 40, 12)
            self.cell(40, 6, self._page_code, align="R")

        self.set_xy(self.l_margin, 20)

    def footer(self):
        code = self._page_code

        if code:
            # QR code — larger size for reliable scanning
            qr_size = 25  # mm (was 18)
            qr_x = self.w - self.r_margin - qr_size - 3
            qr_y = self.h - 18 - qr_size

            if code not in self._qr_cache:
                self._qr_cache[code] = generate_qr_image(code)

            self.image(io.BytesIO(self._qr_cache[code]), x=qr_x, y=qr_y, w=qr_size, h=qr_size)

            # Code label below QR — large, bold, mono-friendly
            self.set_font("DejaVu", "B", 10)
            self.set_text_color(40, 40, 40)
            self.set_xy(qr_x - 2, qr_y + qr_size + 1)
            self.cell(qr_size + 4, 5, code, align="C")

        # Page number (centered)
        self.set_y(-15)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Pagina {self.page_no()}/{{nb}}", align="C")


async def get_journey_users(db: AsyncSession, journey_id: uuid.UUID) -> list[User]:
    """Get all users from teams assigned to this journey (deduplicated)."""
    team_ids_q = select(journey_team.c.team_id).where(
        journey_team.c.journey_id == journey_id
    )
    user_ids_q = select(team_member.c.user_id).where(
        team_member.c.team_id.in_(team_ids_q)
    )
    result = await db.execute(
        select(User)
        .where(User.id.in_(user_ids_q))
        .order_by(User.full_name)
    )
    return list(result.scalars().all())


async def _create_page_code(
    db: AsyncSession, journey_id: uuid.UUID, user_id: uuid.UUID, page_number: int,
) -> str:
    """Create a PageCode record and return the generated code."""
    for _ in range(10):  # retry on rare collision
        code = generate_code()
        existing = await db.execute(select(PageCode).where(PageCode.code == code))
        if existing.scalar_one_or_none() is None:
            break

    page_code = PageCode(
        code=code,
        journey_id=journey_id,
        user_id=user_id,
        page_number=page_number,
    )
    db.add(page_code)
    await db.flush()
    return code


async def generate_journey_pdf(
    db: AsyncSession,
    journey_id: uuid.UUID,
) -> bytes:
    """Generate a printable PDF for a sync journey, repeated for each assigned user."""

    result = await db.execute(
        select(Journey)
        .where(Journey.id == journey_id)
        .options(selectinload(Journey.questions))
    )
    journey = result.scalar_one_or_none()
    if not journey:
        raise ValueError("Jornada nao encontrada")

    questions = sorted(journey.questions, key=lambda q: q.order)
    if not questions:
        raise ValueError("Jornada sem perguntas")

    users = await get_journey_users(db, journey_id)
    if not users:
        raise ValueError("Nenhuma equipe ou usuario atribuido a esta jornada")

    pdf = JourneyPDF(journey.title)
    pdf.alias_nb_pages()
    # Reserve enough bottom margin so content never overlaps the footer QR code.
    # QR occupies from (page_h - 43) to (page_h - 18); add 5 mm buffer above it.
    pdf.set_auto_page_break(auto=True, margin=48)

    now = datetime.now(timezone.utc).strftime("%d/%m/%Y")

    for user in users:
        await _render_user_pages(db, pdf, journey, questions, user, now)

    await db.commit()
    return pdf.output()


async def _render_user_pages(
    db: AsyncSession,
    pdf: JourneyPDF,
    journey: Journey,
    questions: list[Question],
    user: User,
    date_str: str,
):
    """Render all journey pages for a single user."""
    # Create code for the first page and set it before add_page
    code = await _create_page_code(db, journey.id, user.id, 1)
    pdf.set_page_code(code)
    pdf.add_page()

    # Store the page counter so we can create codes for subsequent pages
    user_page = 1

    # --- Cover / Header ---
    pdf.set_font("DejaVu", "B", 18)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 12, journey.title, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    if journey.description:
        pdf.set_font("DejaVu", "", 10)
        pdf.set_text_color(80, 80, 80)
        pdf.multi_cell(0, 5, journey.description, align="C")
        pdf.ln(4)

    # Divider
    pdf.set_draw_color(200, 200, 200)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(6)

    # User info box
    pdf.set_fill_color(245, 245, 250)
    pdf.set_draw_color(180, 180, 200)
    box_y = pdf.get_y()
    pdf.rect(pdf.l_margin, box_y, pdf.w - pdf.l_margin - pdf.r_margin, 22, style="DF")

    pdf.set_xy(pdf.l_margin + 4, box_y + 3)
    pdf.set_font("DejaVu", "B", 10)
    pdf.set_text_color(50, 50, 50)
    pdf.cell(30, 6, "Nome:")
    pdf.set_font("DejaVu", "", 10)
    pdf.cell(80, 6, user.full_name or "")
    pdf.set_font("DejaVu", "B", 10)
    pdf.cell(15, 6, "Data:")
    pdf.set_font("DejaVu", "", 10)
    pdf.cell(0, 6, date_str)
    pdf.ln(8)

    pdf.set_x(pdf.l_margin + 4)
    pdf.set_font("DejaVu", "B", 10)
    pdf.cell(30, 6, "E-mail:")
    pdf.set_font("DejaVu", "", 10)
    pdf.cell(80, 6, user.email or "")
    pdf.set_font("DejaVu", "B", 10)
    pdf.cell(22, 6, u"Dom\u00ednio:")
    pdf.set_font("DejaVu", "", 10)
    pdf.cell(0, 6, (journey.domain or "").capitalize())

    pdf.set_y(box_y + 26)

    # Journey metadata
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(100, 100, 100)
    meta = f"Dura\u00e7\u00e3o: {journey.session_duration_minutes}min  |  N\u00edvel: {journey.participant_level}  |  {len(questions)} perguntas"
    pdf.cell(0, 6, meta, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Divider
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(6)

    # --- Questions ---
    for i, q in enumerate(questions):
        user_page = await _render_question(db, pdf, q, i + 1, journey.id, user.id, user_page)


async def _render_question(
    db: AsyncSession,
    pdf: JourneyPDF,
    q: Question,
    number: int,
    journey_id: uuid.UUID,
    user_id: uuid.UUID,
    user_page: int,
) -> int:
    """Render a single question with answer space. Returns updated page count."""
    # Check if we need a new page (at least 50mm needed for question + some lines)
    if pdf.get_y() > pdf.h - 60:
        user_page += 1
        code = await _create_page_code(db, journey_id, user_id, user_page)
        pdf.set_page_code(code)
        pdf.add_page()

    # Question number + type
    q_type_str = Q_TYPE_LABELS.get(q.type.name, q.type.value)

    pdf.set_font("DejaVu", "B", 11)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 7, f"Pergunta {number}  ({q_type_str} \u2014 Peso: {q.weight})", new_x="LMARGIN", new_y="NEXT")

    # Question text
    pdf.set_font("DejaVu", "", 10)
    pdf.set_text_color(50, 50, 50)
    pdf.multi_cell(0, 5, q.text)
    pdf.ln(3)

    # Answer lines
    num_lines = q.expected_lines or 10
    line_height = 8
    pdf.set_draw_color(200, 200, 200)

    for _ in range(num_lines):
        if pdf.get_y() > pdf.h - 48:
            user_page += 1
            code = await _create_page_code(db, journey_id, user_id, user_page)
            pdf.set_page_code(code)
            pdf.add_page()
        y = pdf.get_y()
        pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
        pdf.ln(line_height)

    pdf.ln(4)
    return user_page
