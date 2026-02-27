import type { GolferScore } from '@/lib/types'

const DEFAULT_PAR = 72

const MOCK_DATA: GolferScore[] = [
  { name: 'Scottie Scheffler',   position: '1',   score: -14, today: -5, thru: 'F',   status: 'active', rounds: [67, 66, 68, 65], par: DEFAULT_PAR },
  { name: 'Rory McIlroy',        position: 'T2',  score: -12, today: -4, thru: 'F',   status: 'active', rounds: [68, 66, 68, 68], par: DEFAULT_PAR },
  { name: 'Xander Schauffele',   position: 'T2',  score: -12, today: -3, thru: 'F',   status: 'active', rounds: [67, 68, 68, 69], par: DEFAULT_PAR },
  { name: 'Collin Morikawa',     position: '4',   score: -10, today: -4, thru: 'F',   status: 'active', rounds: [68, 68, 68, 68], par: DEFAULT_PAR },
  { name: 'Ludvig Åberg',        position: '5',   score: -9,  today: -2, thru: 'F',   status: 'active', rounds: [69, 68, 68, 70], par: DEFAULT_PAR },
  { name: 'Tommy Fleetwood',     position: '6',   score: -8,  today: -3, thru: 'F',   status: 'active', rounds: [69, 68, 69, 69], par: DEFAULT_PAR },
  { name: 'Cameron Young',       position: '7',   score: -7,  today: -1, thru: 'F',   status: 'active', rounds: [69, 70, 68, 71], par: DEFAULT_PAR },
  { name: 'Jon Rahm',            position: 'CUT', score: 6,   today: 3,  thru: 'CUT', status: 'cut',    rounds: [75, 75, null, null], par: DEFAULT_PAR },
  { name: 'Tony Finau',          position: 'CUT', score: 8,   today: 4,  thru: 'CUT', status: 'cut',    rounds: [76, 76, null, null], par: DEFAULT_PAR },
]

// Parse ESPN to-par display strings: "-7" → -7, "E" → 0, "+2" → 2, null/"--" → null
function parseToPar(dv: string | undefined | null): number | null {
  if (!dv || dv === '--' || dv === '') return null
  if (dv === 'E') return 0
  const n = parseInt(dv)
  return isNaN(n) ? null : n
}

export async function fetchLiveScores(): Promise<GolferScore[]> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error('ESPN fetch failed')
    const data = await res.json()

    const events = data?.events || []
    if (!events.length) return MOCK_DATA
    const competitions = events[0]?.competitions || []
    if (!competitions.length) return MOCK_DATA
    const raw = competitions[0]?.competitors || []
    if (raw.length < 5) return MOCK_DATA

    // ── Derive course par from first golfer's first completed round ──
    // par = raw strokes - to-par displayValue  (e.g. 63 - (-7) = 70)
    // The competition details[] array is unreliable/empty; this always works.
    let coursePar = DEFAULT_PAR
    for (const c of raw) {
      const l0 = (c.linescores || [])[0]
      if (!l0) continue
      const strokes = Math.round(l0.value || 0)
      const toPar = parseToPar(l0.displayValue)
      if (toPar !== null && strokes >= 60 && strokes <= 80) {
        const derived = strokes - toPar
        if (derived >= 68 && derived <= 74) { coursePar = derived; break }
      }
    }
    console.log(`🏌️ Course Par: ${coursePar}`)

    // ── First pass: compute positions accounting for ties ──
    const scoreValues: number[] = raw.map((c: any) => {
      const s = parseFloat(c.score ?? '999')
      return isNaN(s) ? 999 : s
    })

    const getPosition = (idx: number, statusStr: string): string => {
      if (statusStr.includes('cut')) return 'CUT'
      if (statusStr.includes('wd')) return 'WD'
      const myScore = scoreValues[idx]
      const tiedCount = scoreValues.filter((s, i) => {
        const st = (raw[i].status?.type?.name || '').toLowerCase()
        return !st.includes('cut') && !st.includes('wd') && s === myScore
      }).length
      const rank = scoreValues.filter((s, i) => {
        const st = (raw[i].status?.type?.name || '').toLowerCase()
        return !st.includes('cut') && !st.includes('wd') && s < myScore
      }).length + 1
      return tiedCount > 1 ? `T${rank}` : `${rank}`
    }

    const competitors: GolferScore[] = raw.map((c: any, idx: number) => {
      // ── Status ──
      const statusRaw = (c.status?.type?.name || '').toLowerCase()
      const status: 'active' | 'cut' | 'wd' =
        statusRaw.includes('cut') ? 'cut' :
        statusRaw.includes('wd')  ? 'wd'  : 'active'

      // ── Position ──
      const position = getPosition(idx, statusRaw)

      // ── Total score to par ──
      // c.score is a string like "-9", "E", "+2"
      let score: number | null = parseToPar(c.score)

      // ── Round-by-round linescores ──
      // lines[i].value = raw strokes (float), lines[i].displayValue = to-par string
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]
      lines.forEach((l: any, i: number) => {
  if (i >= 4) return
  // R1: l.value is raw strokes (e.g. 69.0) — reliable
  // R2+: l.value becomes cumulative to-par — NOT raw strokes
  // So for R2+, derive strokes from displayValue (to-par string) + coursePar
  if (i === 0) {
    // R1: use value directly as raw strokes
    const n = Math.round(l.value || 0)
    if (n >= 55 && n <= 95) rounds[i] = n
  } else {
    // R2-R4: convert displayValue to-par string back to raw strokes
    const toPar = parseToPar(l.displayValue)
    if (toPar !== null) {
      const strokes = toPar + coursePar
      if (strokes >= 55 && strokes <= 95) rounds[i] = strokes
    }
  }
})

     // ── Today (current/last round to-par) ──
// lines[last].displayValue = cumulative to-par through last round (NOT just today)
// So derive today = current total - sum of previous completed rounds
let today: number | null = null
if (lines.length > 0) {
  if (lines.length === 1) {
    // Only R1 data — today IS the round score
    today = parseToPar(lines[0]?.displayValue)
  } else {
    // R2+: today = total (c.score) minus sum of all completed prior rounds' to-par
    const totalToPar = parseToPar(c.score)  // overall to-par e.g. -9
    let priorRoundsToPar = 0
    // Sum all rounds except the last (which is today)
    for (let i = 0; i < lines.length - 1; i++) {
      const rtp = parseToPar(lines[i]?.displayValue)
      if (rtp !== null) priorRoundsToPar += rtp
    }
    if (totalToPar !== null) {
      today = totalToPar - priorRoundsToPar
    }
  }
}

      // ── Thru ──
      // c.statistics[] is always empty. ESPN's THRU during R1 shows tee times
      // like "10:35 AM*" not a hole number, so we derive thru ourselves:
      //
      //  - cut / wd          → "CUT" / "WD"
      //  - 4 linescores      → tournament complete → "F"
      //  - current round nested linescores present:
      //      18 holes         → round finished → "F"
      //      < 18 holes       → in progress → hole count as string
      //  - 1 linescore, no nested holes (R1 just finished but no hole detail) → "F"
      //  - no linescores yet → haven't teed off → "—"
      let thru: string
      if (status === 'cut') {
        thru = 'CUT'
      } else if (status === 'wd') {
        thru = 'WD'
      } else if (lines.length === 4) {
        thru = 'F'
      } else if (lines.length > 0) {
        const currentRoundHoles: any[] = lines[lines.length - 1]?.linescores || []
        if (currentRoundHoles.length === 0) {
          // No nested hole data — round is complete (ESPN drops hole detail after finishing)
          thru = 'F'
        } else if (currentRoundHoles.length >= 18) {
          thru = 'F'
        } else {
          thru = String(currentRoundHoles.length)
        }
      } else {
        thru = '—'
      }

      // ── Cut/WD score: sum to-par displayValues across played rounds ──
      if (status === 'cut' || status === 'wd') {
        let toParSum = 0; let validRounds = 0
        for (const l of lines) {
          const v = parseToPar(l?.displayValue)
          if (v !== null) { toParSum += v; validRounds++ }
        }
        if (validRounds > 0) score = toParSum
      }

      return {
        name: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
        position,
        score,
        today,
        thru,
        status,
        rounds,
        par: coursePar,
      } as GolferScore
    })

    return competitors.length > 5 ? competitors : MOCK_DATA
  } catch (e) {
    console.error('ESPN fetch error:', e)
    return MOCK_DATA
  }
}

export { MOCK_DATA }
