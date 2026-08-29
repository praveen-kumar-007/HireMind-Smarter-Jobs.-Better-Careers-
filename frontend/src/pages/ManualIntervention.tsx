import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { 
  AlertCircle, 
  ExternalLink, 
  CheckCircle2, 
  Trash2, 
  Building2, 
  Briefcase, 
  MapPin, 
  Calendar
} from 'lucide-react'

export default function ManualIntervention() {
  const [filterText, setFilterText] = useState('')
  const queryClient = useQueryClient()

  // Fetch all applications with status "Manual Intervention"
  const { data: manualApps, isLoading } = useQuery({
    queryKey: ['manual-intervention-applications'],
    queryFn: async () => {
      const response = await api.get('/applications', {
        params: { status: 'Manual Intervention' }
      })
      return response.data
    }
  })

  // Mutation to mark the application as completed (status = "Applied")
  const completeMutation = useMutation({
    mutationFn: async (appId: number) => {
      await api.put(`/applications/${appId}`, { status: 'Applied', notes: 'Applied Manually' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual-intervention-applications'] })
      queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (appId: number) => {
      await api.delete(`/applications/${appId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual-intervention-applications'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    }
  })

  // Client-side text filter
  const filteredApps = (manualApps || []).filter((app: any) => {
    const term = filterText.toLowerCase()
    return (
      app.title?.toLowerCase().includes(term) ||
      app.company?.toLowerCase().includes(term) ||
      app.job?.location?.toLowerCase().includes(term)
    )
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div className="loader"></div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <AlertCircle style={{ color: '#EF4444' }} /> Need Manual Intervention
          </h1>
          <p className="text-muted">
            These jobs cannot be quick-applied because they require manual entries directly on the company's career page.
          </p>
        </div>
      </div>

      {/* Filter box */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by title, company, or location..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ maxWidth: '400px' }}
          />
        </div>
      </div>

      {filteredApps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--glass-bg)' }}>
          <CheckCircle2 size={48} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
          <h3>All caught up!</h3>
          <p className="text-muted" style={{ maxWidth: '450px', margin: '0.5rem auto 0' }}>
            No applications are pending manual intervention. Discovered company website jobs will be listed here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          {filteredApps.map((app: any) => {
            const jobUrl = app.job?.url || app.notes?.split(' - ').pop() || ''
            return (
              <div key={app.id} className="card" style={{ borderLeft: '4px solid #EF4444', background: 'var(--glass-bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        Manual Apply Needed
                      </span>
                      <span className="badge" style={{ background: 'var(--bg-tertiary)' }}>
                        {app.job?.source || 'Company Website'}
                      </span>
                    </div>

                    <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{app.title}</h3>
                    
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Building2 size={14} /> {app.company}
                      </span>
                      {app.job?.location && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <MapPin size={14} /> {app.job.location}
                        </span>
                      )}
                      {app.job?.experience && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Briefcase size={14} /> {app.job.experience}
                        </span>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Calendar size={14} /> Discovered {new Date(app.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {app.job?.description && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: '1.4', WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {app.job.description}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignSelf: 'center' }}>
                    {jobUrl && (
                      <a
                        href={jobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none' }}
                      >
                        <ExternalLink size={15} /> Apply on Site
                      </a>
                    )}
                    
                    <button
                      className="btn"
                      onClick={() => completeMutation.mutate(app.id)}
                      style={{ background: '#10B981', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      disabled={completeMutation.isPending}
                    >
                      <CheckCircle2 size={15} /> Mark as Applied
                    </button>

                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        if (confirm('Are you sure you want to dismiss this manual entry?')) {
                          deleteMutation.mutate(app.id)
                        }
                      }}
                      style={{ padding: '0.5rem 0.75rem', minWidth: 'auto' }}
                      disabled={deleteMutation.isPending}
                      title="Dismiss listing"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
