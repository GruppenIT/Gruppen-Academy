# CLAUDE.md

## Visão geral do projeto

Este repositório contém o backend e/ou orquestração da plataforma interna de aprendizagem corporativa da Gruppen, inicialmente focada em desenvolvimento contínuo do time de vendas em soluções complexas de segurança da informação (ex.: BaaS – Backup como Serviço, Pentest, Firewall as a Service, SIEM as a Service).

A aplicação deve funcionar como uma “Academia de Competências”: combinar avaliações estruturadas (jornadas), feedback analítico individual, trilhas de aprendizado e um tutor conversacional baseado em LLM, com gamificação e suporte tanto a hard skills (produtos/serviços) quanto soft skills (habilidades comportamentais).

---

## Papel esperado do modelo (Claude / LLM)

Dentro deste projeto, o modelo de linguagem deve:

- Atuar como motor de geração de conteúdo educacional e avaliativo (perguntas, estudos de caso, rubricas, feedbacks).
- Avaliar respostas textuais dos vendedores/profissionais com base em critérios explícitos configurados por admins (rubricas), gerando notas e comentários estruturados.
- Servir como tutor interativo para sessões de prática guiada (“Evoluir meu conhecimento”), simulando conversas com clientes, cenários técnicos ou situações de atendimento.
- Operar sempre condicionado ao contexto interno: soluções da Gruppen, orientações master da diretoria, taxonomia de competências e regras de negócio da plataforma.

O modelo nunca deve inventar políticas internas ou características de produtos: quando não tiver contexto suficiente, deve sinalizar falta de informação e/ou pedir mais detalhes.

---

## Contexto de domínio (Gruppen)

- A Gruppen é uma empresa de tecnologia e segurança da informação, com foco em soluções de TI e segurança gerenciada para clientes corporativos.
- Entre as ofertas mais estratégicas, estão:
  - BaaS – Backup como Serviço (proteção de dados críticos, backup automatizado, disponibilidade em desastres).
  - Serviços de segurança como Pentest/Pentesting as a Service, Firewall as a Service, SIEM as a Service, entre outros.
- Vendedores precisam posicionar essas soluções de forma consultiva, traduzindo aspectos técnicos em valor de negócio (risco, compliance, continuidade, custo total, etc.).

A plataforma de aprendizagem deve usar esse contexto para gerar perguntas, cenários e feedbacks alinhados à realidade de vendas e suporte técnico da empresa.

---

## Personas e perfis suportados

A plataforma lida com quatro perfis principais:

1. **Admin de Conteúdo / Treinamento**
   - Gerencia catálogo de soluções/produtos e “orientações master”.
   - Cria jornadas de avaliação, revisa relatórios da IA e aprova feedbacks antes de enviar.
   - Define rubricas de avaliação e trilhas de aprendizado.

2. **Gestor (ex.: gerente comercial, coordenador de suporte)**
   - Visualiza dashboards de evolução da equipe.
   - Dispara jornadas específicas para seus times.
   - Usa relatórios para apoiar feedback 1:1 e planos de desenvolvimento.

3. **Profissional-alvo (vendedor, suporte, CS, etc.)**
   - Participa de jornadas presenciais (respostas manuscritas digitalizadas posteriormente).
   - Recebe relatórios analíticos com pontos fortes, fracos e recomendações.
   - Usa o módulo “Evoluir meu conhecimento” para prática guiada e construção de trilhas.

4. **Super Admin / Corporativo (opcional)**
   - Define taxonomia global de competências.
   - Habilita novos domínios (Vendas, Suporte, Liderança, etc.).

Claude deve adaptar linguagem e profundidade dependendo de qual fluxo está sendo executado (admin vs vendedor, por exemplo).

---

## Entidades centrais (modelo conceitual)

A aplicação trabalha com as seguintes entidades de alto nível:

- **Produto/Solução**
  - Ex.: BaaS, SIEM as a Service, Pentest, Firewall as a Service.
  - Atributos: nome, descrição, persona-alvo, dores comuns, objeções típicas, diferenciais, materiais de apoio.

- **Competência**
  - Unidade de habilidade mensurável (hard ou soft).
  - Ex. hard: “Explicar arquitetura do BaaS e seus benefícios de RTO/RPO”.
  - Ex. soft: “Conduzir diagnóstico consultivo sem antecipar solução”.

- **Orientação Master**
  - Orientações estratégicas vindas da diretoria, por produto/tema.
  - Exemplos: abordagens recomendadas, perguntas de descoberta, ângulos de valor, storytelling, objeções-chave.

- **Jornada de Avaliação**
  - Coleção de perguntas (dissertativas, estudo de caso, roleplay etc.) associadas a produtos e competências.
  - Amarrada a um tempo total de sessão (ex.: 3h) — usado para calibrar número e tipo de perguntas.

- **Pergunta**
  - Texto da questão + tipo + competências que mede + peso.
  - Pode ter rubrica de avaliação específica.

- **Formulário de Jornada**
  - Versão imprimível da jornada, com cabeçalho (nome do vendedor, data, time, produtos avaliados) e espaço limitado de resposta para cada pergunta (número de linhas esperado).

- **Resposta Avaliada**
  - Texto da resposta (extraído via OCR) + notas por critério de rubrica + justificativas.

- **Relatório Analítico**
  - Documento gerado pela IA sintetizando a jornada para a pessoa avaliada e para o gestor.

- **Trilha de Aprendizado**
  - Sequência de atividades alinhadas a lacunas de competência (microlessons, quizzes, sessões IA).

- **Atividade de Aprendizagem**
  - Unidade concreta de prática: quiz, simulação, estudo de caso, sessão de chat guiada, etc.

- **Pontuação / Gamificação**
  - Registro de pontos de jornada, atividades e proatividade.

---

## Módulos funcionais da aplicação

### 1. Catálogo de Conteúdo e Orientações

Responsabilidades:

- Ingerir e manter o catálogo de soluções da Gruppen (via cadastro manual ou integração futura com site interno).
- Associar cada solução a:
  - Competências hard.
  - Orientações master (abordagem, valor, objeções, storytelling).
- Manter taxonomia de competências (hard/soft), reutilizável por Vendas, Suporte, Liderança etc.

O modelo será acionado aqui para:

- Gerar sugestões de competências com base na descrição de um produto.
- Propor “orientações master” a partir de insumos da diretoria (mas nunca substituir a decisão humana).

### 2. Jornadas de Avaliação

Fluxo básico:

1. Admin seleciona: área (ex. Vendas), produtos/temas, competências foco e tempo total da sessão.
2. Backend chama o modelo para sugerir um conjunto de perguntas coerente com:
   - Tempo total.
   - Nível esperado do público.
   - Cobertura das competências indicadas.
3. Admin revisa, edita e salva a jornada.
4. Sistema gera PDF para impressão com campos de resposta dimensionados.
5. Após sessão presencial, formulários são digitalizados e processados (OCR).
6. Para cada resposta, o modelo é acionado para avaliação.

Regras para o modelo:

- Respeitar sempre a rubrica e os pesos fornecidos.
- Retornar sempre JSON estruturado com:
  - notas por critério;
  - nota global;
  - comentários por critério;
  - recomendações de melhoria;
  - tags de competências avaliadas.
- Evitar viés: avaliar conteúdo da resposta, não forma de escrita (erros simples de português não devem pesar tanto quanto erro conceitual, a não ser que a rubrica peça explicitamente).

### 3. Avaliação Automatizada e Relatórios

Responsabilidades do modelo:

- Dada uma pergunta, uma resposta e a rubrica, produzir uma avaliação explicável.
- Gerar duas versões de relatório:
  - Versão “Gestor/Admin”: mais detalhada, com notas por critério e insights comparativos.
  - Versão “Profissional”: linguagem mais simples, foco em orientações práticas, exemplos de boas respostas.

Cuidados:

- O modelo não decide sozinho sobre consequências (promoção, punição, etc.).
- A avaliação final sempre passa por possibilidade de revisão/ajuste manual por um admin antes de envio.

Formato sugerido da resposta do modelo (para avaliação de uma pergunta):

```json
{
  "score_global": 0.0,
  "criterios": [
    {
      "nome": "clareza",
      "peso": 0.3,
      "nota": 0.8,
      "comentario": "..."
    },
    {
      "nome": "profundidade_tecnica",
      "peso": 0.4,
      "nota": 0.6,
      "comentario": "..."
    }
  ],
  "comentario_geral": "...",
  "recomendacoes": [
    "Sugestão 1",
    "Sugestão 2"
  ],
  "competencias_mapeadas": [
    "explicar_valor_negocio_baas",
    "explorar_cenario_cliente"
  ]
}
```

---

### 4. Trilhas de Aprendizagem e Tutor IA

Responsabilidades:

- Criar trilhas por função (ex.: Vendedor, Suporte N1, N2) e por produto/tema.
- A partir dos gaps de competência identificados nas jornadas, sugerir trilhas e atividades.
- Permitir que o profissional acesse a área “Evoluir meu conhecimento” e inicie sessões com o tutor IA.

Comportamento esperado do tutor IA:

- Contexto de entrada:
  - Perfil do profissional;
  - Histórico de jornadas e principais lacunas;
  - Produto/tema escolhido;
  - Orientações master associadas.

- Tipos de interação:
  - Perguntas abertas com feedback imediato.
  - Simulações de call com cliente (IA faz papel do cliente).
  - Reformulações: pedir para o profissional resumir em 3 bullets, adaptar argumento para CFO, CTO, etc.
  - Exercícios de objeções (IA apresenta objeções e avalia a resposta).

- Saída após cada sessão:
  - Resumo do desempenho;
  - Competências treinadas;
  - Sugestões de próximas atividades.

O modelo deve manter tom construtivo, focado em desenvolvimento, evitando julgamentos pessoais.

---

### 5. Gamificação

A plataforma implementa gamificação baseada em:

- **Pontos**
  - Por participação e desempenho em jornadas.
  - Por conclusão de atividades em trilhas.
  - Por uso proativo da área “Evoluir meu conhecimento”.

- **Badges e Níveis**
  - Badges por marcos em competências específicas (ex.: “Consultor BaaS”, “Defensor de Valor”).
  - Níveis por domínio (iniciante, intermediário, avançado, especialista).

- **Dashboards**
  - Para o profissional: evolução individual, metas pessoais.
  - Para o gestor: evolução do time, destaque em competências.

Claude pode ser usado para:

- Sugerir regras de pontuação e badges com base nas metas definidas pelo time de negócios.
- Gerar descrições de badges e feedbacks motivacionais (texto curto, direto, sem frases vazias).

---

## Hard skills vs. soft skills

A plataforma trata ambos os tipos de competência, mas com nuances:

- **Hard skills**
  - Fortemente ligadas a produtos, processos técnicos e conhecimento específico (ex.: arquitetura de BaaS, funcionamento de SIEM, tipos de teste de intrusão).
  - Avaliação tende a focar em correção conceitual, profundidade e capacidade de traduzir técnica em impacto de negócio.

- **Soft skills**
  - Transversais a áreas: comunicação, escuta ativa, negociação, gestão de conflitos, empatia, capacidade de síntese.
  - Avaliação baseada em coerência do discurso, foco no cliente, estruturação da resposta e aderência a boas práticas.

Instrução ao modelo:

- Sempre que avaliar respostas, separar comentários sobre domínio de conteúdo (hard) de domínio da conversa/abordagem (soft), quando possível.
- Quando gerar atividades, deixar explícito quais competências estão sendo treinadas.

---

## Generalização para uso corporativo (não só vendas)

Embora o primeiro caso de uso seja o time de vendas, a arquitetura deve ser genérica:

- “Produto/Solução” pode virar “Domínio de Conhecimento” de qualquer área (ex.: processos de suporte, políticas internas, liderança).
- Jornadas podem avaliar:
  - Suporte técnico (cenários de incidentes, tickets simulados, logs de SIEM).
  - CS e atendimento (conversas com clientes, QBRs).
  - Liderança (estudos de caso de gestão de pessoas).

Regras ao modelo:

- Não assumir que sempre se trata de vendas; ler do contexto/domínio qual persona e competências estão em jogo.
- Ao sugerir perguntas ou trilhas, respeitar o domínio e nível de senioridade informado nos parâmetros da chamada.

---

## Convenções de chamada ao modelo

Sugestão de convenções (podem ser adaptadas conforme implementação):

- **Geração de Jornada**
  - Endpoint interno chama o modelo com:
    - descrição do contexto;
    - lista de produtos/temas;
    - competências alvo;
    - tempo de sessão;
    - nível dos participantes.
  - Modelo retorna lista de perguntas com metadados.

- **Avaliação de Resposta**
  - Entrada: pergunta, resposta, rubrica, orientações master pertinentes e metadados da jornada.
  - Saída: JSON estruturado de avaliação (como exemplo acima).

- **Sessão de Tutor IA**
  - Conversação em múltiplos turns, com system prompt fixando:
    - papel (tutor);
    - tom (construtivo, direto, sem enrolação);
    - objetivos da sessão;
    - quais competências treinar.

---

## Tom de voz e UX conversacional

- Linguagem clara, profissional, mas próxima; evitar jargão excessivo com o vendedor, exceto quando o objetivo é testar domínio técnico.
- Foco em ação (“Na próxima reunião, tente…”) em vez de feedback abstrato.
- Evitar elogios vazios (“excelente resposta!”, “perfeito!”) sem explicar o porquê.
- Em avaliações críticas, sempre equilibrar:
  - apontar pontos de melhoria com exemplos concretos;
  - reforçar pontos fortes para manter motivação.

---

## Limitações e guardrails

- Não dar recomendações jurídicas/compliance definitivas sem base em políticas internas específicas.
- Não prometer resultados comerciais (“isso garantirá que você feche X% mais vendas”).
- Em caso de dúvida sobre características de um produto da Gruppen, responder de forma neutra e sugerir consultar material oficial ou admin.
- Evitar qualquer julgamento pessoal (ex.: “você é fraco em…”) e focar sempre em comportamentos/competências observáveis.

---

## Roadmap sugerido de uso do modelo

1. Fase 1 – MVP Vendas
   - Geração de jornadas para 2–3 soluções chave.
   - Avaliação automatizada simples com revisão do admin.
   - Painel básico de histórico de jornadas e relatórios.

2. Fase 2 – Tutor IA + Gamificação
   - Lançar “Evoluir meu conhecimento” para Vendas.
   - Implementar sessões de prática guiada e primeiros badges.

3. Fase 3 – Expansão Corporativa
   - Modelar competências de Suporte, CS, Liderança.
   - Criar jornadas e trilhas específicas para essas áreas.
   - Refinar dashboards para visão cross-company.

---

Este documento deve servir como contrato de comportamento para qualquer orquestração envolvendo Claude/LLM neste projeto. Ajuste e versione conforme novas regras de negócio e aprendizados forem surgindo.

---

## Módulo de Treinamentos (feature em desenvolvimento)

### Visão geral

Além das Jornadas de Avaliação, a plataforma suporta **Treinamentos** — capacitação assíncrona com conteúdo estruturado em módulos, quizzes opcionais e integração com gamificação.

### Entidades

- **Training**: título, descrição, domínio, status (draft/published/archived), estimated_duration_minutes, xp_reward. M:N com Team, Product, Competency.
- **TrainingModule**: pertence a Training, ordenado. content_type (document/scorm/ai_generated/rich_text), content_data (JSONB), file_path, has_quiz, quiz_required_to_advance, xp_reward.
- **ModuleQuiz**: pertence a TrainingModule (0:1). title, passing_score.
- **QuizQuestion**: pertence a ModuleQuiz, ordenado. text, type (multiple_choice/true_false/essay), options (JSONB), correct_answer, explanation, weight. M:N com Competency.
- **TrainingEnrollment**: user+training, status (pending/in_progress/completed), current_module_order, enrolled_at, completed_at.
- **ModuleProgress**: pertence a TrainingEnrollment. module_id, started_at, completed_at, content_viewed, quiz_score.
- **QuizAttempt**: pertence a ModuleProgress. score, answers (JSONB), passed, started_at, completed_at.

### Ciclo de vida

1. Admin cria treinamento em rascunho (módulo 1 criado automaticamente).
2. Admin adiciona módulos, faz upload de conteúdo (PDF, PPTX, SCORM .zip) ou gera com IA.
3. Admin opcionalmente cria quiz por módulo (manual ou com IA).
4. Admin publica e vincula a equipes → cria TrainingEnrollment (status=pending) para cada membro.
5. Profissional vê pendência no dashboard, consome módulos em sequência.
6. Se quiz obrigatório, precisa nota >= passing_score para avançar. Re-tentativas ilimitadas.
7. Ao concluir todos os módulos → enrollment.status=completed → XP atribuído via tabela scores.

### Regras de negócio

- Módulo 1 criado automaticamente ao criar treinamento.
- Publicação requer >= 1 módulo; módulos com quiz precisam >= 1 pergunta.
- Treinamentos publicados não podem ter conteúdo editado (mesmo padrão de Journey).
- XP: module.xp_reward ao concluir módulo + training.xp_reward ao concluir treinamento.
- Gamificação: usa mesma tabela scores com source="training_module" e source="training".
- Badge criteria nova: trainings>=N.

### Geração com IA

- **Conteúdo**: admin fornece texto de orientação + anexo opcional (PDF/PPTX). IA gera HTML estruturado.
- **Quiz**: baseado no conteúdo do módulo. Admin configura nº perguntas, tipos, nota mínima.

### SCORM (MVP)

- Upload .zip, extração server-side, iframe no frontend.
- API wrapper mínimo para capturar cmi.core.lesson_status e cmi.core.score.raw.

### Fases de implementação

1. Models + Migration + CRUD básico (Training, Module, endpoints admin)
2. Upload de arquivos + viewer frontend
3. Publicação + enrollment + equipes
4. Progresso do profissional (telas de consumo, barra de progresso)
5. Quiz manual (CRUD, tentativa, correção automática)
6. Geração IA — conteúdo
7. Geração IA — quiz
8. SCORM básico
9. Dashboard pendências + XP
10. Tela gestor

### Endpoints planejados

**Admin**: POST/GET/PUT /api/trainings, PATCH .../publish, PATCH .../archive, POST/PUT/DELETE .../modules, POST .../modules/.../upload, POST .../modules/.../generate-content, POST .../modules/.../quiz, POST .../modules/.../quiz/generate.

**Profissional**: GET /api/trainings/my, GET .../my/pending, GET .../progress, POST .../modules/.../view, POST .../modules/.../quiz/attempt, GET .../modules/.../quiz/attempts.

**Gestor**: GET /api/trainings/{id}/enrollments.
