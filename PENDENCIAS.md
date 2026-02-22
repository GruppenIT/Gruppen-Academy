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

- [ ] **2.1** Dashboard do gestor com visão de evolução dos times
- [ ] **2.2** Histórico de jornadas do time com notas por membro
- [ ] **2.3** Gestor disparar jornada para time (hoje só admin)

---

## LOTE 3 — TRILHAS DE APRENDIZAGEM

- [ ] **3.1** Modelo ActivityCompletion + endpoint para marcar atividade concluída + pontos automáticos
- [ ] **3.2** Cálculo de progresso na trilha (% de atividades concluídas)
- [ ] **3.3** Atividades interativas: quiz, simulação, estudo de caso (não só título/descrição)
- [ ] **3.4** Sugestão de trilha por gap de competência (baseado em avaliações)

---

## LOTE 4 — GAMIFICAÇÃO AUTOMÁTICA

- [ ] **5.1** Pontos automáticos por conclusão de jornada (proporcional ao desempenho)
- [ ] **5.2** Pontos automáticos por conclusão de atividade de trilha
- [ ] **5.3** Pontos por uso do tutor IA
- [ ] **5.4** Badges automáticos (verificar critérios e conceder)
- [ ] **5.5** Cálculo de streak real (dias consecutivos de atividade)

---

## LOTE 5 — TUTOR IA (Melhorias)

- [ ] **4.1** Contexto rico no tutor: perfil, histórico, gaps, orientações master
- [ ] **4.2** Resumo pós-sessão automático (desempenho, competências, sugestões)
- [ ] **4.3** Histórico de sessões (frontend — listar sessões passadas)
- [ ] **4.4** Tópicos dinâmicos baseados nos produtos/gaps do usuário

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

_Última atualização: 2026-02-21_
