import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const revalidate = 0

export async function GET() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { cache: 'no-store' }
    )
    const data = await res.json()
    const raw = data?.events?.[0]?.competitions?.[0]?.competitors || []

    const toSample = (c: any) => ({
      name: c.athlete?.displayName,
      score: c.score,
      status: c.status,
      linescores: c.linescores,
      statistics: c.statistics,
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

    // Also grab a raw sample of competitors 50-55 (near cut line) regardless of detection
    const nearCut = raw.slice(50, 55).map(toSample)

    return NextResponse.json({ active, cutPlayers, nearCut })
  } catch (e: any) {
    return NextResponse.json({ error: e.message })
  }
}
