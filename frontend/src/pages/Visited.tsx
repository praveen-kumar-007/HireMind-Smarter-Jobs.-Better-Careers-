import React, { useState } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { 
  Mail, 
  Send, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Search, 
  ShieldCheck, 
  Building2, 
  ExternalLink,
  ArrowRight,
  Filter,
  CheckCheck,
  AlertCircle
} from 'lucide-react'
import OutreachEmailModal from '../components/OutreachEmailModal'
import BulkOutreachModal from '../components/BulkOutreachModal'
import ConfirmModal from '../components/ConfirmModal'
import Toast from '../components/Toast'
import LiveApplicationModal from '../components/LiveApplicationModal'

export default function Visited() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [filterText, setFilterText] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [untrackTarget, setUntrackTarget] = useState<{ id: number; title: string } | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

  const [outreachModal, setOutreachModal] = useState<{
    isOpen: boolean
    appId: number | null
    jobId?: number | null
    jobTitle: string
    company: string
  }>({
    isOpen: false,
    appId: null,
    jobId: null,
    jobTitle: '',
    company: ''
  })

  // Fetch Pending Applications: ONLY jobs that are Applied, Visited, Manual Intervention or Failed
  const { data: pendingApplications, isLoading } = useQuery({
    queryKey: ['pending-outreach-applications'],
    queryFn: async () => {
      const response = await api.get('/applications', {
        params: { status: 'Applied,Visited,Manual Intervention,Failed' }
      })
      return response.data
    }
  })

  // State to track the live Playwright session progress
  const [liveSession, setLiveSession] = useState<{ isOpen: boolean; appId: number | null; jobTitle: string; company: string }>({
    isOpen: false,
    appId: null,
    jobTitle: '',
    company: ''
  })

  // Mutation to retry failed auto-apply using Playwright runner
  const retryMutation = useMutation({
    mutationFn: async (app: any) => {
      setLiveSession({
        isOpen: true,
        appId: app.id,
        jobTitle: app.title,
        company: app.company
      })
      const response = await api.post(`/applications/${app.id}/auto-fill`)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
      queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    }
  })

  // Mutation to mark the application as completed (status = "Applied")
  const completeMutation = useMutation({
    mutationFn: async (appId: number) => {
      await api.put(`/applications/${appId}`, { status: 'Applied', notes: 'Applied Manually' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
      queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      setToast({
        type: 'success',
        message: 'Status updated! The job has been moved to Applied and remains in the email queue.'
      })
    }
  })

  // Fetch applied applications for the counter
  const { data: sentApplications } = useQuery({
    queryKey: ['all-applied-applications'],
    queryFn: async () => {
      const response = await api.get('/applications', {
        params: { status: 'Applied' }
      })
      return response.data
    }
  })

  const sentAppsCount = (sentApplications || []).filter(
    (app: any) => app.notes && app.notes.includes('Outreach Email Sent')
  ).length

  // Untrack application mutation
  const untrackMutation = useMutation({
    mutationFn: async (appId: number) => {
      await api.delete(`/applications/${appId}`)
    },
    onSuccess: () => {
      setUntrackTarget(null)
      queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
      queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      setToast({
        type: 'success',
        message: 'Untracked job! It is now returned to the Discovered Jobs board.'
      })
    },
    onError: (err: any) => {
      setUntrackTarget(null)
      setToast({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to untrack job.'
      })
    }
  })

  // Only jobs that were viewed, applied, manual or failed, and email has not been sent yet
  const pendingApps: any[] = (pendingApplications || [])
    .filter((app: any) => app.status === 'Applied' || app.status === 'Visited' || app.status === 'Manual Intervention' || app.status === 'Failed')
    .filter((app: any) => app.status !== 'Dismissed')
    .filter((app: any) => !app.notes || !app.notes.includes('Outreach Email Sent'))
    .filter((app: any) => {
      if (!filterText) return true
      const term = filterText.toLowerCase()
      return (
        app.title?.toLowerCase().includes(term) ||
        app.company?.toLowerCase().includes(term) ||
        app.source?.toLowerCase().includes(term)
      )
    })
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === pendingApps.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(pendingApps.map(a => a.id))
    }
  }

  return (
    <div>
      {/* Top Executive Header */}
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
              padding: '0.2rem 0.65rem',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              boxShadow: '0 2px 8px rgba(0, 120, 212, 0.25)'
            }}>
              <Clock size={12} /> Pending Outreach Mail Queue
            </span>
            <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: '500' }}>
              {pendingApps.length} Remaining to Send
            </span>
          </div>
          <h1 style={{ fontSize: '2rem', fontFamily: 'var(--font-display)', margin: 0, color: '#0F172A' }}>
            Pending Recruiter Outreach Mails
          </h1>
          <p style={{ color: '#475569', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Listings where recruiter emails are pending. Once sent, each application automatically migrates to the <strong>Mail Sent & Applied</strong> page.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="btn btn-primary"
            disabled={pendingApps.filter(a => a.status !== 'Manual Intervention').length === 0}
            style={{
              padding: '0.75rem 1.6rem',
              fontSize: '0.92rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem'
            }}
          >
            <Send size={16} />
            Send Bulk Mails to All Pending ({pendingApps.filter(a => a.status !== 'Manual Intervention').length})
          </button>

          <button
            onClick={() => navigate('/applied')}
            className="btn btn-secondary"
            style={{
              borderColor: '#A7F3D0',
              color: '#047857',
              background: '#ECFDF5',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              fontWeight: '600'
            }}
          >
            <CheckCircle2 size={16} />
            View Mails Sent ({sentAppsCount})
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Navigation Switch Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        marginBottom: '1.5rem',
        borderBottom: '1px solid #E2E8F0',
        paddingBottom: '0.6rem'
      }}>
        <button
          className="btn btn-primary"
          style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem' }}
        >
          <Clock size={14} />
          Pending Mails Queue ({pendingApps.length})
        </button>

        <button
          onClick={() => navigate('/applied')}
          className="btn btn-secondary"
          style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem' }}
        >
          <CheckCheck size={14} />
          Mails Sent & Applied ({sentAppsCount})
        </button>
      </div>

      {/* Floating Multi-Select Action Bar */}
      {selectedIds.length > 0 && (
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
              {selectedIds.length} Selected
            </span>
            <span style={{ color: '#0F172A', fontSize: '0.9rem', fontWeight: '600' }}>
              Pending jobs ready for bulk outreach dispatch
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="btn btn-primary"
              style={{
                padding: '0.55rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Send size={15} />
              Send Selected Mails ({selectedIds.length})
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="btn btn-secondary"
              style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
            >
              Deselect / Leave All
            </button>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Filter pending jobs..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              paddingLeft: '2.4rem',
              background: '#FFFFFF',
              borderColor: '#CBD5E1',
              color: '#0F172A'
            }}
          />
          <Search size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
        </div>

        {pendingApps.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
          >
            {selectedIds.length === pendingApps.length ? 'Deselect All' : 'Select All Pending'}
          </button>
        )}
      </div>

      {/* Pending Applications List */}
      {isLoading ? (
        <div style={{ color: '#64748B', textAlign: 'center', padding: '3rem' }}>
          Loading pending outreach queue...
        </div>
      ) : pendingApps.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: '#FFFFFF',
          border: '1px dashed #CBD5E1',
          borderRadius: '16px',
          color: '#64748B'
        }}>
          <CheckCircle2 size={40} style={{ margin: '0 auto 1rem', color: '#10B981', opacity: 0.9 }} />
          <h3 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '0.5rem' }}>All Caught Up! Zero Pending Mails</h3>
          <p style={{ fontSize: '0.9rem', maxWidth: '460px', margin: '0 auto 1.5rem', color: '#475569' }}>
            All your tracked recruiter cold emails have been dispatched and migrated to <strong>Mail Sent & Applied</strong>.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.8rem' }}>
            <button
              onClick={() => navigate('/jobs')}
              className="btn btn-primary"
              style={{ padding: '0.6rem 1.4rem', fontSize: '0.9rem' }}
            >
              Discover More Jobs
            </button>
            <button
              onClick={() => navigate('/applied')}
              className="btn btn-secondary"
              style={{ padding: '0.6rem 1.4rem', fontSize: '0.9rem' }}
            >
              View Sent Mails ({sentAppsCount})
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {pendingApps.map((app: any) => {
            const isSelected = selectedIds.includes(app.id)
            const cleanComp = app.company.toLowerCase().replace(/[^a-z0-9]/g, '')
            const hrEmail = `hr@${cleanComp || 'company'}.com`
            const ccEmail = `info@${cleanComp || 'company'}.com`

            return (
              <div
                key={app.id}
                className="card"
                style={{
                  border: isSelected ? '1px solid #0078D4' : '1px solid #E2E8F0',
                  background: isSelected ? '#EFF6FF' : '#FFFFFF',
                  boxShadow: isSelected ? '0 8px 24px rgba(0, 120, 212, 0.1)' : 'var(--shadow-sm)'
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(app.id)}
                      style={{ width: '18px', height: '18px', accentColor: '#0078D4', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.2rem', margin: 0, color: '#0F172A' }}>
                          {app.title}
                        </h3>
                        {app.status === 'Manual Intervention' ? (
                          <span style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#EF4444',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            padding: '0.15rem 0.55rem',
                            borderRadius: '999px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}>
                            <AlertCircle size={12} /> Manual Apply Pending
                          </span>
                        ) : app.status === 'Failed' ? (
                          <span style={{
                            background: 'rgba(220, 38, 38, 0.1)',
                            border: '1px solid rgba(220, 38, 38, 0.2)',
                            color: '#DC2626',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            padding: '0.15rem 0.55rem',
                            borderRadius: '999px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}>
                            <AlertCircle size={12} /> Auto-Apply Failed
                          </span>
                        ) : (
                          <span style={{
                            background: '#FFFBEB',
                            border: '1px solid #FDE68A',
                            color: '#B45309',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            padding: '0.15rem 0.55rem',
                            borderRadius: '999px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}>
                            <Clock size={12} /> Mail Pending
                          </span>
                        )}
                        <span style={{
                          background: '#F0F9FF',
                          border: '1px solid #BAE6FD',
                          color: '#0369A1',
                          fontSize: '0.72rem',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px'
                        }}>
                          {app.source || 'Direct'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.35rem', fontSize: '0.82rem', color: '#64748B', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#1E293B', fontWeight: '600' }}>
                          <Building2 size={14} style={{ color: '#0078D4' }} />
                          {app.company}
                        </span>
                        <span>•</span>
                        <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '0.3', fontWeight: '500' }}>
                          <ShieldCheck size={13} /> To: {hrEmail}
                        </span>
                        <span>•</span>
                        <span style={{ color: '#0284C7', fontWeight: '500' }}>
                          CC: {ccEmail}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {app.status === 'Manual Intervention' ? (
                      <>
                        <a
                          href={app.job?.url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline"
                          style={{
                            padding: '0.5rem 1.1rem',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            textDecoration: 'none'
                          }}
                        >
                          <ExternalLink size={14} />
                          View & Apply
                        </a>
                        <button
                          className="btn"
                          onClick={() => completeMutation.mutate(app.id)}
                          style={{
                            background: '#10B981',
                            color: '#fff',
                            padding: '0.5rem 1.1rem',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem'
                          }}
                          disabled={completeMutation.isPending}
                        >
                          <CheckCircle2 size={14} />
                          Mark as Applied
                        </button>
                      </>
                    ) : app.status === 'Failed' ? (
                      <button
                        className="btn"
                        onClick={() => retryMutation.mutate(app)}
                        style={{
                          background: '#EF4444',
                          color: '#fff',
                          padding: '0.5rem 1.1rem',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem'
                        }}
                        disabled={retryMutation.isPending}
                      >
                        <Clock size={14} />
                        Retry Auto-Apply
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => setOutreachModal({
                          isOpen: true,
                          appId: app.id,
                          jobId: app.job_id || app.id,
                          jobTitle: app.title,
                          company: app.company
                        })}
                        style={{
                          padding: '0.5rem 1.1rem',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem'
                        }}
                      >
                        <Mail size={14} />
                        Send Outreach Mail
                      </button>
                    )}

                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 0.65rem', color: '#F87171' }}
                      title="Untrack / Remove from queue"
                      onClick={() => setUntrackTarget({ id: app.id, title: app.title })}
                      disabled={untrackMutation.isPending}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Outreach Email Modal */}
      <OutreachEmailModal
        isOpen={outreachModal.isOpen}
        appId={outreachModal.appId}
        jobId={outreachModal.jobId}
        jobTitle={outreachModal.jobTitle}
        company={outreachModal.company}
        onClose={() => setOutreachModal(prev => ({ ...prev, isOpen: false }))}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
          queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          queryClient.invalidateQueries({ queryKey: ['analytics'] })
        }}
      />

      {/* Bulk Outreach Modal */}
      <BulkOutreachModal
        isOpen={isBulkModalOpen}
        applications={selectedIds.length > 0 ? pendingApps.filter(a => selectedIds.includes(a.id) && a.status !== 'Manual Intervention') : pendingApps.filter(a => a.status !== 'Manual Intervention')}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={() => {
          setSelectedIds([])
          queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
          queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          queryClient.invalidateQueries({ queryKey: ['analytics'] })
        }}
      />

      {/* Untrack Confirmation */}
      <ConfirmModal
        isOpen={!!untrackTarget}
        title="Untrack Job Listing"
        message={`Do you want to remove "${untrackTarget?.title}" from the Pending Mail Queue?`}
        confirmText="Untrack Job"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          if (untrackTarget) {
            untrackMutation.mutate(untrackTarget.id)
          }
        }}
        onCancel={() => setUntrackTarget(null)}
      />

      {/* Live Application Telemetry Modal */}
      <LiveApplicationModal
        isOpen={liveSession.isOpen}
        appId={liveSession.appId}
        jobTitle={liveSession.jobTitle}
        company={liveSession.company}
        onClose={() => {
          setLiveSession(prev => ({ ...prev, isOpen: false }))
          queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
          queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
