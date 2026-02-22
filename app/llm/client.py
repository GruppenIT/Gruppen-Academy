import json
import logging

from openai import AsyncOpenAI

from app.config import settings
from app.evaluations.schemas import EvaluationResult
from app.llm.prompts import (
    COMPETENCY_SUGGESTION_SYSTEM_PROMPT,
    EVALUATION_SYSTEM_PROMPT,
    GUIDELINE_SUGGESTION_SYSTEM_PROMPT,
    QUESTION_GENERATION_SYSTEM_PROMPT,
    REPORT_MANAGER_SYSTEM_PROMPT,
    REPORT_PROFESSIONAL_SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)


def _get_client() -> AsyncOpenAI:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY não configurada. Verifique o arquivo .env.")
    return AsyncOpenAI(api_key=settings.openai_api_key, timeout=120.0)


async def evaluate_response(
    question_text: str,
    answer_text: str,
    rubric: dict | None = None,
    guidelines: list[dict] | None = None,
) -> EvaluationResult:
    client = _get_client()

    user_content = f"""Pergunta: {question_text}

Resposta do profissional: {answer_text}
"""
    if rubric:
        user_content += f"\nRubrica de avaliação: {json.dumps(rubric, ensure_ascii=False)}"
    if guidelines:
        corporate = [g for g in guidelines if g.get("is_corporate")]
        product_specific = [g for g in guidelines if not g.get("is_corporate")]
        if corporate:
            user_content += f"\n\nOrientações Corporativas (valem para todos os produtos — use como referência na avaliação):\n{json.dumps(corporate, ensure_ascii=False, indent=2)}"
        if product_specific:
            user_content += f"\n\nOrientações Master do Produto:\n{json.dumps(product_specific, ensure_ascii=False, indent=2)}"

    response = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=2048,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": EVALUATION_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )

    result_text = response.choices[0].message.content
    result_json = json.loads(result_text)
    return EvaluationResult(**result_json)


async def generate_questions(
    products: list[dict],
    competencies: list[dict],
    session_duration_minutes: int,
    participant_level: str,
    domain: str,
    num_questions: int | None = None,
    guidelines: list[dict] | None = None,
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
    if guidelines:
        corporate = [g for g in guidelines if g.get("is_corporate")]
        product_specific = [g for g in guidelines if not g.get("is_corporate")]
        if corporate:
            user_content += f"""
Orientações Corporativas (valem para TODOS os produtos — devem ser consideradas em todas as perguntas):
{json.dumps(corporate, ensure_ascii=False, indent=2)}
"""
        if product_specific:
            user_content += f"""
Orientações Master por Produto:
{json.dumps(product_specific, ensure_ascii=False, indent=2)}
"""
    if num_questions:
        user_content += f"\nNúmero desejado de perguntas: {num_questions}"

    response = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": QUESTION_GENERATION_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )

    result = json.loads(response.choices[0].message.content)
    return result if isinstance(result, list) else result.get("questions", [result])


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

    response = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    )

    return json.loads(response.choices[0].message.content)


async def suggest_competencies(
    products: list[dict],
    existing_competencies: list[dict],
) -> list[dict]:
    client = _get_client()

    user_content = f"""Analise os produtos/soluções da Gruppen e as competências já cadastradas.
Sugira NOVAS competências que complementem as existentes.

Produtos/Soluções cadastrados:
{json.dumps(products, ensure_ascii=False, indent=2)}

Competências já existentes:
{json.dumps(existing_competencies, ensure_ascii=False, indent=2)}
"""

    response = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": COMPETENCY_SUGGESTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )

    result = json.loads(response.choices[0].message.content)
    return result.get("suggestions", [])


async def suggest_guidelines(
    products: list[dict],
    existing_guidelines: list[dict],
) -> list[dict]:
    client = _get_client()

    user_content = f"""Analise os produtos/soluções da Gruppen e as orientações master já cadastradas.
Sugira NOVAS orientações estratégicas.

Produtos/Soluções:
{json.dumps(products, ensure_ascii=False, indent=2)}

Orientações já existentes:
{json.dumps(existing_guidelines, ensure_ascii=False, indent=2)}
"""

    response = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": GUIDELINE_SUGGESTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )

    result = json.loads(response.choices[0].message.content)
    return result.get("suggestions", [])


async def generate_tutor_summary(
    messages: list[dict],
    topic: str,
) -> dict:
    """Generate a structured summary for a tutor session."""
    from app.llm.prompts import TUTOR_SUMMARY_SYSTEM_PROMPT

    client = _get_client()

    conversation_text = "\n".join(
        f"{'Profissional' if m['role'] == 'user' else 'Tutor'}: {m['content']}"
        for m in messages
        if m["role"] in ("user", "assistant")
    )

    user_content = f"""Sessão de prática sobre: {topic}

Conversa:
{conversation_text}"""

    response = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=2048,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": TUTOR_SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )

    return json.loads(response.choices[0].message.content)


async def tutor_chat(
    messages: list[dict],
    system_context: str,
) -> str:
    client = _get_client()

    api_messages = [{"role": "system", "content": system_context}, *messages]

    response = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=2048,
        messages=api_messages,
    )

    return response.choices[0].message.content
