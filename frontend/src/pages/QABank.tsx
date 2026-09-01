import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { 
  HelpCircle, 
  Search, 
  Edit3, 
  Check, 
  Copy, 
  Trash2, 
  Building2, 
  Briefcase, 
  Calendar, 
  Zap, 
  ExternalLink,
  MessageSquareText,
  Sparkles,
  Cpu,
  Globe,
  RefreshCw,
  Sliders,
  ChevronRight,
  Database
} from 'lucide-react'
import Toast from '../components/Toast'

interface QAItem {
  id: number
  application_id: number
  question: string
  answer: string
  is_generated: boolean
  created_at: string | null
  company: string
  job_title: string
  source: string
  job_id?: number
  job_url?: string
  status?: string
}

export default function QABank() {
  const queryClient = useQueryClient()

  const [searchTerm, setSearchTerm] = useState('')
  const [sourceFilter, setSourceFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

  // RAG Testing & Generation State
  const [ragQuestion, setRagQuestion] = useState('')
  const [ragJobTitle, setRagJobTitle] = useState('Software Engineer')
  const [generatedRAGAnswer, setGeneratedRAGAnswer] = useState<string | null>(null)
  const [showRAGPlayground, setShowRAGPlayground] = useState(true)

  // Crawl AI State
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawledData, setCrawledData] = useState<any | null>(null)

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

  // RAG Generation Mutation
  const ragMutation = useMutation({
    mutationFn: async ({ question, jobTitle }: { question: string; jobTitle: string }) => {
      const res = await api.post('/applications/qa/generate', {
        question,
        job_title: jobTitle,
        job_description: crawledData ? crawledData.markdown_description : ''
      })
      return res.data
    },
    onSuccess: (data) => {
      setGeneratedRAGAnswer(data.answer)
      setToast({ type: 'success', message: 'RAG Answer generated with candidate vector context!' })
    },
    onError: (err: any) => {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Failed to generate answer.' })
    }
  })

  // Resume Vectorization Mutation
  const vectorizeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/applications/rag/vectorize')
      return res.data
    },
    onSuccess: (data) => {
      setToast({ type: 'success', message: `Resume Vectorized! Indexed ${data.chunks_indexed} semantic chunks.` })
    },
    onError: (err: any) => {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Failed to vectorize resume.' })
    }
  })

  // Crawl AI Mutation
  const crawlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await api.post('/applications/crawl/extract', { url })
      return res.data
    },
    onSuccess: (data) => {
      setCrawledData(data.data)
      if (data.data?.title) {
        setRagJobTitle(data.data.title)
      }
      setToast({ type: 'success', message: `Crawled ${data.data?.title || 'job listing'} successfully!` })
    },
    onError: (err: any) => {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Failed to crawl job URL.' })
    }
  })

  // Fetch all Q&A items
  const { data: qaList = [], isLoading } = useQuery<QAItem[]>({
    queryKey: ['applications-qa'],
    queryFn: async () => {
      const res = await api.get('/applications/qa/all')
      return res.data
    }
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, answer }: { id: number; answer: string }) => {
      const res = await api.put(`/applications/qa/${id}`, { answer })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications-qa'] })
      setEditingId(null)
      setToast({ type: 'success', message: 'Answer updated and verified!' })
    },
    onError: (err: any) => {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Failed to update answer.' })
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/applications/qa/${id}`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications-qa'] })
      setToast({ type: 'info', message: 'Question/Answer removed.' })
    },
    onError: (err: any) => {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Failed to delete.' })
    }
  })

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setToast({ type: 'success', message: 'Copied answer to clipboard!' })
  }

  const startEdit = (item: QAItem) => {
    setEditingId(item.id)
    setEditText(item.answer)
  }

  const saveEdit = (id: number) => {
    if (!editText.trim()) return
    updateMutation.mutate({ id, answer: editText.trim() })
  }

  // Filtered items
  const filteredQAs = qaList.filter(item => {
    // Search match
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      const qMatch = item.question?.toLowerCase().includes(term)
      const aMatch = item.answer?.toLowerCase().includes(term)
      const cMatch = item.company?.toLowerCase().includes(term)
      const tMatch = item.job_title?.toLowerCase().includes(term)
      if (!qMatch && !aMatch && !cMatch && !tMatch) return false
    }

    // Source filter
    if (sourceFilter !== 'ALL') {
      if (item.source !== sourceFilter) return false
    }

    // Type filter
    if (typeFilter === 'AI' && !item.is_generated) return false
    if (typeFilter === 'VERIFIED' && item.is_generated) return false

    return true
  })

  const totalCount = qaList.length
  const aiGeneratedCount = qaList.filter(q => q.is_generated).length
  const verifiedCount = qaList.filter(q => !q.is_generated).length

  return (
    <div className="qa-bank-container" style={{ padding: '1.5rem', maxWidth: '1280px', margin: '0 auto' }}>
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)',
        borderRadius: '16px',
        padding: '2rem',
        color: '#FFFFFF',
        marginBottom: '2rem',
        boxShadow: '0 10px 25px -5px rgba(67, 56, 202, 0.25)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '0.5rem', borderRadius: '10px' }}>
                <MessageSquareText size={28} color="#FBBF24" />
              </div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>AI Answer History</h1>
            </div>
            <p style={{ color: '#E0E7FF', fontSize: '0.95rem', margin: 0, maxWidth: '680px' }}>
              Review all questions asked during your automated applications and the exact answers submitted by the AI for your inspection.
            </p>
          </div>

          {/* Quick Stats */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '0.75rem 1.25rem', borderRadius: '12px', textAlign: 'center', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{totalCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#C7D2FE', textTransform: 'uppercase' }}>Questions Answered</div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '0.75rem 1.25rem', borderRadius: '12px', textAlign: 'center', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38BDF8' }}>{aiGeneratedCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#C7D2FE', textTransform: 'uppercase' }}>AI Generated</div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '0.75rem 1.25rem', borderRadius: '12px', textAlign: 'center', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4ADE80' }}>{verifiedCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#C7D2FE', textTransform: 'uppercase' }}>Custom / Verified</div>
            </div>
          </div>
        </div>
      </div>

      {/* RAG Semantic Assistant & Crawl AI Playground */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.98) 100%)',
        borderRadius: '16px',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        padding: '1.5rem',
        color: '#F8FAFC',
        marginBottom: '2rem',
        boxShadow: '0 15px 30px -10px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)', padding: '0.4rem', borderRadius: '8px' }}>
              <Sparkles size={20} color="#FFFFFF" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                RAG Resume Vectorizer & Screening Reasoning Engine
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                Answers any screening, behavioral, or hypothetical question using your vectorized projects & experiences
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              onClick={() => vectorizeMutation.mutate()}
              disabled={vectorizeMutation.isPending}
              style={{
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                color: '#A5B4FC',
                padding: '0.5rem 0.9rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
              title="Vectorize and index your resume experiences into semantic embeddings"
            >
              <Database size={14} style={{ animation: vectorizeMutation.isPending ? 'spin 1s linear infinite' : 'none' }} />
              {vectorizeMutation.isPending ? 'Vectorizing...' : 'Sync & Vectorize Resume'}
            </button>

            <button
              onClick={() => setShowRAGPlayground(!showRAGPlayground)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#E2E8F0',
                padding: '0.5rem 0.8rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              {showRAGPlayground ? 'Hide Playground ▲' : 'Open Playground ▼'}
            </button>
          </div>
        </div>

        {showRAGPlayground && (
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '1.25rem' }}>
            {/* Quick Scenario Buttons */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase' }}>
                Quick Test Scenarios (Hypothetical & Behavioral):
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { label: '🐛 Complex Bug & Solution', q: 'Tell me about a difficult technical challenge or bug you faced in your projects and how you solved it.' },
                  { label: '⚡ Asynchronous Processing', q: 'How would you design an asynchronous task processing pipeline to handle high load without server crashes?' },
                  { label: '📉 Latency Optimization', q: 'How do you approach optimizing high latency and database bottlenecks in a web application?' },
                  { label: '🚀 Adopting New Tech', q: 'How do you approach learning and implementing a new framework or technology that is not in your primary stack?' }
                ].map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => setRagQuestion(s.q)}
                    style={{
                      background: 'rgba(30, 41, 59, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#CBD5E1',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Crawl AI Job URL Bar (Optional) */}
            <div style={{ marginBottom: '1rem', background: 'rgba(0, 0, 0, 0.25)', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <Globe size={14} color="#38BDF8" />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38BDF8' }}>Crawl AI Job Alignment (Optional):</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={crawlUrl}
                  onChange={(e) => setCrawlUrl(e.target.value)}
                  placeholder="Paste any job listing URL (e.g. Naukri job link) to crawl requirements..."
                  style={{
                    flex: '1 1 280px',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'rgba(15, 23, 42, 0.8)',
                    color: '#F8FAFC',
                    fontSize: '0.85rem'
                  }}
                />
                <button
                  onClick={() => crawlMutation.mutate(crawlUrl)}
                  disabled={crawlMutation.isPending || !crawlUrl.trim()}
                  style={{
                    background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                    border: 'none',
                    color: '#FFFFFF',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {crawlMutation.isPending ? 'Crawling...' : 'Extract with Crawl AI'}
                </button>
              </div>
              {crawledData && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#4ADE80', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span>✓ Role: <strong>{crawledData.title}</strong></span>
                  <span>• Company: <strong>{crawledData.company || 'Direct Employer'}</strong></span>
                  <span>• Extracted Skills: {crawledData.skills?.slice(0, 5).join(', ')}</span>
                </div>
              )}
            </div>

            {/* Question Input */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <input
                type="text"
                value={ragQuestion}
                onChange={(e) => setRagQuestion(e.target.value)}
                placeholder="Ask any screening question (e.g., 'What is your experience with microservices?', 'How do you solve bugs?')..."
                style={{
                  flex: '1 1 320px',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <button
                onClick={() => ragMutation.mutate({ question: ragQuestion, jobTitle: ragJobTitle })}
                disabled={ragMutation.isPending || !ragQuestion.trim()}
                style={{
                  background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '0.75rem 1.4rem',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)'
                }}
              >
                <Sparkles size={16} />
                {ragMutation.isPending ? 'Generating...' : 'Generate RAG Answer'}
              </button>
            </div>

            {/* Generated Output Display */}
            {generatedRAGAnswer && (
              <div style={{
                background: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                borderRadius: '10px',
                padding: '1.25rem',
                marginTop: '1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ background: '#10B981', width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }}></span>
                    <span style={{ fontSize: '0.8rem', color: '#34D399', fontWeight: 600 }}>
                      Grounded in Candidate Resume Vector Store (First-Person Authenticated)
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopy(generatedRAGAnswer)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      color: '#E2E8F0',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: '1.6', color: '#F1F5F9' }}>
                  "{generatedRAGAnswer}"
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 320px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search questions, answers, companies..."
            style={{
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2.75rem',
              borderRadius: '12px',
              border: '1px solid #CBD5E1',
              fontSize: '0.95rem',
              outline: 'none',
              background: '#FFFFFF'
            }}
          />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              border: '1px solid #CBD5E1',
              fontSize: '0.9rem',
              background: '#FFFFFF',
              color: '#334155',
              outline: 'none'
            }}
          >
            <option value="ALL">All Platforms</option>
            <option value="Naukri">Naukri</option>
            <option value="Company Website">Company Site</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              border: '1px solid #CBD5E1',
              fontSize: '0.9rem',
              background: '#FFFFFF',
              color: '#334155',
              outline: 'none'
            }}
          >
            <option value="ALL">All Q&A Statuses</option>
            <option value="AI">AI Generated</option>
            <option value="VERIFIED">Verified / Custom</option>
          </select>
        </div>
      </div>

      {/* Q&A Cards List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
          <p>Loading application questions & answers from TiDB Cloud...</p>
        </div>
      ) : filteredQAs.length === 0 ? (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          padding: '3rem',
          textAlign: 'center',
          border: '1px dashed #CBD5E1',
          color: '#64748B'
        }}>
          <HelpCircle size={48} color="#94A3B8" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
            No Questions Found
          </h3>
          <p style={{ margin: '0 auto', maxWidth: '460px', fontSize: '0.9rem' }}>
            {searchTerm || sourceFilter !== 'ALL' || typeFilter !== 'ALL'
              ? 'No screening questions match your search filters.'
              : 'As your agent applies to jobs on Naukri, every screening question and AI answer will be automatically saved here for your inspection.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredQAs.map((item) => {
            const wordCount = item.answer ? item.answer.trim().split(/\s+/).length : 0
            const isEditing = editingId === item.id

            return (
              <div
                key={item.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '14px',
                  padding: '1.5rem',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Meta Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#1E293B', fontWeight: 700, fontSize: '0.95rem' }}>
                      <Building2 size={16} color="#6366F1" />
                      <span>{item.company}</span>
                    </div>
                    <span style={{ color: '#94A3B8' }}>•</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#475569', fontSize: '0.9rem' }}>
                      <Briefcase size={15} color="#64748B" />
                      <span>{item.job_title}</span>
                    </div>
                    {item.job_url && (
                      <a
                        href={item.job_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#6366F1', display: 'flex', alignItems: 'center' }}
                        title="View original job posting"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '12px',
                      background: item.source === 'LinkedIn' ? '#E0F2FE' : item.source === 'Naukri' ? '#FEF3C7' : '#F1F5F9',
                      color: item.source === 'LinkedIn' ? '#0369A1' : item.source === 'Naukri' ? '#B45309' : '#475569'
                    }}>
                      {item.source}
                    </span>

                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '12px',
                      background: item.is_generated ? '#F5F3FF' : '#F0FDF4',
                      color: item.is_generated ? '#7C3AED' : '#166534',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {item.is_generated ? <Zap size={12} /> : <Check size={12} />}
                      <span>{item.is_generated ? 'AI Generated' : 'Verified'}</span>
                    </span>
                  </div>
                </div>

                {/* Question */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    Question Asked:
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    {item.question}
                  </h3>
                </div>

                {/* Answer Box */}
                <div style={{
                  background: '#F8FAFC',
                  borderRadius: '10px',
                  padding: '1rem',
                  border: '1px solid #E2E8F0',
                  marginBottom: '0.75rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Answer Submitted ({wordCount} words):
                    </span>
                    {!isEditing && (
                      <button
                        onClick={() => handleCopy(item.answer)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#64748B',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}
                      >
                        <Copy size={13} />
                        <span>Copy</span>
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '8px',
                          border: '1px solid #6366F1',
                          fontSize: '0.95rem',
                          outline: 'none',
                          fontFamily: 'inherit'
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            background: '#F1F5F9',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#475569',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveEdit(item.id)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            background: '#4F46E5',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#FFFFFF',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Save & Verify
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ color: '#334155', fontSize: '0.95rem', lineHeight: '1.5', margin: 0, fontWeight: 500 }}>
                      {item.answer}
                    </p>
                  )}
                </div>

                {/* Card Action Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#94A3B8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Calendar size={13} />
                    <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recent'}</span>
                  </div>

                  {!isEditing && (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button
                        onClick={() => startEdit(item)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#4F46E5',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.8rem',
                          fontWeight: 600
                        }}
                      >
                        <Edit3 size={14} />
                        <span>Edit Answer</span>
                      </button>

                      <button
                        onClick={() => {
                          if (window.confirm("Remove this question record?")) {
                            deleteMutation.mutate(item.id)
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#EF4444',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.8rem',
                          fontWeight: 600
                        }}
                      >
                        <Trash2 size={14} />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
