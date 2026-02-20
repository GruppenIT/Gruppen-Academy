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

  // Catalog
  getProducts(skip = 0, limit = 50) { return this.request<import('@/types').Product[]>(`/api/catalog/products?skip=${skip}&limit=${limit}`) }
  getProduct(id: string) { return this.request<import('@/types').Product>(`/api/catalog/products/${id}`) }
  getCompetencies(domain?: string) {
    const q = domain ? `?domain=${domain}` : ''
    return this.request<import('@/types').Competency[]>(`/api/catalog/competencies${q}`)
  }

  // Journeys
  getJourneys(skip = 0, limit = 50) { return this.request<import('@/types').Journey[]>(`/api/journeys?skip=${skip}&limit=${limit}`) }
  getJourney(id: string) { return this.request<import('@/types').Journey>(`/api/journeys/${id}`) }
  getJourneyQuestions(id: string) { return this.request<import('@/types').Question[]>(`/api/journeys/${id}/questions`) }

  // Learning
  getLearningPaths(domain?: string) {
    const q = domain ? `?domain=${domain}` : ''
    return this.request<import('@/types').LearningPath[]>(`/api/learning/paths${q}`)
  }
  getLearningPath(id: string) { return this.request<import('@/types').LearningPath>(`/api/learning/paths/${id}`) }
  getPathActivities(pathId: string) { return this.request<import('@/types').LearningActivity[]>(`/api/learning/paths/${pathId}/activities`) }

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
}

export const api = new ApiClient()
