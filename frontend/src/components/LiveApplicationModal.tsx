import React, { useEffect, useState, useRef } from 'react'
import { CheckCircle2, AlertCircle, Loader2, Play, Shield, Terminal, X } from 'lucide-react'
import api from '../services/api'

interface LiveApplicationModalProps {
  isOpen: boolean
  appId: number | null
  jobTitle: string
  company: string
  onClose: () => void
}

interface EventLog {
  step: string
  progress: number
  status_text: string
  is_error?: boolean
  timestamp: string
}

export default function LiveApplicationModal({
  isOpen,
  appId,
  jobTitle,
  company,
  onClose
}: LiveApplicationModalProps) {
  const [events, setEvents] = useState<EventLog[]>([])
  const [progress, setProgress] = useState(10)
  const [currentStep, setCurrentStep] = useState('Initializing Application...')
  const [isFinished, setIsFinished] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // 5-Second Auto-close timer on completion
  useEffect(() => {
    if (!isFinished) {
      setCountdown(null)
      return
    }

    setCountdown(5)
    const interval = setInterval(() => {
      setCountdown(prev => (prev !== null && prev > 1 ? prev - 1 : 0))
    }, 1000)

    const timeout = setTimeout(() => {
      onClose()
    }, 5000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [isFinished, onClose])

  useEffect(() => {
    if (!isOpen || !appId) {
      setEvents([])
      setProgress(10)
      setCurrentStep('Initializing Application...')
      setIsFinished(false)
      setHasError(false)
      setCountdown(null)
      return
    }

    let isSubscribed = true

    // 1. Polling sync loop for guaranteed telemetry delivery
    const syncEvents = async () => {
      try {
        const res = await api.get(`/applications/${appId}/events-list`)
        if (!isSubscribed) return
        const evs = res.data.events || []
        if (evs.length > 0) {
          const latest = evs[evs.length - 1]
          setProgress(latest.progress || 10)
          setCurrentStep(latest.status_text || latest.step)
          if (latest.is_error) setHasError(true)
          if (latest.progress >= 100 || latest.step === 'Completed' || latest.step === 'Prepared' || latest.step === 'Failed' || latest.step === 'Applied' || latest.step === 'Already Applied') {
            setIsFinished(true)
          }

          setEvents(evs.map((e: any) => ({
            step: e.step,
            progress: e.progress,
            status_text: e.status_text,
            is_error: e.is_error,
            timestamp: e.created_at ? new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Now'
          })))
        }
      } catch (err) {
        // Poll sync fallback
      }
    }

    syncEvents()
    const pollInterval = setInterval(syncEvents, 1000)

    // 2. Real-Time SSE Stream with Token
    const token = localStorage.getItem('access_token') || ''
    const baseURL = (api.defaults.baseURL || '/api').replace(/\/$/, '')
    const url = `${baseURL}/applications/${appId}/events?token=${encodeURIComponent(token)}`
    let eventSource: EventSource | null = null
    try {
      eventSource = new EventSource(url)
    } catch (sseErr) {
      console.warn("EventSource init failed, relying on polling fallback", sseErr)
    }

    if (eventSource) {
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          
          setEvents((prev) => {
            if (prev.some(p => p.step === data.step && p.status_text === data.status_text)) return prev
            return [...prev, { ...data, timestamp: now }]
          })
          if (data.progress) setProgress(data.progress)
          if (data.status_text) setCurrentStep(data.status_text)
          if (data.is_error) setHasError(true)

          if (data.progress >= 100 || data.step === 'Completed' || data.step === 'Prepared' || data.is_error) {
            setIsFinished(true)
            clearInterval(pollInterval)
            eventSource?.close()
          }
        } catch (e) {
          console.error("SSE parse error", e)
        }
      }

      eventSource.onerror = () => {
        eventSource?.close()
      }
    }

    return () => {
      isSubscribed = false
      clearInterval(pollInterval)
      eventSource?.close()
    }
  }, [isOpen, appId])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1.5rem'
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid rgba(118, 185, 0, 0.3)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(118, 185, 0, 0.15)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: '680px',
        overflow: 'hidden',
        animation: 'fadeIn 0.25s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, rgba(118, 185, 0, 0.1) 0%, rgba(0, 0, 0, 0) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(118, 185, 0, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#76b900'
            }}>
              <Play size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>Live AI Auto-Apply Session</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {jobTitle} • <span style={{ color: '#e5e7eb' }}>{company}</span>
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: '1.5rem' }}>
          {/* Progress Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: hasError ? 'var(--danger)' : '#76b900', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {!isFinished ? (
                <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              ) : hasError ? (
                <AlertCircle size={16} style={{ color: 'var(--danger)' }} />
              ) : (
                <CheckCircle2 size={16} style={{ color: '#76b900' }} />
              )}
              {currentStep}
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#e5e7eb' }}>
              {progress}%
            </span>
          </div>

          {/* Progress Bar */}
          <div style={{
            height: '8px',
            background: 'var(--bg-tertiary)',
            borderRadius: '999px',
            overflow: 'hidden',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: hasError ? 'var(--danger)' : 'linear-gradient(90deg, #76b900 0%, #10b981 100%)',
              transition: 'width 0.4s ease-out',
              boxShadow: '0 0 10px rgba(118, 185, 0, 0.5)'
            }} />
          </div>

          {/* Visual Phase Stepper */}
          <div className="responsive-grid-five-col" style={{
            gap: '0.4rem',
            marginBottom: '1.25rem'
          }}>
            {[
              { label: '1. Profile & Chrome', minPct: 10, maxPct: 30 },
              { label: '2. AI Tailoring', minPct: 31, maxPct: 45 },
              { label: '3. Portal Auth', minPct: 46, maxPct: 65 },
              { label: '4. Form & Typing', minPct: 66, maxPct: 88 },
              { label: '5. Submission', minPct: 89, maxPct: 100 }
            ].map((st, i) => {
              const isCurrent = progress >= st.minPct && progress < st.maxPct
              const isPast = progress >= st.maxPct
              return (
                <div key={i} style={{
                  padding: '0.4rem 0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  textAlign: 'center',
                  background: isPast ? 'rgba(118, 185, 0, 0.15)' : isCurrent ? 'rgba(118, 185, 0, 0.3)' : 'rgba(255, 255, 255, 0.03)',
                  border: isCurrent ? '1px solid #76b900' : isPast ? '1px solid rgba(118, 185, 0, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                  color: isPast ? '#a3e635' : isCurrent ? '#ffffff' : '#64748b',
                  transition: 'all 0.3s ease'
                }}>
                  {st.label}
                </div>
              )
            })}
          </div>

          {/* Real-time Telemetry Terminal */}
          <div style={{
            background: '#090d16',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '1rem',
            fontFamily: 'monospace',
            fontSize: '0.82rem',
            maxHeight: '220px',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
              <Terminal size={14} style={{ color: '#76b900' }} />
              <span>LIVE BROWSER TELEMETRY & EVENT STREAM</span>
            </div>

            {events.length === 0 ? (
              <div style={{ color: '#64748b', fontStyle: 'italic' }}>
                Connecting to automation engine and launching Playwright browser context...
              </div>
            ) : (
              events.map((ev, idx) => (
                <div key={idx} style={{ 
                  marginBottom: '0.4rem', 
                  color: ev.is_error ? '#f87171' : (ev.progress >= 100 ? '#4ade80' : '#cbd5e1'),
                  display: 'flex',
                  gap: '0.5rem'
                }}>
                  <span style={{ color: '#64748b' }}>[{ev.timestamp}]</span>
                  <span style={{ color: '#76b900', fontWeight: '600' }}>[{ev.step}]</span>
                  <span>{ev.status_text}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--glass-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0, 0, 0, 0.2)'
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Shield size={14} style={{ color: '#76b900' }} />
            Encrypted candidate profile injection
          </span>

          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {countdown !== null ? `Auto-minimizing in ${countdown}s` : (isFinished ? 'Close' : 'Minimize Session')}
          </button>
        </div>
      </div>
    </div>
  )
}
