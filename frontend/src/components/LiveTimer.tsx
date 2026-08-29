import React, { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'

interface LiveTimerProps {
  date: string | Date
  prefix?: string
  showExact?: boolean
  style?: React.CSSProperties
}

export default function LiveTimer({ date, prefix = 'Added', showExact = true, style }: LiveTimerProps) {
  const [elapsed, setElapsed] = useState('')
  const [exactTimeStr, setExactTimeStr] = useState('')

  useEffect(() => {
    if (!date) return

    const rawDateStr = typeof date === 'string' && !date.endsWith('Z') && !date.includes('+') ? `${date}Z` : date
    const dateObj = new Date(rawDateStr)
    
    // Format full date with hours, minutes, seconds: e.g. "Aug 25, 09:38:22 PM" or "21:38:22"
    try {
      const timeFormatted = dateObj.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: true 
      })
      const dateFormatted = dateObj.toLocaleDateString([], {
        month: 'short',
        day: 'numeric'
      })
      setExactTimeStr(`${dateFormatted}, ${timeFormatted}`)
    } catch {
      setExactTimeStr(dateObj.toLocaleString())
    }

    const calculateTime = () => {
      const now = new Date().getTime()
      const past = dateObj.getTime()
      let diff = Math.max(0, Math.floor((now - past) / 1000))

      const days = Math.floor(diff / 86400)
      diff %= 86400
      const hours = Math.floor(diff / 3600)
      diff %= 3600
      const minutes = Math.floor(diff / 60)
      const seconds = diff % 60

      if (days > 0) {
        setElapsed(`${days}d ${hours}h ${minutes}m ${seconds}s ago`)
      } else if (hours > 0) {
        setElapsed(`${hours}h ${minutes}m ${seconds}s ago`)
      } else if (minutes > 0) {
        setElapsed(`${minutes}m ${seconds}s ago`)
      } else {
        setElapsed(`${seconds}s ago`)
      }
    }

    calculateTime()
    const timer = setInterval(calculateTime, 1000)
    return () => clearInterval(timer)
  }, [date])

  if (!date) return null

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '0.78rem',
        color: '#60a5fa',
        background: 'rgba(96, 165, 250, 0.1)',
        padding: '0.2rem 0.6rem',
        borderRadius: '12px',
        border: '1px solid rgba(96, 165, 250, 0.25)',
        fontWeight: '500',
        letterSpacing: '0.01em',
        ...style
      }}
      title={`Full Timestamp: ${new Date(date).toLocaleString()}`}
    >
      <Clock size={12} style={{ color: '#93c5fd' }} />
      <span>
        {prefix ? `${prefix}: ` : ''}
        {showExact && exactTimeStr ? <strong style={{ color: '#ffffff', marginRight: '0.35rem' }}>{exactTimeStr}</strong> : null}
        <span style={{ color: '#93c5fd' }}>({elapsed || '0s ago'})</span>
      </span>
    </span>
  )
}

