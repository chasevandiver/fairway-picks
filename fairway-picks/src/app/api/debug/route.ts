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
    const competition = data?.events?.[0]?.competitions?.[0] || {}
    const raw: any[] = competition?.competitors || []

    // Full snapshot of every field that might distinguish cut from active-waiting
    const toSample = (c: any) => {
      const lines: any[] = c.linescores || []
      return {
        name: c.athlete?.displayName,
        score: c.score,
        active: c.active,           // top-level active boolean
        order: c.order,             // sort order in the field
        status_displayValue: c.status?.displayValue,
        status_type_id: c.status?.type?.id,
        status_type_name: c.status?.type?.name,
        status_type_state: c.status?.type?.state,
        status_type_completed: c.status?.type?.completed,
        status_type_shortDetail: c.status?.type?.shortDetail,
        status_type_detail: c.status?.type?.detail,
        status_type_description: c.status?.type?.description,
        status_type_abbreviation: c.status?.type?.abbreviation,
        linescores_count: lines.length,
        linescores_periods: lines.map((l: any) => ({
          period: l.period,
          value: l.value,
          displayValue: l.displayValue,
          holes: (l.linescores || []).length,
        })),
      }
    }

    // Competition-level fields
    const competitionMeta = {
      status_period: competition.status?.period,
      status_type_name: competition.status?.type?.name,
      status_type_state: competition.status?.type?.state,
      status_type_detail: competition.status?.type?.detail,
      status_displayValue: competition.status?.displayValue,
      total_competitors: raw.length,
    }

    // Players currently detected as CUT by explicit ESPN flags
    const espnFlaggedCut = raw.filter((c: any) => {
      const scoreStr = (c.score ?? '').toString().trim().toUpperCase()
      if (scoreStr === 'CUT' || scoreStr === 'WD') return true
      const typeName = (c.status?.type?.name || '').toLowerCase()
      if (typeName.includes('cut') || typeName.includes('wd') || typeName.includes('withdraw')) return true
      const abbrev = (c.status?.type?.abbreviation || '').toUpperCase()
      if (abbrev === 'CUT' || abbrev === 'MC' || abbrev === 'WD') return true
      const detail = (c.status?.type?.shortDetail || c.status?.type?.detail || '').toUpperCase()
      if (detail === 'CUT' || detail === 'MC') return true
      const dv = (c.status?.displayValue || '').toUpperCase()
      if (dv === 'CUT' || dv === 'MC') return true
      const lines: any[] = c.linescores || []
      for (const l of lines) {
        const ld = (l.displayValue || '').trim().toUpperCase()
        if (ld === 'CUT' || ld === 'MC') return true
      }
      return false
    }).slice(0, 5).map(toSample)

    // Players with c.active === false (new check)
    const inactivePlayers = raw.filter((c: any) => c.active === false).slice(0, 5).map(toSample)

    // Players who completed R1+R2 but have NO period-3 linescore entry
    // (these are the ones the !hasR3Entry fallback would catch)
    const noR3Entry = raw.filter((c: any) => {
      const lines: any[] = c.linescores || []
      const r1Done = lines.some((l: any) => l.period === 1 && (l.linescores || []).length === 18)
      const r2Done = lines.some((l: any) => l.period === 2 && (l.linescores || []).length === 18)
      const hasR3 = lines.some((l: any) => l.period >= 3)
      return r1Done && r2Done && !hasR3
    }).slice(0, 5).map(toSample)

    // Players who completed R1+R2, have a period-3 entry, but 0 holes in R3
    // (these are the ones the !hasR3Entry fallback MISSES)
    const r3PlaceholderOnly = raw.filter((c: any) => {
      const lines: any[] = c.linescores || []
      const r1Done = lines.some((l: any) => l.period === 1 && (l.linescores || []).length === 18)
      const r2Done = lines.some((l: any) => l.period === 2 && (l.linescores || []).length === 18)
      const r3Entry = lines.find((l: any) => l.period === 3)
      const r3Holes = r3Entry ? (r3Entry.linescores || []).length : -1
      return r1Done && r2Done && r3Entry && r3Holes === 0
    }).slice(0, 5).map(toSample)

    // First 3 active leaders (top of field)
    const leaders = raw.slice(0, 3).map(toSample)

    return NextResponse.json({
      competitionMeta,
      leaders,
      espnFlaggedCut,
      inactivePlayers,
      noR3Entry,
      r3PlaceholderOnly,
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e) })
  }
}
