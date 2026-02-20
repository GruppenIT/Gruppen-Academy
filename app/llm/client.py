import json

import anthropic

from app.config import settings
from app.evaluations.schemas import EvaluationResult
from app.llm.prompts import (
    EVALUATION_SYSTEM_PROMPT,
    QUESTION_GENERATION_SYSTEM_PROMPT,
    REPORT_MANAGER_SYSTEM_PROMPT,
    REPORT_PROFESSIONAL_SYSTEM_PROMPT,
)

MODEL = "claude-sonnet-4-20250514"


def _get_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


async def evaluate_response(
    question_text: str,
    answer_text: str,
    rubric: dict | None = None,
) -> EvaluationResult:
    client = _get_client()

    user_content = f"""Pergunta: {question_text}

Resposta do profissional: {answer_text}
"""
    if rubric:
        user_content += f"\nRubrica de avaliação: {json.dumps(rubric, ensure_ascii=False)}"

    message = await client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=EVALUATION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    result_text = message.content[0].text
    result_json = json.loads(result_text)
    return EvaluationResult(**result_json)


async def generate_questions(
    products: list[dict],
    competencies: list[dict],
    session_duration_minutes: int,
    participant_level: str,
    domain: str,
    num_questions: int | None = None,
) -> list[dict]:
    client = _get_client()

    user_content = f"""Gere perguntas de avaliação com os seguintes parâmetros:

Domínio: {domain}
Nível dos participantes: {participant_level}
Tempo total da sessão: {session_duration_minutes} minutos

Produtos/Soluções:
{json.dumps(products, ensure_ascii=False, indent=2)}

Competências alvo:
{json.dumps(competencies, ensure_ascii=False, indent=2)}
"""
    if num_questions:
        user_content += f"\nNúmero desejado de perguntas: {num_questions}"

    message = await client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=QUESTION_GENERATION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    return json.loads(message.content[0].text)


async def generate_report(evaluations: list, report_type: str) -> dict:
    client = _get_client()

    system_prompt = (
        REPORT_MANAGER_SYSTEM_PROMPT if report_type == "manager"
        else REPORT_PROFESSIONAL_SYSTEM_PROMPT
    )

    evaluations_data = []
    for ev in evaluations:
        evaluations_data.append({
            "score_global": ev.score_global,
            "criteria": ev.criteria,
            "general_comment": ev.general_comment,
            "recommendations": ev.recommendations,
            "mapped_competencies": ev.mapped_competencies,
        })

    user_content = f"""Gere um relatório analítico baseado nas seguintes avaliações:

{json.dumps(evaluations_data, ensure_ascii=False, indent=2)}
"""

    message = await client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )

    return json.loads(message.content[0].text)


async def tutor_chat(
    messages: list[dict],
    system_context: str,
) -> str:
    client = _get_client()

    message = await client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=system_context,
        messages=messages,
    )

    return message.content[0].text
