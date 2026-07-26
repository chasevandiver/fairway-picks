'use client'

import { useState, useCallback } from 'react'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

/**
 * Hook + dialog for destructive-action confirmation. Usage:
 *   const { confirm, dialog } = useConfirm()
 *   ...
 *   confirm({ title, message, onConfirm: doIt })
 *   ...render {dialog} once near the root of the component.
 */
export function useConfirm() {
  const [req, setReq] = useState<ConfirmRequest | null>(null)
  const [busy, setBusy] = useState(false)

  const confirm = useCallback((r: ConfirmRequest) => setReq(r), [])

  const dialog = req ? (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={() => !busy && setReq(null)}
    >
      <div
        className="card"
        role="alertdialog"
        aria-modal="true"
        aria-label={req.title}
        style={{ maxWidth: 400, width: '100%', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{req.title}</div>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
          {req.message}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => setReq(null)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{
              flex: 1,
              ...(req.danger ? { background: 'var(--red)', borderColor: 'var(--red)' } : {}),
            }}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await req.onConfirm()
              } finally {
                setBusy(false)
                setReq(null)
              }
            }}
          >
            {busy ? 'Working…' : req.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, dialog }
}
