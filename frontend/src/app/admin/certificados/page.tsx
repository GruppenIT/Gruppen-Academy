'use client'

import { useEffect, useState, useRef } from 'react'
import { api } from '@/lib/api'
import type { CertificateSettings } from '@/types'
import {
  GraduationCap, Upload, Save, Loader2, Image, Palette, PenLine, Type, Minus, Check,
} from 'lucide-react'
import { clsx } from 'clsx'

const SIGNATURE_STYLES = [
  { value: 'line', label: 'Linha', description: 'Linha simples com nome abaixo', icon: Minus },
  { value: 'typed', label: 'Digitada', description: 'Nome estilizado como assinatura', icon: Type },
  { value: 'image', label: 'Imagem', description: 'Upload de imagem da assinatura', icon: PenLine },
]

export default function CertificadosAdminPage() {
  const [settings, setSettings] = useState<CertificateSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [logoHeight, setLogoHeight] = useState(56)
  const [companyName, setCompanyName] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [signatureStyle, setSignatureStyle] = useState('line')
  const [extraText, setExtraText] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#1e40af')
  const [secondaryColor, setSecondaryColor] = useState('#1e3a5f')

  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingSig, setUploadingSig] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)
  const sigRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.getCertificateSettings()
      .then((s) => {
        setSettings(s)
        setLogoHeight(s.logo_height ?? 56)
        setCompanyName(s.company_name)
        setSignerName(s.signer_name)
        setSignerTitle(s.signer_title)
        setSignatureStyle(s.signature_style)
        setExtraText(s.extra_text || '')
        setPrimaryColor(s.primary_color)
        setSecondaryColor(s.secondary_color)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const updated = await api.updateCertificateSettings({
        company_name: companyName,
        signer_name: signerName,
        signer_title: signerTitle,
        signature_style: signatureStyle,
        extra_text: extraText || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        logo_height: logoHeight,
      })
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const updated = await api.uploadCertificateLogo(file)
      setSettings(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload')
    } finally {
      setUploadingLogo(false)
      if (logoRef.current) logoRef.current.value = ''
    }
  }

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingSig(true)
    try {
      const updated = await api.uploadCertificateSignatureImage(file)
      setSettings(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload')
    } finally {
      setUploadingSig(false)
      if (sigRef.current) sigRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/3" />
        <div className="h-40 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-brand-600" />
          Certificados
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Personalize a aparência dos certificados emitidos ao concluir treinamentos.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {/* Logo Upload */}
      <section className="card p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Image className="w-4 h-4 text-gray-500" />
          Logo da empresa
        </h3>
        <div className="flex items-center gap-4">
          {settings?.logo_path ? (
            <div className="w-32 h-16 border rounded-lg overflow-hidden bg-white flex items-center justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={api.getCertificateLogoUrl()}
                alt="Logo"
                className="max-h-full max-w-full object-contain"
                crossOrigin="use-credentials"
              />
            </div>
          ) : (
            <div className="w-32 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs">
              Sem logo
            </div>
          )}
          <div>
            <button
              onClick={() => logoRef.current?.click()}
              disabled={uploadingLogo}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {settings?.logo_path ? 'Trocar logo' : 'Enviar logo'}
            </button>
            <p className="text-xs text-gray-400 mt-1">PNG, JPEG, WebP ou SVG. Max 5 MB.</p>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>
        </div>
        {settings?.logo_path && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tamanho do logo no certificado: <span className="font-bold text-brand-600">{logoHeight}px</span>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">24px</span>
              <input
                type="range"
                min={24}
                max={120}
                step={4}
                value={logoHeight}
                onChange={(e) => setLogoHeight(Number(e.target.value))}
                className="flex-1 accent-brand-600"
              />
              <span className="text-xs text-gray-400">120px</span>
            </div>
          </div>
        )}
      </section>

      {/* Company & Signer Info */}
      <section className="card p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <PenLine className="w-4 h-4 text-gray-500" />
          Informações do certificado
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="input-field"
              placeholder="Gruppen"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome de quem assina</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="input-field"
              placeholder="Ex: João Silva"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo de quem assina</label>
            <input
              type="text"
              value={signerTitle}
              onChange={(e) => setSignerTitle(e.target.value)}
              className="input-field"
              placeholder="Ex: Diretor de Treinamento"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Texto extra (opcional)</label>
            <input
              type="text"
              value={extraText}
              onChange={(e) => setExtraText(e.target.value)}
              className="input-field"
              placeholder="Ex: Este certificado é válido como horas complementares."
            />
          </div>
        </div>
      </section>

      {/* Signature Style */}
      <section className="card p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <PenLine className="w-4 h-4 text-gray-500" />
          Estilo de assinatura
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SIGNATURE_STYLES.map((style) => {
            const Icon = style.icon
            const selected = signatureStyle === style.value
            return (
              <button
                key={style.value}
                onClick={() => setSignatureStyle(style.value)}
                className={clsx(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  selected
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={clsx('w-5 h-5', selected ? 'text-brand-600' : 'text-gray-400')} />
                  {selected && <Check className="w-4 h-4 text-brand-600" />}
                </div>
                <p className={clsx('text-sm font-medium', selected ? 'text-brand-700' : 'text-gray-700')}>
                  {style.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{style.description}</p>
              </button>
            )
          })}
        </div>

        {signatureStyle === 'image' && (
          <div className="flex items-center gap-4 pt-2">
            {settings?.signature_image_path ? (
              <div className="w-40 h-16 border rounded-lg overflow-hidden bg-white flex items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={api.getCertificateSignatureUrl()}
                  alt="Assinatura"
                  className="max-h-full max-w-full object-contain"
                  crossOrigin="use-credentials"
                />
              </div>
            ) : (
              <div className="w-40 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                Sem imagem
              </div>
            )}
            <div>
              <button
                onClick={() => sigRef.current?.click()}
                disabled={uploadingSig}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                {uploadingSig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {settings?.signature_image_path ? 'Trocar imagem' : 'Enviar imagem'}
              </button>
              <p className="text-xs text-gray-400 mt-1">PNG ou JPEG com fundo transparente. Max 5 MB.</p>
              <input ref={sigRef} type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} />
            </div>
          </div>
        )}

        {signatureStyle === 'typed' && signerName && (
          <div className="pt-2">
            <p className="text-xs text-gray-400 mb-1">Pré-visualização:</p>
            <p className="text-2xl italic text-gray-700" style={{ fontFamily: 'Georgia, serif' }}>
              {signerName}
            </p>
          </div>
        )}
      </section>

      {/* Colors */}
      <section className="card p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Palette className="w-4 h-4 text-gray-500" />
          Cores do certificado
        </h3>
        <div className="flex gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cor primária</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border-0"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="input-field w-28 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cor secundária</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border-0"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="input-field w-28 text-sm"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-6 py-2.5 flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar configurações
        </button>
        {saved && (
          <span className="text-sm text-emerald-600 flex items-center gap-1">
            <Check className="w-4 h-4" /> Salvo com sucesso
          </span>
        )}
      </div>

      {/* Preview */}
      <section className="card p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Pré-visualização</h3>
        <div
          className="border-2 rounded-xl p-8 bg-white relative overflow-hidden"
          style={{ borderColor: primaryColor }}
        >
          {/* Decorative border */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-2" style={{ background: primaryColor }} />
            <div className="absolute bottom-0 left-0 w-full h-2" style={{ background: secondaryColor }} />
          </div>

          <div className="text-center space-y-4 py-4">
            {settings?.logo_path && (
              <div className="flex justify-center mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={api.getCertificateLogoUrl()}
                  alt="Logo"
                  className="object-contain"
                  style={{ height: `${logoHeight}px` }}
                  crossOrigin="use-credentials"
                />
              </div>
            )}
            <p className="text-xs uppercase tracking-widest" style={{ color: secondaryColor }}>
              {companyName || 'Gruppen'}
            </p>
            <h4 className="text-2xl font-bold" style={{ color: primaryColor }}>
              Certificado de Conclusão
            </h4>
            <p className="text-sm text-gray-500">
              Certificamos que <span className="font-semibold text-gray-800">Nome do Profissional</span> concluiu
              com sucesso o treinamento <span className="font-semibold text-gray-800">Nome do Treinamento</span>.
            </p>
            {extraText && <p className="text-xs text-gray-400 italic">{extraText}</p>}

            <div className="pt-8">
              {signatureStyle === 'line' && (
                <div className="inline-block">
                  <div className="w-48 border-b border-gray-400 mb-1" />
                  <p className="text-sm font-medium text-gray-700">{signerName || 'Nome do assinante'}</p>
                  <p className="text-xs text-gray-400">{signerTitle || 'Cargo'}</p>
                </div>
              )}
              {signatureStyle === 'typed' && (
                <div className="inline-block">
                  <p className="text-2xl italic text-gray-600 mb-1" style={{ fontFamily: 'Georgia, serif' }}>
                    {signerName || 'Nome do assinante'}
                  </p>
                  <p className="text-xs text-gray-400">{signerTitle || 'Cargo'}</p>
                </div>
              )}
              {signatureStyle === 'image' && (
                <div className="inline-block">
                  {settings?.signature_image_path ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={api.getCertificateSignatureUrl()}
                        alt="Assinatura"
                        className="h-12 mx-auto mb-1 object-contain"
                        crossOrigin="use-credentials"
                      />
                    </>
                  ) : (
                    <div className="w-40 h-12 border-2 border-dashed border-gray-200 rounded mx-auto mb-1 flex items-center justify-center text-gray-300 text-xs">
                      Imagem da assinatura
                    </div>
                  )}
                  <p className="text-sm font-medium text-gray-700">{signerName || 'Nome do assinante'}</p>
                  <p className="text-xs text-gray-400">{signerTitle || 'Cargo'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
