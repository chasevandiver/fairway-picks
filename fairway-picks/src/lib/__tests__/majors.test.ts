import { describe, it, expect } from 'vitest'
import { majorKey, isMajorName } from '../majors'
import { PGA_SCHEDULE, MAJORS_HISTORY, MAJOR_COLORS } from '../constants'

describe('majorKey', () => {
  it('maps every US Open spelling in use', () => {
    // 'U.S. Open' is what PGA_SCHEDULE stores, and is the spelling that broke
    // the 2026 Majors Wall cell.
    expect(majorKey('U.S. Open')).toBe('US Open')
    expect(majorKey('US Open')).toBe('US Open')
    expect(majorKey('125th US Open at Oakmont')).toBe('US Open')
    expect(majorKey('U.S. Open Championship')).toBe('US Open')
  })

  it('maps every Open Championship spelling in use', () => {
    expect(majorKey('The Open Championship')).toBe('The Open')
    expect(majorKey('British Open')).toBe('The Open')   // historical sheets
    expect(majorKey('Open Championship')).toBe('The Open')
    expect(majorKey('The Open')).toBe('The Open')
  })

  it('maps the Masters and the PGA Championship', () => {
    expect(majorKey('Masters Tournament')).toBe('Masters')
    expect(majorKey('Masters')).toBe('Masters')
    expect(majorKey('Masters Tournament at Augusta National')).toBe('Masters')
    expect(majorKey('PGA Championship')).toBe('PGA Championship')
    expect(majorKey('PGA Championship at Valhalla')).toBe('PGA Championship')
  })

  it('is case-insensitive', () => {
    expect(majorKey('the players championship')).toBeNull()
    expect(majorKey('MASTERS TOURNAMENT')).toBe('Masters')
    expect(majorKey('us open')).toBe('US Open')
  })

  it('returns null for non-majors that look like majors', () => {
    // Each of these would have been swallowed by the old `?? 'The Open'`
    // fallback if is_major were ever set on them.
    expect(majorKey('Genesis Scottish Open')).toBeNull()
    expect(majorKey('Scottish Open')).toBeNull()
    expect(majorKey('THE PLAYERS Championship')).toBeNull()
    expect(majorKey('Barracuda Championship')).toBeNull()
    expect(majorKey('Sony Open in Hawaii')).toBeNull()
    expect(majorKey('Farmers Insurance Open')).toBeNull()
    expect(majorKey('BMW Championship')).toBeNull()
    expect(majorKey('TOUR Championship')).toBeNull()
  })

  it('handles empty and missing names', () => {
    expect(majorKey(null)).toBeNull()
    expect(majorKey(undefined)).toBeNull()
    expect(majorKey('')).toBeNull()
    expect(majorKey('   ')).toBeNull()
  })
})

describe('isMajorName', () => {
  it('agrees with majorKey', () => {
    expect(isMajorName('U.S. Open')).toBe(true)
    expect(isMajorName('The Open Championship')).toBe(true)
    expect(isMajorName('Genesis Scottish Open')).toBe(false)
  })
})

describe('integration with the 2026 schedule', () => {
  it('classifies exactly the four majors on the schedule', () => {
    const majors = PGA_SCHEDULE.filter(t => isMajorName(t.name)).map(t => majorKey(t.name))
    expect(majors.sort()).toEqual(['Masters', 'PGA Championship', 'The Open', 'US Open'])
  })

  it('gives the U.S. Open and The Open Championship distinct keys', () => {
    // Both used to collapse to 'The Open', so one silently overwrote the other
    // in the Majors Wall lookup.
    expect(majorKey('U.S. Open')).not.toBe(majorKey('The Open Championship'))
  })

  it('produces keys that match the Majors Wall columns', () => {
    for (const key of PGA_SCHEDULE.map(t => majorKey(t.name))) {
      if (key) expect(MAJOR_COLORS[key]).toBeDefined()
    }
  })

  it('produces keys that match the hardcoded history', () => {
    const historyNames = new Set(MAJORS_HISTORY.map(m => m.name))
    for (const name of Array.from(historyNames)) {
      expect(majorKey(name)).toBe(name)
    }
  })
})
