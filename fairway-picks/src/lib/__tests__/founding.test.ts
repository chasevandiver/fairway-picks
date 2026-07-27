import { describe, it, expect } from 'vitest'
import { LEGACY_PLAYER_NAMES, HISTORICAL_PLAYER_NAMES, ALL_TIME_PLAYER_NAMES } from '../founding'
import { MAJORS_HISTORY, ALL_STATS } from '../constants'
import { parseWinnerPlayers } from '../scoring'

describe('historical-only players', () => {
  it('are not part of the active roster', () => {
    for (const p of HISTORICAL_PLAYER_NAMES) {
      expect(LEGACY_PLAYER_NAMES).not.toContain(p)
    }
  })

  it('are included in the all-time roster', () => {
    for (const p of HISTORICAL_PLAYER_NAMES) {
      expect(ALL_TIME_PLAYER_NAMES).toContain(p)
    }
    for (const p of LEGACY_PLAYER_NAMES) {
      expect(ALL_TIME_PLAYER_NAMES).toContain(p)
    }
  })

  it('have no ALL_STATS baseline, so their counts must render as unknown', () => {
    // ALL_STATS only covers active players. A historical-only player showing a
    // zero here would read as "played and never placed", which is not what we
    // know — the numbers were simply never recorded.
    const baselinePlayers = ALL_STATS.map(s => s.player)
    for (const p of HISTORICAL_PLAYER_NAMES) {
      expect(baselinePlayers).not.toContain(p)
    }
  })
})

describe('every major winner on record is attributable', () => {
  it('names only players in the all-time roster', () => {
    // JHall won the 2023 Masters but was absent from every roster constant, so
    // that major was credited to nobody.
    const unattributed = MAJORS_HISTORY
      .flatMap(m => parseWinnerPlayers(m.winner))
      .filter(p => !ALL_TIME_PLAYER_NAMES.includes(p as never))
    expect(unattributed).toEqual([])
  })

  it('still credits JHall the 2023 Masters', () => {
    const masters2023 = MAJORS_HISTORY.find(m => m.year === 2023 && m.name === 'Masters')
    expect(masters2023?.winner).toBe('JHall')
    expect(ALL_TIME_PLAYER_NAMES).toContain('JHall')
  })
})
