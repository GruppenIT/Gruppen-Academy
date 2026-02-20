'use client'

import { useState, useRef, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { TutorMessage } from '@/types'
import { useAuth } from '@/lib/auth'
import {
  MessageSquareMore, Send, Sparkles, Bot, User,
  Loader2, Plus, Lightbulb,
} from 'lucide-react'
import { clsx } from 'clsx'

const quickTopics = [
  { label: 'Pitch de BaaS', topic: 'Simulação de pitch do BaaS (Backup como Serviço) para um CTO' },
  { label: 'Objeções de preço', topic: 'Praticar respostas a objeções de preço em vendas de segurança' },
  { label: 'Discovery call', topic: 'Simular uma discovery call para identificar dores de segurança do cliente' },
  { label: 'Valor do SIEM', topic: 'Como explicar o valor de negócio do SIEM as a Service para um CFO' },
]

export default function TutorPage() {
  const { user } = useAuth()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startSession = async (topic: string) => {
    setStarting(true)
    try {
      const session = await api.createTutorSession(topic)
      setSessionId(session.id)
      setMessages(session.messages.filter(m => m.role !== 'system'))
    } catch {
      // handle error
    } finally {
      setStarting(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || sending) return
    const text = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setSending(true)
    try {
      const session = await api.sendTutorMessage(sessionId, text)
      setMessages(session.messages.filter(m => m.role !== 'system'))
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, ocorreu um erro. Tente novamente.' }])
    } finally {
      setSending(false)
    }
  }

  const resetSession = () => {
    setSessionId(null)
    setMessages([])
    setInput('')
  }

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
          {sessionId && (
            <button onClick={resetSession} className="btn-secondary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nova Sessão
            </button>
          )}
        </div>

        {!sessionId ? (
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

              {/* Quick topics */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {quickTopics.map((qt) => (
                  <button
                    key={qt.label}
                    onClick={() => startSession(qt.topic)}
                    disabled={starting}
                    className="card-hover p-4 text-left group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb className="w-4 h-4 text-brand-500" />
                      <span className="text-sm font-medium text-gray-900">{qt.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{qt.topic}</p>
                  </button>
                ))}
              </div>

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
        ) : (
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
