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

// Parse ESPN to-par display strings: "-7" → -7, "E" → 0, "+2" → 2, null/"--"/"-" → null
function parseToPar(dv: string | undefined | null): number | null {
  if (!dv || dv === '--' || dv === '' || dv === '-') return null
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
      let score: number | null = parseToPar(c.score)

      // ── Round-by-round linescores ──
      // l.value = raw strokes for that round (e.g. 62, 64)
      // l.displayValue = that round's to-par string (e.g. "-9", "-3", "E", "-")
      // l.linescores = nested hole-by-hole array (only present when round has started)
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]
      lines.forEach((l: any, i: number) => {
        if (i >= 4) return
        const n = Math.round(l.value || 0)
        if (n >= 55 && n <= 95) rounds[i] = n
      })

      // ── Today (current round to-par) ──
      // Walk backwards through linescores to find the last round that has
      // actually started (has nested hole linescores with length > 0).
      // This correctly handles:
      //   - Golfers who haven't teed off in R2 yet (dv="-", holes=0) → show R1 score
      //   - Golfers mid-R2 (holes > 0) → show live R2 to-par
      //   - Golfers who finished R2 (holes=18) → show R2 final to-par
      let today: number | null = null
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i]
        const hasHoles = (l.linescores?.length ?? 0) > 0
        const toPar = parseToPar(l?.displayValue)
        if (hasHoles && toPar !== null) {
          today = toPar
          break
        }
      }

      // ── Thru ──
      let thru: string
      if (status === 'cut') {
        thru = 'CUT'
      } else if (status === 'wd') {
        thru = 'WD'
      } else if (lines.length === 4 && (lines[3].linescores?.length ?? 0) >= 18) {
        thru = 'F'
      } else {
        // Find the current active round (last one with holes data)
        let thruSet = false
        for (let i = lines.length - 1; i >= 0; i--) {
          const currentRoundHoles: any[] = lines[i]?.linescores || []
          if (currentRoundHoles.length > 0) {
            thru = currentRoundHoles.length >= 18 ? 'F' : String(currentRoundHoles.length)
            thruSet = true
            break
          }
        }
        if (!thruSet) thru = '—'
      }

      // ── Cut/WD score: sum to-par across played rounds ──
      if (status === 'cut' || status === 'wd') {
        let toParSum = 0
        let validRounds = 0
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
