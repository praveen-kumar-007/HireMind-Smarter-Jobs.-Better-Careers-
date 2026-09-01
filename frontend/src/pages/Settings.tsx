import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { Save, User, Sliders, Shield, Database, Zap } from 'lucide-react'
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

  
  const [github, setGithub] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [portfolio, setPortfolio] = useState('')
  
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
      setGithub(p.github || '')
      setLinkedin(p.linkedin || '')
      setPortfolio(p.portfolio || '')
      setTargetRoles(p.target_roles?.join(', ') || '')
      setPreferredLocations(p.preferred_locations?.join(', ') || '')
      setRemotePreference(p.remote_preference || 'any')
      setExperienceLevel(p.experience_level || 'junior')
      setMinSalary(p.min_salary ?? '')
      setMinMatchPercentage(p.min_match_percentage ?? 60)
      setPrimaryModel(p.primary_model || 'qwen3:8b')
      setFastModel(p.fast_model || 'qwen3:4b')
      setAiTemperature(p.ai_temperature ?? 0.7)
      setAiTimeout(p.ai_timeout ?? 120)
      
      // Sync automation parameters
      setTestMode(p.test_mode ?? true)
      setMaxApplicationsPerDay(p.max_applications_per_day ?? 20)
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
      alert("Settings and Fresher Profile saved successfully!")
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
      github: github || null,
      linkedin: linkedin || null,
      portfolio: portfolio || null,
      target_roles: rolesArray,
      preferred_locations: locationsArray,
      remote_preference: remotePreference,
      experience_level: experienceLevel,
      min_salary: minSalary === '' ? null : Number(minSalary),
      min_match_percentage: minMatchPercentage,
      primary_model: primaryModel,
      fast_model: fastModel,
      ai_temperature: aiTemperature,
      ai_timeout: aiTimeout,
      test_mode: testMode,
      max_applications_per_day: Number(maxApplicationsPerDay),
      notice_period: noticePeriod,
      salary_expectation: salaryExpectation,
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
      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>Profile & Career Settings</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Logged in as <strong style={{ color: 'var(--primary)' }}>{user?.email || 'User'}</strong> | Manage candidate info, Fresher status, skills, and target roles.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ 
            padding: '0.4rem 0.85rem', 
            borderRadius: '20px', 
            fontSize: '0.85rem', 
            fontWeight: '700',
            background: experienceLevel === 'junior' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
            color: experienceLevel === 'junior' ? '#10B981' : '#6366F1',
            border: `1px solid ${experienceLevel === 'junior' ? '#10B981' : '#6366F1'}`
          }}>
            {experienceLevel === 'junior' ? '🎓 Fresher (0-1 Yrs)' : experienceLevel === 'mid' ? '💼 Mid-Level' : experienceLevel === 'senior' ? '⭐ Senior' : '🌐 Open Level'}
          </span>
        </div>
      </div>

      <form onSubmit={handleSaveSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
          
          {/* Profile Card */}
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={18} style={{ color: 'var(--primary)' }} />
              Personal & Online Profiles
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

            <div className="form-group">
              <label className="form-label">GitHub URL</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="https://github.com/..." 
                value={github}
                onChange={(e) => setGithub(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">LinkedIn URL</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="https://www.linkedin.com/in/..." 
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Portfolio / Website</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="https://..." 
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
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
          <div className="card" style={{ height: 'fit-content', border: '1px solid rgba(0, 120, 212, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Zap size={18} style={{ color: '#0078D4' }} />
                AI Engine & Inference Settings
              </h3>
              <span style={{ 
                fontSize: '0.7rem', 
                background: '#EFF6FF', 
                color: '#0078D4', 
                padding: '0.2rem 0.5rem', 
                borderRadius: '4px', 
                fontWeight: '700',
                border: '1px solid #BFDBFE'
              }}>
                LOCAL + CLOUD
              </span>
            </div>

            <div style={{ 
              background: 'rgba(0, 120, 212, 0.04)', 
              border: '1px solid rgba(0, 120, 212, 0.15)', 
              padding: '0.75rem', 
              borderRadius: '6px', 
              fontSize: '0.8rem', 
              color: 'var(--text-secondary)',
              marginBottom: '1rem',
              lineHeight: '1.4'
            }}>
              ⚡ Choose between <strong>Local AI (Ollama)</strong> (100% on-device & private with local-only fallback) or <strong>Cloud AI APIs</strong> (Groq LPU ~300 t/s with multi-cloud ML API fallback).
            </div>

            <div className="form-group">
              <label className="form-label">Active AI Engine</label>
              <select
                className="form-input"
                value={primaryModel === 'ollama' ? 'local' : (primaryModel === 'cloud' || primaryModel === 'hybrid' || primaryModel === 'groq' || primaryModel === 'gemini' || primaryModel === 'nvidia' ? 'cloud' : primaryModel)}
                onChange={(e) => setPrimaryModel(e.target.value)}
                style={{ cursor: 'pointer', fontWeight: '600' }}
              >
                <option value="local">🤖 Local AI (Ollama - 100% Private & On-Device)</option>
                <option value="cloud">⚡ Cloud AI APIs (Groq LPU + Gemini 2.0 + NVIDIA NIM)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Fast Model / Sub-Agent</label>
              <input 
                type="text" 
                className="form-input" 
                value={fastModel || "qwen3:4b"}
                onChange={(e) => setFastModel(e.target.value)}
                placeholder="qwen3:4b / llama-3.1-8b-instant"
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
