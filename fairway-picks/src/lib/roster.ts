import { FOUNDING_LEAGUE_ID, LEGACY_PLAYER_NAMES } from './founding'

export interface LeagueMember {
  user_id: string
  joined_at?: string
  display_name: string
  /** Claimed legacy player name (founding league), if any. */
  player_name: string | null
}

/**
 * The names that picks/results/money are recorded under for a league.
 *
 * Priority:
 *  1. The active tournament's draft_order — the authoritative participant
 *     list for the week in play.
 *  2. Founding league: the legacy roster names (results are keyed by them).
 *  3. Custom league: each member's claimed name or display name.
 */
export function getLeagueRoster(opts: {
  leagueId: string
  members: LeagueMember[]
  draftOrder?: string[] | null
}): string[] {
  const { leagueId, members, draftOrder } = opts
  if (draftOrder && draftOrder.length > 0) return draftOrder
  if (leagueId === FOUNDING_LEAGUE_ID) return [...LEGACY_PLAYER_NAMES]
  const names = members.map((m) => m.player_name || m.display_name).filter(Boolean)
  // De-dupe while preserving join order.
  return Array.from(new Set(names))
}
