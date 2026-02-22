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
  type: 'hard' | 'soft'
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

// Streak
export interface UserStreak {
  current_streak: number
  longest_streak: number
  total_active_days: number
}

// Tutor Summary
export interface TutorSummary {
  desempenho: string
  competencias_treinadas: string[]
  pontos_fortes: string[]
  areas_melhoria: string[]
  proximos_passos: string[]
  nota_sessao: number
}

// Suggested Topic
export interface SuggestedTopic {
  label: string
  topic: string
  source: 'product' | 'gap' | 'default'
}

// OCR Upload types
export type OCRUploadStatus = 'uploaded' | 'processing' | 'processed' | 'reviewed' | 'error'

export interface OCRExtractedResponse {
  question_order: number
  question_id: string | null
  extracted_text: string
  confidence: number | null
}

export interface OCRUpload {
  id: string
  participation_id: string | null
  original_filename: string
  status: OCRUploadStatus
  extracted_responses: OCRExtractedResponse[] | null
  import_report: OCRImportReport | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface OCRImportedUser {
  user_name: string
  user_email: string
  participation_id: string | null
  ocr_upload_id: string | null
  status: 'ok' | 'not_found' | 'no_journey' | 'created'
}

export interface OCRImportFailure {
  message: string
  details: string | null
}

export interface OCRImportReport {
  journey_title: string | null
  journey_id: string | null
  users_imported: OCRImportedUser[]
  failures: OCRImportFailure[]
  total_pages: number
  total_respondents_found: number
  ocr_upload_ids: string[]
}

// Suggested Learning Path
export interface SuggestedPath {
  path_id: string
  title: string
  description: string | null
  domain: string
  target_role: string
  relevance: string
  matching_competencies: string[]
}

// Training types
export type TrainingStatus = 'draft' | 'published' | 'archived'
export type ModuleContentType = 'document' | 'scorm' | 'ai_generated' | 'rich_text'
export type QuizQuestionType = 'multiple_choice' | 'true_false' | 'essay'
export type EnrollmentStatus = 'pending' | 'in_progress' | 'completed'

export interface Training {
  id: string
  title: string
  description: string | null
  domain: string
  participant_level: string
  status: TrainingStatus
  estimated_duration_minutes: number
  xp_reward: number
  cover_image_path: string | null
  created_by: string
  created_at: string
  updated_at: string
  modules?: TrainingModule[]
}

export interface TrainingModule {
  id: string
  training_id: string
  title: string
  description: string | null
  order: number
  content_type: ModuleContentType | null
  content_data: Record<string, unknown> | null
  file_path: string | null
  original_filename: string | null
  mime_type: string | null
  has_quiz: boolean
  quiz_required_to_advance: boolean
  xp_reward: number
  created_at: string
  quiz?: ModuleQuiz | null
}

export interface ModuleQuiz {
  id: string
  module_id: string
  title: string
  passing_score: number
  created_at: string
  questions: QuizQuestion[]
}

export interface QuizQuestion {
  id: string
  quiz_id: string
  text: string
  type: QuizQuestionType
  options: { text: string; is_correct?: boolean }[] | null
  correct_answer: string | null
  explanation: string | null
  weight: number
  order: number
  created_at: string
}

export interface TrainingEnrollment {
  id: string
  training_id: string
  user_id: string
  status: EnrollmentStatus
  current_module_order: number
  enrolled_at: string
  completed_at: string | null
  user_name?: string | null
  user_email?: string | null
  training_title?: string | null
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
