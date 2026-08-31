import React, { useState } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import Applications from './pages/Applications'
import Resume from './pages/Resume'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Register from './pages/Register'
import Visited from './pages/Visited'
import AllApplied from './pages/AllApplied'
import ManualIntervention from './pages/ManualIntervention'
import QABank from './pages/QABank'
import { Menu, X } from 'lucide-react'

// Guarded Route component checking for JWT tokens
function ProtectedLayout({ onLogout }: { onLogout: () => void }) {
  const token = localStorage.getItem('access_token')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  if (!token) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="app-container">
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <button 
          className="menu-toggle" 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title="Toggle Navigation Menu"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <div className="mobile-logo" style={{ display: 'flex', alignItems: 'center' }}>
          <img 
            src="/hiremind-compact.png" 
            alt="HireMind" 
            style={{ height: '32px', objectFit: 'contain' }} 
          />
        </div>
        <div style={{ width: '28px' }}></div> {/* Balanced placeholder for symmetry */}
      </header>

      {/* Backdrop overlay for mobile menu */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} 
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar 
        onLogout={onLogout} 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
      />
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  )
}

export default function App() {
  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  return (
    <Routes>
      {/* Auth Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected App Routes */}
      <Route element={<ProtectedLayout onLogout={handleLogout} />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/visited" element={<Visited />} />
        <Route path="/applied" element={<AllApplied />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/qa" element={<QABank />} />
        <Route path="/manual" element={<ManualIntervention />} />
        <Route path="/resume" element={<Resume />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Fallback redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
