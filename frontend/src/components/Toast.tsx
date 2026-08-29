import React, { useEffect } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

export interface ToastProps {
  id?: string
  type?: 'success' | 'error' | 'info'
  message: string
  onClose: () => void
}

export default function Toast({ type = 'success', message, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  const getToastStyle = () => {
    switch (type) {
      case 'error':
        return {
          icon: <AlertCircle size={18} style={{ color: '#ef4444' }} />,
          border: 'rgba(239, 68, 68, 0.4)',
          bg: 'rgba(28, 16, 20, 0.95)',
          shadow: '0 8px 30px rgba(239, 68, 68, 0.2)'
        }
      case 'info':
        return {
          icon: <Info size={18} style={{ color: '#60a5fa' }} />,
          border: 'rgba(96, 165, 250, 0.4)',
          bg: 'rgba(16, 22, 38, 0.95)',
          shadow: '0 8px 30px rgba(96, 165, 250, 0.2)'
        }
      case 'success':
      default:
        return {
          icon: <CheckCircle size={18} style={{ color: '#10b981' }} />,
          border: 'rgba(16, 185, 129, 0.4)',
          bg: 'rgba(14, 28, 22, 0.95)',
          shadow: '0 8px 30px rgba(16, 185, 129, 0.2)'
        }
    }
  }

  const s = getToastStyle()

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        zIndex: 99999,
        background: s.bg,
        border: `1px solid ${s.border}`,
        boxShadow: s.shadow,
        borderRadius: '12px',
        padding: '0.85rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        maxWidth: '400px',
        backdropFilter: 'blur(12px)',
        animation: 'slideUp 0.3s ease-out'
      }}
    >
      {s.icon}
      <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', flex: 1, lineHeight: '1.4' }}>
        {message}
      </span>
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '0.2rem',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <X size={15} />
      </button>
    </div>
  )
}
