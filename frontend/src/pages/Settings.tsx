import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Save, User, Sliders, Shield, Database } from 'lucide-react'
import CredentialSettings from '../components/CredentialSettings'


export default function Settings() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [targetRoles, setTargetRoles] = useState('')
  const [preferredLocations, setPreferredLocations] = useState('')
  const [remotePreference, setRemotePreference] = useState('any')
  const [experienceLevel, setExperienceLevel] = useState('any')
  const [minSalary, setMinSalary] = useState<number | ''>('')
  const [minMatchPercentage, setMinMatchPercentage] = useState(60)
  const [primaryModel, setPrimaryModel] = useState('qwen3:8b')
  const [fastModel, setFastModel] = useState('qwen3:4b')
  const [aiTemperature, setAiTemperature] = useState(0.7)
  const [aiTimeout, setAiTimeout] = useState(120)
  
  // Safety & Automation Controls
  const [testMode, setTestMode] = useState(true)
  const [maxApplicationsPerDay, setMaxApplicationsPerDay] = useState(10)
  const [noticePeriod, setNoticePeriod] = useState('immediate')
  const [salaryExpectation, setSalaryExpectation] = useState('')
  const [workAuthorization, setWorkAuthorization] = useState('authorized')
  const [excludedCompanies, setExcludedCompanies] = useState('')
  const [excludedJobTitles, setExcludedJobTitles] = useState('')

  
  const queryClient = useQueryClient()

  // Fetch current user details
  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api.get('/auth/me')
      return response.data
    }
  })

  // Synchronise state with database values when loaded
  useEffect(() => {
    if (user && user.profile) {
      const p = user.profile
      setFullName(p.full_name || '')
      setPhone(p.phone || '')
      setLocation(p.location || '')
      setTargetRoles(p.target_roles?.join(', ') || '')
      setPreferredLocations(p.preferred_locations?.join(', ') || '')
      setRemotePreference(p.remote_preference || 'any')
      setExperienceLevel(p.experience_level || 'any')
      setMinSalary(p.min_salary ?? '')
      setMinMatchPercentage(p.min_match_percentage ?? 60)
      setPrimaryModel(p.primary_model || 'qwen3:8b')
      setFastModel(p.fast_model || 'qwen3:4b')
      setAiTemperature(p.ai_temperature ?? 0.7)
      setAiTimeout(p.ai_timeout ?? 120)
      
      // Sync automation parameters
      setTestMode(p.test_mode ?? true)
      setMaxApplicationsPerDay(p.max_applications_per_day ?? 10)
      setNoticePeriod(p.notice_period || 'immediate')
      setSalaryExpectation(p.salary_expectation || '')
      setWorkAuthorization(p.work_authorization || 'authorized')
      setExcludedCompanies(p.excluded_companies?.join(', ') || '')
      setExcludedJobTitles(p.excluded_job_titles?.join(', ') || '')
    }
  }, [user])

  // Save profile settings mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await api.put('/auth/profile', payload)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      alert("Settings saved successfully!")
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to update profile settings.")
    }
  })

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Parse target roles and locations
    const rolesArray = targetRoles.split(',').map(r => r.trim()).filter(r => r !== '')
    const locationsArray = preferredLocations.split(',').map(l => l.trim()).filter(l => l !== '')
    const exclCompaniesArray = excludedCompanies.split(',').map(c => c.trim()).filter(c => c !== '')
    const exclTitlesArray = excludedJobTitles.split(',').map(t => t.trim()).filter(t => t !== '')
    
    const payload = {
      full_name: fullName || null,
      phone: phone || null,
      location: location || null,
      target_roles: rolesArray,
      preferred_locations: locationsArray,
      remote_preference: remotePreference,
      experience_level: experienceLevel,
      min_salary: minSalary !== '' ? Number(minSalary) : null,
      min_match_percentage: Number(minMatchPercentage),
      primary_model: primaryModel,
      fast_model: fastModel,
      ai_temperature: Number(aiTemperature),
      ai_timeout: Number(aiTimeout),
      test_mode: testMode,
      max_applications_per_day: Number(maxApplicationsPerDay),
      notice_period: noticePeriod,
      salary_expectation: salaryExpectation || null,
      work_authorization: workAuthorization,
      excluded_companies: exclCompaniesArray,
      excluded_job_titles: exclTitlesArray
    }
    
    saveMutation.mutate(payload)
  }

  if (isLoading) {
    return <div style={{ color: 'var(--text-secondary)' }}>Loading your profile settings...</div>
  }

  return (
    <div>
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>User Settings</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Configure target roles, salary, remote preferences, and customize match score thresholds.</p>
      </div>

      <form onSubmit={handleSaveSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
          
          {/* Profile Card */}
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={18} style={{ color: 'var(--primary)' }} />
              Contact Information
            </h3>
            
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input 
                type="text" 
                className="form-input" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Location (City, State)</label>
              <input 
                type="text" 
                className="form-input" 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          {/* Job targeting & preferences */}
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sliders size={18} style={{ color: 'var(--secondary)' }} />
              Job Targeting & Preferences
            </h3>

            <div className="form-group">
              <label className="form-label">Target Roles (comma separated)</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Python Developer, React Engineer" 
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Preferred Locations (comma separated)</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Bangalore, Remote" 
                value={preferredLocations}
                onChange={(e) => setPreferredLocations(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Remote Preference</label>
              <select 
                className="form-input" 
                value={remotePreference}
                onChange={(e) => setRemotePreference(e.target.value)}
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <option value="any">Any</option>
                <option value="remote">Remote Only</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Experience Level / Profile Tier</label>
              <select 
                className="form-input" 
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <option value="any">Any Level</option>
                <option value="junior">Junior / Fresher (0-1 Years)</option>
                <option value="mid">Mid-Level (1-3 Years)</option>
                <option value="senior">Senior Level (5+ Years)</option>
              </select>
            </div>
          </div>

          {/* Compensation & Notice */}
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sliders size={18} style={{ color: '#ec4899' }} />
              Compensation & Notice
            </h3>

            <div className="form-group">
              <label className="form-label">Work Authorization Status</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. Authorized to work in India" 
                value={workAuthorization}
                onChange={(e) => setWorkAuthorization(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Notice Period</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Immediate, 30 Days" 
                  value={noticePeriod}
                  onChange={(e) => setNoticePeriod(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Salary Expectation</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. 10 LPA" 
                  value={salaryExpectation}
                  onChange={(e) => setSalaryExpectation(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Min Salary (LPA)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={minSalary}
                  onChange={(e) => setMinSalary(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Min Match (%)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={minMatchPercentage}
                  onChange={(e) => setMinMatchPercentage(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Exclusions & Filters */}
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sliders size={18} style={{ color: '#a855f7' }} />
              Exclusions & Filters
            </h3>

            <div className="form-group">
              <label className="form-label">Excluded Companies (comma separated)</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Google, Facebook" 
                value={excludedCompanies}
                onChange={(e) => setExcludedCompanies(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Excluded Job Titles (comma separated)</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Sales, Recruiter" 
                value={excludedJobTitles}
                onChange={(e) => setExcludedJobTitles(e.target.value)}
              />
            </div>
          </div>

          {/* Safety & Automation Card */}
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={18} style={{ color: 'var(--accent)' }} />
              Agent Safety & Apply Mode
            </h3>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--glass-border)' }}>
              <input 
                type="checkbox" 
                id="testModeToggle"
                checked={testMode}
                onChange={(e) => setTestMode(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="testModeToggle" style={{ fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' }}>
                Enable Safe Test Mode (Stops before submission)
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">Max Applications Per Day</label>
              <input 
                type="number" 
                className="form-input" 
                value={maxApplicationsPerDay}
                onChange={(e) => setMaxApplicationsPerDay(Number(e.target.value))}
              />
            </div>
          </div>

          {/* AI Settings Card */}
          <div className="card" style={{ height: 'fit-content', border: '1px solid rgba(118, 185, 0, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Shield size={18} style={{ color: '#76b900' }} />
                NVIDIA NIM AI Acceleration
              </h3>
              <span style={{ 
                fontSize: '0.7rem', 
                background: 'rgba(118, 185, 0, 0.15)', 
                color: '#76b900', 
                padding: '0.2rem 0.5rem', 
                borderRadius: '4px', 
                fontWeight: '700',
                border: '1px solid rgba(118, 185, 0, 0.3)'
              }}>
                PRIMARY ENGINE
              </span>
            </div>

            <div style={{ 
              background: 'rgba(118, 185, 0, 0.04)', 
              border: '1px solid rgba(118, 185, 0, 0.15)', 
              padding: '0.75rem', 
              borderRadius: '6px', 
              fontSize: '0.8rem', 
              color: 'var(--text-secondary)',
              marginBottom: '1rem',
              lineHeight: '1.4'
            }}>
              🚀 Powered by <strong>NVIDIA NIM Cloud Endpoints</strong> (Nemotron 550B Ultra + 30B Omni Reasoning) with automatic failover to local Ollama.
            </div>

            <div className="form-group">
              <label className="form-label">Primary NVIDIA Reasoning Model</label>
              <input 
                type="text" 
                className="form-input" 
                value={primaryModel || "nvidia/nemotron-3-ultra-550b-a55b"}
                onChange={(e) => setPrimaryModel(e.target.value)}
                placeholder="nvidia/nemotron-3-ultra-550b-a55b"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Fast Extraction / Vision Model</label>
              <input 
                type="text" 
                className="form-input" 
                value={fastModel || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"}
                onChange={(e) => setFastModel(e.target.value)}
                placeholder="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">AI Temperature</label>
                <input 
                  type="number" 
                  step="0.1" 
                  min="0" 
                  max="1.5"
                  className="form-input" 
                  value={aiTemperature}
                  onChange={(e) => setAiTemperature(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">AI Timeout (s)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={aiTimeout}
                  onChange={(e) => setAiTimeout(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
          <button type="submit" className="btn btn-primary" style={{ padding: '0.9rem 2.5rem' }} disabled={saveMutation.isPending}>
            <Save size={16} />
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
      <CredentialSettings />
    </div>
  )
}
