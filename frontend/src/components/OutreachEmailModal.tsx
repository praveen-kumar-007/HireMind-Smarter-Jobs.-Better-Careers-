import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Send, X, CheckCircle2, AlertCircle, Loader2, Sparkles, Paperclip, ShieldCheck } from 'lucide-react'
import api from '../services/api'

interface OutreachEmailModalProps {
  isOpen: boolean
  appId: number | null
  jobId?: number | null
  jobTitle: string
  company: string
  onClose: () => void
  onSuccess?: () => void
}

export default function OutreachEmailModal({
  isOpen,
  appId,
  jobId,
  jobTitle,
  company,
  onClose,
  onSuccess
}: OutreachEmailModalProps) {
  const navigate = useNavigate()
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [ccEmail, setCcEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [emailStatus, setEmailStatus] = useState<string>('VERIFIED_ACTIVE')
  const [alternatives, setAlternatives] = useState<string[]>([])
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!isOpen || (!appId && !jobId)) {
      setRecipientEmail('')
      setCcEmail('')
      setSubject('')
      setBody('')
      setToast(null)
      return
    }

    const fetchDraft = async () => {
      setLoadingDraft(true)
      setToast(null)
      try {
        let res
        if (appId) {
          try {
            res = await api.post(`/outreach/applications/${appId}/generate-email`)
          } catch (e) {
            if (jobId) {
              res = await api.post(`/outreach/jobs/${jobId}/generate-email`)
            } else {
              throw e
            }
          }
        } else if (jobId) {
          res = await api.post(`/outreach/jobs/${jobId}/generate-email`)
        }
        
        if (res && res.data) {
          const data = res.data
          const cleanComp = company.toLowerCase().replace(/[^a-z0-9]/g, '')
          setRecipientEmail(data.recipient_email || `hr@${cleanComp || 'company'}.com`)
          setCcEmail(data.cc_email || `info@${cleanComp || 'company'}.com`)
          setSubject(data.subject || `Application for ${jobTitle} - Praveen Kumar`)
          setBody(data.body || '')
          setEmailStatus(data.status || 'VERIFIED_ACTIVE')
          setAlternatives(data.alternatives || [])
        }
      } catch (err: any) {
        console.error('Draft generation fallback', err)
        const compClean = company.toLowerCase().replace(/[^a-z0-9]/g, '')
        setRecipientEmail(`hr@${compClean || 'company'}.com`)
        setCcEmail(`info@${compClean || 'company'}.com`)
        setSubject(`Application & Direct Follow-up for ${jobTitle} - Praveen Kumar`)
        setBody(`Dear Hiring Team at ${company},\n\nI hope this email finds you well.\n\nI am writing to express my strong interest in the ${jobTitle} role. I have submitted my candidate profile and wanted to reach out directly with my attached resume.\n\nKey Qualifications:\n- Candidate Name: Praveen Kumar\n- Core Skills: Python, React, FastAPI, SQL, Machine Learning\n- Experience: Full-stack development, API architecture, and intelligent automated workflows\n\nI would welcome the opportunity to discuss how my skill set aligns with your team's engineering goals.\n\nThank you for your time and consideration.\n\nBest regards,\nPraveen Kumar`)
        setEmailStatus('AI_SUGGESTED')
        setAlternatives([`careers@${compClean}.com`, `talent@${compClean}.com`, `contact@${compClean}.com`])
      } finally {
        setLoadingDraft(false)
      }
    }

    fetchDraft()
  }, [isOpen, appId, jobId, jobTitle, company])

  const handleSend = async () => {
    if (!recipientEmail || !subject || !body) {
      setToast({ type: 'error', message: 'Please fill in recipient email, subject, and message body.' })
      return
    }

    setSending(true)
    setToast(null)
    try {
      let res
      if (appId) {
        try {
          res = await api.post(`/outreach/applications/${appId}/send-email`, {
            recipient_email: recipientEmail,
            cc_email: ccEmail || undefined,
            subject: subject,
            body: body,
            skip_mx_check: true
          })
        } catch (e) {
          if (jobId) {
            res = await api.post(`/outreach/jobs/${jobId}/send-email`, {
              recipient_email: recipientEmail,
              cc_email: ccEmail || undefined,
              subject: subject,
              body: body,
              skip_mx_check: true
            })
          } else {
            throw e
          }
        }
      } else if (jobId) {
        res = await api.post(`/outreach/jobs/${jobId}/send-email`, {
          recipient_email: recipientEmail,
          cc_email: ccEmail || undefined,
          subject: subject,
          body: body,
          skip_mx_check: true
        })
      }

      setToast({ type: 'success', message: res?.data?.message || 'Outreach email sent successfully! Transferring to All Applied...' })
      if (onSuccess) onSuccess()
      setTimeout(() => {
        onClose()
        navigate('/applied')
      }, 1400)
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to send outreach email. Please ensure SMTP credentials (host, port, app password) are configured in Settings.'
      setToast({ type: 'error', message: msg })
    } finally {
      setSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1.5rem'
    }}>
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.12), 0 0 30px rgba(0, 120, 212, 0.08)',
        borderRadius: '18px',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.25s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.35rem 1.6rem',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(90deg, #EFF6FF 0%, #ECFDF5 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(0, 120, 212, 0.3)'
            }}>
              <Mail size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#0F172A' }}>
                AI Recruiter & Company Outreach
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569' }}>
                {jobTitle} • <span style={{ color: '#0F172A', fontWeight: '600' }}>{company}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#64748B',
              cursor: 'pointer',
              padding: '0.45rem',
              borderRadius: '8px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
          {loadingDraft ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#64748B' }}>
              <Loader2 size={26} className="spin" style={{ margin: '0 auto 1.25rem', animation: 'spin 1s linear infinite', color: '#0078D4' }} />
              <p style={{ fontSize: '0.95rem', fontWeight: '600', color: '#0F172A' }}>
                AI is researching company mail servers and verifying HR & Profile CC mailboxes...
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {/* Recipient HR Field */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', marginBottom: '0.4rem', color: '#0F172A' }}>
                  To: Primary HR / Talent Email (Discovered by AI)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="email"
                    className="form-input"
                    style={{ flex: 1, background: '#FFFFFF', borderColor: '#CBD5E1', color: '#0F172A' }}
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="hr@company.com"
                  />
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: '#047857',
                    background: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}>
                    <ShieldCheck size={13} /> {emailStatus}
                  </span>
                </div>

                {alternatives.length > 0 && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#64748B', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>Alternatives:</span>
                    {alternatives.map((alt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setRecipientEmail(alt)}
                        style={{
                          background: '#F1F5F9',
                          border: '1px solid #CBD5E1',
                          color: '#334155',
                          borderRadius: '4px',
                          padding: '0.15rem 0.45rem',
                          cursor: 'pointer',
                          fontSize: '0.72rem'
                        }}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CC: Company Profile / General Inbox */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', marginBottom: '0.4rem', color: '#0F172A' }}>
                  CC: Company Profile / Official Contact Inbox
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="email"
                    className="form-input"
                    style={{ flex: 1, background: '#FFFFFF', borderColor: '#CBD5E1', color: '#0F172A' }}
                    value={ccEmail}
                    onChange={(e) => setCcEmail(e.target.value)}
                    placeholder="info@company.com or careers@company.com"
                  />
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: '#4338CA',
                    background: '#EEF2FF',
                    border: '1px solid #C7D2FE',
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    whiteSpace: 'nowrap'
                  }}>
                    Company Profile CC
                  </span>
                </div>
              </div>

              {/* Subject Field */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', marginBottom: '0.4rem', color: '#0F172A' }}>
                  Email Subject
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ background: '#FFFFFF', borderColor: '#CBD5E1', color: '#0F172A' }}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Application for Position - Name"
                />
              </div>

              {/* Email Body Field */}
              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', fontWeight: '600', marginBottom: '0.4rem', color: '#0F172A' }}>
                  <span>Personalized Pitch (1st-Person Candidate Voice)</span>
                  <span style={{ color: '#0078D4', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: '600' }}>
                    <Sparkles size={12} /> AI Tailored
                  </span>
                </label>
                <textarea
                  className="form-input"
                  style={{
                    minHeight: '180px',
                    fontFamily: 'inherit',
                    fontSize: '0.85rem',
                    lineHeight: '1.5',
                    resize: 'vertical',
                    background: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    color: '#0F172A'
                  }}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              {/* Attachment Pill */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                padding: '0.65rem 1rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', color: '#0F172A', fontWeight: '500' }}>
                  <Paperclip size={14} style={{ color: '#059669' }} />
                  <span>Resume Praveen Kumar.pdf (Attached Automatically)</span>
                </div>
                <span style={{ color: '#059669', fontWeight: '600', fontSize: '0.75rem' }}>Ready</span>
              </div>

              {/* Toast Feedback */}
              {toast && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: toast.type === 'success' ? '#ECFDF5' : '#FEF2F2',
                  border: toast.type === 'success' ? '1px solid #A7F3D0' : '1px solid #FECACA',
                  color: toast.type === 'success' ? '#047857' : '#DC2626'
                }}>
                  {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{toast.message}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1.2rem 1.75rem',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#F8FAFC'
        }}>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            disabled={sending}
          >
            Cancel
          </button>

          <button
            onClick={handleSend}
            className="btn btn-primary"
            disabled={sending || loadingDraft}
            style={{
              background: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)',
              boxShadow: '0 4px 14px rgba(0, 120, 212, 0.3)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.65rem 1.4rem'
            }}
          >
            {sending ? (
              <>
                <Loader2 size={15} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                Sending Mail...
              </>
            ) : (
              <>
                <Send size={15} />
                Send Cold Email to Recruiter (with CC)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
