'use client'

// ─── Skeleton Screen ─────────────────────────────────────────────────────────
export function SkeletonScreen() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <div className="skeleton skeleton-title" style={{ width: 280 }} />
          <div className="skeleton skeleton-text" style={{ width: 180 }} />
        </div>
      </div>
      <div className="stats-row mb-24">
        {[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-stat" />)}
      </div>
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" style={{ height: 320 }} />
    </div>
  )
}
