'use client'

import { useState, useRef, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { TutorMessage, TutorSession, SuggestedTopic } from '@/types'
import {
  MessageSquareMore, Send, Sparkles, Bot, User,
  Loader2, Plus, Lightbulb, History, ChevronRight,
  FileText, Star, ArrowLeft, Target,
} from 'lucide-react'
import { clsx } from 'clsx'

export default function TutorPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)
  const [view, setView] = useState<'topics' | 'chat' | 'history'>('topics')
  const [pastSessions, setPastSessions] = useState<TutorSession[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [suggestedTopics, setSuggestedTopics] = useState<SuggestedTopic[]>([])
  const [loadingTopics, setLoadingTopics] = useState(true)
  const [currentSession, setCurrentSession] = useState<TutorSession | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    loadSuggestedTopics()
  }, [])

  const loadSuggestedTopics = async () => {
    setLoadingTopics(true)
    try {
      const topics = await api.getSuggestedTopics()
      setSuggestedTopics(topics)
    } catch {
      setSuggestedTopics([
        { label: 'Pitch de BaaS', topic: 'Simulação de pitch do BaaS (Backup como Serviço) para um CTO', source: 'default' },
        { label: 'Objeções de preço', topic: 'Praticar respostas a objeções de preço em vendas de segurança', source: 'default' },
        { label: 'Discovery call', topic: 'Simular uma discovery call para identificar dores de segurança do cliente', source: 'default' },
        { label: 'Valor do SIEM', topic: 'Como explicar o valor de negócio do SIEM as a Service para um CFO', source: 'default' },
      ])
    } finally {
      setLoadingTopics(false)
    }
  }

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const sessions = await api.listTutorSessions(0, 30)
      setPastSessions(sessions)
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false)
    }
    setView('history')
  }

  const startSession = async (topic: string) => {
    setStarting(true)
    try {
      const session = await api.createTutorSession(topic)
      setSessionId(session.id)
      setCurrentSession(session)
      setMessages(session.messages.filter(m => m.role !== 'system'))
      setView('chat')
    } catch {
      // handle error
    } finally {
      setStarting(false)
    }
  }

  const resumeSession = async (session: TutorSession) => {
    setSessionId(session.id)
    setCurrentSession(session)
    setMessages(session.messages.filter(m => m.role !== 'system'))
    setView('chat')
  }

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || sending) return
    const text = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setSending(true)
    try {
      const session = await api.sendTutorMessage(sessionId, text)
      setCurrentSession(session)
      setMessages(session.messages.filter(m => m.role !== 'system'))
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, ocorreu um erro. Tente novamente.' }])
    } finally {
      setSending(false)
    }
  }

  const handleGenerateSummary = async () => {
    if (!sessionId || generatingSummary) return
    setGeneratingSummary(true)
    try {
      const session = await api.generateSessionSummary(sessionId)
      setCurrentSession(session)
    } catch {
      // ignore
    } finally {
      setGeneratingSummary(false)
    }
  }

  const resetSession = () => {
    setSessionId(null)
    setCurrentSession(null)
    setMessages([])
    setInput('')
    setView('topics')
  }

  const userMsgCount = messages.filter(m => m.role === 'user').length
  const summary = currentSession?.summary as Record<string, unknown> | null

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquareMore className="w-6 h-6 text-brand-600" />
              Tutor IA
            </h1>
            <p className="text-gray-500 text-sm mt-1">Pratique situações reais com seu tutor inteligente.</p>
          </div>
          <div className="flex gap-2">
            {view !== 'topics' && (
              <button onClick={resetSession} className="btn-secondary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Nova Sessão
              </button>
            )}
            {view !== 'history' && (
              <button onClick={loadHistory} className="btn-secondary flex items-center gap-2">
                <History className="w-4 h-4" /> Histórico
              </button>
            )}
          </div>
        </div>

        {view === 'topics' && (
          /* Topic Selection */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-lg">
              <div className="w-20 h-20 rounded-3xl bg-brand-50 flex items-center justify-center mx-auto mb-6">
                <Bot className="w-10 h-10 text-brand-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Vamos praticar?</h2>
              <p className="text-gray-500 mb-8">
                Escolha um tema abaixo ou digite seu próprio tópico para iniciar uma sessão de prática guiada.
              </p>

              {/* Suggested topics */}
              {loadingTopics ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
              ) : (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {suggestedTopics.slice(0, 6).map((qt, idx) => (
                    <button
                      key={idx}
                      onClick={() => startSession(qt.topic)}
                      disabled={starting}
                      className="card-hover p-4 text-left group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {qt.source === 'gap' ? (
                          <Target className="w-4 h-4 text-amber-500" />
                        ) : qt.source === 'product' ? (
                          <Sparkles className="w-4 h-4 text-brand-500" />
                        ) : (
                          <Lightbulb className="w-4 h-4 text-brand-500" />
                        )}
                        <span className="text-sm font-medium text-gray-900">{qt.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2">{qt.topic}</p>
                      {qt.source === 'gap' && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded mt-1 inline-block">Área de melhoria</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Custom topic */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ou digite um tema personalizado..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && input.trim() && startSession(input.trim())}
                  className="input-field flex-1"
                />
                <button
                  onClick={() => input.trim() && startSession(input.trim())}
                  disabled={!input.trim() || starting}
                  className="btn-primary"
                >
                  {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Iniciar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'history' && (
          /* Session History */
          <div className="flex-1 overflow-y-auto">
            <button onClick={() => setView('topics')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Sessões anteriores</h2>
            {loadingHistory ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
            ) : pastSessions.length === 0 ? (
              <p className="text-gray-400 text-center py-12">Nenhuma sessão anterior encontrada.</p>
            ) : (
              <div className="space-y-2">
                {pastSessions.map((session) => {
                  const msgCount = session.messages.filter(m => m.role === 'user').length
                  const hasSummary = !!session.summary
                  return (
                    <button
                      key={session.id}
                      onClick={() => resumeSession(session)}
                      className="card-hover p-4 w-full text-left flex items-center gap-4"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                        <MessageSquareMore className="w-5 h-5 text-brand-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">{session.topic}</h4>
                        <p className="text-xs text-gray-400">
                          {msgCount} mensagens &bull; {new Date(session.created_at).toLocaleDateString('pt-BR')}
                          {hasSummary && ' \u2022 Resumo disponível'}
                        </p>
                      </div>
                      {hasSummary && <Star className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {view === 'chat' && (
          /* Chat Interface */
          <>
            <div className="flex-1 overflow-y-auto rounded-2xl bg-white border border-gray-100 p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={clsx('flex gap-3 animate-slide-up', msg.role === 'user' && 'flex-row-reverse')}
                >
                  <div className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    msg.role === 'user' ? 'bg-brand-100' : 'bg-gray-100'
                  )}>
                    {msg.role === 'user'
                      ? <User className="w-4 h-4 text-brand-700" />
                      : <Bot className="w-4 h-4 text-gray-600" />
                    }
                  </div>
                  <div className={clsx(
                    'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-brand-600 text-white rounded-br-md'
                      : 'bg-gray-50 text-gray-800 rounded-bl-md'
                  )}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Summary Section */}
            {summary && (
              <div className="mt-3 card p-4 bg-amber-50/50 border-amber-200">
                <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-amber-600" /> Resumo da Sessão
                </h4>
                <p className="text-sm text-gray-700 mb-2">{summary.desempenho as string}</p>
                {(summary.competencias_treinadas as string[])?.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs font-medium text-gray-500">Competências treinadas:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(summary.competencias_treinadas as string[]).map((c, i) => (
                        <span key={i} className="badge-pill bg-violet-100 text-violet-700 text-xs">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(summary.proximos_passos as string[])?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-gray-500">Próximos passos:</span>
                    <ul className="text-sm text-gray-600 mt-1 list-disc list-inside">
                      {(summary.proximos_passos as string[]).map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.nota_sessao != null && (
                  <div className="mt-2 text-sm">
                    <span className="text-gray-500">Nota: </span>
                    <span className="font-bold text-amber-700">{(summary.nota_sessao as number).toFixed(1)}/10</span>
                  </div>
                )}
              </div>
            )}

            {/* Generate Summary Button */}
            {!summary && userMsgCount >= 3 && (
              <div className="mt-2 flex justify-center">
                <button
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                  className="btn-secondary text-xs flex items-center gap-1"
                >
                  {generatingSummary ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                  Gerar resumo da sessão
                </button>
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                placeholder="Digite sua mensagem..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                className="input-field flex-1"
                disabled={sending}
                autoFocus
              />
              <button onClick={sendMessage} disabled={!input.trim() || sending} className="btn-primary px-4">
                <Send className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-gray-400">
              <Sparkles className="w-3 h-3" />
              Tutor IA da Gruppen Academy — respostas geradas por inteligência artificial
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
