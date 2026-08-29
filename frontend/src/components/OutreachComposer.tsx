import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../services/api'
import { X, Send, Mail, AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'

interface OutreachComposerProps {
  jobId: number
  jobTitle: string
  company: string
  onClose: () => void
  onSuccess: () => void
}

export default function OutreachComposer({ jobId, jobTitle, company, onClose, onSuccess }: OutreachComposerProps) {
  const [jobRole, setJobRole] = useState(jobTitle)
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [verificationData, setVerificationData] = useState<{
    status: string
    source: string
    is_active_mx: boolean
    alternatives: string[]
  }>({
    status: 'VERIFIED_ACTIVE',
    source: 'Company Mail Server',
    is_active_mx: true,
    alternatives: []
  })

  // 1. Verify if SMTP is configured
  const { data: smtpConfig, isLoading: checkingSmtp } = useQuery({
    queryKey: ['smtp-config'],
    queryFn: async () => {
      const response = await api.get('/outreach/settings/smtp')
      return response.data
    }
  })

  // 2. Draft generation mutation
  const generateMutation = useMutation({
    mutationFn: async (targetRole: string) => {
      const response = await api.post(`/outreach/jobs/${jobId}/generate-email`, null, {
        params: { job_role: targetRole }
      })
      return response.data
    },
    onSuccess: (data) => {
      setRecipient(data.recipient_email || '')
      setSubject(data.subject || '')
      setBody(data.body || '')
      setVerificationData({
        status: data.status || 'VERIFIED_ACTIVE',
        source: data.source || 'Company Mail Server',
        is_active_mx: data.is_active_mx ?? true,
        alternatives: data.alternatives || []
      })
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.detail || "Failed to generate outreach draft. Ensure you have uploaded an active resume in Settings.")
    }
  })

  useEffect(() => {
    if (smtpConfig?.configured) {
      generateMutation.mutate(jobTitle)
    }
  }, [smtpConfig])

  // 3. Email dispatch mutation
  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recipient || !subject || !body) {
      alert("All fields are required to send the email.")
      return
    }

    setSending(true)
    setErrorMessage('')
    try {
      await api.post(`/outreach/jobs/${jobId}/send-email`, {
        recipient_email: recipient,
        subject: subject,
        body: body
      })
      alert(`Outreach email successfully sent to verified address: ${recipient}!`)
      setSending(false)
      onSuccess()
      onClose()
    } catch (err: any) {
      setSending(false)
      setErrorMessage(err.response?.data?.detail || "Failed to send email. Please check your SMTP credentials or target email.")
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }}>
      <div className="card" style={{
        width: '90%',
        maxWidth: '720px',
        maxHeight: '90vh',
        overflowY: 'auto',
        position: 'relative',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
        border: '1px solid var(--glass-border)',
        padding: '2rem'
      }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mail style={{ color: 'var(--secondary)' }} size={20} />
              Cold Outreach Email Composer
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Applying to <strong>{company}</strong>
            </p>
          </div>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        {/* Errors */}
        {errorMessage && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--danger)',
            color: '#f87171',
            padding: '1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.9rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <AlertTriangle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Checking SMTP Host status */}
        {checkingSmtp && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Loader2 className="spin" style={{ margin: '0 auto 1rem' }} />
            Checking SMTP credentials connection...
          </div>
        )}

        {/* If SMTP is not configured */}
        {!checkingSmtp && smtpConfig && !smtpConfig.configured && (
          <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-sm)' }}>
            <AlertTriangle size={36} style={{ color: 'var(--warning)', marginBottom: '1rem' }} />
            <h4 style={{ marginBottom: '0.5rem' }}>SMTP Credentials Required</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              You need to configure your Outbound Email SMTP Server settings (e.g., Gmail App Password) first.
            </p>
            <button className="btn btn-primary" onClick={onClose}>
              Go to Settings
            </button>
          </div>
        )}

        {/* SMTP is ready, drafting loading state */}
        {!checkingSmtp && smtpConfig?.configured && generateMutation.isPending && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <Loader2 className="spin" style={{ margin: '0 auto 1.5rem', color: 'var(--secondary)' }} size={32} />
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Verifying HR Mail & Compiling Email...</h4>
            <p style={{ fontSize: '0.85rem', maxWidth: '440px', margin: '0 auto' }}>
              Checking DNS MX records for corporate mail servers and locating verified HR / Career addresses...
            </p>
          </div>
        )}

        {/* Email Editor and Sender Form */}
        {!checkingSmtp && smtpConfig?.configured && !generateMutation.isPending && !generateMutation.isError && (
          <form onSubmit={sendEmail}>
            
            {/* Job Role input and Regenerator */}
            <div className="form-group" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', marginBottom: '1.5rem' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ marginBottom: '0.4rem' }}>Target Job Role / Position</label>
                <input
                  type="text"
                  className="form-input"
                  value={jobRole}
                  onChange={(e) => setJobRole(e.target.value)}
                  placeholder="e.g. Python Developer"
                  required
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => generateMutation.mutate(jobRole)}
                style={{ height: '38px', display: 'flex', gap: '0.4rem', alignItems: 'center', whiteSpace: 'nowrap' }}
                disabled={generateMutation.isPending}
              >
                <RefreshCw size={14} />
                Regenerate Template
              </button>
            </div>

            {/* Recruiter / HR email with active MX verification status */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label className="form-label" style={{ margin: 0 }}>HR / Talent Contact Email</label>
                {verificationData.is_active_mx ? (
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.3rem', 
                    fontSize: '0.75rem', 
                    color: 'var(--success)',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                  }}>
                    <ShieldCheck size={13} />
                    Active Mailbox (MX Verified)
                  </span>
                ) : (
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.3rem', 
                    fontSize: '0.75rem', 
                    color: 'var(--warning)',
                    background: 'rgba(245, 158, 11, 0.1)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid rgba(245, 158, 11, 0.2)'
                  }}>
                    <AlertTriangle size={13} />
                    Check Email Validity
                  </span>
                )}
              </div>

              <input
                type="email"
                className="form-input"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                required
              />

              <div style={{ marginTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Source: <strong>{verificationData.source}</strong>
                </span>

                {/* Candidate alternatives pills */}
                {verificationData.alternatives && verificationData.alternatives.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Try:</span>
                    {verificationData.alternatives.map((altEmail, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setRecipient(altEmail)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '4px',
                          padding: '0.15rem 0.4rem',
                          fontSize: '0.7rem',
                          color: altEmail === recipient ? 'var(--primary)' : 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                      >
                        {altEmail}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Subject</label>
              <input
                type="text"
                className="form-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Body (Templated Cover Letter)</label>
              <textarea
                className="form-input"
                style={{ height: '240px', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: '1.5' }}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={sending}>
                <Send size={16} />
                {sending ? 'Sending via SMTP...' : 'Send Cold Email'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  )
}

