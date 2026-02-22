"""PDF generation for sync/presential journeys."""

import io
import uuid
from datetime import datetime, timezone

from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.journeys.models import Journey, Question
from app.journeys.qr_utils import (
    draw_corner_markers,
    encode_qr_payload,
    generate_qr_image,
    make_short_code,
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

        # Current user context for QR generation
        self._journey_id: uuid.UUID | None = None
        self._user_id: uuid.UUID | None = None
        self._user_page: int = 0  # page counter per user (1-based)

        # Pending context switch (applied in header(), so footer() of previous
        # page still uses the OLD context)
        self._pending_journey_id: uuid.UUID | None = None
        self._pending_user_id: uuid.UUID | None = None

        # Pre-generated QR image bytes cache: (journey_id, user_id, page) -> png
        self._qr_cache: dict[tuple, bytes] = {}

    def set_user_context(
        self, journey_id: uuid.UUID, user_id: uuid.UUID,
    ):
        """Queue a user context switch.

        The actual switch happens inside header() — this ensures that
        footer() of the previous page still draws with the OLD user's
        context (fpdf2 calls footer→header inside add_page).
        """
        self._pending_journey_id = journey_id
        self._pending_user_id = user_id

    def _apply_pending_context(self):
        """Apply a queued context switch (called at the start of header)."""
        if self._pending_journey_id is not None:
            self._journey_id = self._pending_journey_id
            self._user_id = self._pending_user_id
            self._user_page = 0  # reset; will be incremented right after
            self._pending_journey_id = None
            self._pending_user_id = None

    def header(self):
        # Apply pending context switch BEFORE anything else
        self._apply_pending_context()

        # Increment user page counter
        self._user_page += 1

        # Fiducial corner markers for deskewing
        draw_corner_markers(self, margin=5.0)

        self.set_font("DejaVu", "B", 10)
        self.set_text_color(100, 100, 100)
        # Leave space for top-left marker
        self.set_xy(self.l_margin, 12)
        self.cell(0, 6, "Gruppen Academy", align="L")

        # Short code in top-right area (human-readable fallback)
        if self._journey_id and self._user_id:
            short = make_short_code(self._journey_id, self._user_id, self._user_page)
            self.set_font("DejaVu", "", 7)
            self.set_text_color(120, 120, 120)
            self.set_xy(self.w - self.r_margin - 50, 12)
            self.cell(50, 6, short, align="R")

        self.set_xy(self.l_margin, 20)

    def footer(self):
        if self._journey_id and self._user_id:
            short = make_short_code(self._journey_id, self._user_id, self._user_page)

            # QR code in bottom-right corner
            qr_size = 18  # mm
            qr_x = self.w - self.r_margin - qr_size - 3
            qr_y = self.h - 20 - qr_size

            cache_key = (self._journey_id, self._user_id, self._user_page)
            if cache_key not in self._qr_cache:
                payload = encode_qr_payload(
                    self._journey_id, self._user_id, self._user_page,
                )
                self._qr_cache[cache_key] = generate_qr_image(payload)

            qr_png = self._qr_cache[cache_key]
            self.image(io.BytesIO(qr_png), x=qr_x, y=qr_y, w=qr_size, h=qr_size)

            # Short code label below QR
            self.set_font("DejaVu", "", 6)
            self.set_text_color(100, 100, 100)
            self.set_xy(qr_x - 2, qr_y + qr_size + 0.5)
            self.cell(qr_size + 4, 4, short, align="C")

        # Page number (centered, avoiding QR area)
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
    pdf.set_auto_page_break(auto=True, margin=20)

    now = datetime.now(timezone.utc).strftime("%d/%m/%Y")

    for user in users:
        _render_user_pages(pdf, journey, questions, user, now)

    return pdf.output()


def _render_user_pages(
    pdf: JourneyPDF,
    journey: Journey,
    questions: list[Question],
    user: User,
    date_str: str,
):
    """Render all journey pages for a single user."""
    pdf.set_user_context(journey.id, user.id)
    pdf.add_page()

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
        _render_question(pdf, q, i + 1)


def _render_question(pdf: JourneyPDF, q: Question, number: int):
    """Render a single question with answer space."""
    # Check if we need a new page (at least 50mm needed for question + some lines)
    if pdf.get_y() > pdf.h - 60:
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
        if pdf.get_y() > pdf.h - 25:
            pdf.add_page()
        y = pdf.get_y()
        pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
        pdf.ln(line_height)

    pdf.ln(4)
