'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import type { CertificateView } from '@/types'
import { Printer, Loader2, AlertTriangle } from 'lucide-react'

export default function CertificateViewPage() {
  const params = useParams()
  const certificateId = params.id as string
  const [cert, setCert] = useState<CertificateView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getCertificateView(certificateId)
      .then(setCert)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [certificateId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !cert) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-700">Certificado não encontrado</h2>
          <p className="text-sm text-gray-400 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const issuedDate = new Date(cert.issued_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const completedDate = cert.completed_at
    ? new Date(cert.completed_at).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric',
      })
    : issuedDate

  const durationHours = Math.floor(cert.training_duration_minutes / 60)
  const durationMins = cert.training_duration_minutes % 60
  const durationText = durationHours > 0
    ? `${durationHours}h${durationMins > 0 ? `${durationMins}min` : ''}`
    : `${durationMins}min`

  return (
    <>
      <style jsx global>{`
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .certificate-page { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
          @page { size: landscape A4; margin: 0; }
        }
        .cert-layout {
          display: table;
          width: 100%;
          height: 100%;
          table-layout: fixed;
        }
        .cert-row {
          display: table-row;
        }
        .cert-cell {
          display: table-cell;
          vertical-align: middle;
          padding-left: 4rem;
          padding-right: 4rem;
        }
        .cert-cell-top {
          height: 30%;
          vertical-align: middle;
          padding-top: 3rem;
        }
        .cert-cell-middle {
          height: 40%;
          vertical-align: middle;
        }
        .cert-cell-bottom {
          height: 30%;
          vertical-align: bottom;
          padding-bottom: 3rem;
        }
      `}</style>

      {/* Print button */}
      <div className="no-print fixed top-4 right-4 z-50">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 rounded-xl shadow-lg hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Imprimir / Salvar PDF
        </button>
      </div>

      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8 print:p-0 print:bg-white">
        <div
          className="certificate-page bg-white shadow-2xl relative overflow-hidden"
          style={{
            width: '297mm',
            height: '210mm',
            maxWidth: '100%',
          }}
        >
          {/* Top decorative strip */}
          <div className="absolute top-0 left-0 w-full h-3" style={{ background: cert.primary_color }} />

          {/* Bottom decorative strip */}
          <div className="absolute bottom-0 left-0 w-full h-3" style={{ background: cert.secondary_color }} />

          {/* Corner decorations */}
          <div className="absolute top-3 left-0 w-24 h-24 opacity-10" style={{
            background: `radial-gradient(circle at top left, ${cert.primary_color} 0%, transparent 70%)`,
          }} />
          <div className="absolute top-3 right-0 w-24 h-24 opacity-10" style={{
            background: `radial-gradient(circle at top right, ${cert.primary_color} 0%, transparent 70%)`,
          }} />
          <div className="absolute bottom-3 left-0 w-24 h-24 opacity-10" style={{
            background: `radial-gradient(circle at bottom left, ${cert.secondary_color} 0%, transparent 70%)`,
          }} />
          <div className="absolute bottom-3 right-0 w-24 h-24 opacity-10" style={{
            background: `radial-gradient(circle at bottom right, ${cert.secondary_color} 0%, transparent 70%)`,
          }} />

          {/* Inner border */}
          <div
            className="absolute inset-6 border-2 rounded-sm pointer-events-none"
            style={{ borderColor: `${cert.primary_color}30` }}
          />

          {/* Content — three vertical sections using table layout for print consistency */}
          <div className="cert-layout relative">

            {/* Top: Logo + title */}
            <div className="cert-row">
              <div className="cert-cell cert-cell-top">
                <div className="text-center">
                  {cert.logo_url && (
                    <div className="flex justify-center mb-5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={api.getCertificateFileUrl('logo', cert.id)}
                        alt="Logo"
                        className="object-contain"
                        style={{ height: `${cert.logo_height ?? 56}px` }}
                        crossOrigin="use-credentials"
                      />
                    </div>
                  )}
                  <p
                    className="text-xs uppercase tracking-[0.3em] font-medium mb-4"
                    style={{ color: cert.secondary_color }}
                  >
                    {cert.company_name}
                  </p>
                  <h1
                    className="text-3xl font-bold tracking-wide"
                    style={{ color: cert.primary_color }}
                  >
                    CERTIFICADO DE CONCLUSÃO
                  </h1>
                  <div className="w-20 h-0.5 mx-auto mt-4" style={{ background: cert.primary_color }} />
                </div>
              </div>
            </div>

            {/* Middle: Body text */}
            <div className="cert-row">
              <div className="cert-cell cert-cell-middle">
                <div className="text-center max-w-2xl mx-auto space-y-3">
                  <p className="text-sm text-gray-500">Certificamos que</p>
                  <p className="text-2xl font-bold text-gray-900">{cert.user_name}</p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    concluiu com sucesso o treinamento
                  </p>
                  <p
                    className="text-xl font-bold"
                    style={{ color: cert.primary_color }}
                  >
                    {cert.training_title}
                  </p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    com carga horária de <span className="font-semibold text-gray-700">{durationText}</span>,
                    na área de <span className="font-semibold text-gray-700 capitalize">{cert.training_domain}</span>,
                    finalizado em <span className="font-semibold text-gray-700">{completedDate}</span>.
                  </p>
                  {cert.extra_text && (
                    <p className="text-xs text-gray-400 italic pt-1">{cert.extra_text}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom: Signature + certificate number */}
            <div className="cert-row">
              <div className="cert-cell cert-cell-bottom">
                <div className="w-full flex items-end justify-between">
                  <div className="text-left">
                    <p className="text-[10px] text-gray-400">
                      Certificado N.&ordm; {cert.certificate_number}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      Emitido em {issuedDate}
                    </p>
                  </div>

                  <div className="text-center">
                    {cert.signature_style === 'image' && cert.signature_image_url && (
                      <div className="flex justify-center mb-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={api.getCertificateFileUrl('signature', cert.id)}
                          alt="Assinatura"
                          className="h-12 object-contain"
                          crossOrigin="use-credentials"
                        />
                      </div>
                    )}
                    {cert.signature_style === 'typed' && cert.signer_name && (
                      <p
                        className="text-2xl italic mb-1"
                        style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#374151' }}
                      >
                        {cert.signer_name}
                      </p>
                    )}
                    {cert.signature_style === 'line' && (
                      <div className="w-56 border-b border-gray-400 mb-1" />
                    )}
                    {(cert.signature_style !== 'typed' || !cert.signer_name) && cert.signer_name && (
                      <p className="text-sm font-medium text-gray-700">{cert.signer_name}</p>
                    )}
                    {cert.signer_title && (
                      <p className="text-xs text-gray-400">{cert.signer_title}</p>
                    )}
                  </div>

                  <div className="w-24" /> {/* spacer for balance */}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
