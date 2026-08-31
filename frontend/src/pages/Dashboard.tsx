import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Line, Bar } from 'react-chartjs-2'
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend,
  Filler
} from 'chart.js'
import { 
  Search, 
  Sparkles, 
  CheckSquare, 
  Award, 
  Mail, 
  Clock, 
  Send,
  Cpu,
  Cloud,
  Server,
  Zap,
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  SlidersHorizontal
} from 'lucide-react'

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const [switchFeedback, setSwitchFeedback] = useState<{ text: string; isError: boolean } | null>(null)

  // Query AI engine health
  const { data: aiHealth, isLoading: aiHealthLoading } = useQuery({
    queryKey: ['aiHealth'],
    queryFn: async () => {
      const response = await api.get('/ai/health')
      return response.data
    },
    refetchInterval: 8000 // Poll every 8s
  })

  // Switch AI Engine Mutation
  const switchEngineMutation = useMutation({
    mutationFn: async (provider: string) => {
      setSwitchingTo(provider)
      const response = await api.post('/ai/switch-engine', { provider })
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['aiHealth'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setSwitchFeedback({ text: data.message || `Switched to ${data.primary_engine}`, isError: false })
      setTimeout(() => setSwitchFeedback(null), 4000)
    },
    onError: (err: any) => {
      setSwitchFeedback({ text: err.response?.data?.detail || "Failed to switch AI engine.", isError: true })
      setTimeout(() => setSwitchFeedback(null), 4000)
    },
    onSettled: () => {
      setSwitchingTo(null)
    }
  })

  // Query analytics endpoint
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => {
      const response = await api.get('/analytics')
      return response.data
    },
    refetchInterval: 3000 // Poll every 3 seconds for real-time dashboard updates
  })

  if (statsLoading || !stats) {
    return <div style={{ color: 'var(--text-secondary)', padding: '2.5rem' }}>Loading Dashboard Analytics...</div>
  }

  const { overview } = stats
  const totalJobsDiscovered = overview.jobs_found || 0
  const activeEngineId = (aiHealth?.active_provider === 'local' || aiHealth?.active_provider === 'ollama') ? 'ollama' : 'cloud'

  // AI Engines Definitions: Strictly 2 Engines (Local Ollama + NVIDIA NIM vs Cloud ML APIs)
  const engineOptions = [
    {
      id: 'ollama',
      name: 'Local AI Engine (Ollama + NVIDIA NIM)',
      badge: '100% PRIVATE & OFFLINE',
      type: 'local',
      icon: <Server size={22} style={{ color: '#059669' }} />,
      tag: 'Local AI + GPU Accelerated',
      models: `${aiHealth?.local?.primary_model || aiHealth?.ollama?.primary_model || 'qwen3:8b'} (Primary) → ${aiHealth?.local?.backup_model || 'qwen3:4b + NVIDIA NIM'}`,
      description: 'Runs on local machine CPU/GPU using Ollama with NVIDIA NIM GPU acceleration fallback. Both ready for instant execution.',
      accent: '#059669',
      bgActive: '#ECFDF5',
      isLive: Boolean(aiHealth?.local?.online ?? (aiHealth?.ollama?.online || aiHealth?.local?.nvidia_online))
    },
    {
      id: 'cloud',
      name: 'Cloud AI APIs (ML APIs)',
      badge: 'ULTRA-FAST ~300 T/S & HIGH CAPACITY',
      type: 'cloud',
      icon: <Zap size={22} style={{ color: '#0078D4' }} />,
      tag: 'High-Speed Cloud ML APIs',
      models: `${aiHealth?.cloud?.primary_model || 'llama-3.3-70b-versatile'} (Groq) → Gemini 2.0 → NVIDIA NIM`,
      description: 'Dedicated ultra-fast Cloud ML APIs (Groq LPU) with automatic regional failover between Cloud ML APIs for 100% uptime.',
      accent: '#0078D4',
      bgActive: '#EFF6FF',
      isLive: Boolean(aiHealth?.cloud?.online ?? (aiHealth?.groq?.online || aiHealth?.gemini?.online || aiHealth?.nvidia?.online))
    }
  ]

  // Data configuration for Applications Trend (Azure Blue)
  const lineData = {
    labels: stats.applications_trend.map((t: any) => t.week),
    datasets: [
      {
        label: 'Applications Prepared',
        data: stats.applications_trend.map((t: any) => t.applications),
        borderColor: '#0078D4',
        backgroundColor: 'rgba(0, 120, 212, 0.12)',
        tension: 0.4,
        fill: true
      }
    ]
  }

  // Data configuration for Match Score Distribution
  const barData = {
    labels: stats.score_distribution.map((d: any) => d.range),
    datasets: [
      {
        label: 'Job Match Count',
        data: stats.score_distribution.map((d: any) => d.count),
        backgroundColor: '#0284C7',
        borderColor: '#0078D4',
        borderWidth: 1,
        borderRadius: 8
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: '#1E293B',
          font: { family: 'Inter', weight: 600 }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: { color: '#475569', font: { weight: 500 } }
      },
      y: {
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: { color: '#475569', font: { weight: 500 } }
      }
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)', marginBottom: '0.5rem', color: '#0F172A' }}>
            Job Hunting Dashboard
          </h1>
          <p style={{ color: '#475569' }}>
            AI-Powered Job Discovery, Tailoring, and One-Click Multi-Engine Automation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.85rem', color: '#64748B', background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-sm)', fontWeight: '500' }}>
          <span>Discovered: <strong style={{ color: '#0F172A' }}>{totalJobsDiscovered}</strong></span>
          <span style={{ color: '#CBD5E1' }}>|</span>
          <span>Smart Matches: <strong style={{ color: '#0F172A' }}>{overview.jobs_matched}</strong></span>
          <span style={{ color: '#CBD5E1' }}>|</span>
          <span>Prepared: <strong style={{ color: '#0F172A' }}>{overview.applications_prepared}</strong></span>
        </div>
      </div>

      {/* AI Engine Control Center & Quick Switcher */}
      <div className="card" style={{ 
        marginBottom: '2.25rem', 
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
        padding: '1.5rem',
        borderRadius: 'var(--radius-md)'
      }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: aiHealth?.status === 'ONLINE' ? '#10B981' : 'var(--danger)',
              boxShadow: aiHealth?.status === 'ONLINE' ? '0 0 10px rgba(16, 185, 129, 0.6)' : '0 0 10px var(--danger)'
            }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <SlidersHorizontal size={18} style={{ color: '#0078D4' }} />
                  AI Engine Control Center
                </h3>
                <span style={{ 
                  fontSize: '0.72rem', 
                  background: '#EFF6FF', 
                  color: '#0078D4', 
                  padding: '0.15rem 0.6rem', 
                  borderRadius: '999px',
                  fontWeight: '700',
                  border: '1px solid #BFDBFE'
                }}>
                  ACTIVE: {activeEngineId === 'ollama' ? 'Local AI (Ollama + NVIDIA NIM)' : 'Cloud AI APIs'}
                </span>
              </div>
              <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
                Select between <strong>Local AI (Ollama)</strong> (100% private with local-only backup) or <strong>Cloud AI APIs</strong> (Groq LPU with multi-cloud ML API backup).
              </span>
            </div>
          </div>

          {switchFeedback && (
            <div style={{ 
              background: switchFeedback.isError ? '#FEF2F2' : '#ECFDF5', 
              color: switchFeedback.isError ? '#991B1B' : '#065F46', 
              border: switchFeedback.isError ? '1px solid #FECACA' : '1px solid #A7F3D0', 
              padding: '0.4rem 0.85rem', 
              borderRadius: '6px', 
              fontSize: '0.82rem', 
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}>
              {switchFeedback.isError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
              {switchFeedback.text}
            </div>
          )}
        </div>

        {/* Engine Switcher Grid (Strictly 2 Columns) */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
          gap: '1.25rem' 
        }}>
          {engineOptions.map((eng) => {
            const isActive = activeEngineId === eng.id
            const isPending = switchingTo === eng.id

            return (
              <div 
                key={eng.id}
                onClick={() => !isActive && !switchEngineMutation.isPending && switchEngineMutation.mutate(eng.id)}
                style={{
                  border: isActive ? `2px solid ${eng.accent}` : '1px solid #E2E8F0',
                  background: isActive ? eng.bgActive : '#FFFFFF',
                  borderRadius: '10px',
                  padding: '1.1rem',
                  cursor: isActive ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isActive ? `0 4px 14px ${eng.accent}25` : '0 1px 3px rgba(0,0,0,0.02)',
                  opacity: isPending ? 0.6 : 1
                }}
                className="engine-card"
              >
                <div>
                  {/* Top Badge & Tag */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {eng.icon}
                      <span style={{ fontSize: '0.72rem', fontWeight: '700', color: eng.accent, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {eng.tag}
                      </span>
                    </div>

                    {isActive && (
                      <span style={{ 
                        fontSize: '0.68rem', 
                        background: eng.accent, 
                        color: '#FFFFFF', 
                        padding: '0.15rem 0.5rem', 
                        borderRadius: '999px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem'
                      }}>
                        <CheckCircle2 size={11} /> ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Engine Name */}
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem', fontWeight: '700', color: '#0F172A' }}>
                    {eng.name}
                  </h4>

                  {/* Model String */}
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#475569', 
                    fontFamily: 'monospace', 
                    background: isActive ? '#FFFFFF' : '#F8FAFC', 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '4px', 
                    marginBottom: '0.5rem',
                    border: '1px solid #E2E8F0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {eng.models}
                  </div>

                  {/* Description */}
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B', lineHeight: '1.35' }}>
                    {eng.description}
                  </p>
                </div>

                {/* Bottom Switch Button */}
                <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: eng.isLive ? '#059669' : '#64748B', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: eng.isLive ? '#10B981' : '#94A3B8' }} />
                    {eng.isLive ? 'Ready / Online' : 'Offline / Standby'}
                  </span>

                  {!isActive && (
                    <button
                      type="button"
                      disabled={switchEngineMutation.isPending}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${eng.accent}`,
                        color: eng.accent,
                        borderRadius: '5px',
                        padding: '0.25rem 0.65rem',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      {isPending ? <RefreshCw size={11} className="spin" /> : 'Use Engine'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="card metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-label">Applications Submitted</span>
            <Send size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <span className="metric-value">{overview.applications_submitted || 0}</span>
        </div>

        <div className="card metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-label">Outreach Mails Sent</span>
            <Mail size={18} style={{ color: 'var(--secondary)' }} />
          </div>
          <span className="metric-value">{overview.outreach_emails_sent || 0}</span>
        </div>

        <div className="card metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-label">Pending Mail Queue</span>
            <Clock size={18} style={{ color: '#4F46E5' }} />
          </div>
          <span className="metric-value">{overview.pending_outreach || 0}</span>
        </div>

        <div className="card metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-label">Offers Received</span>
            <Award size={18} style={{ color: 'var(--success)' }} />
          </div>
          <span className="metric-value">{overview.offers || 0}</span>
        </div>
      </div>

      {/* Analytics Charts Grid */}
      <div className="responsive-charts-grid">
        <div className="card">
          <h3 className="card-title">Applications Submitted Per Week</h3>
          <div style={{ position: 'relative', height: '260px' }}>
            <Line data={lineData} options={chartOptions} />
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Match Score Distribution</h3>
          <div style={{ position: 'relative', height: '260px' }}>
            <Bar data={barData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Rates Row */}
      <div className="responsive-rates-grid">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ 
            width: '80px', 
            height: '80px', 
            borderRadius: '50%', 
            background: `conic-gradient(var(--primary) 0% ${Math.min(100, Math.max(0, stats.interview_rate))}%, #E2E8F0 ${Math.min(100, Math.max(0, stats.interview_rate))}% 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            fontWeight: '700',
            color: '#0F172A'
          }}>
            {stats.interview_rate}%
          </div>
          <div>
            <h4 style={{ marginBottom: '0.25rem', color: '#0F172A' }}>Interview Response Rate</h4>
            <p style={{ color: '#475569', fontSize: '0.85rem' }}>
              Ratio of interviews scheduled to applications submitted.
            </p>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ 
            width: '80px', 
            height: '80px', 
            borderRadius: '50%', 
            background: `conic-gradient(var(--success) 0% ${Math.min(100, Math.max(0, stats.offer_rate))}%, #E2E8F0 ${Math.min(100, Math.max(0, stats.offer_rate))}% 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            fontWeight: '700',
            color: '#0F172A'
          }}>
            {stats.offer_rate}%
          </div>
          <div>
            <h4 style={{ marginBottom: '0.25rem', color: '#0F172A' }}>Offer Success Rate</h4>
            <p style={{ color: '#475569', fontSize: '0.85rem' }}>
              Ratio of job offers received to applications submitted.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
