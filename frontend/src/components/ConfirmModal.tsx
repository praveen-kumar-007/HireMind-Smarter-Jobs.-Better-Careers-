import React, { useEffect } from 'react'
import { AlertTriangle, Info, Trash2, X, CheckCircle2 } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary' | 'warning' | 'success'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <Trash2 size={24} style={{ color: '#ef4444' }} />,
          iconBg: 'rgba(239, 68, 68, 0.15)',
          iconBorder: 'rgba(239, 68, 68, 0.3)',
          confirmBg: 'linear-gradient(135deg, #ef4444, #dc2626)',
          confirmHoverBg: '#dc2626',
          confirmBorder: 'rgba(239, 68, 68, 0.5)'
        }
      case 'warning':
        return {
          icon: <AlertTriangle size={24} style={{ color: '#f59e0b' }} />,
          iconBg: 'rgba(245, 158, 11, 0.15)',
          iconBorder: 'rgba(245, 158, 11, 0.3)',
          confirmBg: 'linear-gradient(135deg, #f59e0b, #d97706)',
          confirmHoverBg: '#d97706',
          confirmBorder: 'rgba(245, 158, 11, 0.5)'
        }
      case 'success':
        return {
          icon: <CheckCircle2 size={24} style={{ color: '#10b981' }} />,
          iconBg: 'rgba(16, 185, 129, 0.15)',
          iconBorder: 'rgba(16, 185, 129, 0.3)',
          confirmBg: 'linear-gradient(135deg, #10b981, #059669)',
          confirmHoverBg: '#059669',
          confirmBorder: 'rgba(16, 185, 129, 0.5)'
        }
      case 'primary':
      default:
        return {
          icon: <Info size={24} style={{ color: '#6366f1' }} />,
          iconBg: 'rgba(99, 102, 241, 0.15)',
          iconBorder: 'rgba(99, 102, 241, 0.3)',
          confirmBg: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          confirmHoverBg: '#4f46e5',
          confirmBorder: 'rgba(99, 102, 241, 0.5)'
        }
    }
  }

  const styles = getVariantStyles()

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'linear-gradient(145deg, rgba(26, 28, 42, 0.95), rgba(16, 17, 28, 0.98))',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(99, 102, 241, 0.15)',
          borderRadius: '16px',
          padding: '1.75rem',
          position: 'relative',
          transform: 'scale(1)',
          animation: 'modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onCancel}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <X size={18} />
        </button>

        {/* Icon & Title Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: styles.iconBg,
              border: `1px solid ${styles.iconBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            {styles.icon}
          </div>

          <div style={{ paddingRight: '1rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>
              {title}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
              {message}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.75rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            style={{
              padding: '0.55rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              borderRadius: '8px'
            }}
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            style={{
              background: styles.confirmBg,
              border: `1px solid ${styles.confirmBorder}`,
              color: '#ffffff',
              padding: '0.55rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
              transition: 'opacity 0.2s, transform 0.1s'
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
