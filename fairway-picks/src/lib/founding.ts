// The original league (Eric, Max, Hayden, Andrew, Brennan, Chase).
// All historical tournaments, picks, results, season money, and the
// RBC Heritage record are under this league id. It is preserved in full
// and stays publicly viewable at /view/EAGLE1 (leagues.is_public_view = true).
export const FOUNDING_LEAGUE_ID = '00000000-0000-0000-0000-000000000001' as const

export const LEGACY_PLAYER_NAMES = ['Eric','Max','Hayden','Andrew','Brennan','Chase'] as const

// Played in the pre-app era and appears in the record books, but is not an
// active member: not claimable, never in a draft order, no roster slot.
// Counted by the all-time stats — JHall's 2023 Masters was being credited to
// nobody — and accepted by the historical importer so past money isn't
// silently dropped on the way in.
export const HISTORICAL_PLAYER_NAMES = ['JHall'] as const

/** Everyone who has ever played: active roster plus historical-only names. */
export const ALL_TIME_PLAYER_NAMES = [
  ...LEGACY_PLAYER_NAMES,
  ...HISTORICAL_PLAYER_NAMES,
] as const
