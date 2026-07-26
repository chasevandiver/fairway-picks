'use client'

import React, { useState, useEffect } from 'react'

// ─── Animated Money Counter ───────────────────────────────────────────────────
export function AnimatedMoney({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [displayed, setDisplayed] = useState(0)
  const [key, setKey] = useState(0)
  const prevRef = React.useRef(0)

  useEffect(() => {
    if (value === prevRef.current) return
    const start = prevRef.current
    const end = value
    const duration = 700
    const startTime = performance.now()
    prevRef.current = end
    setKey(k => k + 1)

    const step = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(start + (end - start) * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [value])

  const formatted = displayed === 0 ? '$0' : displayed > 0 ? `+$${displayed}` : `-$${Math.abs(displayed)}`
  return (
    <span key={key} className={`count-up ${className || ''}`} style={style}>
      {formatted}
    </span>
  )
}
