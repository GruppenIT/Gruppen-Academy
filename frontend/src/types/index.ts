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
  technology: string | null
  priority: number
  is_active: boolean
}

export interface Competency {
  id: string
  name: string
  description: string
  type: 'HARD' | 'SOFT' | 'hard' | 'soft'
  domain: string
}

export interface MasterGuideline {
  id: string
  product_id: string | null
  title: string
  content: string
  category: string
  is_corporate: boolean
  domain: string | null
  created_at: string
}

export interface Team {
  id: string
  name: string
  description: string | null
  created_at: string
  members: TeamMember[]
}

export interface TeamMember {
  id: string
  email: string
  full_name: string
  role: string
  department: string | null
}

export type JourneyMode = 'sync' | 'async'

export interface Journey {
  id: string
  title: string
  description: string | null
  domain: string
  mode: JourneyMode
  session_duration_minutes: number
  participant_level: string
  status: string
  created_at: string
  questions?: Question[]
}

export interface Question {
  id: string
  text: string
  type: string
  weight: number
  rubric: Record<string, unknown> | null
  max_time_seconds: number | null
  expected_lines: number
  order: number
}

export interface AsyncQuestion {
  question_id: string
  text: string
  type: string
  order: number
  max_time_seconds: number | null
  expected_lines: number
  total_questions: number
  current_number: number
  already_answered: boolean
}

export interface ParticipationStatus {
  participation_id: string
  journey_id: string
  journey_title: string
  mode: string
  total_questions: number
  answered_questions: number
  current_question_order: number
  completed: boolean
  started_at: string
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
  response_id: string
  score_global: number
  criteria: { criterios?: EvaluationCriteria[] } & Record<string, unknown>
  general_comment: string
  recommendations: string[]
  mapped_competencies: string[]
  status: 'pending' | 'evaluated' | 'reviewed' | 'sent'
  reviewed_by: string | null
  review_notes: string | null
  created_at: string
}

export interface EvaluationCriteria {
  nome: string
  peso: number
  nota: number
  comentario: string
}

export interface ParticipationEvaluationSummary {
  participation_id: string
  journey_id: string
  journey_title: string
  user_id: string
  user_name: string
  user_email: string
  started_at: string | null
  completed_at: string | null
  total_responses: number
  evaluated_count: number
  has_report: boolean
}

export interface ParticipationResponseDetail {
  response_id: string
  question_id: string
  question_text: string
  question_type: string
  question_order: number
  answer_text: string
  evaluation: Evaluation | null
}

export interface UserParticipationSummary {
  participation_id: string
  journey_id: string
  journey_title: string
  journey_domain: string
  started_at: string | null
  completed_at: string | null
  total_responses: number
  evaluated_count: number
  avg_score: number | null
  report_id: string | null
}

export interface AnalyticalReport {
  id: string
  participation_id: string
  report_type: 'manager' | 'professional'
  content: Record<string, unknown>
  created_at: string
}

// Learning Path Progress types
export interface PathProgressActivity {
  activity_id: string
  title: string
  description: string | null
  type: string
  order: number
  points_reward: number
  completed: boolean
}

export interface PathProgress {
  total_activities: number
  completed_activities: number
  progress_percent: number
  activities: PathProgressActivity[]
}

// Manager Dashboard types
export interface ManagerTeamMemberSummary {
  user_id: string
  user_name: string
  user_email: string
  participations: number
  completed: number
  avg_score: number | null
}

export interface ManagerTeamSummary {
  team_id: string
  team_name: string
  member_count: number
  members: ManagerTeamMemberSummary[]
  total_participations: number
  completed_participations: number
  avg_score: number | null
}

export interface ManagerDashboard {
  total_teams: number
  total_members: number
  teams: ManagerTeamSummary[]
}

// Copilot types
export interface CopilotCompetencySuggestion {
  name: string
  description: string
  type: 'HARD' | 'SOFT'
  domain: string
  rationale: string
}

export interface CopilotCompetencySuggestResponse {
  suggestions: CopilotCompetencySuggestion[]
}

export interface CopilotGuidelineSuggestion {
  title: string
  content: string
  category: string
  product_id: string | null
  is_corporate: boolean
  rationale: string
}

export interface CopilotGuidelineSuggestResponse {
  suggestions: CopilotGuidelineSuggestion[]
}

export interface CopilotGeneratedQuestion {
  text: string
  type: string
  weight: number
  expected_lines: number
  max_time_seconds: number | null
  rubric: Record<string, unknown> | null
  competency_tags: string[]
}

export interface CopilotJourneyGenerateResponse {
  journey_id: string
  questions: CopilotGeneratedQuestion[]
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
