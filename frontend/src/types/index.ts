export type UserRole = 'super_admin' | 'admin' | 'manager' | 'professional'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  department: string | null
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  name: string
  description: string
  target_persona: string | null
  common_pain_points: string | null
  typical_objections: string | null
  differentials: string | null
  priority: number
  is_active: boolean
}

export interface Competency {
  id: string
  name: string
  description: string
  type: 'HARD' | 'SOFT'
  domain: string
}

export interface MasterGuideline {
  id: string
  product_id: string
  title: string
  content: string
  category: string
  created_at: string
}

export interface Journey {
  id: string
  title: string
  description: string | null
  domain: string
  session_duration_minutes: number
  participant_level: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  created_at: string
  questions?: Question[]
}

export interface Question {
  id: string
  text: string
  type: 'ESSAY' | 'CASE_STUDY' | 'ROLEPLAY' | 'OBJECTIVE'
  weight: number
  rubric: Record<string, unknown> | null
  expected_lines: number
  order: number
}

export interface LearningPath {
  id: string
  title: string
  description: string | null
  domain: string
  target_role: string
  is_active: boolean
  activities?: LearningActivity[]
}

export interface LearningActivity {
  id: string
  title: string
  description: string | null
  type: 'QUIZ' | 'SIMULATION' | 'CASE_STUDY' | 'GUIDED_CHAT' | 'MICROLESSON'
  content: Record<string, unknown> | null
  order: number
  points_reward: number
}

export interface TutorSession {
  id: string
  topic: string
  messages: TutorMessage[]
  summary: Record<string, unknown> | null
  created_at: string
}

export interface TutorMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface Score {
  id: string
  user_id: string
  points: number
  source: string
  description: string | null
  created_at: string
}

export interface UserPointsSummary {
  user_id: string
  total_points: number
  scores_count: number
  full_name?: string
}

export interface Badge {
  id: string
  name: string
  description: string
  icon: string | null
  criteria: string
  points_threshold: number | null
}

export interface UserBadge {
  id: string
  badge: Badge
  earned_at: string
}

export interface Evaluation {
  id: string
  score_global: number
  criteria: EvaluationCriteria[]
  general_comment: string
  recommendations: string[]
  mapped_competencies: string[]
  status: 'PENDING' | 'EVALUATED' | 'REVIEWED' | 'SENT'
}

export interface EvaluationCriteria {
  nome: string
  peso: number
  nota: number
  comentario: string
}

// Gamification levels
export const LEVELS = [
  { name: 'Iniciante', minPoints: 0, icon: '🌱' },
  { name: 'Aprendiz', minPoints: 100, icon: '📚' },
  { name: 'Praticante', minPoints: 300, icon: '⚡' },
  { name: 'Especialista', minPoints: 600, icon: '🎯' },
  { name: 'Mestre', minPoints: 1000, icon: '🏆' },
  { name: 'Lenda', minPoints: 2000, icon: '👑' },
] as const

type Level = typeof LEVELS[number]

export function getUserLevel(points: number) {
  let current: Level = LEVELS[0]
  let next: Level = LEVELS[1]
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (points >= LEVELS[i].minPoints) {
      current = LEVELS[i]
      next = LEVELS[i + 1] || LEVELS[i]
      break
    }
  }
  const progressToNext = next.name === current.name
    ? 100
    : ((points - current.minPoints) / (next.minPoints - current.minPoints)) * 100
  return { current, next, progressToNext }
}
