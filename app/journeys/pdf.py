"""PDF generation for sync/presential journeys."""

import io
import uuid
from datetime import datetime, timezone

from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.journeys.models import Journey, Question
from app.teams.models import Team, journey_team, team_member
from app.users.models import User

Q_TYPE_LABELS = {
    "ESSAY": "Dissertativa",
    "CASE_STUDY": "Estudo de Caso",
    "ROLEPLAY": "Roleplay",
    "OBJECTIVE": "Objetiva",
}


class JourneyPDF(FPDF):
    """Custom PDF for journey printing."""

    def __init__(self, journey_title: str):
        super().__init__()
        self.journey_title = journey_title

    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 6, "Gruppen Academy", align="L")
        self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
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
    pdf.add_page()

    # --- Cover / Header ---
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 12, journey.title, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    if journey.description:
        pdf.set_font("Helvetica", "", 10)
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
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(50, 50, 50)
    pdf.cell(30, 6, "Nome:")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(80, 6, user.full_name or "")
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(15, 6, "Data:")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, date_str)
    pdf.ln(8)

    pdf.set_x(pdf.l_margin + 4)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(30, 6, "E-mail:")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(80, 6, user.email or "")
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(22, 6, "Dominio:")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, (journey.domain or "").capitalize())

    pdf.set_y(box_y + 26)

    # Journey metadata
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(100, 100, 100)
    meta = f"Duracao: {journey.session_duration_minutes}min  |  Nivel: {journey.participant_level}  |  {len(questions)} perguntas"
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
    q_type_str = Q_TYPE_LABELS.get(str(q.type).upper().replace(".", ""), str(q.type))

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 7, f"Pergunta {number}  ({q_type_str} — Peso: {q.weight})", new_x="LMARGIN", new_y="NEXT")

    # Question text
    pdf.set_font("Helvetica", "", 10)
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
