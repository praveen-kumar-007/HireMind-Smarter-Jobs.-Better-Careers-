import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Search, Sparkles, Plus, ExternalLink, Calendar, MapPin, Briefcase, Trash2, XCircle, CheckCircle2, BookmarkPlus, Clock, Zap, Mail, Bookmark, Send, RotateCcw, Puzzle } from 'lucide-react'
import LiveTimer from '../components/LiveTimer'
import ConfirmModal from '../components/ConfirmModal'
import Toast from '../components/Toast'
import LiveApplicationModal from '../components/LiveApplicationModal'

export function getDirectJobUrl(job: any): string {
  let url = (job?.url || '').trim();
  const source = (job?.source || '').toLowerCase();
  const title = job?.title || 'Software Developer';
  const location = job?.location || 'India';
  
  if (source.includes('naukri') || url.includes('naukri.com') || (!url && !source)) {
    // If it's already an unexpired direct job-listings URL, return it directly
    if (url && url.includes('/job-listings-')) {
      if (!url.startsWith('http')) {
        return `https://www.naukri.com${url.startsWith('/') ? '' : '/'}${url}`;
      }
      return url;
    }
    
    // If it is a valid search URL or category URL, keep it clean
    if (url && (url.includes('-jobs-in-') || url.includes('?k=') || url.includes('/jobs-in-'))) {
      if (!url.startsWith('http')) {
        return `https://www.naukri.com${url.startsWith('/') ? '' : '/'}${url}`;
      }
      return url;
    }
    
    // Otherwise construct a clean, valid Naukri search URL that loads live jobs without ?expJD=true
    const cleanTitle = title.replace(/[^a-zA-Z0-9\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '-');
    const cleanLoc = location.replace(/[^a-zA-Z0-9\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '-') || 'india';
    return `https://www.naukri.com/${cleanTitle}-jobs-in-${cleanLoc}?k=${encodeURIComponent(title)}`;
  }
  
  if (url && !url.startsWith('http')) {
    return `https://www.naukri.com${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return url || 'https://www.naukri.com';
}

export default function Jobs() {
  const [searchTerm, setSearchTerm] = useState('')
  const [location, setLocation] = useState('')
  const [source, setSource] = useState('')
  const [applyType, setApplyType] = useState('')
  const [matchProfile, setMatchProfile] = useState(true)
  const [showApplied, setShowApplied] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanStatusText, setScanStatusText] = useState('')
  const [scanQueryTerm, setScanQueryTerm] = useState('')
  const [foundNewCount, setFoundNewCount] = useState<number | null>(null)
  const [showScanSummary, setShowScanSummary] = useState(false)
  const [autoApplyingAll, setAutoApplyingAll] = useState(false)
  const [activeMatchJobId, setActiveMatchJobId] = useState<number | null>(null)
  const [autoApplyingJobId, setAutoApplyingJobId] = useState<number | null>(null)
  const [revertingJobId, setRevertingJobId] = useState<number | null>(null)
  const [hasExtension, setHasExtension] = useState(false)
  const [showExtensionModal, setShowExtensionModal] = useState(false)
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

  // Detect and synchronize with HireMind Chrome Extension
  useEffect(() => {
    const checkExt = () => {
      if ((window as any).__HIREMIND_EXTENSION_INSTALLED__ || document.documentElement.hasAttribute('data-hiremind-extension')) {
        setHasExtension(true);
      }
    };

    checkExt();

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'HIREMIND_EXTENSION_READY' || event.data?.type === 'HIREMIND_PONG') {
        setHasExtension(true);
      } else if (event.data?.type === 'HIREMIND_APPLY_ACK') {
        setHasExtension(true);
        if (event.data.status === 'error') {
          console.warn('[Jobs] Extension delegation note:', event.data.error);
          if (event.data.error && event.data.error.includes('context invalidated')) {
            setToast({
              type: 'info',
              message: 'Extension was reloaded. Please refresh this tab (F5) to use native extension mode. Proceeding with automated background apply...'
            });
          }
          // Automatic seamless fallback to backend auto-apply
          if (event.data.appId) {
            try {
              await api.post(`/applications/${event.data.appId}/auto-fill`);
            } catch (fallbackErr) {
              console.error('Fallback auto-fill error:', fallbackErr);
            }
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    window.postMessage({ type: 'HIREMIND_PING' }, '*');

    // Sync current session token with extension
    const token = localStorage.getItem('access_token');
    if (token) {
      window.postMessage({
        type: 'HIREMIND_SYNC_AUTH',
        token,
        serverUrl: window.location.origin.includes('localhost')
          ? 'http://localhost:8000'
          : 'https://hiremind-smarter-jobs-better-careers.onrender.com'
      }, '*');
    }

    const timer = setTimeout(checkExt, 1000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timer);
    };
  }, [])

  // Fetch Jobs List with live 1s refetch during active crawling
  const { data: jobs, refetch, isFetching } = useQuery({
    queryKey: ['jobs', matchProfile],
    queryFn: async () => {
      const response = await api.get('/jobs', {
        params: { match_profile: matchProfile }
      })
      return response.data
    },
    staleTime: 0,
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

    // 2. Filter by location (handles worldwide, india, and regional synonyms)
    if (location.trim()) {
      const loc = location.trim().toLowerCase();
      if (loc !== 'worldwide' && loc !== 'india') {
        const jobLoc = (job.location || '').toLowerCase();
        const isLocMatch = 
          jobLoc.includes(loc) ||
          (loc === 'bangalore' && jobLoc.includes('bengaluru')) ||
          (loc === 'bengaluru' && jobLoc.includes('bangalore')) ||
          (loc === 'gurgaon' && jobLoc.includes('gurugram')) ||
          (loc === 'gurugram' && jobLoc.includes('gurgaon')) ||
          (loc === 'delhi' && (jobLoc.includes('noida') || jobLoc.includes('gurgaon') || jobLoc.includes('ncr') || jobLoc.includes('delhi'))) ||
          jobLoc.includes('remote') ||
          jobLoc.includes('india');
        if (!isLocMatch) {
          return false;
        }
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

    // 4. Filter out Applied, Mail Sent, and Dismissed jobs from active job search
    const appForJob = userApplications?.find((app: any) => 
      (app.job?.job_id === job.job_id || app.job_id === job.id) ||
      (app.company?.trim().toLowerCase() === job.company?.trim().toLowerCase() && 
       app.title?.trim().toLowerCase() === job.title?.trim().toLowerCase())
    );

    if (appForJob) {
      if (appForJob.status === 'Dismissed') {
        return false;
      }

      const isAppliedOrMailSent = 
        appForJob.status === 'Applied' ||
        appForJob.status === 'Interview' ||
        appForJob.status === 'Offer' ||
        appForJob.status === 'Joined' ||
        (appForJob.notes && (
          appForJob.notes.toLowerCase().includes('outreach') ||
          appForJob.notes.toLowerCase().includes('mail') ||
          appForJob.notes.toLowerCase().includes('email')
        ));

      if (isAppliedOrMailSent && !showApplied) {
        return false;
      }
    }

    return true;
  });

  // Calculate count of applied / outreach jobs currently hidden
  const appliedOrMailSentCount = (jobs || []).filter((job: any) => {
    const appForJob = userApplications?.find((app: any) => 
      (app.job?.job_id === job.job_id || app.job_id === job.id) ||
      (app.company?.trim().toLowerCase() === job.company?.trim().toLowerCase() && 
       app.title?.trim().toLowerCase() === job.title?.trim().toLowerCase())
    );
    return appForJob && (
      appForJob.status === 'Applied' ||
      appForJob.status === 'Interview' ||
      appForJob.status === 'Offer' ||
      appForJob.status === 'Joined' ||
      (appForJob.notes && (
        appForJob.notes.toLowerCase().includes('outreach') ||
        appForJob.notes.toLowerCase().includes('mail') ||
        appForJob.notes.toLowerCase().includes('email')
      ))
    );
  }).length;

  // Sort: Naukri first, then other verified listings
  const sortedFilteredJobs = [...filteredJobs].sort((a: any, b: any) => {
    if (a.source === 'Naukri' && b.source !== 'Naukri') return -1;
    if (a.source !== 'Naukri' && b.source === 'Naukri') return 1;
    
    const isQuickA = a.source !== 'Company Website';
    const isQuickB = b.source !== 'Company Website';
    if (isQuickA && !isQuickB) return -1;
    if (!isQuickA && isQuickB) return 1;
    
    // Sort newly arrived items first
    return b.id - a.id;
  });

  // Scan Live Jobs Crawler with Realistic Real-Time Progress Bar
  const scanMutation = useMutation({
    mutationFn: async (overrideSearch?: string) => {
      const prevCount = (jobs || []).length
      const queryTerm = overrideSearch || searchTerm || 'IT Software Roles'
      
      setScanning(true)
      setShowScanSummary(false)
      setFoundNewCount(null)
      setScanProgress(14)
      setScanQueryTerm(queryTerm)
      setScanStatusText('Connecting to Naukri Crawler & initializing session...')

      // Simulated progressive stages during crawling
      const interval = setInterval(() => {
        setScanProgress((prev) => {
          if (prev < 35) {
            setScanStatusText(`Searching Naukri listings for "${queryTerm}" in ${location || 'India'}...`)
            return prev + 6
          } else if (prev < 68) {
            setScanStatusText('Scanning active IT tuples, extracting CTC, experience & skill tags...')
            return prev + 5
          } else if (prev < 88) {
            setScanStatusText('Analyzing tech role alignment, filtering fresh vacancies & deduplicating...')
            return prev + 3
          } else if (prev < 96) {
            setScanStatusText('Finalizing job discovery and storing records in database...')
            return prev + 1
          }
          return prev
        })
      }, 450)

      try {
        const response = await api.get('/jobs', {
          params: { 
            trigger_scan: true,
            location: location || undefined,
            search: overrideSearch || searchTerm || undefined
          }
        })
        clearInterval(interval)
        return { data: response.data, prevCount }
      } catch (err) {
        clearInterval(interval)
        throw err
      }
    },
    onSuccess: (res) => {
      setScanProgress(100)
      const newTotal = res.data?.length || 0
      const newDiscovered = Math.max(0, newTotal - res.prevCount)
      setFoundNewCount(newDiscovered > 0 ? newDiscovered : newTotal)
      setScanStatusText(
        newDiscovered > 0
          ? `Scan complete! Discovered ${newDiscovered} new verified IT opportunities on Naukri.`
          : `Scan complete! Found ${newTotal} active verified IT listings on Naukri.`
      )
      setScanning(false)
      setShowScanSummary(true)
      queryClient.setQueryData(['jobs', matchProfile], res.data)
      queryClient.setQueryData(['jobs'], res.data)
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      setToast({
        type: 'success',
        message: newDiscovered > 0 ? `Discovery complete! Added ${newDiscovered} new jobs.` : 'Job scan completed! All listings refreshed.'
      })
    },
    onError: () => {
      setScanning(false)
      setScanProgress(0)
      setShowScanSummary(false)
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
      
      const isExtInstalled = hasExtension || (window as any).__HIREMIND_EXTENSION_INSTALLED__ || document.documentElement.hasAttribute('data-hiremind-extension');
      
      const token = localStorage.getItem('access_token') || '';
      const serverUrl = window.location.origin.includes('localhost')
        ? 'http://localhost:8000'
        : 'https://hiremind-smarter-jobs-better-careers.onrender.com';

      let targetJobUrl = getDirectJobUrl(payload.job);
      const sep = targetJobUrl.includes('?') ? '&' : '?';
      const directApplyUrl = `${targetJobUrl}${sep}hiremind_app_id=${appId}`;

      // 1. Dispatch message to extension bridge
      window.postMessage({
        type: 'HIREMIND_START_APPLY',
        appId: appId,
        job: payload.job,
        token,
        serverUrl
      }, '*');

      // 2. Open Naukri job tab directly so the content script automator starts immediately
      window.open(directApplyUrl, '_blank');

      return {
        data: {
          status: 'started',
          message: 'Job application session launched in browser tab with your active login!'
        },
        job: payload.job
      };
    },
    onSuccess: (res) => {
      setAutoApplyingJobId(null)
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['visited-applications'] })

      if (res.data.status === 'started') {
        // Expected success state: Background automation runner process spawned
        setToast({
          type: 'success',
          message: 'Browser automation session started successfully!'
        })
      } else if (res.data.status === 'success') {
        setToast({
          type: 'success',
          message: 'Success! The AI agent completed the Easy Apply submission.'
        })
      } else if (res.data.status === 'manual_apply_required') {
        setLiveSession({ isOpen: false, appId: null, jobTitle: '', company: '' })
        setToast({
          type: 'info',
          message: `Company Website Detected: ${res.data.message || 'Left for manual application as requested.'}`
        })
      } else if (res.data.status === 'human_action_required') {
        setToast({
          type: 'info',
          message: `Human Action Required: ${res.data.message}`
        })
      } else {
        setLiveSession({ isOpen: false, appId: null, jobTitle: '', company: '' })
        setToast({
          type: 'error',
          message: res.data.message || 'Failed to auto-apply.'
        })
      }
    },
    onError: (err: any) => {
      setAutoApplyingJobId(null)
      setLiveSession({ isOpen: false, appId: null, jobTitle: '', company: '' })
      setToast({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Failed to auto-apply. Ensure credentials and profiles are set.'
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

  // Revert Last Application Mutation (Global Undo)
  const revertLastMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/applications/revert-last')
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['visited-applications'] })
      queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
      queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      if (data.status === 'reverted') {
        setToast({
          type: 'success',
          message: data.message || 'Last application reverted back to unapplied!'
        })
      } else {
        setToast({
          type: 'info',
          message: data.message || 'No recent application found to revert.'
        })
      }
    },
    onError: (err: any) => {
      setToast({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to revert last application.'
      })
    }
  })

  // Revert Specific Job Application Mutation
  const revertJobMutation = useMutation({
    mutationFn: async (job: any) => {
      setRevertingJobId(job.id)
      const response = await api.post(`/applications/revert-by-job/${job.id}`)
      return { data: response.data, job }
    },
    onSuccess: (res) => {
      setRevertingJobId(null)
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['visited-applications'] })
      queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
      queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      setToast({
        type: 'success',
        message: res.data.message || `Reverted application for "${res.job.title}". Restored to unapplied.`
      })
    },
    onError: (err: any) => {
      setRevertingJobId(null)
      setToast({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to revert application for this job.'
      })
    }
  })

  // Clear All Applications Mutation
  const revertAllMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/applications/revert-all')
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['visited-applications'] })
      queryClient.invalidateQueries({ queryKey: ['pending-outreach-applications'] })
      queryClient.invalidateQueries({ queryKey: ['all-applied-applications'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      if (data.status === 'reverted') {
        setToast({
          type: 'success',
          message: data.message || 'All applications cleared!'
        })
      } else {
        setToast({
          type: 'info',
          message: data.message || 'No applications found to clear.'
        })
      }
    },
    onError: (err: any) => {
      setToast({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to clear applications.'
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
          <p style={{ color: 'var(--text-secondary)' }}>Explore verified IT & software listings crawled from Naukri with 1-Click AI Apply.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {hasExtension ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '9999px',
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                color: '#4ade80',
                fontSize: '0.82rem',
                fontWeight: '600'
              }}
              title="HireMind Chrome Extension is active! 100% native 1-click apply mode enabled."
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }}></span>
              <Puzzle size={14} /> Extension Active
            </div>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={() => setShowExtensionModal(true)}
              style={{
                borderColor: 'rgba(99, 102, 241, 0.4)',
                color: '#818cf8',
                background: 'rgba(99, 102, 241, 0.08)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.82rem',
                fontWeight: '600'
              }}
              title="Click to see how to install the HireMind Chrome Extension for zero-captcha 1-click apply in production"
            >
              <Puzzle size={14} /> Chrome Extension
            </button>
          )}

          <button
            className="btn btn-secondary"
            onClick={() => revertLastMutation.mutate()}
            disabled={revertLastMutation.isPending}
            style={{
              borderColor: '#F59E0B',
              color: '#B45309',
              background: '#FFFBEB',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: '600',
              boxShadow: '0 1px 3px rgba(245, 158, 11, 0.1)'
            }}
            title="Undo / Revert the most recently applied job back to unapplied state"
          >
            <RotateCcw size={15} style={{ animation: revertLastMutation.isPending ? 'spin 1s linear infinite' : 'none' }} />
            {revertLastMutation.isPending ? 'Undoing...' : 'Undo Last Apply'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => { if (confirm('Clear ALL applied status and restore all jobs to unapplied?')) revertAllMutation.mutate() }}
            disabled={revertAllMutation.isPending}
            style={{
              borderColor: '#EF4444',
              color: '#DC2626',
              background: '#FEF2F2',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: '600',
              boxShadow: '0 1px 3px rgba(239, 68, 68, 0.1)'
            }}
            title="Clear ALL applied applications and restore all jobs to unapplied state"
          >
            <RotateCcw size={15} style={{ animation: revertAllMutation.isPending ? 'spin 1s linear infinite' : 'none' }} />
            {revertAllMutation.isPending ? 'Clearing...' : 'Clear All Applied'}
          </button>

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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {[
                { name: 'Worldwide', val: 'Worldwide' },
                { name: 'India', val: 'India' },
                { name: 'Bangalore', val: 'Bangalore' },
                { name: 'Pune', val: 'Pune' },
                { name: 'Noida', val: 'Noida' },
                { name: 'Gurgaon', val: 'Gurgaon' },
                { name: 'Delhi', val: 'Delhi' },
                { name: 'Maharashtra', val: 'Maharashtra' }
              ].map(loc => (
                <button
                  key={loc.val}
                  type="button"
                  onClick={() => setLocation(loc.val)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    background: location === loc.val ? 'var(--primary-color)' : 'var(--bg-secondary)',
                    color: location === loc.val ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={(e) => {
                    if (location !== loc.val) {
                      e.currentTarget.style.borderColor = 'var(--primary-color)'
                      e.currentTarget.style.color = 'var(--text-primary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (location !== loc.val) {
                      e.currentTarget.style.borderColor = 'var(--border-color)'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }
                  }}
                >
                  {loc.name}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Source Board</label>
            <select 
              className="form-input" 
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <option value="">All Sources (Naukri)</option>
              <option value="Naukri">Naukri</option>
              <option value="Company Website">Company Website (Direct Careers)</option>
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={matchProfile}
                onChange={(e) => setMatchProfile(e.target.checked)}
                style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
              />
              <span>Match only with my <strong>Resume & Target Roles</strong></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={showApplied}
                onChange={(e) => setShowApplied(e.target.checked)}
                style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
              />
              <span>Show Applied & Mail Sent Jobs {appliedOrMailSentCount > 0 && <span style={{ marginLeft: '4px', padding: '2px 6px', borderRadius: '9999px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontSize: '11px', fontWeight: '600' }}>{appliedOrMailSentCount} hidden</span>}</span>
            </label>
          </div>

          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Calendar size={13} /> Showing <strong>Most Recent Jobs First</strong> across all equal sources
          </span>
        </div>
      </div>

      {/* Professional Interactive Crawl Progress Bar */}
      {(scanning || showScanSummary) && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.97) 100%)',
            backdropFilter: 'blur(16px)',
            border: scanning ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(34, 197, 94, 0.4)',
            borderRadius: '16px',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.75rem',
            boxShadow: scanning 
              ? '0 12px 32px -4px rgba(15, 23, 42, 0.5), 0 0 20px rgba(99, 102, 241, 0.15)'
              : '0 12px 32px -4px rgba(15, 23, 42, 0.5), 0 0 20px rgba(34, 197, 94, 0.15)',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.3s ease'
          }}
        >
          {/* Ambient Glow in background */}
          <div
            style={{
              position: 'absolute',
              top: '-40%',
              right: '-10%',
              width: '320px',
              height: '320px',
              background: scanning 
                ? 'radial-gradient(circle, rgba(99, 102, 241, 0.22) 0%, rgba(168, 85, 247, 0.08) 60%, transparent 100%)'
                : 'radial-gradient(circle, rgba(34, 197, 94, 0.22) 0%, rgba(16, 185, 129, 0.08) 60%, transparent 100%)',
              pointerEvents: 'none',
              filter: 'blur(40px)',
            }}
          />

          {/* Top Header Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: scanning ? 'rgba(99, 102, 241, 0.25)' : 'rgba(34, 197, 94, 0.25)',
                  border: scanning ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(34, 197, 94, 0.5)',
                  flexShrink: 0
                }}
              >
                {scanning ? (
                  <Sparkles size={17} style={{ color: '#818cf8', animation: 'spin 2.5s linear infinite' }} />
                ) : (
                  <CheckCircle2 size={18} style={{ color: '#4ade80' }} />
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                    {scanning ? 'Live Naukri AI Job Discovery' : 'Job Discovery Complete'}
                  </span>
                  {scanning && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        background: 'rgba(59, 130, 246, 0.2)',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        color: '#93c5fd',
                        fontSize: '0.72rem',
                        fontWeight: 600
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px #3b82f6', animation: 'pulse-dot 1.5s infinite' }}></span>
                      Active Crawl
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', marginTop: '2px', fontWeight: 500 }}>
                  {scanStatusText || 'Searching for developer and software roles...'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Live Found Count Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '10px',
                  color: '#f1f5f9',
                  fontSize: '0.82rem',
                  fontWeight: 700
                }}
              >
                <Briefcase size={14} style={{ color: '#818cf8' }} />
                <span>
                  {jobs?.length || 0} Total Available
                  {foundNewCount !== null && foundNewCount > 0 && (
                    <span style={{ color: '#4ade80', marginLeft: '5px' }}>(+{foundNewCount} new)</span>
                  )}
                </span>
              </div>

              {/* Progress Percentage Badge */}
              <span
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  color: scanning ? '#818cf8' : '#4ade80',
                  minWidth: '45px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {Math.round(scanProgress)}%
              </span>

              {showScanSummary && !scanning && (
                <button
                  onClick={() => setShowScanSummary(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '0 4px',
                    lineHeight: 1,
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
                  title="Dismiss progress notification"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* The Animated Progress Bar */}
          <div
            style={{
              width: '100%',
              height: '9px',
              background: 'rgba(15, 23, 42, 0.85)',
              borderRadius: '9999px',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div
              style={{
                width: `${Math.min(Math.max(scanProgress, 2), 100)}%`,
                height: '100%',
                background: scanning
                  ? 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)'
                  : 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                borderRadius: '9999px',
                transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s ease',
                boxShadow: scanning ? '0 0 14px rgba(99, 102, 241, 0.7)' : '0 0 14px rgba(16, 185, 129, 0.7)',
                position: 'relative'
              }}
            >
              {/* Shimmer effect inside bar */}
              {scanning && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%)',
                    animation: 'shimmer 1.4s infinite linear',
                    backgroundSize: '200% 100%'
                  }}
                />
              )}
            </div>
          </div>

          {/* Bottom Footer Info */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '0.75rem',
              fontSize: '0.76rem',
              color: '#94a3b8',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#cbd5e1' }}>
                Query: <strong style={{ color: '#93c5fd' }}>{scanQueryTerm || 'IT Software Developer'}</strong>
              </span>
              <span>•</span>
              <span>Location: <strong style={{ color: '#e2e8f0' }}>{location || 'India'}</strong></span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>Platform: <strong style={{ color: '#f59e0b' }}>Naukri.com SRP</strong></span>
              <span>•</span>
              <span style={{ color: scanning ? '#38bdf8' : '#4ade80', fontWeight: 600 }}>
                {scanning ? 'Live Parsing & Extraction' : 'Verified & Synced to Database'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Jobs list */}
      {isFetching && !scanning && <div style={{ color: '#64748B', marginBottom: '1rem' }}>Updating listings...</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {sortedFilteredJobs?.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3.5rem 2rem',
              background: '#FFFFFF',
              border: '1px dashed #CBD5E1',
              borderRadius: '16px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)'
            }}
          >
            <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#64748B' }}>
              <Briefcase size={26} style={{ color: '#0078D4' }} />
            </div>
            
            {appliedOrMailSentCount > 0 && !showApplied ? (
              <div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.4rem' }}>
                  {appliedOrMailSentCount} Jobs in your Applied / Mail Sent list
                </h4>
                <p style={{ color: '#64748B', fontSize: '0.88rem', maxWidth: '480px', margin: '0 auto 1.25rem' }}>
                  All current listings in this pool have already been applied to or reached out to. You can reveal them or scan for brand new unapplied opportunities.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setShowApplied(true)}
                    className="btn btn-outline"
                    style={{ fontSize: '0.88rem', padding: '0.55rem 1.25rem', fontWeight: 600 }}
                  >
                    Reveal {appliedOrMailSentCount} Applied Jobs
                  </button>
                  <button
                    onClick={() => scanMutation.mutate()}
                    disabled={scanning}
                    className="btn btn-primary"
                    style={{ fontSize: '0.88rem', padding: '0.55rem 1.25rem', fontWeight: 600 }}
                  >
                    <Sparkles size={15} /> Scan Fresh Naukri Jobs
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.4rem' }}>
                  No jobs found matching your filters
                </h4>
                <p style={{ color: '#64748B', fontSize: '0.88rem', maxWidth: '440px', margin: '0 auto 1.25rem' }}>
                  Try adjusting your search keywords, location filters, or click below to discover fresh IT & Software vacancies.
                </p>
                <button
                  onClick={() => scanMutation.mutate()}
                  disabled={scanning}
                  className="btn btn-primary"
                  style={{ fontSize: '0.88rem', padding: '0.55rem 1.25rem', fontWeight: 600 }}
                >
                  <Sparkles size={15} /> Scan Naukri Jobs via AI
                </button>
              </div>
            )}
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
                          background: '#FEF3C7',
                          border: '1px solid #F59E0B',
                          color: '#92400E',
                          fontSize: '0.74rem',
                          fontWeight: '700',
                          padding: '0.2rem 0.65rem',
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          boxShadow: '0 1px 3px rgba(245, 158, 11, 0.15)'
                        }}>
                          <Mail size={13} style={{ color: '#D97706' }} /> Mail Pending
                        </span>
                      )}

                      {(appRecord?.status === 'Manual Intervention' || isCompanyWebsite) && (
                        <span style={{
                          background: '#EEF2FF',
                          border: '1px solid #818CF8',
                          color: '#3730A3',
                          fontSize: '0.74rem',
                          fontWeight: '700',
                          padding: '0.2rem 0.65rem',
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          boxShadow: '0 1px 3px rgba(99, 102, 241, 0.15)'
                        }}>
                          <ExternalLink size={13} style={{ color: '#6366F1' }} /> Manual Intervention
                        </span>
                      )}

                      {appRecord?.status === 'Saved' && (
                        <span style={{
                          background: '#F3E8FF',
                          border: '1px solid #C084FC',
                          color: '#6B21A8',
                          fontSize: '0.74rem',
                          fontWeight: '700',
                          padding: '0.2rem 0.65rem',
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          boxShadow: '0 1px 3px rgba(168, 85, 247, 0.15)'
                        }}>
                          <Bookmark size={13} style={{ color: '#A855F7' }} /> Saved
                        </span>
                      )}

                      {appRecord?.status === 'Visited' && (
                        <span style={{
                          background: '#FFFBEB',
                          border: '1px solid #FDE68A',
                          color: '#B45309',
                          fontSize: '0.74rem',
                          fontWeight: '700',
                          padding: '0.2rem 0.65rem',
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}>
                          <Clock size={13} /> In Pending Queue
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

                    {appRecord && appRecord.status !== 'Dismissed' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {appRecord.status === 'Applied' && (
                          <a 
                            href="/visited"
                            className="btn btn-secondary"
                            style={{ background: '#FEF3C7', color: '#92400E', borderColor: '#F59E0B', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none' }}
                            title="Application submitted! Click to send recruiter follow-up mail"
                          >
                            <Mail size={14} style={{ color: '#D97706' }} />
                            Send HR Mail
                          </a>
                        )}

                        {(appRecord.status === 'Manual Intervention' || isCompanyWebsite) && (
                          <a
                            href={getDirectJobUrl(job)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-primary"
                            style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none' }}
                            title="Apply directly on company website"
                          >
                            <ExternalLink size={14} />
                            Apply on Site
                          </a>
                        )}

                        <button
                          className="btn btn-secondary"
                          onClick={() => revertJobMutation.mutate(job)}
                          disabled={revertJobMutation.isPending && revertingJobId === job.id}
                          style={{
                            borderColor: '#F59E0B',
                            color: '#B45309',
                            background: '#FFFBEB',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.82rem',
                            fontWeight: '600'
                          }}
                          title="Undo application and revert this job back to unapplied state"
                        >
                          <RotateCcw size={13} style={{ animation: revertingJobId === job.id ? 'spin 1s linear infinite' : 'none' }} />
                          {revertJobMutation.isPending && revertingJobId === job.id ? 'Reverting...' : 'Undo Apply'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button 
                          className="btn btn-primary"
                          onClick={() => autoApplyMutation.mutate({ job })}
                          disabled={autoApplyMutation.isPending && autoApplyingJobId === job.id}
                          style={{ background: 'linear-gradient(135deg, #0078D4 0%, #005A9E 100%)' }}
                          title="Auto-apply via AI"
                        >
                          <Sparkles size={14} />
                          {autoApplyMutation.isPending && autoApplyingJobId === job.id ? 'Applying...' : 'Auto-Apply'}
                        </button>

                        <button 
                          className="btn btn-secondary" 
                          onClick={() => trackInVisitedMutation.mutate(job)}
                          disabled={trackInVisitedMutation.isPending}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          title="Store in Pending Outreach Queue"
                        >
                          <BookmarkPlus size={15} style={{ color: 'var(--primary)' }} />
                          Add to Mail Queue
                        </button>
                      </>
                    )}

                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setDismissTarget({ id: job.id, job_id: job.job_id, title: job.title })}
                      style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                      title="Clear / Dismiss"
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
                      const directUrl = getDirectJobUrl(job);
                      const newWindow = window.open(directUrl, '_blank');
                      try {
                        const ensureRes = await api.post('/jobs/ensure', {
                          job_id: job.job_id,
                          title: job.title,
                          company: job.company,
                          location: job.location,
                          salary: job.salary,
                          experience: job.experience,
                          description: job.description,
                          url: directUrl,
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

      {/* Chrome Extension Setup Modal */}
      {showExtensionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg, #1e293b)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            maxWidth: '520px',
            width: '100%',
            padding: '2rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            position: 'relative',
            color: 'var(--text-primary, #f8fafc)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                }}>
                  🧩
                </div>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>HireMind Chrome Extension</h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #94a3b8)', margin: 0 }}>Native 1-Click Production Apply Assistant</p>
                </div>
              </div>
              <button
                onClick={() => setShowExtensionModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.5', marginBottom: '1.25rem' }}>
              The HireMind Extension drives your browser directly on your computer — completely bypassing Cloudflare, Captchas, and OTP challenges by using your already-logged-in session.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>1</span>
                <span style={{ fontSize: '0.875rem', color: '#e2e8f0' }}>Open <strong>chrome://extensions</strong> in your Google Chrome browser.</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>2</span>
                <span style={{ fontSize: '0.875rem', color: '#e2e8f0' }}>Enable <strong>Developer mode</strong> in the top-right toggle.</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>3</span>
                <span style={{ fontSize: '0.875rem', color: '#e2e8f0' }}>Click <strong>Load unpacked</strong> and select the <code>extension</code> folder in your project directory.</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                onClick={() => setShowExtensionModal(false)}
                style={{ padding: '0.6rem 1.25rem', fontWeight: '600' }}
              >
                Got It!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


