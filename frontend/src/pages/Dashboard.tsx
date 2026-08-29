import React from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { Search, Sparkles, CheckSquare, Award, Mail, Clock, Send } from 'lucide-react'

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
  // Query AI engine health
  const { data: aiHealth } = useQuery({
    queryKey: ['aiHealth'],
    queryFn: async () => {
      const response = await api.get('/ai/health')
      return response.data
    },
    refetchInterval: 10000 // Poll every 10s
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
      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)', marginBottom: '0.5rem', color: '#0F172A' }}>
            Job Hunting Dashboard
          </h1>
          <p style={{ color: '#475569' }}>
            Welcome back! Here is a summary of your AI-powered job discovery and applications status.
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

      {/* NVIDIA NIM AI Engine Status Indicator */}
      <div className="card" style={{ 
        marginBottom: '2rem', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        boxShadow: 'var(--shadow-sm)',
        padding: '1.2rem 1.8rem',
        borderRadius: 'var(--radius-md)',
        flexWrap: 'wrap',
        gap: '1.2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ 
            width: '12px', 
            height: '12px', 
            borderRadius: '50%', 
            background: aiHealth?.status === 'ONLINE' ? '#10B981' : 'var(--danger)',
            boxShadow: aiHealth?.status === 'ONLINE' ? '0 0 10px rgba(16, 185, 129, 0.5)' : '0 0 10px var(--danger)'
          }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: '700', fontSize: '1rem', color: '#0078D4', letterSpacing: '0.5px' }}>
                NVIDIA NIM Ultra
              </span>
              <span style={{ 
                fontSize: '0.7rem', 
                background: '#EFF6FF', 
                color: '#0078D4', 
                padding: '0.15rem 0.55rem', 
                borderRadius: '999px',
                fontWeight: '700',
                border: '1px solid #BFDBFE'
              }}>
                PRIMARY ENGINE
              </span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
              {aiHealth?.nvidia?.online ? 'Accelerated Cloud AI Active' : (aiHealth?.ollama?.online ? 'Running on Local Fallback' : 'Connecting...')}
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.82rem', color: '#475569', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ 
            background: '#F8FAFC', 
            border: '1px solid #E2E8F0', 
            padding: '0.35rem 0.75rem', 
            borderRadius: '6px' 
          }}>
            <span style={{ color: '#64748B' }}>Primary: </span>
            <strong style={{ color: '#0F172A' }}>550B Nemotron Ultra</strong>
            {aiHealth?.nvidia?.primary_key_active ? <span style={{ color: '#059669', marginLeft: '4px', fontWeight: '600' }}>● Live</span> : <span style={{ color: '#64748B', marginLeft: '4px' }}>● Ready</span>}
          </div>

          <div style={{ 
            background: '#F8FAFC', 
            border: '1px solid #E2E8F0', 
            padding: '0.35rem 0.75rem', 
            borderRadius: '6px' 
          }}>
            <span style={{ color: '#64748B' }}>Fast: </span>
            <strong style={{ color: '#0F172A' }}>30B Nemotron Omni</strong>
            {aiHealth?.nvidia?.fallback_key_active ? <span style={{ color: '#059669', marginLeft: '4px', fontWeight: '600' }}>● Live</span> : <span style={{ color: '#64748B', marginLeft: '4px' }}>● Ready</span>}
          </div>

          <div style={{ 
            background: '#F8FAFC', 
            border: '1px solid #E2E8F0', 
            padding: '0.35rem 0.75rem', 
            borderRadius: '6px' 
          }}>
            <span style={{ color: '#64748B' }}>Local: </span>
            <strong style={{ color: aiHealth?.ollama?.online ? '#059669' : '#64748B' }}>
              {aiHealth?.ollama?.online ? 'Ollama Standby ✓' : 'Ollama Off'}
            </strong>
          </div>
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
