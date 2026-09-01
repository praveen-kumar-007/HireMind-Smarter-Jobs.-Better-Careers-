import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { KeyRound, ShieldAlert, Plus, Trash2, Mail, Briefcase } from 'lucide-react'

export default function CredentialSettings() {
  const [platform, setPlatform] = useState('naukri')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [imapHost, setImapHost] = useState('imap.gmail.com')
  const [imapPort, setImapPort] = useState('993')
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState('587')
  const [fromEmail, setFromEmail] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
 
  const queryClient = useQueryClient()
 
  // Fetch saved credentials
  const { data: credentials, isLoading } = useQuery({
    queryKey: ['credentials'],
    queryFn: async () => {
      const response = await api.get('/settings/credentials')
      return response.data
    }
  })
 
  // Save credential mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await api.post('/settings/credentials', payload)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
      setUsername('')
      setPassword('')
      setFromEmail('')
      setErrorMsg('')
      alert('Platform credentials saved successfully!')
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail || 'Failed to save credentials.')
    }
  })
 
  // Delete credential mutation
  const deleteMutation = useMutation({
    mutationFn: async (targetPlatform: string) => {
      await api.delete(`/settings/credentials/${targetPlatform}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
      alert('Credentials deleted successfully.')
    }
  })
 
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    if (!username || !password) {
      setErrorMsg('Please fill in both username and password.');
      return
    }
 
    let extra_data = {}
    if (platform === 'email_imap') {
      extra_data = { host: imapHost, port: imapPort }
    } else if (platform === 'email_smtp') {
      extra_data = { host: smtpHost, port: smtpPort, from_email: fromEmail || username }
    }

    saveMutation.mutate({
      platform,
      username,
      password,
      extra_data
    })
  }
 
  if (isLoading) {
    return <div style={{ color: 'var(--text-secondary)' }}>Loading credential vaults...</div>
  }
 
  return (
    <div className="card" style={{ height: 'fit-content', marginTop: '2rem' }}>
      <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <KeyRound size={18} style={{ color: 'var(--accent)' }} />
        Automatic Agent Login Vault
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Provide credentials so the Playwright agent can automatically log in and apply for jobs on your behalf.
      </p>
 
      {errorMsg && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid var(--danger)',
          color: '#f87171',
          padding: '0.75rem',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem',
          marginBottom: '1rem'
        }}>
          {errorMsg}
        </div>
      )}
 
      <form onSubmit={handleSave} style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
          
          <div className="form-group">
            <label className="form-label">Target Platform</label>
            <select
              className="form-input"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <option value="naukri">Naukri</option>
              <option value="email_imap">Email Inbox (IMAP OTP Reader)</option>
              <option value="email_smtp">Cold Email Outreach (SMTP Server)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Username / Email</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. user@gmail.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password / App Code</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {platform === 'email_imap' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--glass-border)' }}>
            <div className="form-group">
              <label className="form-label">IMAP Server Host</label>
              <input
                type="text"
                className="form-input"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">IMAP Port (SSL)</label>
              <input
                type="text"
                className="form-input"
                value={imapPort}
                onChange={(e) => setImapPort(e.target.value)}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <ShieldAlert size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <span>For Gmail accounts, configure a 16-character <strong>App Password</strong> in your Google Account security settings.</span>
            </div>
          </div>
        )}

        {platform === 'email_smtp' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--glass-border)' }}>
            <div className="form-group">
              <label className="form-label">SMTP Server Host</label>
              <input
                type="text"
                className="form-input"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="e.g. smtp.gmail.com"
              />
            </div>
            <div className="form-group">
              <label className="form-label">SMTP Port</label>
              <input
                type="text"
                className="form-input"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="e.g. 587 or 465"
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Sender Email Address (From Address)</label>
              <input
                type="email"
                className="form-input"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="e.g. address@gmail.com (Leave blank to use username)"
              />
            </div>
            <div style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <ShieldAlert size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <span>For Gmail SMTP, configure a 16-character <strong>App Password</strong>. Gmail requires port 587 (TLS) or 465 (SSL).</span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem' }} disabled={saveMutation.isPending}>
            <Plus size={16} />
            {saveMutation.isPending ? 'Saving Vault...' : 'Add Account'}
          </button>
        </div>
      </form>

      {/* List of active credentials */}
      <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Active Vault Connections</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {credentials?.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No platform logins configured yet. The agent will track jobs as "Saved" instead of auto-applying.
          </div>
        ) : (
          credentials?.map((cred: any) => (
            <div key={cred.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {cred.platform.startsWith('email_') ? <Mail size={16} style={{ color: 'var(--accent)' }} /> : <Briefcase size={16} style={{ color: 'var(--primary)' }} />}
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '600', textTransform: 'capitalize' }}>
                    {cred.platform === 'email_imap' ? 'Email (IMAP OTP Reader)' : cred.platform === 'email_smtp' ? 'Cold Email Outreach (SMTP)' : cred.platform}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{cred.username}</div>
                </div>
              </div>
              <button
                className="btn btn-danger"
                style={{ padding: '0.4rem', borderRadius: '4px' }}
                onClick={() => {
                  if (confirm(`Are you sure you want to delete credentials for ${cred.platform}?`)) {
                    deleteMutation.mutate(cred.platform)
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
