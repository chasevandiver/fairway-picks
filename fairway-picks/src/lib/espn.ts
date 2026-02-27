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

    // ── Get actual course par ──
    // Derive par from the first golfer's first completed round:
    // par = raw strokes - to-par display value
    let coursePar = DEFAULT_PAR
    for (const c of raw) {
      const lines0: any[] = c.linescores || []
      if (lines0.length > 0) {
        const strokes = Math.round(lines0[0].value || 0)
        const dv = lines0[0].displayValue || ''
        let toPar: number | null = null
        if (dv === 'E') toPar = 0
        else { const p = parseInt(dv); if (!isNaN(p)) toPar = p }
        if (toPar !== null && strokes > 60 && strokes < 80) {
          const derived = strokes - toPar
          if (derived >= 68 && derived <= 73) {
            coursePar = derived
            break
          }
        }
      }
    }
    console.log(`🏌️ Course Par: ${coursePar}`)

    // First pass: figure out positions accounting for ties
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

      // ── Total score to par ── ESPN returns this as a string in c.score e.g. "-16"
      let score: number | null = null
      if (c.score !== undefined && c.score !== null) {
        const v = parseFloat(c.score)
        if (!isNaN(v)) score = v
      }

      // ── Round-by-round linescores ──
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]

      lines.forEach((l: any, i: number) => {
        if (i >= 4) return
        const strokes = l.value  // raw strokes as a float e.g. 63.0
        if (strokes !== undefined && strokes !== null) {
          const n = Math.round(strokes)
          if (n >= 55 && n <= 95) {
            rounds[i] = n
          }
        }
      })

      // ── Today (current round to par) ──
      // linescores[i].displayValue is already the correct to-par string for that round
      // e.g. "-7", "-1", "E", "+2" — use the last completed round's displayValue directly.
      // This avoids any par assumption issues since ESPN calculates it hole-by-hole.
      let today: number | null = null
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1]
        const dv = lastLine?.displayValue
        if (dv && dv !== '--') {
          if (dv === 'E') {
            today = 0
          } else {
            const t = parseInt(dv)
            if (!isNaN(t)) today = t
          }
        }
      }

      // ── Thru ──
      // c.statistics is always [] at top-level. Instead derive thru from:
      // - status type description for finished/cut/wd
      // - number of holes completed in the current (last) linescore's nested linescores
      let thru: string
      if (status === 'cut') {
        thru = 'CUT'
      } else if (status === 'wd') {
        thru = 'WD'
      } else {
        const statusDesc = (c.status?.type?.description || '').toLowerCase()
        const statusName = (c.status?.type?.name || '').toLowerCase()
        if (statusDesc.includes('final') || statusName.includes('final') || 
            statusDesc.includes('complete') || lines.length === 4) {
          // All 4 rounds completed = finished
          thru = 'F'
        } else if (lines.length > 0) {
          // Count holes played in the current round via nested linescores
          const currentRoundLinescores = lines[lines.length - 1]?.linescores || []
          const holesPlayed = currentRoundLinescores.length
          if (holesPlayed === 18) {
            thru = 'F'
          } else if (holesPlayed > 0) {
            thru = String(holesPlayed)
          } else {
            thru = '—'
          }
        } else {
          thru = '—'
        }
      }

      // For cut/wd golfers: derive score from sum of round displayValues (to-par per round)
      // This is more reliable than strokes - par since ESPN already calculated it correctly
      if (status === 'cut' || status === 'wd') {
        let toParSum = 0
        let validRounds = 0
        for (const l of lines) {
          const dv = l?.displayValue
          if (dv && dv !== '--') {
            const v = dv === 'E' ? 0 : parseInt(dv)
            if (!isNaN(v)) { toParSum += v; validRounds++ }
          }
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
        par: coursePar,  // Use actual course par
      } as GolferScore
    })

    return competitors.length > 5 ? competitors : MOCK_DATA
  } catch (e) {
    console.error('ESPN fetch error:', e)
    return MOCK_DATA
  }
}

export { MOCK_DATA }
