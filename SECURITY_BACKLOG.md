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

### 3. Migrar JWT para RS256 (assimétrico)
- **Status:** CONCLUÍDO (2026-02-22)
- **OWASP:** A02 — Cryptographic Failures
- **Risco:** HS256 usa segredo compartilhado — qualquer serviço que valida
  tokens também pode emiti-los.
- **Solução:** Default alterado para RS256. Chave privada assina, pública valida.
  Em dev, par RSA efêmero é gerado automaticamente. Em produção, exige
  `JWT_PRIVATE_KEY` e `JWT_PUBLIC_KEY` via env vars. Script helper em
  `python -m app.auth.generate_keys`. HS256 ainda funciona se `JWT_ALGORITHM=HS256`.
- **Arquivos alterados:** `app/config.py`, `app/auth/service.py`,
  `app/auth/generate_keys.py`, `.gitignore`

### 4. Audit logging estruturado
- **Status:** CONCLUÍDO (2026-02-22)
- **OWASP:** A09 — Security Logging and Monitoring Failures
- **Risco:** Sem trilha de auditoria para mudanças de config, roles e acessos
  sensíveis.
- **Solução:** Tabela `audit_logs` com índices em timestamp, user_id e action.
  Middleware `AuditLogMiddleware` registra automaticamente toda requisição
  mutante (POST/PUT/PATCH/DELETE) a `/api/*`, capturando usuário, IP, user-agent,
  método, path e status code. Função `write_audit_log()` disponível para logs
  manuais em pontos específicos (ex.: mudança de role, exclusão de dados).
- **Arquivos criados:** `app/audit/__init__.py`, `app/audit/models.py`,
  `app/audit/service.py`, `app/audit/middleware.py`,
  `alembic/versions/007_add_audit_logs.py`
- **Arquivos alterados:** `app/main.py`, `app/auth/dependencies.py`,
  `alembic/env.py`

## Prioridade Baixa

### 5. pip audit + npm audit no CI/CD
- **Status:** CONCLUÍDO (2026-02-22)
- **OWASP:** A06 — Vulnerable and Outdated Components
- **Solução:** Workflow GitHub Actions (`security.yml`) com job `dependency-audit`
  que roda `pip-audit --strict` e `npm audit --audit-level=high`. Executa em
  push/PR para main e semanalmente (cron segunda 06:00 UTC). Falha o pipeline
  se houver vulnerabilidades altas ou críticas.
- **Arquivos criados:** `.github/workflows/security.yml`

### 6. SBOM (Software Bill of Materials)
- **Status:** CONCLUÍDO (2026-02-22)
- **OWASP:** A06
- **Solução:** Job `sbom` no mesmo workflow `security.yml` gera SBOMs em
  formato CycloneDX JSON para Python (`cyclonedx-py`) e frontend
  (`@cyclonedx/cyclonedx-npm`). Artefatos retidos por 90 dias no GitHub Actions.
- **Arquivos criados:** `.github/workflows/security.yml`
