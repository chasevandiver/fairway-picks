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

    // Return the first 3 active golfers' raw data so we can inspect the structure
    const sample = raw.slice(0, 3).map((c: any) => ({
      name: c.athlete?.displayName,
      score: c.score,
      status: c.status,
      linescores: c.linescores,
      statistics: c.statistics,
    }))

    return NextResponse.json(sample)
  } catch (e: any) {
    return NextResponse.json({ error: e.message })
  }
}
