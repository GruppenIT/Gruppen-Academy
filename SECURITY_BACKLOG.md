# Security Backlog — Gruppen Academy

Pendências de segurança identificadas na auditoria de 2026-02-22 que requerem
mudanças arquiteturais ou de infraestrutura.

## Prioridade Alta

### 1. Migrar JWT de localStorage para HttpOnly cookies
- **Status:** CONCLUÍDO (2026-02-22)
- **OWASP:** A07 — Identification and Authentication Failures
- **Risco:** Token acessível via JavaScript; qualquer XSS rouba a sessão.
- **Solução:** Backend seta cookie `HttpOnly; Secure; SameSite=Lax` no login.
  Frontend deixa de ler `localStorage` e passa a depender do cookie automático.
- **Arquivos alterados:** `app/config.py`, `app/auth/router.py`,
  `app/auth/dependencies.py`, `frontend/src/lib/api.ts`,
  `frontend/src/lib/auth.tsx`, `frontend/src/app/auth/callback/page.tsx`

## Prioridade Média

### 2. Token revocation / blacklist com Redis
- **Status:** CONCLUÍDO (2026-02-22)
- **OWASP:** A07
- **Risco:** Tokens válidos por 30 min sem possibilidade de revogação (logout
  real inexistente).
- **Solução:** Redis adicionado ao stack. `POST /api/auth/logout` extrai o `jti`
  do JWT e armazena em `revoked:<jti>` com TTL igual ao tempo restante do token.
  `get_current_user` verifica a blacklist antes de autorizar.
- **Arquivos alterados:** `app/config.py`, `app/redis.py`, `app/auth/blacklist.py`,
  `app/auth/router.py`, `app/auth/dependencies.py`, `app/main.py`,
  `docker-compose.yml`, `pyproject.toml`

### 3. Considerar RS256 (assimétrico) para JWT
- **Status:** PENDENTE
- **OWASP:** A02 — Cryptographic Failures
- **Risco:** HS256 usa segredo compartilhado — qualquer serviço que valida
  tokens também pode emiti-los.
- **Solução:** Gerar par RSA, assinar com chave privada, validar com pública.

### 4. Audit logging estruturado
- **Status:** PENDENTE
- **OWASP:** A09 — Security Logging and Monitoring Failures
- **Risco:** Sem trilha de auditoria para mudanças de config, roles e acessos
  sensíveis.
- **Solução:** Tabela `audit_log` + middleware que registra ações de admin.

## Prioridade Baixa

### 5. pip audit + npm audit no CI/CD
- **Status:** PENDENTE
- **OWASP:** A06 — Vulnerable and Outdated Components
- **Solução:** Adicionar step no pipeline (GitHub Actions) que roda `pip audit`
  e `npm audit` e falha em vulnerabilidades críticas.

### 6. SBOM (Software Bill of Materials)
- **Status:** PENDENTE
- **OWASP:** A06
- **Solução:** Gerar SBOM com `cyclonedx-bom` no build e armazenar como
  artefato do CI.
