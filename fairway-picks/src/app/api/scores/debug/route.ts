import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { cache: 'no-store' }
    )
    const data = await res.json()
    const raw = data?.events?.[0]?.competitions?.[0]?.competitors || []

    // Return first 3 active + first 3 cut-ish players with ALL their raw fields
    const sample = raw.slice(0, 6).map((c: any) => ({
      name: c.athlete?.displayName,
      score: c.score,
      status_type_name: c.status?.type?.name,
      status_type_description: c.status?.type?.description,
      status_type_detail: c.status?.type?.detail,
      status_type_shortDetail: c.status?.type?.shortDetail,
      status_position_id: c.status?.position?.id,
      status_position_displayName: c.status?.position?.displayName,
      linescores: c.linescores?.map((l: any) => ({ value: l.value, displayValue: l.displayValue })),
      statistics: c.statistics?.map((s: any) => ({ name: s.name, abbreviation: s.abbreviation, displayValue: s.displayValue })),
    }))

    // Also grab last 3 (likely cut players)
    const last3 = raw.slice(-3).map((c: any) => ({
      name: c.athlete?.displayName,
      score: c.score,
      status_type_name: c.status?.type?.name,
      status_position_displayName: c.status?.position?.displayName,
      linescores: c.linescores?.map((l: any) => ({ value: l.value, displayValue: l.displayValue })),
      statistics: c.statistics?.map((s: any) => ({ name: s.name, abbreviation: s.abbreviation, displayValue: s.displayValue })),
    }))

    return NextResponse.json({ total: raw.length, first6: sample, last3 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message })
  }
}
