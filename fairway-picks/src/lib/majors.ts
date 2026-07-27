// ─── Major championship name normalization ────────────────────────────────────
// Tournament names reach us from three places that never agreed on spelling:
// PGA_SCHEDULE ("U.S. Open", "The Open Championship"), the admin's free-form
// setup, and the historical Google Sheets ("US Open", "British Open"). The
// Majors Wall renders four fixed columns, so every one of those spellings has
// to collapse to the same four keys — a naive `name.includes('US Open')` misses
// "U.S. Open" on the periods and silently files it under the wrong major.

export const MAJOR_KEYS = ['Masters', 'PGA Championship', 'US Open', 'The Open'] as const
export type MajorKey = (typeof MAJOR_KEYS)[number]

// Lowercase, drop periods ("U.S." → "us"), collapse runs of whitespace.
function normalize(name: string): string {
  return name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Map a tournament name to its major championship, or null if it isn't one of
 * the four. Returning null rather than defaulting matters: the old code fell
 * back to 'The Open', which quietly parked unmatched majors in that column.
 */
export function majorKey(name?: string | null): MajorKey | null {
  if (!name) return null
  const n = normalize(name)

  // The US Open must be tested before any generic "open" rule — "125th US Open
  // at Oakmont" would otherwise be ambiguous.
  if (n.includes('us open')) return 'US Open'

  // "The Open Championship" (schedule), "British Open" (the sheets), or the
  // bare "The Open". Note "Genesis Scottish Open" matches none of these.
  if (n.includes('british open') || n.includes('open championship') || n === 'the open') return 'The Open'

  if (n.includes('pga championship')) return 'PGA Championship'
  if (n.includes('masters')) return 'Masters'

  return null
}

/** True when a tournament name is one of the four majors. */
export function isMajorName(name?: string | null): boolean {
  return majorKey(name) !== null
}
