import type { GolferScore } from '@/lib/types'

const PAR = 72

const MOCK_DATA: GolferScore[] = [
  { name: 'Scottie Scheffler',   position: '1',   score: -14, today: -5, thru: 'F',   status: 'active', rounds: [67, 66, 68, 65], par: PAR },
  { name: 'Rory McIlroy',        position: 'T2',  score: -12, today: -4, thru: 'F',   status: 'active', rounds: [68, 66, 68, 68], par: PAR },
  { name: 'Xander Schauffele',   position: 'T2',  score: -12, today: -3, thru: 'F',   status: 'active', rounds: [67, 68, 68, 69], par: PAR },
  { name: 'Collin Morikawa',     position: '4',   score: -10, today: -4, thru: 'F',   status: 'active', rounds: [68, 68, 68, 68], par: PAR },
  { name: 'Ludvig Åberg',        position: '5',   score: -9,  today: -2, thru: 'F',   status: 'active', rounds: [69, 68, 68, 70], par: PAR },
  { name: 'Tommy Fleetwood',     position: '6',   score: -8,  today: -3, thru: 'F',   status: 'active', rounds: [69, 68, 69, 69], par: PAR },
  { name: 'Cameron Young',       position: '7',   score: -7,  today: -1, thru: 'F',   status: 'active', rounds: [69, 70, 68, 71], par: PAR },
  { name: 'Hideki Matsuyama',    position: 'T7',  score: -7,  today: -2, thru: 'F',   status: 'active', rounds: [70, 68, 69, 70], par: PAR },
  { name: 'Patrick Cantlay',     position: '9',   score: -6,  today: 0,  thru: 'F',   status: 'active', rounds: [70, 68, 70, 72], par: PAR },
  { name: 'Justin Rose',         position: '10',  score: -5,  today: -2, thru: 'F',   status: 'active', rounds: [70, 69, 70, 70], par: PAR },
  { name: 'Jon Rahm',            position: 'CUT', score: 6,   today: 3,  thru: 'CUT', status: 'cut',    rounds: [75, 75, null, null], par: PAR },
  { name: 'Tony Finau',          position: 'CUT', score: 8,   today: 4,  thru: 'CUT', status: 'cut',    rounds: [76, 76, null, null], par: PAR },
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

    // First pass: get score values for position/tie calculation
    const scoreValues: number[] = raw.map((c: any) => {
      const v = parseFloat(c.score ?? '999')
      return isNaN(v) ? 999 : v
    })

    const competitors: GolferScore[] = raw.map((c: any, idx: number) => {
      // ── Status: check multiple fields ESPN might use ──
      const statusName = (c.status?.type?.name || '').toLowerCase()
      const statusDesc = (c.status?.type?.description || '').toLowerCase()
      const statusShort = (c.status?.type?.shortDetail || c.status?.type?.detail || '').toLowerCase()

      const isCutRaw = statusName.includes('cut') || statusDesc.includes('cut') || statusShort.includes('cut')
      const isWDRaw  = statusName.includes('wd')  || statusDesc.includes('withdraw') || statusShort.includes('wd')

      // ── Round linescores: l.value = raw strokes as float ──
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]
      lines.forEach((l: any, i: number) => {
        if (i >= 4) return
        // Try value first (raw strokes), then displayValue
        let strokes: number | null = null
        if (l.value !== undefined && l.value !== null) {
          const n = Math.round(l.value)
          if (n >= 55 && n <= 95) strokes = n
        }
        if (strokes === null && l.displayValue && l.displayValue !== '--') {
          const n = parseInt(l.displayValue)
          if (!isNaN(n) && n >= 55 && n <= 95) strokes = n
          else if (!isNaN(n) && Math.abs(n) <= 20) strokes = PAR + n
        }
        rounds[i] = strokes
      })

      // ── Detect cut/WD from round count too — if only R1+R2 played, likely cut ──
      const roundsPlayed = rounds.filter(r => r !== null).length
      const isCut = isCutRaw || (roundsPlayed === 2 && !isCutRaw && !isWDRaw
        // Only treat as cut if ESPN score string contains "CUT" or position does
        && (String(c.score || '').toUpperCase().includes('CUT')
          || (c.status?.position?.displayName || '').toUpperCase().includes('CUT')))
      const isWD = isWDRaw

      const status: 'active' | 'cut' | 'wd' = isCut ? 'cut' : isWD ? 'wd' : 'active'

      // ── Position: compute from sort order + tie detection ──
      let position: string
      if (isCut) {
        position = 'CUT'
      } else if (isWD) {
        position = 'WD'
      } else {
        const myScore = scoreValues[idx]
        const tiedCount = scoreValues.filter((s, i) => {
          const st = (raw[i].status?.type?.name || '').toLowerCase()
          return !st.includes('cut') && !st.includes('wd') && s === myScore
        }).length
        const rank = scoreValues.filter((s, i) => {
          const st = (raw[i].status?.type?.name || '').toLowerCase()
          return !st.includes('cut') && !st.includes('wd') && s < myScore
        }).length + 1
        position = tiedCount > 1 ? `T${rank}` : `${rank}`
      }

      // ── Total score to par ──
      let score: number | null = null
      if (c.score !== undefined && c.score !== null) {
        const v = parseFloat(c.score)
        if (!isNaN(v)) score = v
      }

      // ── Thru ──
      const stats: any[] = c.statistics || []
      const thruStat = stats.find((s: any) =>
        s.name === 'thru' || s.abbreviation === 'THRU' || s.abbreviation === 'TOT'
      )
      const thruVal = thruStat?.displayValue
      const thru: string =
        status === 'cut' ? 'CUT' :
        status === 'wd'  ? 'WD'  :
        thruVal && thruVal !== '--' ? thruVal : '—'

      // ── Today — last played round minus par ──
      let today: number | null = null
      for (let i = rounds.length - 1; i >= 0; i--) {
        if (rounds[i] !== null) { today = (rounds[i] as number) - PAR; break }
      }

      // ── Cut/WD: keep only real rounds, null out R3+R4 ──
      // scoring.ts will mirror R3=R1, R4=R2 for display and double the score
      if (status === 'cut' || status === 'wd') {
        rounds[2] = null
        rounds[3] = null
        if (rounds[0] !== null && rounds[1] !== null) {
          score = rounds[0] + rounds[1] - PAR * 2
        }
      }

      return {
        name: c.athlete?.displayName || c.athlete?.fullName || 'Unknown',
        position,
        score,
        today,
        thru,
        status,
        rounds,
        par: PAR,
      } as GolferScore
    })

    return competitors.length > 5 ? competitors : MOCK_DATA
  } catch (e) {
    console.error('ESPN fetch error:', e)
    return MOCK_DATA
  }
}

export { MOCK_DATA }
