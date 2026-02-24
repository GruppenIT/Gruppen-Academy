const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export function getApiBase() { return API_BASE }

class ApiClient {
  /**
   * Whether the user has a valid session.
   * This is a client-side hint only — the real auth state is in the HttpOnly cookie.
   */
  private _authenticated: boolean = false

  get authenticated(): boolean {
    return this._authenticated
  }

  setAuthenticated(value: boolean) {
    this._authenticated = value
  }

  // --- Backward compatibility shims (no-ops, token lives in HttpOnly cookie) ---
  /** @deprecated Token is now managed via HttpOnly cookie */
  setToken(token: string | null) {
    this._authenticated = !!token
    // Migration: clean up any leftover localStorage token
    if (typeof window !== 'undefined') localStorage.removeItem('token')
  }

  /** @deprecated Token is now managed via HttpOnly cookie */
  getToken(): string | null {
    // During migration: check if there's an old localStorage token
    if (typeof window !== 'undefined') {
      const legacy = localStorage.getItem('token')
      if (legacy) {
        // Clean up old token — cookie is now the source of truth
        localStorage.removeItem('token')
      }
    }
    return null
  }

  private async request<T>(path: string, options: RequestInit = {}, timeoutMs?: number): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }

    const controller = new AbortController()
    const timeout = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined
    const fetchOptions: RequestInit = {
      ...options,
      headers,
      signal: controller.signal,
      credentials: 'include',  // Send HttpOnly cookie automatically
    }

    let res: Response
    try {
      res = await fetch(`${API_BASE}${path}`, fetchOptions)
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error('Tempo limite excedido. A requisição demorou demais.')
      }
      throw new Error(`Erro de conexão com o servidor. Verifique se a API está rodando. (${err instanceof Error ? err.message : err})`)
    } finally {
      if (timeout) clearTimeout(timeout)
    }

    if (res.status === 401) {
      this._authenticated = false
      // Only redirect if not already on a public page (avoids infinite reload loop)
      if (typeof window !== 'undefined') {
        const p = window.location.pathname
        if (p !== '/login' && !p.startsWith('/auth/')) {
          window.location.href = '/login'
        }
      }
      throw new Error('Não autorizado')
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const detail = body.detail
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join('; ')
          : `Erro ${res.status}`
      throw new Error(message)
    }

    if (res.status === 204) return {} as T
    return res.json()
  }

  // Auth
  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',  // Receive and store HttpOnly cookie
    })
    if (!res.ok) throw new Error('Credenciais inválidas')
    this._authenticated = true
    return res.json()
  }

  async logout() {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Best-effort: even if the call fails, clear client state
    }
    this._authenticated = false
    // Clean up any legacy localStorage token
    if (typeof window !== 'undefined') localStorage.removeItem('token')
  }

  // SSO
  ssoAuthorize() {
    return this.request<{ authorize_url: string; state: string }>('/api/auth/sso/authorize')
  }

  async ssoCallback(code: string, state: string) {
    const res = await fetch(`${API_BASE}/api/auth/sso/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
      credentials: 'include',  // Receive and store HttpOnly cookie
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || 'Falha na autenticação SSO')
    }
    this._authenticated = true
    return res.json()
  }

  ssoCheck() {
    return this.request<{ enabled: boolean }>('/api/auth/sso/check')
  }

  // Users
  getMe() { return this.request<import('@/types').User>('/api/users/me') }
  getUsers(skip = 0, limit = 50) { return this.request<import('@/types').User[]>(`/api/users?skip=${skip}&limit=${limit}`) }
  createUser(data: { email: string; password: string; full_name: string; role?: string; department?: string }) {
    return this.request<import('@/types').User>('/api/users', { method: 'POST', body: JSON.stringify(data) })
  }
  updateUser(id: string, data: { full_name?: string; role?: string; department?: string; is_active?: boolean }) {
    return this.request<import('@/types').User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  // Catalog - Products
  getProducts(skip = 0, limit = 50, includeInactive = false) {
    return this.request<import('@/types').Product[]>(`/api/catalog/products?skip=${skip}&limit=${limit}&include_inactive=${includeInactive}`)
  }
  getProduct(id: string) { return this.request<import('@/types').Product>(`/api/catalog/products/${id}`) }
  createProduct(data: { name: string; description: string; target_persona?: string; common_pain_points?: string; typical_objections?: string; differentials?: string; technology?: string; priority?: number }) {
    return this.request<import('@/types').Product>('/api/catalog/products', { method: 'POST', body: JSON.stringify(data) })
  }
  updateProduct(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').Product>(`/api/catalog/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  reorderProducts(items: { id: string; priority: number }[]) {
    return this.request<void>('/api/catalog/products/reorder', { method: 'PUT', body: JSON.stringify(items) })
  }

  // Catalog - Competencies
  getCompetencies(domain?: string) {
    const q = domain ? `?domain=${domain}` : ''
    return this.request<import('@/types').Competency[]>(`/api/catalog/competencies${q}`)
  }
  createCompetency(data: { name: string; description: string; type: string; domain?: string }) {
    return this.request<import('@/types').Competency>('/api/catalog/competencies', { method: 'POST', body: JSON.stringify(data) })
  }
  updateCompetency(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').Competency>(`/api/catalog/competencies/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  // Catalog - Guidelines
  getGuidelines(productId?: string) {
    const q = productId ? `?product_id=${productId}` : ''
    return this.request<import('@/types').MasterGuideline[]>(`/api/catalog/guidelines${q}`)
  }
  createGuideline(data: { product_id?: string | null; title: string; content: string; category: string; is_corporate?: boolean; domain?: string }) {
    return this.request<import('@/types').MasterGuideline>('/api/catalog/guidelines', { method: 'POST', body: JSON.stringify(data) })
  }
  updateGuideline(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').MasterGuideline>(`/api/catalog/guidelines/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  // Teams
  getTeams() { return this.request<import('@/types').Team[]>('/api/teams') }
  getTeam(id: string) { return this.request<import('@/types').Team>(`/api/teams/${id}`) }
  createTeam(data: { name: string; description?: string; member_ids?: string[] }) {
    return this.request<import('@/types').Team>('/api/teams', { method: 'POST', body: JSON.stringify(data) })
  }
  updateTeam(id: string, data: { name?: string; description?: string }) {
    return this.request<import('@/types').Team>(`/api/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  setTeamMembers(teamId: string, memberIds: string[]) {
    return this.request<import('@/types').Team>(`/api/teams/${teamId}/members`, { method: 'PUT', body: JSON.stringify(memberIds) })
  }
  deleteTeam(id: string) {
    return this.request<void>(`/api/teams/${id}`, { method: 'DELETE' })
  }

  // Journeys
  getJourneys(skip = 0, limit = 50, domain?: string) {
    const q = domain ? `&domain=${domain}` : ''
    return this.request<import('@/types').Journey[]>(`/api/journeys?skip=${skip}&limit=${limit}${q}`)
  }
  getJourney(id: string) { return this.request<import('@/types').Journey>(`/api/journeys/${id}`) }
  getJourneyQuestions(id: string) { return this.request<import('@/types').Question[]>(`/api/journeys/${id}/questions`) }
  createJourney(data: { title: string; description?: string; domain?: string; session_duration_minutes?: number; participant_level?: string; mode?: string; product_ids?: string[]; competency_ids?: string[] }) {
    return this.request<import('@/types').Journey>('/api/journeys', { method: 'POST', body: JSON.stringify(data) })
  }
  updateJourney(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').Journey>(`/api/journeys/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  createQuestion(journeyId: string, data: { text: string; type?: string; weight?: number; rubric?: Record<string, unknown>; max_time_seconds?: number | null; expected_lines?: number; order?: number; competency_ids?: string[] }) {
    return this.request<import('@/types').Question>(`/api/journeys/${journeyId}/questions`, { method: 'POST', body: JSON.stringify(data) })
  }
  updateQuestion(journeyId: string, questionId: string, data: { text?: string; type?: string; weight?: number; rubric?: Record<string, unknown> | null; max_time_seconds?: number | null; expected_lines?: number; order?: number }) {
    return this.request<import('@/types').Question>(`/api/journeys/${journeyId}/questions/${questionId}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  deleteQuestion(journeyId: string, questionId: string) {
    return this.request<void>(`/api/journeys/${journeyId}/questions/${questionId}`, { method: 'DELETE' })
  }
  cloneJourney(journeyId: string) {
    return this.request<import('@/types').Journey>(`/api/journeys/${journeyId}/clone`, { method: 'POST' })
  }
  getJourneyTeams(journeyId: string) {
    return this.request<{ id: string; name: string }[]>(`/api/journeys/${journeyId}/teams`)
  }
  assignJourneyTeams(journeyId: string, teamIds: string[]) {
    return this.request<string[]>(`/api/journeys/${journeyId}/teams`, { method: 'PUT', body: JSON.stringify(teamIds) })
  }

  // PDF Generation (sync journeys)
  async downloadJourneyPdf(journeyId: string) {
    const res = await fetch(`${API_BASE}/api/journeys/${journeyId}/print-pdf`, {
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Erro ${res.status}`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jornada-${journeyId}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Async Journey Participation
  getMyAvailableJourneys() { return this.request<import('@/types').Journey[]>('/api/journeys/my/available') }
  startJourney(journeyId: string) {
    return this.request<import('@/types').ParticipationStatus>(`/api/journeys/${journeyId}/start`, { method: 'POST' })
  }
  getCurrentQuestion(journeyId: string) {
    return this.request<import('@/types').AsyncQuestion>(`/api/journeys/${journeyId}/current-question`)
  }
  submitAnswer(journeyId: string, answerText: string) {
    return this.request<import('@/types').ParticipationStatus>(`/api/journeys/${journeyId}/answer`, { method: 'POST', body: JSON.stringify({ answer_text: answerText }) })
  }

  // OCR Uploads (Sync Journey)
  async uploadOCRBatch(file: File): Promise<import('@/types').OCRImportReport> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/journeys/ocr-upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Erro ${res.status}`)
    }
    return res.json() as Promise<import('@/types').OCRImportReport>
  }
  /** @deprecated Use uploadOCRBatch instead */
  async uploadOCRPdf(participationId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/journeys/participations/${participationId}/ocr-upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Erro ${res.status}`)
    }
    return res.json() as Promise<import('@/types').OCRUpload>
  }
  getOCRUploads(skip = 0, limit = 50) {
    return this.request<import('@/types').OCRUpload[]>(`/api/journeys/ocr-uploads?skip=${skip}&limit=${limit}`)
  }
  getOCRUpload(uploadId: string) {
    return this.request<import('@/types').OCRUpload>(`/api/journeys/ocr-uploads/${uploadId}`)
  }
  processOCRUpload(uploadId: string) {
    return this.request<import('@/types').OCRUpload>(`/api/journeys/ocr-uploads/${uploadId}/process`, { method: 'POST' }, 120000)
  }
  reviewOCRUpload(uploadId: string, extractedResponses: import('@/types').OCRExtractedResponse[]) {
    return this.request<import('@/types').OCRUpload>(`/api/journeys/ocr-uploads/${uploadId}/review`, {
      method: 'PATCH', body: JSON.stringify({ extracted_responses: extractedResponses }),
    })
  }
  approveOCRUpload(uploadId: string) {
    return this.request<{ id: string; answer_text: string }[]>(`/api/journeys/ocr-uploads/${uploadId}/approve`, { method: 'POST' })
  }

  // Learning
  getLearningPaths(domain?: string, activeOnly = true) {
    const params = new URLSearchParams()
    if (domain) params.set('domain', domain)
    if (!activeOnly) params.set('active_only', 'false')
    const q = params.toString() ? `?${params}` : ''
    return this.request<import('@/types').LearningPath[]>(`/api/learning/paths${q}`)
  }
  getLearningPath(id: string) { return this.request<import('@/types').LearningPath>(`/api/learning/paths/${id}`) }
  getPathActivities(pathId: string) { return this.request<import('@/types').LearningActivity[]>(`/api/learning/paths/${pathId}/activities`) }
  createLearningPath(data: { title: string; description?: string; domain?: string; target_role?: string; competency_ids?: string[] }) {
    return this.request<import('@/types').LearningPath>('/api/learning/paths', { method: 'POST', body: JSON.stringify(data) })
  }
  updateLearningPath(pathId: string, data: { title?: string; description?: string; domain?: string; target_role?: string; is_active?: boolean }) {
    return this.request<import('@/types').LearningPath>(`/api/learning/paths/${pathId}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  deleteLearningPath(pathId: string) {
    return this.request<void>(`/api/learning/paths/${pathId}`, { method: 'DELETE' })
  }
  getSuggestedPaths() {
    return this.request<import('@/types').SuggestedPath[]>('/api/learning/paths/suggested-for-me')
  }
  // Path Items (trainings/journeys in a path)
  getPathItems(pathId: string) {
    return this.request<import('@/types').PathItem[]>(`/api/learning/paths/${pathId}/items`)
  }
  addPathItem(pathId: string, data: { item_type: string; item_id: string; order?: number }) {
    return this.request<import('@/types').PathItem>(`/api/learning/paths/${pathId}/items`, { method: 'POST', body: JSON.stringify(data) })
  }
  removePathItem(pathId: string, itemId: string) {
    return this.request<void>(`/api/learning/paths/${pathId}/items/${itemId}`, { method: 'DELETE' })
  }
  reorderPathItems(pathId: string, itemIds: string[]) {
    return this.request<import('@/types').PathItem[]>(`/api/learning/paths/${pathId}/items/reorder`, { method: 'PUT', body: JSON.stringify({ item_ids: itemIds }) })
  }
  // Path Badges
  setPathBadges(pathId: string, badgeIds: string[]) {
    return this.request<{ ok: boolean }>(`/api/learning/paths/${pathId}/badges`, { method: 'PUT', body: JSON.stringify({ badge_ids: badgeIds }) })
  }
  // Path Teams
  setPathTeams(pathId: string, teamIds: string[]) {
    return this.request<{ ok: boolean }>(`/api/learning/paths/${pathId}/teams`, { method: 'PUT', body: JSON.stringify({ team_ids: teamIds }) })
  }
  getMyLearningPaths() {
    return this.request<import('@/types').LearningPath[]>('/api/learning/paths/my')
  }
  // Path Completion
  getPathCompletion(pathId: string) {
    return this.request<import('@/types').PathCompletion>(`/api/learning/paths/${pathId}/completion`)
  }
  // Legacy activities
  createActivity(pathId: string, data: { title: string; description?: string; type: string; content?: Record<string, unknown>; order?: number; points_reward?: number }) {
    return this.request<import('@/types').LearningActivity>(`/api/learning/paths/${pathId}/activities`, { method: 'POST', body: JSON.stringify(data) })
  }
  updateActivity(pathId: string, activityId: string, data: { title?: string; description?: string; type?: string; content?: Record<string, unknown>; order?: number; points_reward?: number }) {
    return this.request<import('@/types').LearningActivity>(`/api/learning/paths/${pathId}/activities/${activityId}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  deleteActivity(pathId: string, activityId: string) {
    return this.request<void>(`/api/learning/paths/${pathId}/activities/${activityId}`, { method: 'DELETE' })
  }
  getPathProgress(pathId: string) {
    return this.request<import('@/types').PathProgress>(`/api/learning/paths/${pathId}/progress`)
  }
  completeActivity(activityId: string) {
    return this.request<{ id: string; activity_id: string; completed_at: string }>(`/api/learning/activities/${activityId}/complete`, { method: 'POST' })
  }

  // Tutor
  listTutorSessions(skip = 0, limit = 20) {
    return this.request<import('@/types').TutorSession[]>(`/api/learning/tutor/sessions?skip=${skip}&limit=${limit}`)
  }
  createTutorSession(topic: string, activityId?: string) {
    return this.request<import('@/types').TutorSession>('/api/learning/tutor/sessions', {
      method: 'POST',
      body: JSON.stringify({ topic, activity_id: activityId }),
    })
  }
  getTutorSession(id: string) { return this.request<import('@/types').TutorSession>(`/api/learning/tutor/sessions/${id}`) }
  sendTutorMessage(sessionId: string, message: string) {
    return this.request<import('@/types').TutorSession>(`/api/learning/tutor/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }
  generateSessionSummary(sessionId: string) {
    return this.request<import('@/types').TutorSession>(`/api/learning/tutor/sessions/${sessionId}/summary`, {
      method: 'POST',
    }, 120000)
  }
  getSuggestedTopics() {
    return this.request<import('@/types').SuggestedTopic[]>('/api/learning/tutor/suggested-topics')
  }

  // Gamification
  getMyPoints() { return this.request<import('@/types').UserPointsSummary>('/api/gamification/scores/me') }
  getMyHistory(skip = 0, limit = 20) { return this.request<import('@/types').Score[]>(`/api/gamification/scores/me/history?skip=${skip}&limit=${limit}`) }
  getLeaderboard(limit = 10) { return this.request<import('@/types').UserPointsSummary[]>(`/api/gamification/leaderboard?limit=${limit}`) }
  getMyStreak() { return this.request<import('@/types').UserStreak>('/api/gamification/streak/me') }
  checkBadges() { return this.request<{ newly_awarded: number }>('/api/gamification/badges/check', { method: 'POST' }) }
  getBadges() { return this.request<import('@/types').Badge[]>('/api/gamification/badges') }
  getMyBadges() { return this.request<import('@/types').UserBadge[]>('/api/gamification/badges/me') }
  createBadge(data: { name: string; description: string; icon?: string; criteria: string; points_threshold?: number }) {
    return this.request<import('@/types').Badge>('/api/gamification/badges', { method: 'POST', body: JSON.stringify(data) })
  }
  awardBadge(badgeId: string, userId: string) {
    return this.request<import('@/types').UserBadge>(`/api/gamification/badges/${badgeId}/award/${userId}`, { method: 'POST' })
  }
  createScore(data: { user_id: string; points: number; source: string; description?: string }) {
    return this.request<import('@/types').Score>('/api/gamification/scores', { method: 'POST', body: JSON.stringify(data) })
  }
  getUserPoints(userId: string) { return this.request<import('@/types').UserPointsSummary>(`/api/gamification/scores/${userId}`) }

  // Manager Dashboard
  getManagerDashboard() {
    return this.request<import('@/types').ManagerDashboard>('/api/evaluations/dashboard/manager')
  }

  // Evaluations
  evaluateResponse(responseId: string) {
    return this.request<import('@/types').Evaluation>('/api/evaluations/evaluate', {
      method: 'POST', body: JSON.stringify({ response_id: responseId }),
    })
  }
  evaluateBulk(participationId: string) {
    return this.request<import('@/types').Evaluation[]>('/api/evaluations/evaluate-bulk', {
      method: 'POST', body: JSON.stringify({ participation_id: participationId }),
    }, 300000)
  }
  getParticipationsForEvaluation(skip = 0, limit = 50) {
    return this.request<import('@/types').ParticipationEvaluationSummary[]>(
      `/api/evaluations/participations?skip=${skip}&limit=${limit}`
    )
  }
  getParticipationDetails(participationId: string) {
    return this.request<import('@/types').ParticipationResponseDetail[]>(
      `/api/evaluations/participations/${participationId}/details`
    )
  }
  getMyParticipations() {
    return this.request<import('@/types').UserParticipationSummary[]>('/api/evaluations/my/participations')
  }
  getMyParticipationDetails(participationId: string) {
    return this.request<import('@/types').ParticipationResponseDetail[]>(
      `/api/evaluations/my/participations/${participationId}/details`
    )
  }
  reviewEvaluation(evaluationId: string, data: { status?: string; review_notes?: string; score_global?: number; general_comment?: string }) {
    return this.request<import('@/types').Evaluation>(`/api/evaluations/${evaluationId}/review`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  }
  generateReport(participationId: string, reportType: 'manager' | 'professional' = 'professional') {
    return this.request<import('@/types').AnalyticalReport>('/api/evaluations/reports', {
      method: 'POST', body: JSON.stringify({ participation_id: participationId, report_type: reportType }),
    }, 150000)
  }
  getReport(reportId: string) {
    return this.request<import('@/types').AnalyticalReport>(`/api/evaluations/reports/${reportId}`)
  }

  // Copilot
  copilotSuggestCompetencies() {
    return this.request<import('@/types').CopilotCompetencySuggestResponse>('/api/copilot/suggest-competencies', { method: 'POST' }, 150000)
  }
  copilotCreateCompetenciesBulk(items: { name: string; description: string; type: string; domain: string }[]) {
    return this.request<{ created: { id: string; name: string }[]; count: number }>('/api/copilot/create-competencies-bulk', { method: 'POST', body: JSON.stringify({ items }) })
  }
  copilotSuggestGuidelines() {
    return this.request<import('@/types').CopilotGuidelineSuggestResponse>('/api/copilot/suggest-guidelines', { method: 'POST' }, 150000)
  }
  copilotCreateGuidelinesBulk(items: { product_id?: string | null; title: string; content: string; category: string; is_corporate?: boolean }[]) {
    return this.request<{ created: { id: string; title: string }[]; count: number }>('/api/copilot/create-guidelines-bulk', { method: 'POST', body: JSON.stringify({ items }) })
  }
  copilotGenerateJourney(data: { title: string; domain: string; session_duration_minutes: number; participant_level: string; product_ids: string[]; description?: string; mode?: string; admin_instructions?: string }) {
    return this.request<import('@/types').CopilotJourneyGenerateResponse>('/api/copilot/generate-journey', { method: 'POST', body: JSON.stringify(data) }, 150000)
  }

  // Trainings
  getTrainings(skip = 0, limit = 50, statusFilter?: string) {
    const q = statusFilter ? `&status_filter=${statusFilter}` : ''
    return this.request<import('@/types').Training[]>(`/api/trainings?skip=${skip}&limit=${limit}${q}`)
  }
  async importScormTraining(
    file: File,
    opts?: { title?: string; description?: string; domain?: string; participant_level?: string; estimated_duration_minutes?: number; xp_reward?: number }
  ): Promise<import('@/types').Training> {
    const formData = new FormData()
    formData.append('file', file)
    if (opts?.title) formData.append('title', opts.title)
    if (opts?.description) formData.append('description', opts.description)
    if (opts?.domain) formData.append('domain', opts.domain)
    if (opts?.participant_level) formData.append('participant_level', opts.participant_level)
    if (opts?.estimated_duration_minutes !== undefined) formData.append('estimated_duration_minutes', String(opts.estimated_duration_minutes))
    if (opts?.xp_reward !== undefined) formData.append('xp_reward', String(opts.xp_reward))
    const res = await fetch(`${API_BASE}/api/trainings/import-scorm`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Erro ${res.status}`)
    }
    return res.json()
  }
  getTraining(id: string) {
    return this.request<import('@/types').Training>(`/api/trainings/${id}`)
  }
  createTraining(data: { title: string; description?: string; domain?: string; participant_level?: string; estimated_duration_minutes?: number; xp_reward?: number; product_ids?: string[]; competency_ids?: string[] }) {
    return this.request<import('@/types').Training>('/api/trainings', { method: 'POST', body: JSON.stringify(data) })
  }
  updateTraining(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').Training>(`/api/trainings/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  }
  publishTraining(id: string, teamIds: string[]) {
    return this.request<import('@/types').Training>(`/api/trainings/${id}/publish`, {
      method: 'PATCH', body: JSON.stringify({ team_ids: teamIds }),
    })
  }
  archiveTraining(id: string) {
    return this.request<import('@/types').Training>(`/api/trainings/${id}/archive`, { method: 'PATCH' })
  }
  deleteTraining(id: string) {
    return this.request<{ deleted: boolean; affected_users: number; xp_reversed: number }>(`/api/trainings/${id}`, { method: 'DELETE' })
  }
  getTrainingModules(trainingId: string) {
    return this.request<import('@/types').TrainingModule[]>(`/api/trainings/${trainingId}/modules`)
  }
  getTrainingModule(trainingId: string, moduleId: string) {
    return this.request<import('@/types').TrainingModule>(`/api/trainings/${trainingId}/modules/${moduleId}`)
  }
  createTrainingModule(trainingId: string, data: { title: string; description?: string; order?: number; xp_reward?: number }) {
    return this.request<import('@/types').TrainingModule>(`/api/trainings/${trainingId}/modules`, { method: 'POST', body: JSON.stringify(data) })
  }
  updateTrainingModule(trainingId: string, moduleId: string, data: Record<string, unknown>) {
    return this.request<import('@/types').TrainingModule>(`/api/trainings/${trainingId}/modules/${moduleId}`, { method: 'PUT', body: JSON.stringify(data) })
  }
  deleteTrainingModule(trainingId: string, moduleId: string) {
    return this.request<void>(`/api/trainings/${trainingId}/modules/${moduleId}`, { method: 'DELETE' })
  }
  async uploadModuleFile(trainingId: string, moduleId: string, file: File, allowDownload: boolean = true): Promise<import('@/types').TrainingModule> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('allow_download', String(allowDownload))
    const res = await fetch(`${API_BASE}/api/trainings/${trainingId}/modules/${moduleId}/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Erro ${res.status}`)
    }
    return res.json()
  }
  getModuleFileUrl(trainingId: string, moduleId: string) {
    return `${API_BASE}/api/trainings/${trainingId}/modules/${moduleId}/file`
  }
  getModulePreviewUrl(trainingId: string, moduleId: string) {
    return `${API_BASE}/api/trainings/${trainingId}/modules/${moduleId}/preview`
  }
  getScormLaunchUrl(trainingId: string, moduleId: string) {
    return `${API_BASE}/api/trainings/${trainingId}/modules/${moduleId}/scorm-launch`
  }
  updateScormStatus(trainingId: string, moduleId: string, data: { lesson_status: string; score_raw: number | null; score_max: number | null }) {
    return this.request<import('@/types').ModuleProgressOut>(`/api/trainings/my/trainings/${trainingId}/modules/${moduleId}/scorm-status`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  createModuleQuiz(trainingId: string, moduleId: string, data: { title?: string; passing_score?: number; questions?: unknown[] }) {
    return this.request<import('@/types').ModuleQuiz>(`/api/trainings/${trainingId}/modules/${moduleId}/quiz`, { method: 'POST', body: JSON.stringify(data) })
  }
  getModuleQuiz(trainingId: string, moduleId: string) {
    return this.request<import('@/types').ModuleQuiz | null>(`/api/trainings/${trainingId}/modules/${moduleId}/quiz`)
  }
  addQuizQuestion(trainingId: string, moduleId: string, data: { text: string; type?: string; options?: unknown[]; correct_answer?: string; explanation?: string; weight?: number; order?: number }) {
    return this.request<import('@/types').QuizQuestion>(`/api/trainings/${trainingId}/modules/${moduleId}/quiz/questions`, { method: 'POST', body: JSON.stringify(data) })
  }
  updateQuizQuestion(trainingId: string, moduleId: string, questionId: string, data: Record<string, unknown>) {
    return this.request<import('@/types').QuizQuestion>(`/api/trainings/${trainingId}/modules/${moduleId}/quiz/questions/${questionId}`, { method: 'PUT', body: JSON.stringify(data) })
  }
  deleteQuizQuestion(trainingId: string, moduleId: string, questionId: string) {
    return this.request<void>(`/api/trainings/${trainingId}/modules/${moduleId}/quiz/questions/${questionId}`, { method: 'DELETE' })
  }
  getTrainingEnrollments(trainingId: string) {
    return this.request<import('@/types').TrainingEnrollment[]>(`/api/trainings/${trainingId}/enrollments`)
  }

  // Trainings — AI Generation
  async generateModuleContent(trainingId: string, moduleId: string, orientation: string, referenceFile?: File, contentLength: string = 'normal'): Promise<Record<string, unknown>> {
    const formData = new FormData()
    formData.append('orientation', orientation)
    formData.append('content_length', contentLength)
    if (referenceFile) formData.append('reference_file', referenceFile)
    const res = await fetch(`${API_BASE}/api/trainings/${trainingId}/modules/${moduleId}/generate-content`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Erro ${res.status}`)
    }
    return res.json()
  }
  updateModuleContent(trainingId: string, moduleId: string, data: { title?: string; sections?: { heading: string; content: string }[]; summary?: string; key_concepts?: string[] }) {
    return this.request<Record<string, unknown>>(`/api/trainings/${trainingId}/modules/${moduleId}/update-content`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  editModuleContentAI(trainingId: string, moduleId: string, prompt: string) {
    return this.request<Record<string, unknown>>(`/api/trainings/${trainingId}/modules/${moduleId}/edit-content-ai`, {
      method: 'POST', body: JSON.stringify({ prompt }),
    })
  }
  generateModuleQuiz(trainingId: string, moduleId: string, opts?: { num_questions?: number; difficulty?: string; orientation?: string }) {
    return this.request<{ quiz_id: string; questions_count: number; questions: import('@/types').QuizQuestion[] }>(
      `/api/trainings/${trainingId}/modules/${moduleId}/generate-quiz`, {
        method: 'POST',
        body: opts ? JSON.stringify(opts) : undefined,
      }
    )
  }

  // Wizard
  async wizardSuggestStructure(data: {
    title?: string; description?: string; domain: string;
    participant_level: string; orientation?: string; reference_file?: File
  }): Promise<{
    suggested_title?: string;
    chapters: { title: string; description: string; estimated_duration_minutes: number }[];
    total_estimated_duration_minutes: number;
    rationale: string;
  }> {
    const formData = new FormData()
    if (data.title) formData.append('title', data.title)
    if (data.description) formData.append('description', data.description)
    formData.append('domain', data.domain)
    formData.append('participant_level', data.participant_level)
    if (data.orientation) formData.append('orientation', data.orientation)
    if (data.reference_file) formData.append('reference_file', data.reference_file)
    const res = await fetch(`${API_BASE}/api/trainings/wizard/suggest-structure`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Erro ${res.status}`)
    }
    return res.json()
  }
  wizardCreateTraining(data: {
    title: string; description?: string; domain: string;
    participant_level: string; estimated_duration_minutes: number;
    xp_reward: number; chapters: { title: string; description?: string }[]
  }) {
    return this.request<import('@/types').Training>('/api/trainings/wizard', {
      method: 'POST', body: JSON.stringify(data),
    })
  }

  // Training Final Quiz (Admin)
  createTrainingQuiz(trainingId: string, data?: { title?: string; passing_score?: number; max_attempts?: number }) {
    return this.request<import('@/types').TrainingQuiz>(`/api/trainings/${trainingId}/quiz`, {
      method: 'POST', body: data ? JSON.stringify(data) : undefined,
    })
  }
  getTrainingQuiz(trainingId: string) {
    return this.request<import('@/types').TrainingQuiz | null>(`/api/trainings/${trainingId}/quiz`)
  }
  updateTrainingQuiz(trainingId: string, data: { title?: string; passing_score?: number; max_attempts?: number }) {
    return this.request<import('@/types').TrainingQuiz>(`/api/trainings/${trainingId}/quiz`, {
      method: 'PUT', body: JSON.stringify(data),
    })
  }
  deleteTrainingQuiz(trainingId: string) {
    return this.request<void>(`/api/trainings/${trainingId}/quiz`, { method: 'DELETE' })
  }
  addTrainingQuizQuestion(trainingId: string, data: Record<string, unknown>) {
    return this.request<import('@/types').TrainingQuizQuestion>(`/api/trainings/${trainingId}/quiz/questions`, {
      method: 'POST', body: JSON.stringify(data),
    })
  }
  updateTrainingQuizQuestion(trainingId: string, questionId: string, data: Record<string, unknown>) {
    return this.request<import('@/types').TrainingQuizQuestion>(`/api/trainings/${trainingId}/quiz/questions/${questionId}`, {
      method: 'PUT', body: JSON.stringify(data),
    })
  }
  deleteTrainingQuizQuestion(trainingId: string, questionId: string) {
    return this.request<void>(`/api/trainings/${trainingId}/quiz/questions/${questionId}`, { method: 'DELETE' })
  }
  generateTrainingQuiz(trainingId: string, opts?: { num_questions?: number; difficulty?: string; orientation?: string }) {
    return this.request<{ quiz_id: string; questions_count: number; questions: import('@/types').TrainingQuizQuestion[] }>(
      `/api/trainings/${trainingId}/quiz/generate`, {
        method: 'POST',
        body: opts ? JSON.stringify(opts) : undefined,
      }
    )
  }
  unlockQuizRetry(trainingId: string, enrollmentId: string) {
    return this.request<import('@/types').TrainingEnrollment>(`/api/trainings/${trainingId}/enrollments/${enrollmentId}/unlock-quiz`, {
      method: 'POST',
    })
  }

  // Trainings — Manager
  getUserEnrollments(userId: string) {
    return this.request<import('@/types').UserEnrollmentSummary[]>(`/api/trainings/manager/users/${userId}/enrollments`)
  }
  resetEnrollment(trainingId: string, enrollmentId: string) {
    return this.request<import('@/types').TrainingEnrollment>(`/api/trainings/${trainingId}/enrollments/${enrollmentId}/reset`, {
      method: 'POST',
    })
  }

  // Trainings — Professional
  getMyTrainings() {
    return this.request<import('@/types').MyTrainingSummary[]>('/api/trainings/my/trainings')
  }
  getMyPendingTrainings() {
    return this.request<import('@/types').PendingItem[]>('/api/trainings/my/pending')
  }
  getTrainingProgress(trainingId: string) {
    return this.request<import('@/types').TrainingProgressOut>(`/api/trainings/my/trainings/${trainingId}/progress`)
  }
  markModuleViewed(trainingId: string, moduleId: string) {
    return this.request<import('@/types').ModuleProgressOut>(`/api/trainings/my/trainings/${trainingId}/modules/${moduleId}/view`, { method: 'POST' })
  }
  submitQuizAttempt(trainingId: string, moduleId: string, answers: Record<string, string>) {
    return this.request<import('@/types').QuizAttemptOut>(`/api/trainings/my/trainings/${trainingId}/modules/${moduleId}/quiz/attempt`, {
      method: 'POST', body: JSON.stringify({ answers }),
    })
  }
  submitTrainingQuizAttempt(trainingId: string, answers: Record<string, string>) {
    return this.request<import('@/types').TrainingQuizAttemptOut>(`/api/trainings/my/trainings/${trainingId}/quiz/attempt`, {
      method: 'POST', body: JSON.stringify({ answers }),
    })
  }
  getTrainingQuizAttempts(trainingId: string) {
    return this.request<import('@/types').TrainingQuizAttemptOut[]>(`/api/trainings/my/trainings/${trainingId}/quiz/attempts`)
  }

  // Settings
  getSettings() {
    return this.request<{ key: string; value: string; description: string | null }[]>('/api/settings')
  }
  updateSettings(settings: Record<string, string>) {
    return this.request<{ key: string; value: string; description: string | null }[]>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    })
  }

  // Certificates — Admin
  getCertificateSettings() {
    return this.request<import('@/types').CertificateSettings>('/api/certificates/settings')
  }
  updateCertificateSettings(data: {
    company_name?: string; signer_name?: string; signer_title?: string;
    signature_style?: string; extra_text?: string | null;
    primary_color?: string; secondary_color?: string;
  }) {
    return this.request<import('@/types').CertificateSettings>('/api/certificates/settings', {
      method: 'PUT', body: JSON.stringify(data),
    })
  }
  async uploadCertificateLogo(file: File): Promise<import('@/types').CertificateSettings> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/certificates/settings/logo`, {
      method: 'POST', body: formData, credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Erro ${res.status}`)
    }
    return res.json()
  }
  async uploadCertificateSignatureImage(file: File): Promise<import('@/types').CertificateSettings> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/certificates/settings/signature-image`, {
      method: 'POST', body: formData, credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Erro ${res.status}`)
    }
    return res.json()
  }
  getCertificateLogoUrl() {
    return `${API_BASE}/api/certificates/settings/logo-file`
  }
  getCertificateSignatureUrl() {
    return `${API_BASE}/api/certificates/settings/signature-file`
  }

  // Certificates — Professional
  issueCertificate(enrollmentId: string) {
    return this.request<import('@/types').CertificateOut>(`/api/certificates/issue/${enrollmentId}`, { method: 'POST' })
  }
  getMyCertificates() {
    return this.request<import('@/types').CertificateOut[]>('/api/certificates/my')
  }
  getCertificateForEnrollment(enrollmentId: string) {
    return this.request<import('@/types').CertificateOut | null>(`/api/certificates/enrollment/${enrollmentId}`)
  }
  getCertificateView(certificateId: string) {
    return this.request<import('@/types').CertificateView>(`/api/certificates/${certificateId}/view`)
  }
  getCertificateFileUrl(type: 'logo' | 'signature', certificateId: string) {
    return `${API_BASE}/api/certificates/files/${type}/${certificateId}`
  }
}

export const api = new ApiClient()
