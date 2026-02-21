'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  Globe, Save, Loader2, CheckCircle2, AlertCircle, Shield,
  ExternalLink, Copy, Eye, EyeOff, ChevronDown, ChevronUp,
} from 'lucide-react'
import { clsx } from 'clsx'

interface SettingItem {
  key: string
  value: string
  description: string | null
}

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Fortaleza',
  'America/Manaus',
  'America/Rio_Branco',
  'America/Noronha',
  'America/Bahia',
  'America/Belem',
  'America/Cuiaba',
  'America/Campo_Grande',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Maceio',
  'America/Recife',
  'America/Araguaina',
  'America/Santarem',
  'America/Eirunepe',
  'UTC',
  'US/Eastern',
  'US/Central',
  'US/Mountain',
  'US/Pacific',
  'Europe/London',
  'Europe/Lisbon',
]

const SAML_STEPS = [
  {
    title: 'Criar App Registration no Microsoft Entra ID',
    content: [
      'Acesse o portal Azure (portal.azure.com) e navegue até Microsoft Entra ID > App registrations.',
      'Clique em "New registration".',
      'Preencha o nome (ex: "Gruppen Academy SSO").',
      'Em "Supported account types", selecione "Accounts in this organizational directory only (Single tenant)".',
      'Em "Redirect URI", selecione "Web" e insira a URL de callback da sua aplicação (ex: https://academy.gruppen.com.br/api/auth/saml/callback).',
      'Clique em "Register".',
    ],
  },
  {
    title: 'Obter Tenant ID e Client ID',
    content: [
      'Após criar o App Registration, você será redirecionado para a página do aplicativo.',
      'Na seção "Overview", copie o "Application (client) ID" — este é o Client ID.',
      'Copie também o "Directory (tenant) ID" — este é o Tenant ID.',
      'Cole ambos os valores nos campos correspondentes abaixo.',
    ],
  },
  {
    title: 'Gerar Client Secret',
    content: [
      'No menu lateral do App Registration, clique em "Certificates & secrets".',
      'Na aba "Client secrets", clique em "New client secret".',
      'Adicione uma descrição (ex: "Gruppen Academy") e selecione a validade desejada.',
      'Clique em "Add".',
      'IMPORTANTE: Copie o valor do secret imediatamente — ele não será exibido novamente.',
      'Cole o valor no campo "Client Secret" abaixo.',
    ],
  },
  {
    title: 'Configurar SAML (Enterprise Application)',
    content: [
      'Navegue até Microsoft Entra ID > Enterprise applications.',
      'Localize a aplicação que você registrou e clique nela.',
      'Vá em "Single sign-on" e selecione "SAML" como método.',
      'Em "Basic SAML Configuration", configure:',
      '  — Identifier (Entity ID): https://academy.gruppen.com.br',
      '  — Reply URL (ACS URL): https://academy.gruppen.com.br/api/auth/saml/callback',
      '  — Sign on URL: https://academy.gruppen.com.br/login',
      'Em "SAML Certificates", copie a "App Federation Metadata Url" e cole no campo abaixo.',
    ],
  },
  {
    title: 'Atribuir Usuários',
    content: [
      'Ainda no Enterprise Application, vá em "Users and groups".',
      'Clique em "Add user/group".',
      'Selecione os usuários ou grupos que terão acesso via SSO.',
      'Clique em "Assign".',
      'Os usuários atribuídos poderão fazer login na Gruppen Academy com suas credenciais Microsoft 365.',
    ],
  },
]

export default function AdminConfiguracoesPage() {
  const [settings, setSettings] = useState<SettingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [expandedStep, setExpandedStep] = useState<number | null>(0)

  // Local form state
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [samlEnabled, setSamlEnabled] = useState(false)
  const [samlTenantId, setSamlTenantId] = useState('')
  const [samlClientId, setSamlClientId] = useState('')
  const [samlClientSecret, setSamlClientSecret] = useState('')
  const [samlMetadataUrl, setSamlMetadataUrl] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.getSettings()
      setSettings(data)
      for (const s of data) {
        switch (s.key) {
          case 'timezone': setTimezone(s.value || 'America/Sao_Paulo'); break
          case 'saml_enabled': setSamlEnabled(s.value === 'true'); break
          case 'saml_tenant_id': setSamlTenantId(s.value); break
          case 'saml_client_id': setSamlClientId(s.value); break
          case 'saml_client_secret': setSamlClientSecret(s.value); break
          case 'saml_metadata_url': setSamlMetadataUrl(s.value); break
        }
      }
    } catch {
      setError('Erro ao carregar configurações.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await api.updateSettings({
        timezone,
        saml_enabled: samlEnabled ? 'true' : 'false',
        saml_tenant_id: samlTenantId,
        saml_client_id: samlClientId,
        saml_client_secret: samlClientSecret,
        saml_metadata_url: samlMetadataUrl,
      })
      setSuccess('Configurações salvas com sucesso.')
      setTimeout(() => setSuccess(''), 4000)
    } catch {
      setError('Erro ao salvar configurações.')
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* Feedback */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-xl text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Timezone Section ── */}
      <section className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Globe className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Fuso Horário</h2>
            <p className="text-sm text-gray-500">Define o fuso horário utilizado em todas as datas e horários da plataforma.</p>
          </div>
        </div>

        <div className="max-w-sm">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Fuso horário do sistema
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="input-field"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1.5">
            Todas as datas exibidas na interface serão convertidas para este fuso horário.
          </p>
        </div>
      </section>

      {/* ── Microsoft 365 SAML Section ── */}
      <section className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <Shield className="w-5 h-5 text-violet-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Autenticação Microsoft 365 (SAML)</h2>
            <p className="text-sm text-gray-500">Configure o Single Sign-On com Microsoft Entra ID para permitir login via credenciais corporativas.</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">{samlEnabled ? 'Ativo' : 'Inativo'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={samlEnabled}
              onClick={() => setSamlEnabled(!samlEnabled)}
              className={clsx(
                'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
                samlEnabled ? 'bg-brand-600' : 'bg-gray-200'
              )}
            >
              <span
                className={clsx(
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5',
                  samlEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                )}
              />
            </button>
          </label>
        </div>

        {/* Step-by-step Guide */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Passo a passo da integração</h3>
          <div className="space-y-2">
            {SAML_STEPS.map((step, index) => (
              <div key={index} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedStep(expandedStep === index ? null : index)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                    expandedStep === index
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-500'
                  )}>
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-800 flex-1">{step.title}</span>
                  {expandedStep === index
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />
                  }
                </button>
                {expandedStep === index && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100">
                    <ol className="space-y-2">
                      {step.content.map((line, li) => (
                        <li key={li} className="flex gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 shrink-0">{li + 1}.</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* SAML Config Fields */}
        <div className="border-t border-gray-200 pt-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Parâmetros de Configuração</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tenant ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tenant ID</label>
              <div className="relative">
                <input
                  type="text"
                  value={samlTenantId}
                  onChange={(e) => setSamlTenantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="input-field pr-10 font-mono text-sm"
                />
                {samlTenantId && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(samlTenantId)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Copiar"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Directory (tenant) ID do Microsoft Entra ID</p>
            </div>

            {/* Client ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Client ID</label>
              <div className="relative">
                <input
                  type="text"
                  value={samlClientId}
                  onChange={(e) => setSamlClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="input-field pr-10 font-mono text-sm"
                />
                {samlClientId && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(samlClientId)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Copiar"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Application (client) ID do App Registration</p>
            </div>
          </div>

          {/* Client Secret */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Client Secret</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={samlClientSecret}
                onChange={(e) => setSamlClientSecret(e.target.value)}
                placeholder="Insira o client secret gerado no passo 3"
                className="input-field pr-20 font-mono text-sm"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-gray-400 hover:text-gray-600 p-0.5"
                  title={showSecret ? 'Ocultar' : 'Mostrar'}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {samlClientSecret && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(samlClientSecret)}
                    className="text-gray-400 hover:text-gray-600 p-0.5"
                    title="Copiar"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">Valor do secret gerado em Certificates & secrets. Armazene com segurança.</p>
          </div>

          {/* Federation Metadata URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Federation Metadata URL</label>
            <div className="relative">
              <input
                type="url"
                value={samlMetadataUrl}
                onChange={(e) => setSamlMetadataUrl(e.target.value)}
                placeholder="https://login.microsoftonline.com/{tenant-id}/federationmetadata/2007-06/federationmetadata.xml"
                className="input-field pr-10 font-mono text-sm"
              />
              {samlMetadataUrl && (
                <a
                  href={samlMetadataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-600"
                  title="Abrir URL"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">URL do XML de metadados SAML do Enterprise Application</p>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 px-6"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  )
}
