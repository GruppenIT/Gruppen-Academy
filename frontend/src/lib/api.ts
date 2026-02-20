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

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

    if (res.status === 401) {
      this.setToken(null)
      if (typeof window !== 'undefined') window.location.href = '/login'
      throw new Error('Não autorizado')
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Erro ${res.status}`)
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
  createGuideline(data: { product_id?: string | null; title: string; content: string; category: string; is_corporate?: boolean }) {
    return this.request<import('@/types').MasterGuideline>('/api/catalog/guidelines', { method: 'POST', body: JSON.stringify(data) })
  }
  updateGuideline(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').MasterGuideline>(`/api/catalog/guidelines/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  // Journeys
  getJourneys(skip = 0, limit = 50) { return this.request<import('@/types').Journey[]>(`/api/journeys?skip=${skip}&limit=${limit}`) }
  getJourney(id: string) { return this.request<import('@/types').Journey>(`/api/journeys/${id}`) }
  getJourneyQuestions(id: string) { return this.request<import('@/types').Question[]>(`/api/journeys/${id}/questions`) }
  createJourney(data: { title: string; description?: string; domain?: string; session_duration_minutes?: number; participant_level?: string; product_ids?: string[]; competency_ids?: string[] }) {
    return this.request<import('@/types').Journey>('/api/journeys', { method: 'POST', body: JSON.stringify(data) })
  }
  updateJourney(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').Journey>(`/api/journeys/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  createQuestion(journeyId: string, data: { text: string; type?: string; weight?: number; rubric?: Record<string, unknown>; expected_lines?: number; order?: number; competency_ids?: string[] }) {
    return this.request<import('@/types').Question>(`/api/journeys/${journeyId}/questions`, { method: 'POST', body: JSON.stringify(data) })
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
  createActivity(pathId: string, data: { title: string; description?: string; type: string; content?: Record<string, unknown>; order?: number; points_reward?: number }) {
    return this.request<import('@/types').LearningActivity>(`/api/learning/paths/${pathId}/activities`, { method: 'POST', body: JSON.stringify(data) })
  }

  // Tutor
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

  // Gamification
  getMyPoints() { return this.request<import('@/types').UserPointsSummary>('/api/gamification/scores/me') }
  getMyHistory(skip = 0, limit = 20) { return this.request<import('@/types').Score[]>(`/api/gamification/scores/me/history?skip=${skip}&limit=${limit}`) }
  getLeaderboard(limit = 10) { return this.request<import('@/types').UserPointsSummary[]>(`/api/gamification/leaderboard?limit=${limit}`) }
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

  // Copilot
  copilotSuggestCompetencies() {
    return this.request<import('@/types').CopilotCompetencySuggestResponse>('/api/copilot/suggest-competencies', { method: 'POST' })
  }
  copilotCreateCompetenciesBulk(items: { name: string; description: string; type: string; domain: string }[]) {
    return this.request<{ created: { id: string; name: string }[]; count: number }>('/api/copilot/create-competencies-bulk', { method: 'POST', body: JSON.stringify({ items }) })
  }
  copilotSuggestGuidelines() {
    return this.request<import('@/types').CopilotGuidelineSuggestResponse>('/api/copilot/suggest-guidelines', { method: 'POST' })
  }
  copilotCreateGuidelinesBulk(items: { product_id?: string | null; title: string; content: string; category: string; is_corporate?: boolean }[]) {
    return this.request<{ created: { id: string; title: string }[]; count: number }>('/api/copilot/create-guidelines-bulk', { method: 'POST', body: JSON.stringify({ items }) })
  }
  copilotGenerateJourney(data: { title: string; domain: string; session_duration_minutes: number; participant_level: string; product_ids: string[]; description?: string }) {
    return this.request<import('@/types').CopilotJourneyGenerateResponse>('/api/copilot/generate-journey', { method: 'POST', body: JSON.stringify(data) })
  }
}

export const api = new ApiClient()
