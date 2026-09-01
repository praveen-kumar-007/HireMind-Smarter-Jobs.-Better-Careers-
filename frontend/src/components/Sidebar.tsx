import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Briefcase, FileText, CheckCircle2, BarChart3, Settings, LogOut, Mail, Clock, X, AlertCircle, MessageSquareText } from 'lucide-react'

interface SidebarProps {
  onLogout: () => void
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ onLogout, isOpen, onClose }: SidebarProps) {
  const navigate = useNavigate()

  const handleLogoutClick = () => {
    onLogout()
    onClose?.()
    navigate('/login')
  }

  const handleLinkClick = () => {
    onClose?.()
  }

  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <button 
        className="sidebar-close-btn" 
        onClick={onClose} 
        title="Close Navigation"
      >
        <X size={20} />
      </button>

      <div style={{ padding: '0.15rem 0.25rem 1.15rem', borderBottom: '1px solid #E2E8F0', marginBottom: '1.25rem' }}>
        <img 
          src="/hiremind-compact.png" 
          alt="HireMind - Smarter Jobs. Better Careers." 
          style={{ width: '100%', maxWidth: '210px', height: 'auto', display: 'block', objectFit: 'contain' }} 
        />
      </div>
      
      <ul className="nav-menu">
        <li>
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleLinkClick} end>
            <LayoutDashboard />
            <span>Dashboard</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/jobs" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleLinkClick}>
            <Briefcase />
            <span>Jobs Search</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/visited" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleLinkClick}>
            <Clock style={{ color: '#FBBF24' }} />
            <span>Pending Mails</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/applied" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleLinkClick}>
            <CheckCircle2 style={{ color: '#10B981' }} />
            <span>Mails Sent (Applied)</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/applications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleLinkClick}>
            <Briefcase />
            <span>App Tracker</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/qa" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleLinkClick}>
            <MessageSquareText style={{ color: '#818CF8' }} />
            <span>Answer History</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/manual" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleLinkClick}>
            <AlertCircle style={{ color: '#EF4444' }} />
            <span>Manual Intervention</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/resume" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleLinkClick}>
            <FileText />
            <span>My Resume</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleLinkClick}>
            <BarChart3 />
            <span>Analytics</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={handleLinkClick}>
            <Settings />
            <span>Settings</span>
          </NavLink>
        </li>
        <li>
          <NavLink 
            to="/admin/users" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} 
            onClick={handleLinkClick}
            style={{ color: '#818CF8', fontWeight: '600' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              🛡️ <span>User Approvals</span>
            </span>
          </NavLink>
        </li>
      </ul>
      
      <div style={{ marginTop: 'auto' }}>
        <button 
          onClick={handleLogoutClick} 
          className="nav-item btn" 
          style={{ 
            width: '100%', 
            background: 'transparent', 
            border: 'none', 
            textAlign: 'left',
            cursor: 'pointer'
          }}
        >
          <LogOut />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}
