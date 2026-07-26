import { describe, it, expect } from 'vitest'
import { parseEspnScoreboard } from '../espn'

// Characterization tests for the ESPN scoreboard parser using synthetic
// payloads shaped like the real feed. The builders below mirror the fields
// espn.ts actually reads: competitors[].score, .linescores[{period, value,
// displayValue, linescores(holes)}], .status.type, .active, .athlete.

/** A completed 18-hole round linescore. */
function completedRound(period: number, strokes: number, par = 72) {
  return {
    period,
    value: strokes,
    displayValue: strokes - par === 0 ? 'E' : strokes - par > 0 ? `+${strokes - par}` : `${strokes - par}`,
    linescores: Array.from({ length: 18 }, (_, i) => ({ period, value: 4, hole: i + 1 })),
  }
}

/** An in-progress round linescore: `holes` played so far, `toPar` for the round. */
function inProgressRound(period: number, holes: number, toPar: number) {
  return {
    period,
    value: 0,
    displayValue: toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`,
    linescores: Array.from({ length: holes }, (_, i) => ({ period, value: 4, hole: i + 1 })),
  }
}

/** A zero-hole placeholder entry (tee time not yet started). */
function placeholderRound(period: number) {
  return { period, value: 0, displayValue: '', linescores: [] }
}

function competitor(
  name: string,
  toPar: number | 'CUT' | 'WD',
  linescores: any[],
  extra: Record<string, any> = {}
) {
  const score = toPar === 'CUT' || toPar === 'WD' ? toPar : toPar === 0 ? 'E' : `${toPar}`
  return {
    athlete: { displayName: name },
    score,
    linescores,
    active: true,
    ...extra,
  }
}

function scoreboard(competitors: any[], period = 4) {
  return {
    events: [
      {
        competitions: [
          {
            status: { period },
            competitors,
          },
        ],
      },
    ],
  }
}

// Field of finished golfers on a par-72 course. To-par is computed from the
// strokes so the payload is internally consistent — the parser derives course
// par from (total strokes − to-par) / rounds and rejects inconsistent data.
function finished(name: string, strokes: [number, number, number, number]): any {
  const toPar = strokes.reduce((a, b) => a + b, 0) - 72 * 4
  return competitor(name, toPar, strokes.map((s, i) => completedRound(i + 1, s)))
}

function finishedField(): any[] {
  return [
    finished('Scottie Scheffler', [67, 66, 68, 65]), // -22
    finished('Rory McIlroy', [68, 66, 68, 66]),      // -20
    finished('Xander Schauffele', [67, 68, 68, 67]), // -18
    finished('Collin Morikawa', [68, 68, 68, 68]),   // -16
    finished('Ludvig Aberg', [69, 68, 68, 71]),      // -12
    finished('Tommy Fleetwood', [72, 72, 72, 72]),   // E
  ]
}

describe('parseEspnScoreboard — unusable payloads', () => {
  it('returns null for empty/missing events', () => {
    expect(parseEspnScoreboard({})).toBeNull()
    expect(parseEspnScoreboard({ events: [] })).toBeNull()
    expect(parseEspnScoreboard({ events: [{ competitions: [] }] })).toBeNull()
  })

  it('returns null for tiny fields (<5 competitors)', () => {
    expect(parseEspnScoreboard(scoreboard(finishedField().slice(0, 3)))).toBeNull()
  })
})

describe('parseEspnScoreboard — finished tournament', () => {
  const result = parseEspnScoreboard(scoreboard(finishedField()))!

  it('parses names, scores, rounds and computes positions', () => {
    const scottie = result.find((g) => g.name === 'Scottie Scheffler')!
    expect(scottie.score).toBe(-22)
    expect(scottie.rounds).toEqual([67, 66, 68, 65])
    expect(scottie.position).toBe('1')
    expect(scottie.thru).toBe('F')
    expect(scottie.status).toBe('active')
  })

  it('derives course par from strokes vs to-par', () => {
    expect(result[0].par).toBe(72)
  })

  it('handles E (even) scores', () => {
    const tommy = result.find((g) => g.name === 'Tommy Fleetwood')!
    expect(tommy.score).toBe(0)
  })

  it('assigns T-prefixed positions on ties', () => {
    const field = finishedField()
    // make two golfers tie at -20 (position is computed from the score field)
    field[2].score = '-20'
    const r = parseEspnScoreboard(scoreboard(field))!
    expect(r.find((g) => g.name === 'Rory McIlroy')!.position).toBe('T2')
    expect(r.find((g) => g.name === 'Xander Schauffele')!.position).toBe('T2')
  })
})

describe('parseEspnScoreboard — cut and WD detection', () => {
  it('detects cut from score field and recomputes score from R1+R2 vs par', () => {
    const field = [
      ...finishedField(),
      competitor('Jon Rahm', 'CUT', [completedRound(1, 75), completedRound(2, 76)]),
    ]
    const rahm = parseEspnScoreboard(scoreboard(field))!.find((g) => g.name === 'Jon Rahm')!
    expect(rahm.status).toBe('cut')
    expect(rahm.position).toBe('CUT')
    expect(rahm.thru).toBe('CUT')
    // 75 + 76 - 144 = +7 recomputed against derived par
    expect(rahm.score).toBe(7)
  })

  it('detects cut from status.type metadata', () => {
    const field = [
      ...finishedField(),
      competitor('Tony Finau', 5, [completedRound(1, 74), completedRound(2, 75)], {
        status: { type: { name: 'STATUS_CUT' } },
      }),
    ]
    const finau = parseEspnScoreboard(scoreboard(field))!.find((g) => g.name === 'Tony Finau')!
    expect(finau.status).toBe('cut')
  })

  it('detects WD and keeps ESPN score', () => {
    const field = [
      ...finishedField(),
      competitor('Will Zalatoris', 'WD', [completedRound(1, 74)]),
    ]
    const wz = parseEspnScoreboard(scoreboard(field))!.find((g) => g.name === 'Will Zalatoris')!
    expect(wz.status).toBe('wd')
    // score falls back to rounds-based: 74 - 72 = +2
    expect(wz.score).toBe(2)
  })

  it('R4-reached fallback: R1+R2-only golfer with no metadata is cut', () => {
    const field = [
      ...finishedField(),
      // No CUT marker anywhere — feed stripped metadata; only two completed rounds.
      competitor('Stealth Cut', 6, [completedRound(1, 75), completedRound(2, 75), placeholderRound(3), placeholderRound(4)]),
    ]
    const g = parseEspnScoreboard(scoreboard(field, 4))!.find((x) => x.name === 'Stealth Cut')!
    expect(g.status).toBe('cut')
  })
})

describe('parseEspnScoreboard — in-progress rounds', () => {
  it('reports today and thru for a golfer mid-round', () => {
    const field = [
      competitor('Mid Round', -5, [completedRound(1, 68), completedRound(2, 69), inProgressRound(3, 7, -2)]),
      ...finishedField().slice(0, 5).map((c) => ({
        ...c,
        // keep others plausible: R1-R2 done, waiting on R3 tee times
        linescores: [c.linescores[0], c.linescores[1], placeholderRound(3)],
      })),
    ]
    const g = parseEspnScoreboard(scoreboard(field, 3))!.find((x) => x.name === 'Mid Round')!
    expect(g.thru).toBe('7')
    expect(g.today).toBe(-2)
    expect(g.status).toBe('active')
  })

  it('nulls today/thru for golfers who have not started the current round', () => {
    const field = [
      competitor('Mid Round', -5, [completedRound(1, 68), completedRound(2, 69), inProgressRound(3, 7, -2)]),
      competitor('Waiting Guy', -4, [completedRound(1, 69), completedRound(2, 69), placeholderRound(3)]),
      ...finishedField().slice(0, 4).map((c) => ({
        ...c,
        linescores: [c.linescores[0], c.linescores[1], placeholderRound(3)],
      })),
    ]
    const g = parseEspnScoreboard(scoreboard(field, 3))!.find((x) => x.name === 'Waiting Guy')!
    expect(g.today).toBeNull()
    expect(g.thru).toBe('—')
    expect(g.status).toBe('active')
  })
})
