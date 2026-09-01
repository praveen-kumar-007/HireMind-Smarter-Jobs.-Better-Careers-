import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { 
  FileText, 
  Upload, 
  Plus, 
  Check, 
  Trash2, 
  Sparkles, 
  Briefcase, 
  GraduationCap, 
  FolderGit2, 
  Award, 
  Code, 
  User, 
  Database,
  Save,
  CheckCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

export default function Resume() {
  const [file, setFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [newSkillInput, setNewSkillInput] = useState('')
  const [activeSection, setActiveSection] = useState<'all' | 'summary' | 'skills' | 'experience' | 'education' | 'projects' | 'achievements'>('all')

  // Edit state holding the active resume structure
  const [formData, setFormData] = useState<any>({
    name: '',
    email: '',
    phone: '',
    location: '',
    github: '',
    linkedin: '',
    portfolio: '',
    summary: '',
    skills: [],
    experience: [],
    education: [],
    projects: [],
    achievements: []
  })

  const queryClient = useQueryClient()

  // Fetch resume data
  const { data: resume, isLoading } = useQuery({
    queryKey: ['resume'],
    queryFn: async () => {
      try {
        const res = await api.get('/resume')
        return res.data
      } catch (err: any) {
        if (err.response?.status === 404) return null
        throw err
      }
    },
    retry: false
  })

  // Sync latest version into editable state
  const latestVersion = resume?.versions?.length ? resume.versions[resume.versions.length - 1] : null

  useEffect(() => {
    if (latestVersion?.parsed_data) {
      const p = latestVersion.parsed_data
      setFormData({
        name: p.name || '',
        email: p.email || '',
        phone: p.phone || '',
        location: p.location || '',
        github: p.github || '',
        linkedin: p.linkedin || '',
        portfolio: p.portfolio || '',
        summary: p.summary || '',
        skills: Array.isArray(p.skills) ? p.skills : [],
        experience: Array.isArray(p.experience) ? p.experience : [],
        education: Array.isArray(p.education) ? p.education : [],
        projects: Array.isArray(p.projects) ? p.projects : [],
        achievements: Array.isArray(p.achievements) ? p.achievements : []
      })
    }
  }, [latestVersion])

  // Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const data = new FormData()
      data.append('file', uploadFile)
      const res = await api.post('/resume/upload', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setFile(null)
      setSaveSuccess('Resume uploaded, parsed, and indexed in RAG Vector Memory!')
      setTimeout(() => setSaveSuccess(''), 5000)
    },
    onError: (err: any) => {
      setUploadError(err.response?.data?.detail || 'Upload parsing failed. Please use valid PDF/DOCX.')
    }
  })

  // Save / Update Resume Version Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!latestVersion) return
      const res = await api.put(`/resume/version/${latestVersion.id}`, formData)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setSaveSuccess('Resume updated & RAG Vector Memory re-indexed successfully!')
      setTimeout(() => setSaveSuccess(''), 5000)
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Failed to update resume details.')
    }
  })

  // Skills helpers
  const handleAddSkill = () => {
    if (!newSkillInput.trim()) return
    const current = formData.skills || []
    if (!current.includes(newSkillInput.trim())) {
      setFormData({ ...formData, skills: [...current, newSkillInput.trim()] })
    }
    setNewSkillInput('')
  }

  const handleRemoveSkill = (skillToRemove: string) => {
    setFormData({
      ...formData,
      skills: (formData.skills || []).filter((s: string) => s !== skillToRemove)
    })
  }

  // Experience helpers
  const handleAddExperience = () => {
    setFormData({
      ...formData,
      experience: [
        {
          company: 'New Company',
          title: 'Software Developer / Intern',
          location: 'Remote / Bengaluru',
          start_date: 'Jan 2025',
          end_date: 'Present',
          description: 'Architected features, developed clean code, and improved system performance.'
        },
        ...(formData.experience || [])
      ]
    })
  }

  const handleUpdateExperience = (index: number, field: string, val: string) => {
    const updated = [...(formData.experience || [])]
    updated[index] = { ...updated[index], [field]: val }
    setFormData({ ...formData, experience: updated })
  }

  const handleRemoveExperience = (index: number) => {
    const updated = [...(formData.experience || [])]
    updated.splice(index, 1)
    setFormData({ ...formData, experience: updated })
  }

  // Education helpers
  const handleAddEducation = () => {
    setFormData({
      ...formData,
      education: [
        {
          institution: 'University / College Name',
          degree: 'Bachelor of Technology (B.Tech)',
          field_of_study: 'Computer Science & Engineering',
          start_date: '2022',
          end_date: '2026',
          gpa: '8.5 CGPA'
        },
        ...(formData.education || [])
      ]
    })
  }

  const handleUpdateEducation = (index: number, field: string, val: string) => {
    const updated = [...(formData.education || [])]
    updated[index] = { ...updated[index], [field]: val }
    setFormData({ ...formData, education: updated })
  }

  const handleRemoveEducation = (index: number) => {
    const updated = [...(formData.education || [])]
    updated.splice(index, 1)
    setFormData({ ...formData, education: updated })
  }

  // Project helpers
  const handleAddProject = () => {
    setFormData({
      ...formData,
      projects: [
        {
          title: 'AI Full Stack Web Application',
          description: 'Engineered a full-stack platform with secure authentication, modern responsive UI, and RESTful microservices.',
          technologies: ['React', 'Node.js', 'Python', 'SQL']
        },
        ...(formData.projects || [])
      ]
    })
  }

  const handleUpdateProject = (index: number, field: string, val: any) => {
    const updated = [...(formData.projects || [])]
    updated[index] = { ...updated[index], [field]: val }
    setFormData({ ...formData, projects: updated })
  }

  const handleRemoveProject = (index: number) => {
    const updated = [...(formData.projects || [])]
    updated.splice(index, 1)
    setFormData({ ...formData, projects: updated })
  }

  // Achievements helpers
  const handleAddAchievement = () => {
    setFormData({
      ...formData,
      achievements: [
        {
          title: 'Smart India Hackathon / Certified Developer',
          issuer: 'Organization / Issuer',
          year: '2025',
          description: 'Awarded top percentile for innovative software solution and algorithmic problem solving.'
        },
        ...(formData.achievements || [])
      ]
    })
  }

  const handleUpdateAchievement = (index: number, field: string, val: string) => {
    const updated = [...(formData.achievements || [])]
    updated[index] = { ...updated[index], [field]: val }
    setFormData({ ...formData, achievements: updated })
  }

  const handleRemoveAchievement = (index: number) => {
    const updated = [...(formData.achievements || [])]
    updated.splice(index, 1)
    setFormData({ ...formData, achievements: updated })
  }

  if (isLoading) {
    return <div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading resume details...</div>
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)', margin: 0 }}>Candidate Resume & RAG Profile</h1>
            <span style={{ 
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', 
              color: '#fff', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '20px', 
              fontSize: '0.75rem', 
              fontWeight: '700',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <Database size={13} /> ⚡ RAG Vector Memory Active
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Every section is fully editable. Updates are instantly indexed in RAG semantic vector embeddings for AI screening and matching.
          </p>
        </div>

        {latestVersion && (
          <button 
            className="btn btn-primary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.4rem', 
              fontWeight: '700',
              padding: '0.65rem 1.4rem',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)'
            }}
          >
            <Save size={18} />
            {saveMutation.isPending ? 'Re-Indexing in RAG...' : 'Save & Re-Index in RAG'}
          </button>
        )}
      </div>

      {saveSuccess && (
        <div style={{ 
          background: 'rgba(16, 185, 129, 0.1)', 
          border: '1px solid #10B981', 
          color: '#10B981', 
          padding: '0.85rem 1.25rem', 
          borderRadius: 'var(--radius-md)', 
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontWeight: '600'
        }}>
          <CheckCircle size={18} />
          {saveSuccess}
        </div>
      )}

      {/* If no resume uploaded yet */}
      {!latestVersion && (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', marginBottom: '2rem' }}>
          <Upload size={48} style={{ color: 'var(--primary)', margin: '0 auto 1rem auto' }} />
          <h2 style={{ marginBottom: '0.5rem' }}>Upload Your Resume to Get Started</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '540px', margin: '0 auto 1.5rem auto' }}>
            Upload your existing PDF/DOCX resume. The AI will automatically extract your contact info, skills, education, and projects, and generate your isolated RAG vector index.
          </p>
          
          <div style={{ maxWidth: '400px', margin: '0 auto' }}>
            <input 
              type="file" 
              accept=".pdf,.docx"
              onChange={(e) => {
                if (e.target.files?.[0]) uploadMutation.mutate(e.target.files[0])
              }}
              style={{ display: 'none' }}
              id="initial-upload"
            />
            <label 
              htmlFor="initial-upload"
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.75rem 1.75rem' }}
            >
              <Upload size={18} /> Choose PDF / DOCX Resume
            </label>
          </div>
        </div>
      )}

      {latestVersion && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Section 1: Personal & Contact */}
          <div className="card">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <User size={20} style={{ color: 'var(--primary)' }} />
              1. Personal & Contact Information
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formData.email} 
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formData.phone} 
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Location (City, Country)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formData.location} 
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">GitHub URL</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formData.github} 
                  onChange={(e) => setFormData({ ...formData, github: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">LinkedIn URL</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formData.linkedin} 
                  onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Portfolio Website</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formData.portfolio} 
                  onChange={(e) => setFormData({ ...formData, portfolio: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Professional Summary */}
          <div className="card">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Sparkles size={20} style={{ color: '#F59E0B' }} />
              2. Professional Summary & Career Objective
            </h3>
            <textarea 
              className="form-input" 
              rows={4}
              placeholder="e.g. Passionate Computer Science graduate and Full Stack Developer with strong expertise in Python, React, AI/ML, and scalable web architectures..."
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          {/* Section 3: Technical Skills Tag Editor */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Code size={20} style={{ color: '#10B981' }} />
                3. Skills & Technologies ({formData.skills?.length || 0})
              </h3>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Type a skill and press Add (e.g. Docker, PyTorch, Next.js)..."
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSkill(); } }}
                style={{ flex: 1 }}
              />
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleAddSkill}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: '600' }}
              >
                <Plus size={16} /> Add Skill
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(formData.skills || []).map((skill: string, idx: number) => (
                <span 
                  key={idx}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--glass-border)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    color: 'var(--text-primary)',
                    fontWeight: '500'
                  }}
                >
                  {skill}
                  <button 
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)' }}
                    title="Remove skill"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Section 4: Experience & Internships */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Briefcase size={20} style={{ color: '#6366F1' }} />
                4. Work Experience & Internships ({formData.experience?.length || 0})
              </h3>
              <button 
                type="button"
                className="btn btn-secondary"
                onClick={handleAddExperience}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: '600' }}
              >
                <Plus size={15} /> Add Experience
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {(formData.experience || []).map((exp: any, idx: number) => (
                <div 
                  key={idx}
                  style={{
                    background: 'var(--bg-tertiary)',
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--primary)' }}>
                      #{idx + 1} {exp.title || 'Role'} at {exp.company || 'Company'}
                    </span>
                    <button 
                      type="button"
                      onClick={() => handleRemoveExperience(idx)}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.25rem' }}
                      title="Delete experience entry"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Company / Organization</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={exp.company || ''} 
                        onChange={(e) => handleUpdateExperience(idx, 'company', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Job Title / Role</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={exp.title || ''} 
                        onChange={(e) => handleUpdateExperience(idx, 'title', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Location</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={exp.location || ''} 
                        onChange={(e) => handleUpdateExperience(idx, 'location', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Duration (e.g. Jun 2025 - Aug 2025)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={`${exp.start_date || ''} - ${exp.end_date || ''}`} 
                        onChange={(e) => {
                          const parts = e.target.value.split('-')
                          handleUpdateExperience(idx, 'start_date', parts[0]?.trim() || '')
                          handleUpdateExperience(idx, 'end_date', parts[1]?.trim() || '')
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Key Accomplishments & Responsibilities</label>
                    <textarea 
                      className="form-input" 
                      rows={3}
                      value={exp.description || ''} 
                      onChange={(e) => handleUpdateExperience(idx, 'description', e.target.value)}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 5: Education */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <GraduationCap size={20} style={{ color: '#EC4899' }} />
                5. Education & Academics ({formData.education?.length || 0})
              </h3>
              <button 
                type="button"
                className="btn btn-secondary"
                onClick={handleAddEducation}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: '600' }}
              >
                <Plus size={15} /> Add Education
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {(formData.education || []).map((edu: any, idx: number) => (
                <div 
                  key={idx}
                  style={{
                    background: 'var(--bg-tertiary)',
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#EC4899' }}>
                      #{idx + 1} {edu.degree || 'Degree'} - {edu.institution || 'Institution'}
                    </span>
                    <button 
                      type="button"
                      onClick={() => handleRemoveEducation(idx)}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.25rem' }}
                      title="Delete education entry"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Institution / University</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={edu.institution || ''} 
                        onChange={(e) => handleUpdateEducation(idx, 'institution', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Degree & Major</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={edu.degree || ''} 
                        onChange={(e) => handleUpdateEducation(idx, 'degree', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>GPA / Percentage</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={edu.gpa || ''} 
                        onChange={(e) => handleUpdateEducation(idx, 'gpa', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Year Range (e.g. 2022 - 2026)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={`${edu.start_date || ''} - ${edu.end_date || ''}`} 
                        onChange={(e) => {
                          const parts = e.target.value.split('-')
                          handleUpdateEducation(idx, 'start_date', parts[0]?.trim() || '')
                          handleUpdateEducation(idx, 'end_date', parts[1]?.trim() || '')
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 6: Key Projects */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <FolderGit2 size={20} style={{ color: '#8B5CF6' }} />
                6. Key Projects ({formData.projects?.length || 0})
              </h3>
              <button 
                type="button"
                className="btn btn-secondary"
                onClick={handleAddProject}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: '600' }}
              >
                <Plus size={15} /> Add Project
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {(formData.projects || []).map((proj: any, idx: number) => (
                <div 
                  key={idx}
                  style={{
                    background: 'var(--bg-tertiary)',
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#8B5CF6' }}>
                      #{idx + 1} {proj.title || 'Project'}
                    </span>
                    <button 
                      type="button"
                      onClick={() => handleRemoveProject(idx)}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.25rem' }}
                      title="Delete project entry"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Project Title</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={proj.title || ''} 
                      onChange={(e) => handleUpdateProject(idx, 'title', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Technologies Used (comma separated)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={Array.isArray(proj.technologies) ? proj.technologies.join(', ') : (proj.technologies || '')} 
                      onChange={(e) => {
                        const tags = e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean)
                        handleUpdateProject(idx, 'technologies', tags)
                      }}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Project Architecture & Highlights</label>
                    <textarea 
                      className="form-input" 
                      rows={3}
                      value={proj.description || ''} 
                      onChange={(e) => handleUpdateProject(idx, 'description', e.target.value)}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 7: Achievements & Certifications */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Award size={20} style={{ color: '#F59E0B' }} />
                7. Achievements & Certifications ({formData.achievements?.length || 0})
              </h3>
              <button 
                type="button"
                className="btn btn-secondary"
                onClick={handleAddAchievement}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: '600' }}
              >
                <Plus size={15} /> Add Achievement / Certificate
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {(formData.achievements || []).map((ach: any, idx: number) => (
                <div 
                  key={idx}
                  style={{
                    background: 'var(--bg-tertiary)',
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#F59E0B' }}>
                      #{idx + 1} {ach.title || 'Certification / Award'}
                    </span>
                    <button 
                      type="button"
                      onClick={() => handleRemoveAchievement(idx)}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.25rem' }}
                      title="Delete entry"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Title</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={ach.title || ''} 
                        onChange={(e) => handleUpdateAchievement(idx, 'title', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Issuing Organization</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={ach.issuer || ''} 
                        onChange={(e) => handleUpdateAchievement(idx, 'issuer', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Year</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={ach.year || ''} 
                        onChange={(e) => handleUpdateAchievement(idx, 'year', e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Details & Context</label>
                    <textarea 
                      className="form-input" 
                      rows={2}
                      value={ach.description || ''} 
                      onChange={(e) => handleUpdateAchievement(idx, 'description', e.target.value)}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Save Bar */}
          <div style={{ 
            position: 'sticky', 
            bottom: '1.5rem', 
            background: 'var(--bg-secondary)', 
            padding: '1rem 1.5rem', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid var(--glass-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            zIndex: 10
          }}>
            <div>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                Ready to save your updates?
              </span>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                Syncs all candidate data and re-indexes RAG semantic embeddings for AI answer generation.
              </p>
            </div>

            <button 
              className="btn btn-primary"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', padding: '0.75rem 1.75rem' }}
            >
              <Save size={18} />
              {saveMutation.isPending ? 'Re-Indexing in RAG...' : 'Save & Re-Index in RAG'}
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
