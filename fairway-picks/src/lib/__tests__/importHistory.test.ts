import { describe, it, expect } from 'vitest'
import { parseHistoricalPaste, parseMoneyCell, parseDateCell, importTotals } from '../importHistory'

const ROSTER = ['Chase', 'Max', 'Hayden', 'Andrew', 'Brennan']

const TSV = [
  'Tournament\tDate\tChase\tMax\tHayden\tAndrew\tBrennan',
  'Sentry Tournament\t2024-01-07\t-15\t60\t-15\t-15\t-15',
  'Sony Open\t2024-01-14\t40\t-10\t-10\t-10\t-10',
].join('\n')

describe('parseMoneyCell', () => {
  it('reads plain and dollar-prefixed numbers', () => {
    expect(parseMoneyCell('60')).toBe(60)
    expect(parseMoneyCell('$60')).toBe(60)
    expect(parseMoneyCell('-$15')).toBe(-15)
    expect(parseMoneyCell('$1,250')).toBe(1250)
  })

  it('reads accounting-style negatives', () => {
    expect(parseMoneyCell('($15)')).toBe(-15)
    expect(parseMoneyCell('(15)')).toBe(-15)
  })

  it('treats blanks and dashes as zero', () => {
    expect(parseMoneyCell('')).toBe(0)
    expect(parseMoneyCell('  ')).toBe(0)
    expect(parseMoneyCell('—')).toBe(0)
    expect(parseMoneyCell('-')).toBe(0)
  })

  it('rejects text', () => {
    expect(parseMoneyCell('n/a')).toBeNull()
    expect(parseMoneyCell('TBD')).toBeNull()
  })
})

describe('parseDateCell', () => {
  it('accepts ISO dates unchanged', () => {
    expect(parseDateCell('2024-01-07')).toBe('2024-01-07')
  })

  it('converts the sheet M/D/YYYY format and pads', () => {
    expect(parseDateCell('1/7/2024')).toBe('2024-01-07')
    expect(parseDateCell('12/25/2024')).toBe('2024-12-25')
    expect(parseDateCell('1/7/24')).toBe('2024-01-07')
  })

  it('fills the year for a bare M/D only when the season is known', () => {
    expect(parseDateCell('1/7', 2022)).toBe('2022-01-07')
    expect(parseDateCell('1/7')).toBeNull()
  })

  it('refuses to guess at anything else', () => {
    expect(parseDateCell('January 7')).toBeNull()
    expect(parseDateCell('')).toBeNull()
  })
})

describe('parseHistoricalPaste', () => {
  it('parses a tab-separated ledger', () => {
    const r = parseHistoricalPaste(TSV, ROSTER)
    expect(r.errors).toEqual([])
    expect(r.events).toHaveLength(2)
    expect(r.events[0]).toMatchObject({
      name: 'Sentry Tournament', date: '2024-01-07', isMajor: false, balanced: true,
    })
    expect(r.events[0].money).toEqual({ Chase: -15, Max: 60, Hayden: -15, Andrew: -15, Brennan: -15 })
  })

  it('parses comma-separated pastes too', () => {
    const csv = TSV.replace(/\t/g, ',')
    expect(parseHistoricalPaste(csv, ROSTER).events).toHaveLength(2)
  })

  it('flags majors from the tournament name', () => {
    const paste = 'Tournament\tDate\tChase\tMax\nU.S. Open\t2024-06-16\t10\t-10'
    expect(parseHistoricalPaste(paste, ROSTER).events[0].isMajor).toBe(true)
  })

  it('does not flag a non-major that merely looks like one', () => {
    const paste = 'Tournament\tDate\tChase\tMax\nGenesis Scottish Open\t2024-07-14\t10\t-10'
    expect(parseHistoricalPaste(paste, ROSTER).events[0].isMajor).toBe(false)
  })

  it('ignores sheet columns that are not players', () => {
    const paste = [
      'Tournament\tDate\tNotes\tChase\tMax\tFedEx Pts',
      'Sentry\t2024-01-07\twindy\t10\t-10\t500',
    ].join('\n')
    const r = parseHistoricalPaste(paste, ROSTER)
    expect(r.players).toEqual(['Chase', 'Max'])
    expect(r.events[0].money).toEqual({ Chase: 10, Max: -10 })
  })

  it('matches player headers case-insensitively', () => {
    const paste = 'Tournament\tDate\tCHASE\tmax\nSentry\t2024-01-07\t10\t-10'
    expect(parseHistoricalPaste(paste, ROSTER).players).toEqual(['Chase', 'Max'])
  })

  it('skips blank spacer rows without complaint', () => {
    const paste = TSV.split('\n')
    paste.splice(2, 0, '\t\t\t\t\t\t')
    const r = parseHistoricalPaste(paste.join('\n'), ROSTER)
    expect(r.events).toHaveLength(2)
    expect(r.errors).toEqual([])
  })

  it('warns when a row does not net to zero', () => {
    const paste = 'Tournament\tDate\tChase\tMax\nSentry\t2024-01-07\t60\t-15'
    const r = parseHistoricalPaste(paste, ROSTER)
    expect(r.events[0].balanced).toBe(false)
    expect(r.warnings.join(' ')).toContain('nets to +45')
  })

  it('warns about a duplicated tournament and date', () => {
    const paste = [
      'Tournament\tDate\tChase\tMax',
      'Sentry\t2024-01-07\t10\t-10',
      'Sentry\t2024-01-07\t10\t-10',
    ].join('\n')
    expect(parseHistoricalPaste(paste, ROSTER).warnings.join(' ')).toContain('more than once')
  })

  it('reports a bad date with the row number and keeps going', () => {
    const paste = [
      'Tournament\tDate\tChase\tMax',
      'Sentry\tsometime\t10\t-10',
      'Sony\t2024-01-14\t10\t-10',
    ].join('\n')
    const r = parseHistoricalPaste(paste, ROSTER)
    expect(r.errors[0]).toContain('Row 2 (Sentry)')
    expect(r.events).toHaveLength(1)
  })

  it('reports a non-numeric money cell', () => {
    const paste = 'Tournament\tDate\tChase\tMax\nSentry\t2024-01-07\tn/a\t-10'
    const r = parseHistoricalPaste(paste, ROSTER)
    expect(r.errors[0]).toContain('isn\'t a money value for Chase')
    expect(r.events).toEqual([])
  })

  it('explains itself when no player column matches', () => {
    const paste = 'Tournament\tDate\tAlice\tBob\nSentry\t2024-01-07\t10\t-10'
    expect(parseHistoricalPaste(paste, ROSTER).errors[0]).toContain('No player columns found')
  })

  it('explains itself when the header is missing a required column', () => {
    const paste = 'Event\tChase\tMax\nSentry\t10\t-10'
    expect(parseHistoricalPaste(paste, ROSTER).errors[0]).toContain('"Date" column')
  })

  it('rejects an empty paste', () => {
    expect(parseHistoricalPaste('', ROSTER).errors[0]).toContain('header row')
    expect(parseHistoricalPaste('Tournament\tDate\tChase', ROSTER).errors[0]).toContain('header row')
  })

  it('fills bare M/D dates from the season year', () => {
    const paste = 'Tournament\tDate\tChase\tMax\nSentry\t1/7\t10\t-10'
    expect(parseHistoricalPaste(paste, ROSTER, 2021).events[0].date).toBe('2021-01-07')
  })
})

describe('importTotals', () => {
  it('sums each player across the paste for reconciling against the sheet', () => {
    const { events } = parseHistoricalPaste(TSV, ROSTER)
    expect(importTotals(events)).toEqual({ Chase: 25, Max: 50, Hayden: -25, Andrew: -25, Brennan: -25 })
  })

  it('is empty for no events', () => {
    expect(importTotals([])).toEqual({})
  })
})
