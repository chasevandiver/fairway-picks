import type { GolferScore } from '@/lib/types'

const PAR = 72

const MOCK_DATA: GolferScore[] = [
  { name: 'Scottie Scheffler',   position: '1',   score: -14, today: -5, thru: 'F',   status: 'active', rounds: [67, 66, 68, 65], par: PAR },
  { name: 'Rory McIlroy',        position: 'T2',  score: -12, today: -4, thru: 'F',   status: 'active', rounds: [68, 66, 68, 68], par: PAR },
  { name: 'Xander Schauffele',   position: 'T2',  score: -12, today: -3, thru: 'F',   status: 'active', rounds: [67, 68, 68, 69], par: PAR },
  { name: 'Collin Morikawa',     position: '4',   score: -10, today: -4, thru: 'F',   status: 'active', rounds: [68, 68, 68, 68], par: PAR },
  { name: 'Ludvig Åberg',        position: '5',   score: -9,  today: -2, thru: 'F',   status: 'active', rounds: [69, 68, 68, 70], par: PAR },
  { name: 'Tommy Fleetwood',     position: '6',   score: -8,  today: -3, thru: 'F',   status: 'active', rounds: [69, 68, 69, 69], par: PAR },
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

    // First pass: parse rounds for everyone so we can detect cuts and compute positions
    const parsed = raw.map((c: any) => {
      const lines: any[] = c.linescores || []
      const rounds: (number | null)[] = [null, null, null, null]
      lines.forEach((l: any, i: number) => {
        if (i >= 4) return
        // l.value is raw strokes e.g. 66.0, l.displayValue is to-par e.g. "-5"
        if (l.value !== undefined && l.value !== null) {
          const n = Math.round(l.value)
          if (n >= 55 && n <= 95) rounds[i] = n
        }
      })
      // KEY INSIGHT from debug: cut golfers have exactly 2 linescores
      // Active golfers in R3/R4 have 3-4, finished have 4
      // A golfer is cut if they have exactly 2 rounds AND the tournament is past R2
      const roundsPlayed = rounds.filter(r => r !== null).length
      const totalCompetitors = raw.length
      // If more than ~40% of field has 4 rounds, tournament is post-cut
      const with4Rounds = raw.filter((x: any) => (x.linescores || []).length >= 3).length
      const postCut = with4Rounds > totalCompetitors * 0.3
      const isCut = postCut && roundsPlayed === 2
      return { c, rounds, roundsPlayed, isCut }
    })

    // Second pass: compute positions from score among non-cut players
    const scoreValues = raw.map((c: any) => {
      const v = parseFloat(c.score ?? '999')
      return isNaN(v) ? 999 : v
    })

    const competitors: GolferScore[] = parsed.map(({ c, rounds, isCut }: any, idx: number) => {
      const status: 'active' | 'cut' | 'wd' = isCut ? 'cut' : 'active'

      // Position
      let position: string
      if (isCut) {
        position = 'CUT'
      } else {
        const myScore = scoreValues[idx]
        const tiedCount = parsed.filter((_: any, i: number) => !parsed[i].isCut && scoreValues[i] === myScore).length
        const rank = parsed.filter((_: any, i: number) => !parsed[i].isCut && scoreValues[i] < myScore).length + 1
        position = tiedCount > 1 ? `T${rank}` : `${rank}`
      }

      // Total score to par from c.score string e.g. "-18"
      let score: number | null = null
      if (c.score !== undefined && c.score !== null) {
        const v = parseFloat(c.score)
        if (!isNaN(v)) score = v
      }

      // Thru: for finished players all 4 rounds present = "F", otherwise in-progress
      const roundsPlayed = rounds.filter((r: number | null) => r !== null).length
      let thru = '—'
      if (isCut) thru = 'CUT'
      else if (roundsPlayed === 4) thru = 'F'

      // Today = last played round minus par
      let today: number | null = null
      for (let i = rounds.length - 1; i >= 0; i--) {
        if (rounds[i] !== null) { today = (rounds[i] as number) - PAR; break }
      }

      // For cut golfers: null out R3/R4, recalculate score from actual rounds
      if (isCut) {
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
