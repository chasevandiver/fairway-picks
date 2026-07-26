'use client'

export interface ToastState {
  message: string
  type: 'error' | 'success'
}

/**
 * Minimal toast — App owns the state (a `notify` helper with an auto-dismiss
 * timeout) and renders this at the shell level. Mutations that used to fail
 * silently now surface here.
 */
export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  if (!toast) return null
  return (
    <div className={`toast toast-${toast.type}`} role="status" onClick={onDismiss}>
      <span>{toast.type === 'error' ? '⚠️' : '✓'}</span>
      <span>{toast.message}</span>
    </div>
  )
}
