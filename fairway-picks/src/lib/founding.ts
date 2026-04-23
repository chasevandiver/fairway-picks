// The original league (Eric, Max, Hayden, Andrew, Brennan, Chase).
// All historical tournaments, picks, results, season money, and the
// RBC Heritage record are under this league id. It is preserved in full
// and stays publicly viewable at /view/EAGLE1 (leagues.is_public_view = true).
export const FOUNDING_LEAGUE_ID   = '00000000-0000-0000-0000-000000000001' as const
export const FOUNDING_INVITE_CODE = 'EAGLE1' as const
export const FOUNDING_LEAGUE_NAME = 'The Original League' as const

export const LEGACY_PLAYER_NAMES = ['Eric','Max','Hayden','Andrew','Brennan','Chase'] as const
export type  LegacyPlayerName    = typeof LEGACY_PLAYER_NAMES[number]

export function isFoundingLeague(id: string | null | undefined): boolean {
  return id === FOUNDING_LEAGUE_ID
}
