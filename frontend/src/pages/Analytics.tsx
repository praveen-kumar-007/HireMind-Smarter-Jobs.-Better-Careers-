import React from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { Bar, Doughnut } from 'react-chartjs-2'
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  ArcElement 
} from 'chart.js'
import { BarChart3, TrendingUp, Award, CheckCircle } from 'lucide-react'

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

export default function Analytics() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => {
      const response = await api.get('/analytics')
      return response.data
    },
    refetchInterval: 3000 // Poll every 3 seconds for real-time analytics updates
  })

  if (isLoading || !stats) {
    return <div style={{ color: 'var(--text-secondary)' }}>Loading Detailed Analytics...</div>
  }

  // Data config for Top Skills Chart (horizontal bar chart)
  const skillsData = {
    labels: stats.top_skills.map((s: any) => s.name),
    datasets: [
      {
        label: 'Job Demand Count',
        data: stats.top_skills.map((s: any) => s.count),
        backgroundColor: [
          'rgba(99, 102, 241, 0.85)',
          'rgba(168, 85, 247, 0.85)',
          'rgba(6, 182, 212, 0.85)',
          'rgba(16, 185, 129, 0.85)',
          'rgba(245, 158, 11, 0.85)',
          'rgba(239, 68, 68, 0.85)'
        ],
        borderWidth: 0,
        borderRadius: 6
      }
    ]
  }

  // Data config for Conversion Funnel
  const funnelData = {
    labels: ['Saved', 'Applied', 'Interviews', 'Offers'],
    datasets: [
      {
        data: [
          stats.overview.jobs_found,
          stats.overview.applications_submitted,
          stats.overview.interviews,
          stats.overview.offers
        ],
        backgroundColor: [
          'rgba(255, 255, 255, 0.1)',
          'rgba(99, 102, 241, 0.6)',
          'rgba(168, 85, 247, 0.75)',
          'rgba(16, 185, 129, 0.9)'
        ],
        borderWidth: 1,
        borderColor: 'var(--glass-border)'
      }
    ]
  }

  const chartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#9ca3af' }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#9ca3af' }
      }
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>Hiring Analytics</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Identify skill gaps, visualize conversion funnels, and track response rates.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '2rem' }}>
        
        {/* Top Skills requested Chart */}
        <div className="card">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={18} style={{ color: 'var(--primary)' }} />
            Top Demanded Skills (In Matches)
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Count of matches where these skill nodes are requested. High demand signals focus areas.
          </p>
          <div style={{ position: 'relative', height: '280px' }}>
            <Bar data={skillsData} options={chartOptions} />
          </div>
        </div>

        {/* Funnel chart */}
        <div className="card">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} style={{ color: 'var(--secondary)' }} />
            Application Pipeline Funnel
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Telemetry tracing funnel steps from initial discovery to final offer accepted.
          </p>
          <div style={{ position: 'relative', height: '240px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '240px' }}>
              <Doughnut data={funnelData} options={{ responsive: true, cutout: '65%' }} />
            </div>
          </div>
        </div>

      </div>

      {/* Metrics breakdown card */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <h3 className="card-title">Detailed Conversion Rates</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '1rem', borderLeft: '3px solid var(--primary)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Match Conversion</span>
            <span style={{ fontSize: '1.75rem', fontWeight: '700' }}>
              {Math.round((stats.overview.jobs_matched / max(1, stats.overview.jobs_found)) * 100)}%
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Found matching your profile thresholds.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '1rem', borderLeft: '3px solid var(--secondary)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Preparation Speed</span>
            <span style={{ fontSize: '1.75rem', fontWeight: '700' }}>
              {Math.round((stats.overview.applications_prepared / max(1, stats.overview.jobs_matched)) * 100)}%
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Prepared drafts from match queue.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '1rem', borderLeft: '3px solid var(--accent)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Interview Callback</span>
            <span style={{ fontSize: '1.75rem', fontWeight: '700' }}>{stats.interview_rate}%</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Interview scheduler callbacks.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '1rem', borderLeft: '3px solid var(--success)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Offer Conversion</span>
            <span style={{ fontSize: '1.75rem', fontWeight: '700' }}>{stats.offer_rate}%</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Offers from final round interviews.</span>
          </div>

        </div>
      </div>
    </div>
  )
}

function max(a: number, b: number) {
  return a > b ? a : b
}
