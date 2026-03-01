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

      const position = getPosition(idx, statusRaw)

      // ── Total score to par ──
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
        const strokes = l.value
        if (strokes !== undefined && strokes !== null) {
          const n = Math.round(strokes)
          if (n >= 55 && n <= 95) {
            rounds[i] = n
          }
        }
      })

      // ── Thru — check multiple ESPN fields ──
      const stats: any[] = c.statistics || []
      const thruStat = stats.find((s: any) =>
        s.name === 'thru' || s.abbreviation === 'THRU' || s.name === 'holesCompleted'
      )
      const thruVal = thruStat?.displayValue ?? thruStat?.value?.toString()

      // ESPN also sometimes exposes thru on the status object directly
      const statusThru = c.status?.thru
      const statusPeriod = c.status?.period

      // Check if golfer has finished today's round
      const isFinished = statusRaw.includes('complete') || statusRaw.includes('final') ||
                         (thruVal && (thruVal === 'F' || thruVal === '18'))

      const thru: string =
        status === 'cut' ? 'CUT' :
        status === 'wd'  ? 'WD'  :
        isFinished ? 'F' :
        (thruVal && thruVal !== '--' && thruVal !== '-' && thruVal !== '') ? thruVal :
        (statusThru !== undefined && statusThru !== null && statusThru !== '') ? String(statusThru) :
        (statusPeriod !== undefined && statusPeriod !== null) ? String(statusPeriod) :
        '—'

      // ── Today (current round to par) ──
      // First try ESPN's direct scoreToPar / today stat
      const todayStat = stats.find((s: any) =>
        s.name === 'scoreToPar' || s.abbreviation === 'TODAY' || s.name === 'today'
      )
      let today: number | null = null

      if (todayStat?.value !== undefined && todayStat.value !== null) {
        const v = parseFloat(todayStat.value)
        if (!isNaN(v) && Math.abs(v) <= 20) today = v
      }

      // Fallback: derive from last played round minus par
      if (today === null) {
        let lastRoundIdx = -1
        for (let i = rounds.length - 1; i >= 0; i--) {
          if (rounds[i] !== null) { lastRoundIdx = i; break }
        }
        if (lastRoundIdx >= 0) {
          today = (rounds[lastRoundIdx] as number) - PAR
        }
      }

      // For cut/wd golfers: score = actual 2-round to-par total
      if ((status === 'cut' || status === 'wd') && rounds[0] !== null && rounds[1] !== null) {
        score = rounds[0] + rounds[1] - PAR * 2
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
