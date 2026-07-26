// ─── SectionDesc ──────────────────────────────────────────────────────────────
// One-line plain-English explainer rendered under a stat section's title so
// everyone knows what they're looking at. Pass padding/margins via `style` to
// fit the section it sits in (card header vs card body vs bare heading).
export function SectionDesc({ children, style }: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, ...style }}>
      {children}
    </div>
  )
}
