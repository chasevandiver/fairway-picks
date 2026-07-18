import { NextResponse } from 'next/server'

// Node.js runtime (not 'edge') — ISR/revalidate is not supported on the Edge
// Runtime for route handlers, so `revalidate` would be silently ignored.
export const revalidate = 60

export async function GET() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { cache: 'no-store' }
    )
    const data = await res.json()
    const competition = data?.events?.[0]?.competitions?.[0] || {}
    const raw = competition?.competitors || []

    // Compact per-round summary instead of full hole-by-hole linescores so a
    // wide sample of competitors fits in one readable response.
    const toSample = (c: any) => ({
      name: c.athlete?.displayName,
      score: c.score,
      order: c.order,
      active: c.active,
      status: c.status,
      periods: (c.linescores || []).map((l: any) => ({
        period: l.period,
        value: l.value,
        displayValue: l.displayValue,
        holes: (l.linescores || []).length,
        teeTime: l.teeTime,
      })),
    })

    // First 3 competitors (likely active/leading)
    const active = raw.slice(0, 3).map(toSample)

    // First 3 competitors whose score or status indicates CUT
    const cutPlayers = raw.filter((c: any) => {
      const scoreStr = (c.score ?? '').toString().trim().toUpperCase()
      if (scoreStr === 'CUT') return true
      const typeName = (c.status?.type?.name || '').toLowerCase()
      if (typeName.includes('cut')) return true
      const detail = (c.status?.type?.shortDetail || c.status?.type?.detail || '').toUpperCase()
      if (detail === 'CUT') return true
      const dv = (c.status?.displayValue || '').toUpperCase()
      if (dv === 'CUT') return true
      return false
    }).slice(0, 3).map(toSample)

    // Golfers with completed R1+R2 but no R3 strokes yet — the population that
    // cut detection has to classify (cut vs. hasn't-teed-off-yet).
    const noR3 = raw.filter((c: any) => {
      const lines: any[] = c.linescores || []
      const done = (p: number) => lines.some((l: any) => l.period === p && (l.linescores || []).length === 18)
      const r3Holes = lines.some((l: any) => l.period === 3 && (l.linescores || []).length > 0)
      return done(1) && done(2) && !r3Holes
    }).slice(0, 6).map(toSample)

    // Tail of the field — after the cut this is where missed-cut golfers live.
    const tail = raw.slice(-6).map(toSample)

    return NextResponse.json({
      eventName: data?.events?.[0]?.name,
      competitionStatus: competition?.status,
      competitorCount: raw.length,
      active,
      cutPlayers,
      noR3,
      tail,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message })
  }
}
