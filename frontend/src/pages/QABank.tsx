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
  MessageSquareText
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

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

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
            <option value="LinkedIn">LinkedIn</option>
            <option value="Naukri">Naukri</option>
            <option value="Indeed">Indeed</option>
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
              : 'As your agent applies to jobs on LinkedIn, Naukri, or Indeed, every screening question and AI answer will be automatically saved here for your inspection.'}
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
