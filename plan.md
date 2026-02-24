# Plano de Melhorias: Quiz IA, Quiz Final de Treinamento e XP

## Resumo das 3 frentes

1. **Quiz IA com formulário de configuração** — modal com nº de perguntas, dificuldade, orientação/perguntas do admin
2. **Quiz Final do Treinamento** — quiz geral vinculado ao treinamento (não a módulo), com tentativas limitadas e aprovação do gestor
3. **Novo cálculo de XP** — remover XP do módulo; XP só na conclusão do treinamento, proporcional à nota do quiz final

---

## 1. Quiz IA com formulário de configuração

### Backend

**Arquivo: `app/llm/client.py`** — Atualizar `generate_training_quiz()`:
- Adicionar parâmetros: `difficulty_level` (fácil/intermediário/difícil), `orientation_text` (orientação/perguntas do admin)
- No prompt, quando `orientation_text` contiver perguntas coladas pelo admin, instruir a IA a melhorá-las e formatá-las
- Garantir que o prompt pede variação de tipos (multiple_choice + true_false) — já existe mas reforçar

**Arquivo: `app/llm/prompts.py`** — Atualizar `TRAINING_QUIZ_SYSTEM_PROMPT`:
- Incluir instruções para nível de dificuldade
- Incluir instruções para interpretar orientação/perguntas coladas e melhorá-las
- Manter a variação de tipos

**Arquivo: `app/trainings/schemas.py`** — Novo schema `GenerateQuizRequest`:
```python
class GenerateQuizRequest(BaseModel):
    num_questions: int = 5  # 3-20
    difficulty: str = "intermediario"  # facil, intermediario, dificil
    orientation: str | None = None  # texto livre / perguntas coladas
```

**Arquivo: `app/trainings/router.py`** — Atualizar endpoint `POST /{training_id}/modules/{module_id}/generate-quiz`:
- Receber body `GenerateQuizRequest`
- Passar `num_questions`, `difficulty`, `orientation` para `generate_training_quiz()`

### Frontend

**Arquivo: `frontend/src/app/admin/treinamentos/[id]/page.tsx`** — QuizPanel:
- Ao clicar "Gerar com IA", abrir um **modal** com:
  - Campo numérico: "Quantas perguntas?" (default 5, min 3, max 20)
  - Select: "Nível de dificuldade" (Fácil / Intermediário / Difícil)
  - Textarea: "Orientação para a IA" (placeholder: "Descreva o foco das perguntas ou cole perguntas que deseja melhorar...")
  - Botão "Gerar" e "Cancelar"
- Enviar dados via API atualizada

**Arquivo: `frontend/src/lib/api.ts`** — Atualizar `generateModuleQuiz()`:
- Aceitar body `{ num_questions, difficulty, orientation }`

---

## 2. Quiz Final do Treinamento

### Conceito
- Um quiz **opcional** vinculado diretamente ao `Training` (não a um módulo)
- Aparece abaixo de todos os módulos na tela de consumo
- Liberado apenas após conclusão de todos os módulos
- Tem campo `max_attempts` (número de tentativas permitidas)
- Após esgotar tentativas sem passar → status "bloqueado", só liberado com aprovação do gestor

### Backend — Modelo

**Arquivo: `app/trainings/models.py`** — Novas entidades:

```python
class TrainingQuiz(Base):
    __tablename__ = "training_quizzes"
    id: UUID PK
    training_id: UUID FK → trainings.id (unique, 1:1)
    title: str default "Avaliação Final"
    passing_score: float default 0.7
    max_attempts: int default 3  # 0 = ilimitado
    created_at: datetime

    training: relationship → Training
    questions: relationship → TrainingQuizQuestion

class TrainingQuizQuestion(Base):
    __tablename__ = "training_quiz_questions"
    # Mesma estrutura de QuizQuestion mas com FK para training_quizzes
    id, quiz_id, text, type, options, correct_answer, explanation, weight, order, created_at

class TrainingQuizAttempt(Base):
    __tablename__ = "training_quiz_attempts"
    id: UUID PK
    enrollment_id: UUID FK → training_enrollments.id
    score: float
    answers: JSONB
    passed: bool
    started_at: datetime
    completed_at: datetime | None
```

**Arquivo: `app/trainings/models.py`** — Atualizar `Training`:
- Adicionar relationship: `final_quiz: TrainingQuiz | None`

**Arquivo: `app/trainings/models.py`** — Atualizar `TrainingEnrollment`:
- Adicionar: `quiz_unlocked_by: UUID | None` (gestor que desbloqueou retentativa)
- Adicionar: `quiz_unlocked_at: datetime | None`
- Adicionar relationship: `quiz_attempts: list[TrainingQuizAttempt]`

### Backend — Migration

**Arquivo: `alembic/versions/012_training_final_quiz.py`**:
- Criar tabelas: `training_quizzes`, `training_quiz_questions`, `training_quiz_attempts`
- Adicionar colunas em `training_enrollments`: `quiz_unlocked_by`, `quiz_unlocked_at`
- Remover coluna `xp_reward` de `training_modules` (parte do item 3)

### Backend — Schemas

**Arquivo: `app/trainings/schemas.py`** — Novos schemas:
- `TrainingQuizCreate(title, passing_score, max_attempts)`
- `TrainingQuizOut(id, training_id, title, passing_score, max_attempts, questions[])`
- `TrainingQuizQuestionCreate` (igual a QuizQuestionCreate)
- `TrainingQuizQuestionOut` (igual a QuizQuestionOut)
- `TrainingQuizAttemptOut(id, enrollment_id, score, answers, passed, started_at, completed_at)`
- Atualizar `TrainingDetailOut` para incluir `final_quiz: TrainingQuizOut | None`
- Atualizar `TrainingProgressOut` para incluir status do quiz final (desbloqueado, tentativas usadas, passou, nota, bloqueado)
- `GenerateTrainingQuizRequest` — mesmos campos do quiz de módulo (num_questions, difficulty, orientation) mas para o quiz final

### Backend — Service

**Arquivo: `app/trainings/service.py`** — Novas funções:
- `get_training_quiz(db, training_id) → TrainingQuiz | None`
- `create_or_update_training_quiz(db, training_id, data) → TrainingQuiz`
- `add_training_quiz_question(db, quiz_id, data) → TrainingQuizQuestion`
- `update_training_quiz_question(db, question_id, data)`
- `delete_training_quiz_question(db, question_id)`
- `submit_training_quiz_attempt(db, enrollment, answers) → TrainingQuizAttempt`
  - Verificar se todos os módulos estão completos
  - Verificar se ainda tem tentativas disponíveis (ou foi desbloqueado pelo gestor)
  - Calcular nota, verificar se passou
  - **Se passou** → chamar lógica de XP proporcional (item 3) e marcar enrollment como completed
  - **Se não passou e esgotou tentativas** → marcar como "bloqueado para quiz"
- `unlock_quiz_retry(db, enrollment_id, manager_id)` — gestor desbloqueia retentativa
- Atualizar `_check_training_completion()`:
  - Se o treinamento tem quiz final, NÃO marcar como completed ao concluir módulos
  - Apenas liberar o quiz final

### Backend — Routes

**Arquivo: `app/trainings/router.py`** — Novos endpoints:

Admin:
- `POST /api/trainings/{id}/quiz` — criar quiz final
- `GET /api/trainings/{id}/quiz` — obter quiz final com perguntas
- `PUT /api/trainings/{id}/quiz` — atualizar configurações (passing_score, max_attempts)
- `POST /api/trainings/{id}/quiz/questions` — adicionar pergunta
- `PUT /api/trainings/{id}/quiz/questions/{qid}` — editar pergunta
- `DELETE /api/trainings/{id}/quiz/questions/{qid}` — remover pergunta
- `POST /api/trainings/{id}/quiz/generate` — gerar quiz final com IA (considera conteúdo de TODOS os módulos)
- `POST /api/trainings/{id}/enrollments/{eid}/unlock-quiz` — gestor desbloqueia retentativa

Profissional:
- `POST /api/trainings/{id}/quiz/attempt` — submeter tentativa do quiz final
- `GET /api/trainings/{id}/quiz/attempts` — listar tentativas anteriores

### Frontend — Admin

**Arquivo: `frontend/src/app/admin/treinamentos/[id]/page.tsx`**:
- Abaixo da lista de módulos, nova seção "Avaliação Final do Treinamento":
  - Se não tem quiz: botões "Criar avaliação" e "Gerar com IA"
  - Se tem quiz: card com configurações (nota mínima, max tentativas) + lista de perguntas
  - Mesmo padrão visual do QuizPanel dos módulos
- Modal de geração IA: mesmos campos (nº perguntas, dificuldade, orientação)
- Campo editável: "Máximo de tentativas" (dropdown: 1, 2, 3, 5, Ilimitado)

**Arquivo: `frontend/src/lib/api.ts`** — Novos métodos:
- `createTrainingQuiz(trainingId, data)`
- `getTrainingQuiz(trainingId)`
- `updateTrainingQuiz(trainingId, data)`
- `addTrainingQuizQuestion(trainingId, data)`
- `updateTrainingQuizQuestion(trainingId, questionId, data)`
- `deleteTrainingQuizQuestion(trainingId, questionId)`
- `generateTrainingQuiz(trainingId, { num_questions, difficulty, orientation })`
- `submitTrainingQuizAttempt(trainingId, answers)`
- `getTrainingQuizAttempts(trainingId)`
- `unlockQuizRetry(trainingId, enrollmentId)`

### Frontend — Profissional

**Arquivo: `frontend/src/app/treinamentos/[id]/page.tsx`**:
- Abaixo da lista de módulos, seção "Avaliação Final":
  - Bloqueado (cinza + cadeado) se nem todos os módulos estão completos
  - Desbloqueado: card com info (nº perguntas, nota mínima, tentativas restantes)
  - Botão "Iniciar avaliação"
  - Se esgotou tentativas: mensagem "Aguardando liberação do gestor" + ícone de bloqueio

**Novo arquivo: `frontend/src/app/treinamentos/[id]/avaliacao/page.tsx`** (ou modal):
- Tela de quiz final (mesmo padrão da tela de quiz de módulo)
- Formulário com perguntas, submit, resultado
- Mostrar nota, tentativas restantes, se passou ou não

### Frontend — Gestor

**Na tela de gestão de enrollments do treinamento** (se existir):
- Indicador de "quiz bloqueado" por aluno
- Botão "Desbloquear nova tentativa"

---

## 3. Novo cálculo de XP

### Regras
1. **Módulos NÃO dão XP** — remover `xp_reward` do `TrainingModule`
2. **Treinamento SEM quiz final**: ao concluir todos os módulos → recebe 100% do `training.xp_reward`
3. **Treinamento COM quiz final**: XP proporcional à nota do quiz
   - Ex: training.xp_reward = 100, nota = 0.7 → recebe 70 XP
   - Se não passar (nota < passing_score) → NÃO recebe XP naquela tentativa
   - Ao passar: XP = round(training.xp_reward * score)

### Backend

**Arquivo: `app/trainings/models.py`**:
- Remover `xp_reward` de `TrainingModule` (ou marcar deprecated; preferível remover)

**Arquivo: `app/trainings/schemas.py`**:
- Remover `xp_reward` de `ModuleCreate`, `ModuleUpdate`, `ModuleOut`, `TrainingProgressModule`

**Arquivo: `app/trainings/service.py`**:
- `mark_content_viewed()`: remover bloco que dá XP do módulo (`add_score(...source="training_module"...)`)
- `submit_quiz_attempt()`: remover bloco que dá XP do módulo
- `_check_training_completion()`:
  - Se treinamento NÃO tem quiz final → dar 100% XP como hoje
  - Se treinamento TEM quiz final → NÃO dar XP aqui (o XP será dado em `submit_training_quiz_attempt`)
- `submit_training_quiz_attempt()` (nova): se passou, dar XP proporcional

**Arquivo: `app/trainings/router.py`**:
- Remover referências a xp_reward de módulos nos endpoints

### Migration

**Já incluso em `012_training_final_quiz.py`**:
- `op.drop_column("training_modules", "xp_reward")`

### Frontend

**Arquivo: `frontend/src/app/admin/treinamentos/[id]/page.tsx`**:
- Remover campo XP de cada módulo (no editor de módulo)
- Manter campo XP apenas no treinamento (já existe no header)

**Arquivo: `frontend/src/types/index.ts`**:
- Remover `xp_reward` de `TrainingModule`
- Remover `xp_reward` de `TrainingProgressModule`
- Adicionar tipos para quiz final

**Arquivo: `frontend/src/app/treinamentos/[id]/page.tsx`** e **modulo/[order]/page.tsx`**:
- Remover exibição de XP por módulo
- Atualizar card de módulo (remover badge de XP)

---

## Ordem de implementação sugerida

1. **Migration 012** — novas tabelas + remoção xp_reward do módulo
2. **Models** — novas entidades + atualizar Training e TrainingEnrollment
3. **Schemas** — novos schemas + remover xp_reward dos módulos
4. **Prompt IA** — atualizar prompt do quiz com dificuldade e orientação
5. **LLM client** — parâmetros novos
6. **Service** — novas funções de quiz final + atualizar XP
7. **Routes** — novos endpoints
8. **Frontend API** — novos métodos
9. **Frontend Admin** — modal IA + seção quiz final
10. **Frontend Profissional** — quiz final + remover XP módulo
11. **Frontend Gestor** — desbloquear quiz
