# PENDENCIAS — Gruppen Academy

Lista de itens pendentes comparando o CLAUDE.md com a implementação atual.
Atualizar este arquivo conforme os itens forem concluídos.

---

## LOTE 1 — AVALIAÇÃO E RELATÓRIOS (Crítico)

- [x] **1.3** Fix: guidelines não são buscadas no service de avaliação (bug)
- [x] **1.2** Endpoint de avaliação em lote (avaliar todas as respostas de uma participação)
- [x] **1.4** Workflow de status com validação de transições (PENDING→EVALUATED→REVIEWED→SENT)
- [x] **1.1** Página admin de avaliações (frontend) — listar respostas, disparar avaliação IA, revisar, aprovar
- [x] **1.5** Página de visualização de relatório (profissional)
- [x] **1.6** Página de visualização de relatório (gestor)
- [x] **6.1** Minhas jornadas concluídas (frontend profissional)
- [x] **6.2** Detalhe da avaliação por pergunta (frontend profissional)
- [x] **6.3** Meu relatório analítico (frontend profissional)

---

## LOTE 2 — DASHBOARD DO GESTOR

- [x] **2.1** Dashboard do gestor com visão de evolução dos times
- [x] **2.2** Histórico de jornadas do time com notas por membro
- [x] **2.3** Gestor disparar jornada para time (hoje só admin)

---

## LOTE 3 — TRILHAS DE APRENDIZAGEM

- [x] **3.1** Modelo ActivityCompletion + endpoint para marcar atividade concluída + pontos automáticos
- [x] **3.2** Cálculo de progresso na trilha (% de atividades concluídas)
- [x] **3.3** Frontend de trilhas com progresso real e botão "Concluir"
- [ ] **3.4** Sugestão de trilha por gap de competência (baseado em avaliações)

---

## LOTE 4 — GAMIFICAÇÃO AUTOMÁTICA

- [x] **5.1** Pontos automáticos por conclusão de jornada (50pts ao completar)
- [x] **5.2** Pontos automáticos por conclusão de atividade de trilha
- [x] **5.3** Pontos por uso do tutor IA (5pts a cada 5 msgs + 15pts ao gerar resumo)
- [x] **5.4** Badges automáticos (check_and_award_badges com critérios: points, journeys, activities, streak, tutor_sessions)
- [x] **5.5** Cálculo de streak real (dias consecutivos de atividade) + endpoint GET /streak/me

---

## LOTE 5 — TUTOR IA (Melhorias)

- [x] **4.1** Contexto rico no tutor: perfil, histórico, gaps, orientações master
- [x] **4.2** Resumo pós-sessão automático (desempenho, competências, sugestões)
- [x] **4.3** Histórico de sessões (frontend — listar, retomar, ver resumo)
- [x] **4.4** Tópicos dinâmicos baseados nos produtos/gaps do usuário

---

## LOTE 6 — JORNADAS SÍNCRONAS (OCR)

- [ ] **7.1** Upload de PDF digitalizado (endpoint + storage)
- [ ] **7.2** Processamento OCR (extrair texto de respostas manuscritas)
- [ ] **7.3** Revisão de OCR pelo admin antes de avaliação

---

## LOTE 7 — MELHORIAS MENORES

- [ ] **8.1** Registro de tempo por resposta (async)
- [ ] **8.2** Deletar/editar perguntas individuais (endpoints)
- [ ] **8.3** CRUD completo para trilhas e atividades (editar/deletar)
- [ ] **8.4** Clonar jornada existente

---

_Última atualização: 2026-02-22_
