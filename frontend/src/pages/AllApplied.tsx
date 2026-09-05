import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { 
  CheckCircle2, 
  Mail, 
  Send, 
  ShieldCheck, 
  ExternalLink, 
  Clock, 
  Search, 
  Sparkles, 
  Paperclip, 
  Trash2,
  Calendar,
  Building2,
  Briefcase,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import OutreachEmailModal from '../components/OutreachEmailModal'
import BulkOutreachModal from '../components/BulkOutreachModal'
import { getDirectJobUrl } from './Jobs'

export default function AllApplied() {
  const [filterText, setFilterText] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [expandedAppId, setExpandedAppId] = useState<number | null>(null)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
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
  const navigate = useNavigate()

  // Fetch all applications with status Applied
  const { data: appliedApps, isLoading } = useQuery({
    queryKey: ['all-applied-applications'],
    queryFn: async () => {
      const response = await api.get('/applications', {
        params: { status: 'Applied' }
      })
      return response.data
    }
  })

  // Fetch pending applications count (ONLY applied and viewed jobs waiting for cold outreach)
  const { data: pendingAppsData } = useQuery({
    queryKey: ['pending-outreach-applications'],
    queryFn: async () => {
      const response = await api.get('/applications', {
        params: { status: 'Applied,Visited' }
      })
      return response.data
    }
  })

  const pendingApps = (pendingAppsData || []).filter(
    (app: any) => (app.status === 'Applied' || app.status === 'Visited') && (!app.notes || !app.notes.includes('Outreach Email Sent'))
  )

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async ({ appId, status }: { appId: number; status: string }) => {
      await api.put(`/applications/${appId}`, { status })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
      queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    }
  })

  const completedApps = (appliedApps || []).filter(
    (app: any) => app.notes && app.notes.includes('Outreach Email Sent')
  )

  const apps: any[] = completedApps.filter((app: any) => {
    if (!filterText) return true
    const term = filterText.toLowerCase()
    return (
      app.title?.toLowerCase().includes(term) ||
      app.company?.toLowerCase().includes(term) ||
      app.source?.toLowerCase().includes(term)
    )
  })

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === apps.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(apps.map(a => a.id))
    }
  }

  return (
    <div>
      {/* Top Executive Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, #FFFFFF 100%)',
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
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '0.72rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '0.2rem 0.65rem',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
            }}>
              <CheckCircle2 size={12} /> Mails Sent & Applied
            </span>
            <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: '500' }}>
              {completedApps.length} Total Completed
            </span>
          </div>
          <h1 style={{ fontSize: '2rem', fontFamily: 'var(--font-display)', margin: 0, color: '#0F172A' }}>
            Mails Sent & Applied Submissions
          </h1>
          <p style={{ color: '#475569', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            All jobs where recruiter cold emails have been dispatched with resume attached or applications submitted.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/visited')}
            className="btn btn-secondary"
            style={{
              borderColor: '#BAE6FD',
              color: '#0369A1',
              background: '#F0F9FF',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              fontWeight: '600'
            }}
          >
            <Clock size={16} />
            Pending Mails ({pendingApps?.length || 0})
          </button>

          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="btn btn-primary"
            disabled={completedApps.length === 0}
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
            Bulk Follow-up Outreach
            <span style={{
              background: 'rgba(255, 255, 255, 0.25)',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.75rem'
            }}>
              {completedApps.length}
            </span>
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
          onClick={() => navigate('/visited')}
          className="btn btn-secondary"
          style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem' }}
        >
          <Clock size={14} />
          Pending Mails Queue ({pendingApps?.length || 0})
        </button>

        <button
          className="btn btn-primary"
          style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem' }}
        >
          <CheckCircle2 size={14} />
          Mails Sent & Applied ({completedApps.length})
        </button>
      </div>

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
            placeholder="Search sent applications..."
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

        {apps.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
          >
            {selectedIds.length === apps.length ? 'Deselect All' : 'Select All Sent'}
          </button>
        )}
      </div>

      {/* Applications Cards List */}
      {isLoading ? (
        <div style={{ color: '#64748B', textAlign: 'center', padding: '3rem' }}>
          Loading sent applications...
        </div>
      ) : apps.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: '#FFFFFF',
          border: '1px dashed #CBD5E1',
          borderRadius: '16px',
          color: '#64748B'
        }}>
          <Mail size={40} style={{ margin: '0 auto 1rem', opacity: 0.7, color: '#0078D4' }} />
          <h3 style={{ fontSize: '1.25rem', color: '#0F172A', marginBottom: '0.5rem' }}>No Sent Applications Found</h3>
          <p style={{ fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto 1.5rem', color: '#475569' }}>
            Once you dispatch cold outreach emails from the Pending Mails queue, they will be archived here.
          </p>
          <button
            onClick={() => navigate('/visited')}
            className="btn btn-primary"
            style={{ padding: '0.6rem 1.4rem', fontSize: '0.9rem' }}
          >
            Go to Pending Mails Queue
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {apps.map((app: any) => {
            const isSelected = selectedIds.includes(app.id)
            const isExpanded = expandedAppId === app.id
            const cleanComp = app.company.toLowerCase().replace(/[^a-z0-9]/g, '')
            const hrEmail = `hr@${cleanComp || 'company'}.com`
            const ccEmail = `info@${cleanComp || 'company'}.com`
            const formattedDate = app.applied_date ? new Date(app.applied_date).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            }) : 'Recently'

            return (
              <div
                key={app.id}
                className="card"
                style={{
                  border: isSelected ? '1px solid #10B981' : '1px solid #E2E8F0',
                  background: isSelected ? '#ECFDF5' : '#FFFFFF',
                  boxShadow: isSelected ? '0 8px 24px rgba(16, 185, 129, 0.1)' : 'var(--shadow-sm)'
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(app.id)}
                      style={{ width: '18px', height: '18px', accentColor: '#10B981', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.2rem', margin: 0, color: '#0F172A' }}>
                          {app.title}
                        </h3>
                        <span style={{
                          background: '#ECFDF5',
                          border: '1px solid #A7F3D0',
                          color: '#047857',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}>
                          <CheckCircle2 size={12} /> Applied
                        </span>
                        <span style={{
                          background: '#EEF2FF',
                          border: '1px solid #C7D2FE',
                          color: '#4338CA',
                          fontSize: '0.72rem',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px'
                        }}>
                          {app.source || 'Direct'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.35rem', fontSize: '0.82rem', color: '#64748B', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#1E293B', fontWeight: '600' }}>
                          <Building2 size={14} style={{ color: '#4F46E5' }} />
                          {app.company}
                        </span>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Calendar size={13} /> Applied: {formattedDate}
                        </span>
                        <span>•</span>
                        <span style={{ color: '#059669', fontWeight: '500' }}>
                          To: {hrEmail}
                        </span>
                        <span>•</span>
                        <span style={{ color: '#4F46E5', fontWeight: '500' }}>
                          CC: {ccEmail}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => setOutreachModal({
                        isOpen: true,
                        appId: app.id,
                        jobTitle: app.title,
                        company: app.company
                      })}
                      style={{
                        background: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)',
                        padding: '0.5rem 1.1rem',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem'
                      }}
                    >
                      <Mail size={14} />
                      Follow-up Mail
                    </button>

                    <button
                      className="btn btn-secondary"
                      onClick={() => setExpandedAppId(isExpanded ? null : app.id)}
                      style={{ padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      Details
                    </button>
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div style={{
                    marginTop: '1.25rem',
                    paddingTop: '1.25rem',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.2rem'
                  }}>
                    {/* Telemetry & Attachment Summary */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '0.9rem'
                    }}>
                      <div style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        padding: '0.75rem 1rem',
                        borderRadius: '8px'
                      }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '0.25rem' }}>PRIMARY RECRUITER</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#059669', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <ShieldCheck size={14} /> {hrEmail}
                        </span>
                      </div>

                      <div style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        padding: '0.75rem 1rem',
                        borderRadius: '8px'
                      }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '0.25rem' }}>COMPANY PROFILE CC</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#4F46E5' }}>
                          {ccEmail}
                        </span>
                      </div>

                      <div style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        padding: '0.75rem 1rem',
                        borderRadius: '8px'
                      }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '0.25rem' }}>RESUME ATTACHMENT</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#F1F5F9', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Paperclip size={13} style={{ color: '#10B981' }} /> Resume Praveen Kumar.pdf
                        </span>
                      </div>
                    </div>

                    {/* Status update option */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Update Pipeline Stage</label>
                        <select
                          className="form-input"
                          style={{ background: '#0B101D', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#F8FAFC' }}
                          value={app.status}
                          onChange={(e) => statusMutation.mutate({ appId: app.id, status: e.target.value })}
                        >
                          <option value="Applied">Applied</option>
                          <option value="Interview">Interview Scheduled</option>
                          <option value="Offer">Offer Received</option>
                          <option value="Saved">Saved for Later</option>
                        </select>
                      </div>

                      {app.job?.url && (
                        <a
                          href={getDirectJobUrl(app.job)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.8rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                          <ExternalLink size={14} />
                          Original Job Posting
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Outreach Email Modal */}
      <OutreachEmailModal
        isOpen={outreachModal.isOpen}
        appId={outreachModal.appId}
        jobTitle={outreachModal.jobTitle}
        company={outreachModal.company}
        onClose={() => setOutreachModal(prev => ({ ...prev, isOpen: false }))}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          queryClient.invalidateQueries({ queryKey: ['analytics'] })
        }}
      />

      {/* Bulk Follow-up Modal */}
      <BulkOutreachModal
        isOpen={isBulkModalOpen}
        applications={selectedIds.length > 0 ? apps.filter(a => selectedIds.includes(a.id)) : completedApps}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={() => {
          setSelectedIds([])
          queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          queryClient.invalidateQueries({ queryKey: ['analytics'] })
        }}
      />
    </div>
  )
}
