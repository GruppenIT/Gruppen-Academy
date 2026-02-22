const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

class ApiClient {
  private token: string | null = null

  setToken(token: string | null) {
    this.token = token
    if (token) {
      if (typeof window !== 'undefined') localStorage.setItem('token', token)
    } else {
      if (typeof window !== 'undefined') localStorage.removeItem('token')
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('token')
    }
    return this.token
  }

  private async request<T>(path: string, options: RequestInit = {}, timeoutMs?: number): Promise<T> {
    const token = this.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const controller = new AbortController()
    const timeout = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined
    const fetchOptions = { ...options, headers, signal: controller.signal }

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
      this.setToken(null)
      if (typeof window !== 'undefined') window.location.href = '/login'
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
    })
    if (!res.ok) throw new Error('Credenciais inválidas')
    const json = await res.json()
    this.setToken(json.access_token)
    return json
  }

  logout() {
    this.setToken(null)
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
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || 'Falha na autenticação SSO')
    }
    const json = await res.json()
    this.setToken(json.access_token)
    return json
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
    const token = this.getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${API_BASE}/api/journeys/${journeyId}/print-pdf`, { headers })
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
  async uploadOCRPdf(participationId: string, file: File) {
    const token = this.getToken()
    const formData = new FormData()
    formData.append('file', file)
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${API_BASE}/api/journeys/participations/${participationId}/ocr-upload`, {
      method: 'POST',
      headers,
      body: formData,
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
  getLearningPaths(domain?: string) {
    const q = domain ? `?domain=${domain}` : ''
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
  copilotGenerateJourney(data: { title: string; domain: string; session_duration_minutes: number; participant_level: string; product_ids: string[]; description?: string; mode?: string }) {
    return this.request<import('@/types').CopilotJourneyGenerateResponse>('/api/copilot/generate-journey', { method: 'POST', body: JSON.stringify(data) }, 150000)
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
}

export const api = new ApiClient()
