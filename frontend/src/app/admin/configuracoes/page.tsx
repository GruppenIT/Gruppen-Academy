'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  Globe, Save, Loader2, CheckCircle2, AlertCircle, Shield,
  Copy, Eye, EyeOff, ChevronDown, ChevronUp,
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

const SSO_STEPS = [
  {
    title: 'Criar App Registration no Microsoft Entra ID',
    content: [
      'Acesse o portal Azure (portal.azure.com) e navegue até Microsoft Entra ID > App registrations.',
      'Clique em "New registration".',
      'Preencha o nome (ex: "Gruppen Academy SSO").',
      'Em "Supported account types", selecione "Accounts in this organizational directory only (Single tenant)".',
      'Em "Redirect URI", selecione "Web" e insira a URL de callback (ex: https://academy.gruppen.com.br/auth/callback).',
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
    title: 'Configurar permissões de API (OpenID Connect)',
    content: [
      'No menu lateral do App Registration, clique em "API permissions".',
      'Verifique que a permissão "Microsoft Graph > User.Read" já está adicionada (vem por padrão).',
      'Clique em "Add a permission" > "Microsoft Graph" > "Delegated permissions".',
      'Adicione as permissões: "openid", "email" e "profile".',
      'Clique em "Grant admin consent" para aprovar as permissões.',
      'A autenticação usará OpenID Connect (OIDC) — não é necessário configurar SAML.',
    ],
  },
  {
    title: 'Atribuir Usuários',
    content: [
      'Navegue até Microsoft Entra ID > Enterprise applications.',
      'Localize a aplicação "Gruppen Academy SSO" e clique nela.',
      'Vá em "Users and groups".',
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
  const [ssoEnabled, setSsoEnabled] = useState(false)
  const [ssoTenantId, setSsoTenantId] = useState('')
  const [ssoClientId, setSsoClientId] = useState('')
  const [ssoClientSecret, setSsoClientSecret] = useState('')
  const [ssoRedirectUri, setSsoRedirectUri] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.getSettings()
      setSettings(data)
      for (const s of data) {
        switch (s.key) {
          case 'timezone': setTimezone(s.value || 'America/Sao_Paulo'); break
          case 'sso_enabled': setSsoEnabled(s.value === 'true'); break
          case 'sso_tenant_id': setSsoTenantId(s.value); break
          case 'sso_client_id': setSsoClientId(s.value); break
          case 'sso_client_secret': setSsoClientSecret(s.value); break
          case 'sso_redirect_uri': setSsoRedirectUri(s.value); break
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
        sso_enabled: ssoEnabled ? 'true' : 'false',
        sso_tenant_id: ssoTenantId,
        sso_client_id: ssoClientId,
        sso_client_secret: ssoClientSecret,
        sso_redirect_uri: ssoRedirectUri,
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

      {/* ── Microsoft 365 SSO Section ── */}
      <section className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <Shield className="w-5 h-5 text-violet-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Single Sign-On — Microsoft Entra ID</h2>
            <p className="text-sm text-gray-500">Configure o login via credenciais corporativas Microsoft 365 usando OpenID Connect (OIDC).</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">{ssoEnabled ? 'Ativo' : 'Inativo'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={ssoEnabled}
              onClick={() => setSsoEnabled(!ssoEnabled)}
              className={clsx(
                'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
                ssoEnabled ? 'bg-brand-600' : 'bg-gray-200'
              )}
            >
              <span
                className={clsx(
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5',
                  ssoEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                )}
              />
            </button>
          </label>
        </div>

        {/* Step-by-step Guide */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Passo a passo da integração</h3>
          <div className="space-y-2">
            {SSO_STEPS.map((step, index) => (
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

        {/* SSO Config Fields */}
        <div className="border-t border-gray-200 pt-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Parâmetros de Configuração</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tenant ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tenant ID</label>
              <div className="relative">
                <input
                  type="text"
                  value={ssoTenantId}
                  onChange={(e) => setSsoTenantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="input-field pr-10 font-mono text-sm"
                />
                {ssoTenantId && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(ssoTenantId)}
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
                  value={ssoClientId}
                  onChange={(e) => setSsoClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="input-field pr-10 font-mono text-sm"
                />
                {ssoClientId && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(ssoClientId)}
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
                value={ssoClientSecret}
                onChange={(e) => setSsoClientSecret(e.target.value)}
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
                {ssoClientSecret && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(ssoClientSecret)}
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

          {/* Redirect URI */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Redirect URI (Callback)</label>
            <div className="relative">
              <input
                type="url"
                value={ssoRedirectUri}
                onChange={(e) => setSsoRedirectUri(e.target.value)}
                placeholder="https://academy.gruppen.com.br/auth/callback"
                className="input-field pr-10 font-mono text-sm"
              />
              {ssoRedirectUri && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(ssoRedirectUri)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title="Copiar"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">URL para onde o Azure redireciona após o login. Deve ser a mesma configurada no App Registration.</p>
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
