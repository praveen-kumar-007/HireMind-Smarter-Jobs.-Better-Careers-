import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { 
  Users, 
  UserCheck, 
  Clock, 
  ShieldCheck, 
  CheckCircle, 
  XCircle, 
  Trash2, 
  Search, 
  Mail, 
  Briefcase, 
  Calendar, 
  Check, 
  X,
  AlertCircle
} from 'lucide-react'

export default function AdminApprovals() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTab, setFilterTab] = useState<'pending' | 'all' | 'approved'>('pending')
  const [actionSuccess, setActionSuccess] = useState('')

  const queryClient = useQueryClient()

  // Fetch admin stats
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/stats')
      return res.data
    }
  })

  // Fetch users list
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await api.get('/admin/users')
      return res.data
    }
  })

  // Approve User Mutation
  const approveMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await api.post(`/admin/users/${userId}/approve`)
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      setActionSuccess(data.message || 'User approved successfully!')
      setTimeout(() => setActionSuccess(''), 4000)
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Failed to approve user.')
    }
  })

  // Reject / Deactivate User Mutation
  const rejectMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await api.post(`/admin/users/${userId}/reject`)
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      setActionSuccess(data.message || 'User rejected/deactivated.')
      setTimeout(() => setActionSuccess(''), 4000)
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Failed to reject user.')
    }
  })

  // Delete User Mutation
  const deleteMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await api.delete(`/admin/users/${userId}`)
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      setActionSuccess(data.message || 'User deleted permanently.')
      setTimeout(() => setActionSuccess(''), 4000)
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Failed to delete user.')
    }
  })

  // Filtered users
  const filteredUsers = users.filter((u: any) => {
    const matchesSearch = 
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.full_name && u.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
    
    if (!matchesSearch) return false

    if (filterTab === 'pending') return !u.is_approved
    if (filterTab === 'approved') return u.is_approved
    return true
  })

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ 
            background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', 
            padding: '0.6rem', 
            borderRadius: '12px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldCheck size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '2rem', fontFamily: 'var(--font-display)', margin: 0 }}>
              User Signups & Approvals
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
              Praveen's Administrator Gate | Review, approve, or reject new candidate registrations before they access HireMind.
            </p>
          </div>
        </div>
      </div>

      {actionSuccess && (
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
          {actionSuccess}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #F59E0B' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, fontWeight: '600' }}>Pending Approval</p>
              <h2 style={{ fontSize: '1.85rem', margin: '0.25rem 0 0 0', color: '#F59E0B' }}>{stats?.pending_approvals ?? 0}</h2>
            </div>
            <Clock size={28} style={{ color: '#F59E0B', opacity: 0.8 }} />
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10B981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, fontWeight: '600' }}>Approved Users</p>
              <h2 style={{ fontSize: '1.85rem', margin: '0.25rem 0 0 0', color: '#10B981' }}>{stats?.approved_users ?? 0}</h2>
            </div>
            <UserCheck size={28} style={{ color: '#10B981', opacity: 0.8 }} />
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #6366F1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, fontWeight: '600' }}>Total Registered</p>
              <h2 style={{ fontSize: '1.85rem', margin: '0.25rem 0 0 0', color: '#6366F1' }}>{stats?.total_users ?? 0}</h2>
            </div>
            <Users size={28} style={{ color: '#6366F1', opacity: 0.8 }} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '1rem',
        marginBottom: '1.5rem' 
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className={`btn ${filterTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterTab('pending')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: '600' }}
          >
            <Clock size={16} /> Pending ({stats?.pending_approvals ?? 0})
          </button>
          <button 
            className={`btn ${filterTab === 'approved' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterTab('approved')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: '600' }}
          >
            <UserCheck size={16} /> Approved ({stats?.approved_users ?? 0})
          </button>
          <button 
            className={`btn ${filterTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterTab('all')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: '600' }}
          >
            <Users size={16} /> All Users ({stats?.total_users ?? 0})
          </button>
        </div>

        <div style={{ position: 'relative', minWidth: '280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
          <input 
            type="text" 
            className="form-input" 
            placeholder="Search email or candidate name..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>
      </div>

      {/* Users List Table / Cards */}
      {isLoading ? (
        <div style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>
          Loading user records...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <CheckCircle size={48} style={{ color: '#10B981', margin: '0 auto 1rem auto', opacity: 0.8 }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>
            {filterTab === 'pending' ? 'All caught up! No pending signups.' : 'No users match your search criteria.'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            {filterTab === 'pending' ? 'When new candidates register, they will appear here awaiting your 1-click approval.' : 'Try changing your search term or filter tab.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredUsers.map((u: any) => {
            const isPraveen = u.email.toLowerCase().includes('praveen.pr105@gmail.com')
            return (
              <div 
                key={u.id} 
                className="card" 
                style={{ 
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  borderLeft: u.is_approved ? '4px solid #10B981' : '4px solid #F59E0B'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                      {u.full_name || 'New Candidate'}
                    </span>
                    
                    <span style={{ 
                      padding: '0.2rem 0.6rem', 
                      borderRadius: '12px', 
                      fontSize: '0.75rem', 
                      fontWeight: '700',
                      background: u.is_approved ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: u.is_approved ? '#10B981' : '#B45309',
                      border: `1px solid ${u.is_approved ? '#10B981' : '#F59E0B'}`
                    }}>
                      {u.is_approved ? '✓ Approved & Active' : '⏳ Awaiting Approval'}
                    </span>

                    {isPraveen && (
                      <span style={{ 
                        padding: '0.2rem 0.6rem', 
                        borderRadius: '12px', 
                        fontSize: '0.75rem', 
                        fontWeight: '700',
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: '#6366F1',
                        border: '1px solid #6366F1'
                      }}>
                        👑 Super Admin
                      </span>
                    )}

                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      User #{u.id}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Mail size={14} /> {u.email}
                    </span>
                    {u.location && (
                      <span>📍 {u.location}</span>
                    )}
                    {u.experience_level && (
                      <span style={{ fontWeight: '600' }}>🎓 {u.experience_level === 'junior' ? 'Fresher (0-1 Yrs)' : u.experience_level}</span>
                    )}
                    {u.created_at && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Calendar size={14} /> Registered: {new Date(u.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {u.target_roles && u.target_roles.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                      {u.target_roles.map((r: string, idx: number) => (
                        <span key={idx} style={{ 
                          fontSize: '0.75rem', 
                          background: 'var(--bg-tertiary)', 
                          padding: '0.15rem 0.5rem', 
                          borderRadius: '4px',
                          color: 'var(--text-secondary)'
                        }}>
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {!u.is_approved ? (
                    <>
                      <button
                        className="btn"
                        onClick={() => approveMutation.mutate(u.id)}
                        disabled={approveMutation.isPending}
                        style={{
                          background: '#10B981',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontWeight: '700',
                          padding: '0.5rem 1rem'
                        }}
                        title="Approve candidate signup so they can login"
                      >
                        <Check size={16} /> Approve Signup
                      </button>

                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          if (confirm(`Reject and delete signup request for ${u.email}?`)) {
                            deleteMutation.mutate(u.id)
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        style={{
                          color: '#EF4444',
                          borderColor: '#EF4444',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.5rem 0.85rem'
                        }}
                        title="Reject signup request"
                      >
                        <X size={16} /> Reject
                      </button>
                    </>
                  ) : (
                    <>
                      {!isPraveen && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            if (confirm(`Deactivate access for ${u.email}?`)) {
                              rejectMutation.mutate(u.id)
                            }
                          }}
                          disabled={rejectMutation.isPending}
                          style={{
                            color: '#F59E0B',
                            borderColor: '#F59E0B',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.85rem'
                          }}
                          title="Temporarily deactivate login access"
                        >
                          <XCircle size={15} /> Deactivate
                        </button>
                      )}

                      {!isPraveen && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            if (confirm(`Permanently delete user ${u.email} and all their data?`)) {
                              deleteMutation.mutate(u.id)
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          style={{
                            color: '#EF4444',
                            borderColor: '#EF4444',
                            padding: '0.5rem',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                          title="Delete User"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </>
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
