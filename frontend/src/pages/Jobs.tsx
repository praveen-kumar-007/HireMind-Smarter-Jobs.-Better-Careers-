import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Search, Sparkles, Plus, ExternalLink, Calendar, MapPin, Briefcase, Trash2, XCircle, CheckCircle2, BookmarkPlus, Clock, Zap } from 'lucide-react'
import LiveTimer from '../components/LiveTimer'
import ConfirmModal from '../components/ConfirmModal'
import Toast from '../components/Toast'
import LiveApplicationModal from '../components/LiveApplicationModal'

export default function Jobs() {
  const [searchTerm, setSearchTerm] = useState('')
  const [location, setLocation] = useState('')
  const [source, setSource] = useState('')
  const [applyType, setApplyType] = useState('')
  const [matchProfile, setMatchProfile] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [autoApplyingAll, setAutoApplyingAll] = useState(false)
  const [activeMatchJobId, setActiveMatchJobId] = useState<number | null>(null)
  const [autoApplyingJobId, setAutoApplyingJobId] = useState<number | null>(null)
  const [liveSession, setLiveSession] = useState<{ isOpen: boolean; appId: number | null; jobTitle: string; company: string }>({
    isOpen: false,
    appId: null,
    jobTitle: '',
    company: ''
  })
  const [clearingJobId, setClearingJobId] = useState<number | null>(null)
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false)
  const [dismissTarget, setDismissTarget] = useState<{ id: number; job_id: string; title: string } | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

  const queryClient = useQueryClient()

  // Fetch Jobs List with live 1s refetch during active crawling
  const { data: jobs, refetch, isFetching } = useQuery({
    queryKey: ['jobs', scanning],
    queryFn: async () => {
      const response = await api.get('/jobs')
      return response.data
    },
    refetchInterval: scanning ? 1000 : false
  })

  // Fetch current user applications for live card badges
  const { data: userApplications } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const response = await api.get('/applications')
      return response.data
    }
  })

  // Client-side filtering logic
  const filteredJobs = (jobs || []).filter((job: any) => {
    // 1. Filter by keyword search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const titleMatch = job.title?.toLowerCase().includes(term);
      const companyMatch = job.company?.toLowerCase().includes(term);
      const descMatch = job.description?.toLowerCase().includes(term);
      const skillMatch = job.skills?.some((s: any) => 
        (typeof s === 'string' ? s : s.name)?.toLowerCase().includes(term)
      );
      if (!titleMatch && !companyMatch && !descMatch && !skillMatch) {
        return false;
      }
    }

    // 2. Filter by location
    if (location.trim()) {
      const loc = location.toLowerCase();
      if (!job.location?.toLowerCase().includes(loc)) {
        return false;
      }
    }

    // 3. Filter by source board
    if (source) {
      if (job.source !== source) {
        return false;
      }
    }

    // 3.5 Filter by apply type
    if (applyType) {
      const isQuick = job.source !== 'Company Website';
      if (applyType === 'quick' && !isQuick) return false;
      if (applyType === 'external' && isQuick) return false;
    }

    // 4. Remove fully-applied ones (but keep Quick Applied & Company Website jobs visible)
    const appForJob = userApplications?.find((app: any) => 
      (app.job?.job_id === job.job_id || app.job_id === job.id) && app.status !== 'Dismissed'
    );
    if (appForJob) {
      // Keep Quick Applied and Company Website jobs visible on the board
      const isQuickApplied = appForJob.notes?.includes('Quick Applied');
      const isCompanyWebsite = appForJob.notes?.includes('Company Website');
      if (!isQuickApplied && !isCompanyWebsite) {
        return false;
      }
    }

    return true;
  });

  // Sort: Quick Apply (LinkedIn, Naukri, Indeed) first, then Company Website
  const sortedFilteredJobs = [...filteredJobs].sort((a: any, b: any) => {
    const isQuickA = a.source !== 'Company Website';
    const isQuickB = b.source !== 'Company Website';
    
    if (isQuickA && !isQuickB) return -1;
    if (!isQuickA && isQuickB) return 1;
    
    // Sort newly arrived items first
    return b.id - a.id;
  });

  // Scan Live Jobs Crawler
  const scanMutation = useMutation({
    mutationFn: async (overrideSearch?: string) => {
      setScanning(true)
      const response = await api.get('/jobs', {
        params: { 
          trigger_scan: true,
          location: location || undefined,
          search: overrideSearch || searchTerm || undefined
        }
      })
      return response.data
    },
    onSuccess: (data) => {
      setScanning(false)
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      setToast({
        type: 'success',
        message: 'Live job scan completed! Latest listings added.'
      })
    },
    onError: () => {
      setScanning(false)
      setToast({
        type: 'error',
        message: 'Live job crawler encountered an issue.'
      })
    }
  })

  // Calculate Match Score
  const matchMutation = useMutation({
    mutationFn: async (job: any) => {
      setActiveMatchJobId(job.id)
      const ensureRes = await api.post('/jobs/ensure', {
        job_id: job.job_id,
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary,
        experience: job.experience,
        description: job.description,
        url: job.url,
        source: job.source,
        posted_date: job.posted_date,
        skills: job.skills?.map((s: any) => typeof s === 'string' ? s : s.name) || []
      })
      const dbJobId = ensureRes.data.id

      const response = await api.post('/match', { job_id: dbJobId })
      return { matchData: response.data, job }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      
      setToast({
        type: 'success',
        message: 'AI matching complete! View the calculated score badge.'
      })
    },
    onError: (err: any) => {
      setToast({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to match. Did you upload a resume first?'
      })
    }
  })

  // Track in Pending Outreach Mail Queue
  const trackInVisitedMutation = useMutation({
    mutationFn: async (job: any) => {
      const ensureRes = await api.post('/jobs/ensure', {
        job_id: job.job_id,
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary,
        experience: job.experience,
        description: job.description,
        url: job.url,
        source: job.source,
        posted_date: job.posted_date,
        skills: job.skills?.map((s: any) => typeof s === 'string' ? s : s.name) || []
      })
      const dbJobId = ensureRes.data.id

      const response = await api.post(`/outreach/jobs/${dbJobId}/visit`)
      return { data: response.data, job }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['visited-applications'] })
      queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      
      setToast({
        type: 'success',
        message: 'Job added to Pending Mail Queue! Recruiter cold email is ready.'
      })
    },
    onError: (err: any) => {
      setToast({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to track job in pending queue.'
      })
    }
  })

  // Save + Auto-Apply Mutation
  const autoApplyMutation = useMutation({
    mutationFn: async (payload: { job: any }) => {
      setAutoApplyingJobId(payload.job.id)
      const ensureRes = await api.post('/jobs/ensure', {
        job_id: payload.job.job_id,
        title: payload.job.title,
        company: payload.job.company,
        location: payload.job.location,
        salary: payload.job.salary,
        experience: payload.job.experience,
        description: payload.job.description,
        url: payload.job.url,
        source: payload.job.source,
        posted_date: payload.job.posted_date,
        skills: payload.job.skills?.map((s: any) => typeof s === 'string' ? s : s.name) || []
      })
      const dbJobId = ensureRes.data.id

      // 1. Create/Retrieve application for this job
      const saveResponse = await api.post('/applications', { job_id: dbJobId })
      const appId = saveResponse.data.id

      // If it is a company website manual apply, bypass browser automation entirely
      if (payload.job.source === 'Company Website') {
        return { data: { status: 'manual_apply_required', message: 'Saved to Manual Intervention list.' }, job: payload.job }
      }

      // Open live visual progress session modal immediately (only for Quick Apply)
      setLiveSession({
        isOpen: true,
        appId: appId,
        jobTitle: payload.job.title,
        company: payload.job.company
      })
      
      // 2. Trigger Playwright auto-apply agent
      const applyResponse = await api.post(`/applications/${appId}/auto-fill`)
      return { data: applyResponse.data, job: payload.job }
    },
    onSuccess: (res) => {
      setAutoApplyingJobId(null)
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['visited-applications'] })

      if (res.data.status === 'success') {
        setToast({
          type: 'success',
          message: 'Success! The AI agent completed the Easy Apply submission.'
        })
      } else if (res.data.status === 'manual_apply_required') {
        setToast({
          type: 'info',
          message: `Company Website Detected: ${res.data.message || 'Left for manual application as requested.'}`
        })
      } else if (res.data.status === 'human_action_required') {
        setToast({
          type: 'info',
          message: `Human Action Required: ${res.data.message}`
        })
      }
    },
    onError: (err: any) => {
      setAutoApplyingJobId(null)
      setToast({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to auto-apply. Ensure credentials and profiles are set.'
      })
    }
  })

  // Auto-Apply All Matched Jobs Mutation
  const autoApplyAllMutation = useMutation({
    mutationFn: async () => {
      setAutoApplyingAll(true)
      const response = await api.post('/applications/auto-apply-all')
      return response.data
    },
    onSuccess: (data) => {
      setAutoApplyingAll(false)
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['visited-applications'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      setToast({
        type: 'success',
        message: data.message || 'Auto-apply complete! Matched applications processed.'
      })
    },
    onError: (err: any) => {
      setAutoApplyingAll(false)
      setToast({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to auto-apply all matched jobs.'
      })
    }
  })

  // Dismiss Single Job Mutation
  const dismissMutation = useMutation({
    mutationFn: async (jobId: number) => {
      await api.post(`/jobs/${jobId}/dismiss`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      setToast({
        type: 'info',
        message: 'Job listing cleared from board.'
      })
    }
  })

  // Dismiss Bulk Jobs Mutation
  const dismissBulkMutation = useMutation({
    mutationFn: async (jobIds: number[]) => {
      await api.post('/jobs/dismiss-bulk', { job_ids: jobIds })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      setToast({
        type: 'success',
        message: 'All current listings have been cleared from the board!'
      })
    }
  })

  const getMatchScoreBadge = (score: number) => {
    if (score >= 80) return 'badge-success'
    if (score >= 60) return 'badge-primary'
    return 'badge-warning'
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>Discovered Jobs</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Explore listings crawled from LinkedIn, Naukri, Indeed, Foundit, and more.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            className="btn" 
            onClick={() => autoApplyAllMutation.mutate()}
            disabled={autoApplyingAll || scanning}
            style={{ 
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
              color: '#ffffff', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.35rem',
              boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.4)',
              fontWeight: '700'
            }}
          >
            <Zap size={16} />
            {autoApplyingAll ? 'Auto-Applying All...' : '⚡ Auto-Apply All Matched'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => scanMutation.mutate('Software Developer urgent hiring')}
            disabled={scanning}
            style={{ borderColor: 'var(--warning)', color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Sparkles size={14} />
            Scan Urgent Hiring
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => scanMutation.mutate('Software Engineer mass hiring')}
            disabled={scanning}
            style={{ borderColor: '#60a5fa', color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Sparkles size={14} />
            Scan Mass Hiring
          </button>
          <button 
            className="btn btn-primary pulse-glow" 
            onClick={() => scanMutation.mutate()}
            disabled={scanning}
          >
            <Sparkles />
            {scanning ? 'Crawling Job Boards...' : 'Scan Jobs via AI'}
          </button>
          {sortedFilteredJobs && sortedFilteredJobs.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmClearAllOpen(true)}
              style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
              title="Clear all currently displayed jobs"
            >
              <Trash2 size={14} />
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Filter card */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label className="form-label">Job Keywords</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder={matchProfile ? "Filtering by your resume/profile data..." : "e.g. Python, React"} 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Location</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. Bangalore, Remote" 
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Source Board</label>
            <select 
              className="form-input" 
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <option value="">All Sources (Company Sites, LinkedIn, Naukri)</option>
              <option value="Company Website">Company Website (Direct Careers)</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Naukri">Naukri</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Apply Type</label>
            <select 
              className="form-input" 
              value={applyType}
              onChange={(e) => setApplyType(e.target.value)}
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <option value="">All Apply Types</option>
              <option value="quick">⚡ Quick Apply (AI Auto-Fill)</option>
              <option value="external">🌐 External Apply (Company Site)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)', flexWrap: 'wrap', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={matchProfile}
              onChange={(e) => setMatchProfile(e.target.checked)}
              style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
            />
            <span>Match only with my <strong>Resume & Target Roles</strong></span>
          </label>

          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Calendar size={13} /> Showing <strong>Most Recent Jobs First</strong> across all equal sources
          </span>
        </div>
      </div>

      {/* Live Parallel Crawl Streaming Banner */}
      {scanning && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          boxShadow: '0 4px 14px rgba(0, 120, 212, 0.1)',
          padding: '0.75rem 1.25rem',
          borderRadius: '12px',
          marginBottom: '1.25rem',
          color: '#1E40AF',
          fontSize: '0.88rem'
        }}>
          <Sparkles size={16} style={{ color: '#0078D4', animation: 'spin 2s linear infinite' }} />
          <span>
            <strong>Ultra-Fast Parallel Crawl Active:</strong> Streaming new jobs from LinkedIn, Naukri & Company Websites instantly as they are discovered...
          </span>
        </div>
      )}

      {/* Jobs list */}
      {isFetching && !scanning && <div style={{ color: '#64748B', marginBottom: '1rem' }}>Updating listings...</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {sortedFilteredJobs?.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
            No jobs found matching your filters. Try clicking "Scan Jobs via AI" to crawl job boards.
          </div>
        ) : (
          sortedFilteredJobs?.map((job: any, index: number) => {
            // Check if user has job_matches
            const matchRecord = job.job_matches?.find((m: any) => m.job_id === job.id)
            const matchScore = matchRecord ? matchRecord.match_score : null
            const appRecord = userApplications?.find((a: any) => a.job_id === job.id && a.status !== 'Dismissed')
            
            // Card highlight styles
            const isCompanyWebsite = appRecord?.notes?.includes('Company Website');
            const isQuickApplied = appRecord?.notes?.includes('Quick Applied');
            const cardHighlight: React.CSSProperties = isCompanyWebsite
              ? { borderLeft: '4px solid #F59E0B', background: 'linear-gradient(90deg, rgba(245,158,11,0.06) 0%, transparent 30%)' }
              : isQuickApplied
                ? { borderLeft: '4px solid #10B981', background: 'linear-gradient(90deg, rgba(16,185,129,0.06) 0%, transparent 30%)' }
                : {};

            return (
              <div key={job.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', ...cardHighlight }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ flex: '1 1 300px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <h3 style={{ fontSize: '1.25rem', margin: '0', display: 'flex', alignItems: 'center', color: '#0F172A' }}>
                        <span style={{ color: '#64748B', marginRight: '0.6rem', fontWeight: 'bold' }}>#{index + 1}</span>
                        {job.title}
                      </h3>
                      <LiveTimer date={job.created_at || job.posted_date} prefix="Added" />
                      
                      {appRecord?.status === 'Applied' && (
                        <span style={{
                          background: appRecord.notes?.includes('Company Website') 
                            ? 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)'
                            : appRecord.notes?.includes('Quick Applied') 
                              ? 'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)' 
                              : appRecord.notes?.includes('Outreach Email Sent') ? '#D1FAE5' : '#ECFDF5',
                          border: appRecord.notes?.includes('Company Website')
                            ? '1px solid #F59E0B'
                            : appRecord.notes?.includes('Quick Applied')
                              ? '1px solid #10B981'
                              : appRecord.notes?.includes('Outreach Email Sent') ? '1px solid #10B981' : '1px solid #A7F3D0',
                          color: appRecord.notes?.includes('Company Website') ? '#92400E' : '#065F46',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}>
                          <CheckCircle2 size={12} /> {
                            appRecord.notes?.includes('Company Website')
                              ? '🌐 Company Website - Apply Manually'
                              : appRecord.notes?.includes('Quick Applied') 
                                ? '⚡ Quick Applied & Queued for Mail' 
                                : appRecord.notes?.includes('Outreach Email Sent') 
                                  ? 'Applied & Outreach Sent' 
                                  : 'Applied & Queued'
                          }
                        </span>
                      )}

                      {appRecord?.status === 'Visited' && (
                        <span style={{
                          background: '#FFFBEB',
                          border: '1px solid #FDE68A',
                          color: '#B45309',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}>
                          <Clock size={12} /> In Pending Queue
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem', color: '#64748B' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#1E293B', fontWeight: '600' }}>
                        <Briefcase size={14} style={{ color: '#0078D4' }} /> {job.company}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <MapPin size={14} /> {job.location}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Calendar size={14} /> {job.experience}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {matchScore !== null ? (
                      <span className={`badge ${getMatchScoreBadge(matchScore)}`} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                        {matchScore}% Match
                      </span>
                    ) : (
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => matchMutation.mutate(job)}
                        disabled={matchMutation.isPending && activeMatchJobId === job.id}
                      >
                        <Sparkles size={16} style={{ color: '#0078D4' }} />
                        {matchMutation.isPending && activeMatchJobId === job.id ? 'Matching...' : 'Match AI'}
                      </button>
                    )}

                    <button 
                      className="btn btn-primary"
                      onClick={() => autoApplyMutation.mutate({ job })}
                      disabled={autoApplyMutation.isPending && autoApplyingJobId === job.id}
                      style={{ background: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)' }}
                      title="Auto-apply via AI and track in Visited Outreach"
                    >
                      <Sparkles size={14} />
                      {autoApplyMutation.isPending && autoApplyingJobId === job.id ? 'Applying...' : 'Auto-Apply'}
                    </button>                    <button 
                      className="btn btn-secondary" 
                      onClick={() => trackInVisitedMutation.mutate(job)}
                      disabled={trackInVisitedMutation.isPending}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                      title="Store in Pending Outreach Queue"
                    >
                      <BookmarkPlus size={15} style={{ color: 'var(--primary)' }} />
                      Add to Pending Mail
                    </button>

                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setDismissTarget({ id: job.id, job_id: job.job_id, title: job.title })}
                      style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                      title="Clear / Dismiss if not relevant"
                    >
                      <XCircle size={15} />
                      Clear
                    </button>
                  </div>
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
                  {job.description?.substring(0, 240)}...
                </p>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {job.skills?.map((s: any) => (
                    <span key={s.id} className="badge badge-info" style={{ textTransform: 'none' }}>
                      {s.name}
                    </span>
                  ))}
                </div>

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  borderTop: '1px solid var(--glass-border)', 
                  paddingTop: '1rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)'
                }}>
                  <span>Source: <strong>{job.source}</strong></span>
                  <button 
                    onClick={async () => {
                      const newWindow = window.open(job.url, '_blank');
                      try {
                        const ensureRes = await api.post('/jobs/ensure', {
                          job_id: job.job_id,
                          title: job.title,
                          company: job.company,
                          location: job.location,
                          salary: job.salary,
                          experience: job.experience,
                          description: job.description,
                          url: job.url,
                          source: job.source,
                          posted_date: job.posted_date,
                          skills: job.skills?.map((s: any) => typeof s === 'string' ? s : s.name) || []
                        })
                        const dbJobId = ensureRes.data.id

                        await api.post(`/outreach/jobs/${dbJobId}/visit`)
                        queryClient.invalidateQueries({ queryKey: ['jobs'] })
                        queryClient.invalidateQueries({ queryKey: ['visited-applications'] })
                        queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
                        queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
                        queryClient.invalidateQueries({ queryKey: ['applications'] })
                        queryClient.invalidateQueries({ queryKey: ['analytics'] })

                        setToast({
                          type: 'success',
                          message: `"${job.title}" registered as Applied & queued for recruiter outreach!`
                        })
                      } catch (err) {
                        console.error("Failed to register job visit", err);
                      }
                    }}
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '0.35rem', 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--primary)', 
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      padding: '0'
                    }}
                    title="Open listing to apply manually (automatically tracks in Applied & Pending Outreach)"
                  >
                    View Listing (Apply Manually) <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Confirmation Modal for Clear Single Job */}
      <ConfirmModal
        isOpen={!!dismissTarget}
        title="Clear Job Listing"
        message={`Are you sure you want to dismiss "${dismissTarget?.title}"? It will be removed from your active job board.`}
        confirmText="Clear Job"
        cancelText="Keep"
        variant="danger"
        onConfirm={() => {
          if (dismissTarget) {
            dismissMutation.mutate(dismissTarget.id);
            setDismissTarget(null);
          }
        }}
        onCancel={() => setDismissTarget(null)}
      />

      {/* Confirmation Modal for Clear All Jobs */}
      <ConfirmModal
        isOpen={confirmClearAllOpen}
        title="Clear All Displayed Listings"
        message={`Are you sure you want to clear all ${sortedFilteredJobs?.length || 0} jobs currently shown on your board?`}
        confirmText="Clear All Jobs"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          dismissBulkMutation.mutate(sortedFilteredJobs.map((j: any) => j.id));
          setConfirmClearAllOpen(false);
        }}
        onCancel={() => setConfirmClearAllOpen(false)}
      />

      {/* Feedback Toast */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Live AI Auto-Apply Session Modal */}
      <LiveApplicationModal
        isOpen={liveSession.isOpen}
        appId={liveSession.appId}
        jobTitle={liveSession.jobTitle}
        company={liveSession.company}
        onClose={() => setLiveSession(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}

