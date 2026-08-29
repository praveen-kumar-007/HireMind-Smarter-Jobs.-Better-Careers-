import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { FileText, Upload, Plus, Check, Mail, Phone, MapPin, Sparkles } from 'lucide-react'

export default function Resume() {
  const [file, setFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<any>(null)
  
  const queryClient = useQueryClient()

  // Fetch resume data
  const { data: resume, isLoading, error } = useQuery({
    queryKey: ['resume'],
    queryFn: async () => {
      const response = await api.get('/resume')
      return response.data
    },
    retry: false
  })

  // Resume Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const formData = new FormData()
      formData.append('file', uploadFile)
      const response = await api.post('/resume/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      setFile(null)
      alert("Resume uploaded and parsed successfully!")
    },
    onError: (err: any) => {
      setUploadError(err.response?.data?.detail || "Upload parsing failed. Use valid PDF/DOCX.")
    }
  })

  // Resume Update parsed fields Mutation
  const updateMutation = useMutation({
    mutationFn: async ({ versionId, data }: { versionId: number, data: any }) => {
      const response = await api.put(`/resume/version/${versionId}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume'] })
      setEditing(false)
      alert("Resume details updated and indexed in FAISS vector database!")
    }
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0])
      setUploadError('')
    }
  }

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    uploadMutation.mutate(file)
  }

  const handleEditClick = (latestVersion: any) => {
    setEditData({ ...latestVersion.parsed_data })
    setEditing(true)
  }

  const handleSaveClick = (versionId: number) => {
    updateMutation.mutate({ versionId, data: editData })
  }

  if (isLoading) {
    return <div style={{ color: 'var(--text-secondary)' }}>Loading resume data...</div>
  }

  // Find latest parsed resume version if resume exists
  const latestVersion = resume && resume.versions && resume.versions.length > 0
    ? resume.versions[resume.versions.length - 1]
    : null

  return (
    <div>
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>My Resume</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Upload your resume, verify the details parsed by the AI agents, and edit data for matching optimization.</p>
      </div>

      {/* If no resume exists or upload trigger */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
        
        {/* Upload Card */}
        <div className="card" style={{ height: 'fit-content' }}>
          <h3 className="card-title">Upload New Resume</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Supported formats: <strong>PDF</strong>, <strong>DOCX</strong> (Max 5MB). Submitting a new file automatically generates a new version history.
          </p>

          {uploadError && (
            <div style={{ color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {uploadError}
            </div>
          )}

          <form onSubmit={handleUploadSubmit}>
            <div style={{ 
              border: '2px dashed #CBD5E1', 
              borderRadius: 'var(--radius-md)', 
              padding: '2.5rem 1.5rem', 
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: '1.5rem',
              background: '#F8FAFC',
              transition: 'var(--transition)'
            }}
            onClick={() => document.getElementById('file-upload-input')?.click()}
            >
              <Upload size={32} style={{ color: '#0078D4', marginBottom: '1rem' }} />
              <p style={{ fontSize: '0.9rem', fontWeight: '600', color: '#0F172A' }}>
                {file ? file.name : 'Click to browse files'}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.25rem' }}>
                Drag and drop your file here
              </p>
              <input 
                id="file-upload-input"
                type="file" 
                style={{ display: 'none' }} 
                accept=".pdf,.docx"
                onChange={handleFileChange}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%' }}
              disabled={uploadMutation.isPending || !file}
            >
              {uploadMutation.isPending ? 'Analyzing Resume...' : 'Parse File'}
            </button>
          </form>
        </div>

        {/* Parsed Output view */}
        <div className="card">
          <div className="card-title">
            <span>Parsed Active Profile</span>
            {latestVersion && !editing && (
              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }} onClick={() => handleEditClick(latestVersion)}>
                Edit Details
              </button>
            )}
          </div>

          {!latestVersion ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
              No active resume. Please upload a PDF/DOCX file to extract profiles.
            </div>
          ) : editing ? (
            /* Editing form */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editData.name || ''} 
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input 
                  type="email" 
                  className="form-input" 
                  value={editData.email || ''} 
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editData.phone || ''} 
                  onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editData.location || ''} 
                  onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={() => handleSaveClick(latestVersion.id)}>
                  <Check size={16} /> Save & Index
                </button>
                <button className="btn btn-secondary" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Standard display values */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                <h2 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', marginBottom: '0.5rem', color: '#0F172A' }}>
                  {latestVersion.parsed_data.name || 'Candidate Name'}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', color: '#475569' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Mail size={12} style={{ color: '#0078D4' }} /> {latestVersion.parsed_data.email || 'No email parsed'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Phone size={12} style={{ color: '#0078D4' }} /> {latestVersion.parsed_data.phone || 'No phone parsed'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <MapPin size={12} style={{ color: '#0078D4' }} /> {latestVersion.parsed_data.location || 'No location parsed'}
                  </span>
                </div>
              </div>

              {/* Skills */}
              <div>
                <h4 style={{ fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', fontWeight: '700' }}>
                  Skills parsed ({latestVersion.skills?.length || 0})
                </h4>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {latestVersion.skills?.map((s: any) => (
                    <span key={s.id} className="badge badge-primary">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Projects */}
              <div>
                <h4 style={{ fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', fontWeight: '700' }}>
                  Projects ({latestVersion.projects?.length || 0})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {latestVersion.projects?.map((proj: any) => (
                    <div key={proj.id} style={{ fontSize: '0.85rem', paddingLeft: '0.75rem', borderLeft: '3px solid #0078D4' }}>
                      <strong style={{ color: '#0F172A' }}>{proj.title}</strong>
                      <p style={{ color: '#475569', marginTop: '0.25rem' }}>{proj.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Education */}
              <div>
                <h4 style={{ fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', fontWeight: '700' }}>
                  Education
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {latestVersion.education?.map((edu: any) => (
                    <div key={edu.id} style={{ fontSize: '0.85rem' }}>
                      <strong style={{ color: '#0F172A' }}>{edu.institution}</strong>
                      <p style={{ color: '#475569' }}>{edu.degree} | GPA: {edu.gpa || 'N/A'}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}
