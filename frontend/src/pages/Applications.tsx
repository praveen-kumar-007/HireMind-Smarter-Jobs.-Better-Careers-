import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { 
  CheckCircle2, 
  Clock, 
  HelpCircle, 
  Play, 
  UserCheck, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  ShieldCheck,
  Terminal,
  Activity,
  Mail,
  Send,
  Users
} from 'lucide-react'
import OutreachEmailModal from '../components/OutreachEmailModal'
import BulkOutreachModal from '../components/BulkOutreachModal'

export default function Applications() {
  const [activeTab, setActiveTab] = useState('Saved')
  const [expandedAppId, setExpandedAppId] = useState<number | null>(null)
  const [customQuestion, setCustomQuestion] = useState('')
  const [autofillAppId, setAutofillAppId] = useState<number | null>(null)
  const [sseEvent, setSseEvent] = useState<any | null>(null)
  const [approvalToken, setApprovalToken] = useState<string | null>(null)
  const [isBulkOutreachOpen, setIsBulkOutreachOpen] = useState(false)
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([])
  const [bulkTargetApps, setBulkTargetApps] = useState<any[]>([])
  const [outreachModal, setOutreachModal] = useState<{
    isOpen: boolean
    appId: number | null
    jobTitle: string
    company: string
  }>({
    isOpen: false,
    appId: null,
    jobTitle: '',
    company: ''
  })
  
  const queryClient = useQueryClient()

  // Fetch tracked applications for current tab
  const { data: apps, isLoading } = useQuery({
    queryKey: ['applications', activeTab],
    queryFn: async () => {
      const response = await api.get('/applications', {
        params: { status: activeTab }
      })
      return response.data
    }
  })

  // Fetch all applied applications for the Bulk Outreach Hub
  const { data: allAppliedApps } = useQuery({
    queryKey: ['applications-all-applied'],
    queryFn: async () => {
      const response = await api.get('/applications', {
        params: { status: 'Applied' }
      })
      return response.data
    }
  })

  const toggleCardSelection = (id: number) => {
    setSelectedCardIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // Real-Time Telemetry Listener (Dual Channel: SSE + Polling Fallback)
  const [eventLogs, setEventLogs] = useState<Array<{ step: string; progress: number; status_text: string; is_error?: boolean; time: string }>>([])

  useEffect(() => {
    if (!autofillAppId) {
      setSseEvent(null)
      setEventLogs([])
      return
    }

    let isSubscribed = true

    // 1. Polling sync loop
    const syncEvents = async () => {
      try {
        const res = await api.get(`/applications/${autofillAppId}/events-list`)
        if (!isSubscribed) return
        const evs = res.data.events || []
        if (evs.length > 0) {
          const latest = evs[evs.length - 1]
          setSseEvent(latest)
          setEventLogs(evs.map((e: any) => ({
            step: e.step,
            progress: e.progress,
            status_text: e.status_text,
            is_error: e.is_error,
            time: e.created_at ? new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Now'
          })))

          if (latest.progress >= 100 || latest.step === 'Completed' || latest.step === 'Prepared' || latest.step === 'Failed') {
            queryClient.invalidateQueries({ queryKey: ['applications'] })
            queryClient.invalidateQueries({ queryKey: ['analytics'] })
          }
        }
      } catch (e) {
        // Poll note
      }
    }

    syncEvents()
    const pollInterval = setInterval(syncEvents, 1200)

    // 2. SSE stream
    const token = localStorage.getItem('access_token') || ''
    const sseUrl = `/api/applications/${autofillAppId}/events?token=${encodeURIComponent(token)}`
    const eventSource = new EventSource(sseUrl)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        setSseEvent(data)
        setEventLogs((prev) => {
          if (prev.some(p => p.step === data.step && p.status_text === data.status_text)) return prev
          return [...prev, { ...data, time: timeStr }]
        })
        
        if (data.step === "Completed" || data.step === "Prepared" || data.step === "Failed") {
          eventSource.close()
          clearInterval(pollInterval)
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          queryClient.invalidateQueries({ queryKey: ['analytics'] })
        }
      } catch (e) {
        console.error("Failed to parse event", e)
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      isSubscribed = false
      clearInterval(pollInterval)
      eventSource.close()
    }
  }, [autofillAppId])

  // Autofill Mutation (Playwright trigger)
  const autofillMutation = useMutation({
    mutationFn: async (appId: number) => {
      setAutofillAppId(appId)
      setSseEvent({ step: 'Initializing browser agent...', progress: 10, status_text: 'Starting Playwright connection...' })
      const response = await api.post(`/applications/${appId}/auto-fill`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
    onError: (err: any) => {
      setSseEvent({
        step: 'Failed',
        progress: 100,
        is_error: true,
        status_text: err.response?.data?.detail || 'Browser automation failed to start.'
      })
    }
  })

  // Approve Mutation (Accidental submission block token)
  const approveMutation = useMutation({
    mutationFn: async (appId: number) => {
      const response = await api.post(`/applications/${appId}/approve`)
      return response.data
    },
    onSuccess: (data) => {
      setApprovalToken(data.token)
      alert("Application approved & submitted successfully!")
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      setExpandedAppId(null)
      setAutofillAppId(null)
    }
  })

  // Generate Custom Screening Answer
  const answerMutation = useMutation({
    mutationFn: async ({ appId, question }: { appId: number, question: string }) => {
      const response = await api.post(`/applications/${appId}/answer`, { question })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      setCustomQuestion('')
      alert("Answer generated based on resume details!")
    }
  })

  // Update Application Status
  const statusMutation = useMutation({
    mutationFn: async ({ appId, status, notes }: { appId: number, status: string, notes?: string }) => {
      const response = await api.put(`/applications/${appId}`, { status, notes })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    }
  })

  const tabs = ['Saved', 'Ready', 'Review Required', 'Applied', 'Interview', 'Offer']

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Applied': return 'badge-success'
      case 'Ready': return 'badge-primary'
      case 'Review Required': return 'badge-danger'
      case 'Interview': return 'badge-info'
      default: return 'badge-warning'
    }
  }

  return (
    <div>
      {/* Top Executive Bulk Outreach & Management Hub */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(0, 120, 212, 0.08) 0%, #FFFFFF 100%)',
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        borderRadius: '16px',
        padding: '1.6rem 2rem',
        marginBottom: '2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <span style={{
              background: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)',
              color: '#ffffff',
              fontSize: '0.72rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '0.2rem 0.6rem',
              borderRadius: '999px'
            }}>
              Executive Suite
            </span>
            <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: '500' }}>
              {allAppliedApps?.length || 0} Applied Jobs Verified
            </span>
          </div>
          <h1 style={{ fontSize: '2rem', fontFamily: 'var(--font-display)', margin: 0, color: '#0F172A' }}>
            Application & Outreach Tracker
          </h1>
          <p style={{ color: '#475569', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Monitor automated browser applications, review tailored screening answers, and dispatch recruiter cold emails.
          </p>
        </div>

        {/* Top Send All Bulk Outreach Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <button
            onClick={() => {
              setBulkTargetApps(allAppliedApps || [])
              setIsBulkOutreachOpen(true)
            }}
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)',
              boxShadow: '0 4px 14px rgba(0, 120, 212, 0.3)',
              padding: '0.75rem 1.6rem',
              fontSize: '0.92rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem'
            }}
          >
            <Send size={16} />
            Send Bulk Recruiter Mails (Send All)
            <span style={{
              background: 'rgba(255, 255, 255, 0.25)',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.75rem'
            }}>
              {allAppliedApps?.length || 0}
            </span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '1.5rem', 
        overflowX: 'auto', 
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #E2E8F0'
      }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            onClick={() => {
              setActiveTab(tab)
              setExpandedAppId(null)
              setAutofillAppId(null)
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Multi-Selection Sticky Action Bar */}
      {selectedCardIds.length > 0 && (
        <div style={{
          position: 'sticky',
          top: '1rem',
          zIndex: 90,
          background: '#FFFFFF',
          border: '1px solid #0078D4',
          boxShadow: '0 12px 30px rgba(0, 120, 212, 0.15)',
          borderRadius: '12px',
          padding: '0.85rem 1.4rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{
              background: '#0078D4',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.82rem',
              padding: '0.2rem 0.65rem',
              borderRadius: '999px'
            }}>
              {selectedCardIds.length} Selected
            </span>
            <span style={{ color: '#0F172A', fontSize: '0.9rem', fontWeight: '600' }}>
              Custom batch actions ready
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => {
                const selected = (apps || []).filter((a: any) => selectedCardIds.includes(a.id))
                setBulkTargetApps(selected)
                setIsBulkOutreachOpen(true)
              }}
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)',
                padding: '0.55rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Send size={15} />
              Send Selected in Bulk ({selectedCardIds.length})
            </button>

            <button
              onClick={() => setSelectedCardIds([])}
              className="btn btn-secondary"
              style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
            >
              Deselect / Leave All
            </button>
          </div>
        </div>
      )}

      {/* Applications list */}
      {isLoading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading your tracker queue...</div>
      ) : apps?.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          No applications in the <strong>{activeTab}</strong> list.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {apps?.map((app: any) => {
            const isExpanded = expandedAppId === app.id
            const isPendingAutofill = autofillMutation.isPending && autofillAppId === app.id
            const isCardSelected = selectedCardIds.includes(app.id)

            return (
              <div 
                key={app.id} 
                className="card" 
                style={{ 
                  transition: 'var(--transition)',
                  border: isCardSelected ? '1px solid rgba(99, 102, 241, 0.5)' : undefined,
                  background: isCardSelected ? 'rgba(99, 102, 241, 0.04)' : undefined
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={isCardSelected}
                      onChange={() => toggleCardSelection(app.id)}
                      title="Select for bulk outreach"
                      style={{ width: '18px', height: '18px', accentColor: '#6366F1', cursor: 'pointer' }}
                    />
                    <div>
                      <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {app.title}
                        <span className={`badge ${getStatusBadge(app.status)}`}>{app.status}</span>
                      </h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                        {app.company} | Source: {app.source}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button 
                      className="btn btn-primary"
                      onClick={() => {
                        setExpandedAppId(app.id)
                        autofillMutation.mutate(app.id)
                      }}
                      disabled={isPendingAutofill}
                    >
                      <Play size={14} />
                      {isPendingAutofill ? 'Auto-filling...' : 'Auto-Fill Form'}
                    </button>
                    
                    <button
                      className="btn btn-secondary"
                      style={{
                        background: 'rgba(118, 185, 0, 0.1)',
                        borderColor: 'rgba(118, 185, 0, 0.3)',
                        color: '#a3e635'
                      }}
                      onClick={() => setOutreachModal({
                        isOpen: true,
                        appId: app.id,
                        jobTitle: app.title,
                        company: app.company
                      })}
                    >
                      <Mail size={14} />
                      Outreach Mail
                    </button>

                    <button 
                      className="btn btn-secondary"
                      onClick={() => setExpandedAppId(isExpanded ? null : app.id)}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      Details
                    </button>
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
                    
                    {/* Real-time SSE Browser Status Widget */}
                    {autofillAppId === app.id && sseEvent && (
                      <div className="card" style={{ 
                        background: 'rgba(9, 13, 22, 0.95)', 
                        border: '1px solid rgba(118, 185, 0, 0.3)', 
                        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
                        marginBottom: '1.5rem', 
                        padding: '1.25rem',
                        borderRadius: 'var(--radius-md)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', color: sseEvent.is_error ? 'var(--danger)' : '#76b900' }}>
                            <Activity className={sseEvent.is_error ? "" : "spin"} size={16} style={{ animation: sseEvent.is_error ? 'none' : 'spin 2s linear infinite' }} />
                            Live AI Browser Agent Telemetry
                          </span>
                          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#e5e7eb' }}>
                            {sseEvent.progress || 10}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', height: '7px', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
                          <div style={{ 
                            width: `${sseEvent.progress || 10}%`, 
                            background: sseEvent.is_error ? 'var(--danger)' : 'linear-gradient(90deg, #76b900 0%, #10b981 100%)',
                            height: '100%', 
                            transition: 'width 0.4s ease',
                            boxShadow: '0 0 10px rgba(118, 185, 0, 0.6)'
                          }}></div>
                        </div>

                        {/* Phase Stepper */}
                        <div className="responsive-grid-five-col" style={{
                          gap: '0.35rem',
                          marginBottom: '1rem'
                        }}>
                          {[
                            { label: '1. Profile & Chrome', minPct: 10, maxPct: 30 },
                            { label: '2. AI Tailoring', minPct: 31, maxPct: 45 },
                            { label: '3. Portal Auth', minPct: 46, maxPct: 65 },
                            { label: '4. Form & Typing', minPct: 66, maxPct: 88 },
                            { label: '5. Submission', minPct: 89, maxPct: 100 }
                          ].map((st, i) => {
                            const curProgress = sseEvent.progress || 10
                            const isCurrent = curProgress >= st.minPct && curProgress < st.maxPct
                            const isPast = curProgress >= st.maxPct
                            return (
                              <div key={i} style={{
                                padding: '0.3rem 0.4rem',
                                borderRadius: '5px',
                                fontSize: '0.7rem',
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

                        {/* Event Logs Terminal */}
                        <div style={{
                          background: '#040711',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: '6px',
                          padding: '0.75rem',
                          fontFamily: 'monospace',
                          fontSize: '0.82rem',
                          maxHeight: '180px',
                          overflowY: 'auto'
                        }}>
                          {eventLogs.length === 0 ? (
                            <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <Terminal size={14} style={{ color: '#76b900' }} />
                              <span>[{sseEvent.step}] {sseEvent.status_text}</span>
                            </div>
                          ) : (
                            eventLogs.map((log, idx) => (
                              <div key={idx} style={{ 
                                marginBottom: '0.35rem',
                                color: log.is_error ? '#f87171' : (log.progress >= 100 ? '#4ade80' : '#cbd5e1'),
                                display: 'flex',
                                gap: '0.5rem'
                              }}>
                                <span style={{ color: '#64748b' }}>[{log.time}]</span>
                                <span style={{ color: '#76b900', fontWeight: '600' }}>[{log.step}]</span>
                                <span>{log.status_text}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Pre-submission Verification Preview */}
                    {app.status === 'Ready' && (
                      <div style={{ 
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid var(--success)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '1.25rem',
                        marginBottom: '1.5rem'
                      }}>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', marginBottom: '0.5rem' }}>
                          <ShieldCheck size={18} />
                          Form Verification Passed
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                          All required candidate fields (Name, Email, Phone, CV upload) were auto-filled successfully. Ready for submission.
                        </p>

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button 
                            className="btn btn-primary"
                            onClick={() => approveMutation.mutate(app.id)}
                            disabled={approveMutation.isPending}
                            style={{ background: 'var(--success)', border: 'none' }}
                          >
                            {approveMutation.isPending ? 'Submitting...' : 'Approve & Submit'}
                          </button>
                          <button 
                            className="btn btn-secondary"
                            onClick={() => statusMutation.mutate({ appId: app.id, status: 'Saved' })}
                          >
                            Edit / Edit Form
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Captcha OTP Warning */}
                    {app.status === 'Review Required' && (
                      <div style={{ 
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid var(--warning)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '1.25rem',
                        marginBottom: '1.5rem'
                      }}>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24', marginBottom: '0.5rem' }}>
                          <AlertTriangle size={18} />
                          Human Action Required
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          The job portal requires manual intervention (puzzle check, sliding captcha, or phone OTP). Click below to solve, then mark as resolved.
                        </p>
                        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                          <button 
                            className="btn btn-primary"
                            onClick={() => statusMutation.mutate({ appId: app.id, status: 'Ready' })}
                          >
                            Mark Challenge as Resolved
                          </button>
                        </div>
                      </div>
                    )}

                    {/* AI Generated QA section */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h4 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <HelpCircle size={16} style={{ color: 'var(--primary)' }} />
                        AI-Generated Screening Answers
                      </h4>
                      {app.answers?.length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          No screening answers generated yet. Fill out fields to trigger Qwen3 custom answers.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {app.answers?.map((ans: any) => (
                            <div key={ans.id} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }}>
                              <p style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)' }}>Q: {ans.question}</p>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', borderLeft: '2px solid var(--primary)', paddingLeft: '0.5rem' }}>
                                A: {ans.answer}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Custom Answer Box */}
                      <div className="form-group" style={{ marginTop: '1rem' }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Generate custom screening answer</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ flex: 1 }}
                            placeholder="Type a custom question (e.g. Describe your Java experience)" 
                            value={customQuestion}
                            onChange={(e) => setCustomQuestion(e.target.value)}
                          />
                          <button 
                            className="btn btn-secondary"
                            onClick={() => answerMutation.mutate({ appId: app.id, question: customQuestion })}
                            disabled={answerMutation.isPending || !customQuestion}
                          >
                            <Sparkles size={14} />
                            Generate
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Status updater */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Update application status</label>
                        <select 
                          className="form-input"
                          style={{ background: 'var(--bg-tertiary)' }}
                          value={app.status}
                          onChange={(e) => statusMutation.mutate({ appId: app.id, status: e.target.value })}
                        >
                          <option value="Saved">Saved</option>
                          <option value="Ready">Ready</option>
                          <option value="Review Required">Review Required</option>
                          <option value="Applied">Applied</option>
                          <option value="Interview">Interview</option>
                          <option value="Offer">Offer</option>
                        </select>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Outreach Recruiter Email Modal */}
      <OutreachEmailModal
        isOpen={outreachModal.isOpen}
        appId={outreachModal.appId}
        jobTitle={outreachModal.jobTitle}
        company={outreachModal.company}
        onClose={() => setOutreachModal(prev => ({ ...prev, isOpen: false }))}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          queryClient.invalidateQueries({ queryKey: ['applications-all-applied'] })
          queryClient.invalidateQueries({ queryKey: ['analytics'] })
        }}
      />

      {/* Top Executive Bulk Outreach Modal */}
      <BulkOutreachModal
        isOpen={isBulkOutreachOpen}
        applications={bulkTargetApps.length > 0 ? bulkTargetApps : (allAppliedApps || [])}
        onClose={() => {
          setIsBulkOutreachOpen(false)
          setBulkTargetApps([])
        }}
        onSuccess={() => {
          setSelectedCardIds([])
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          queryClient.invalidateQueries({ queryKey: ['applications-all-applied'] })
          queryClient.invalidateQueries({ queryKey: ['analytics'] })
        }}
      />
    </div>
  )
}
const logger = {
  info: (msg: string) => console.log(`[SSE] ${msg}`)
}
