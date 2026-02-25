import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const revalidate = 3600 // cache for 1 hour — odds don't change that fast

export interface OddsEntry {
  name: string
  odds: string    // American odds string e.g. "+1200", "+500"
  impliedProb: number  // 0-100 implied probability
}

/**
 * Fetches outright (to-win) odds for the current PGA Tour event.
 * Uses The Odds API (free tier: 500 req/month) if ODDS_API_KEY is set.
 * Falls back to ESPN field rankings if no key or if fetch fails.
 */
export async function GET() {
  const apiKey = process.env.ODDS_API_KEY

  if (apiKey) {
    try {
      // The Odds API — golf_pga_tour outright market
      const url = `https://api.the-odds-api.com/v4/sports/golf_pga_tour/odds?apiKey=${apiKey}&regions=us&markets=outrights&oddsFormat=american`
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        // data is an array of events, take the first (current/next)
        if (data?.length > 0) {
          const event = data[0]
          // Aggregate odds across bookmakers — take the best (most favorable) for each player
          const playerOdds: Record<string, number> = {}
          for (const bm of event.bookmakers || []) {
            for (const market of bm.markets || []) {
              if (market.key === 'outrights') {
                for (const outcome of market.outcomes || []) {
                  const name = outcome.name
                  const price = outcome.price // American odds
                  if (!playerOdds[name] || price > playerOdds[name]) {
                    playerOdds[name] = price
                  }
                }
              }
            }
          }

          // Convert to sorted array
          const entries: OddsEntry[] = Object.entries(playerOdds)
            .map(([name, odds]) => ({
              name,
              odds: odds > 0 ? `+${odds}` : `${odds}`,
              impliedProb: americanToImplied(odds),
            }))
            .sort((a, b) => b.impliedProb - a.impliedProb) // favorites first

          if (entries.length > 0) {
            return NextResponse.json({ source: 'odds-api', entries })
          }
        }
      }
    } catch (e) {
      console.error('Odds API error:', e)
    }
  }

  // Fallback: return empty — the client will use ESPN position as proxy
  return NextResponse.json({ source: 'espn-fallback', entries: [] })
}

function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100) * 100
  return Math.abs(odds) / (Math.abs(odds) + 100) * 100
}
