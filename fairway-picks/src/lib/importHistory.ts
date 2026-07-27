// ─── Historical season import ─────────────────────────────────────────────────
// Parses the money ledger pasted straight out of the old Golf Picks
// spreadsheets. The sheets lay money out wide — one row per tournament, one
// column per player — so that is the format this accepts, because it is what
// you get from selecting the block and hitting copy.
//
// Imported events are money-only. Their finishes, cuts and majors are already
// counted in the hardcoded ALL_STATS / MAJORS_HISTORY baselines, so they are
// written with is_historical = true and skipped by the all-time tallies.

import { isMajorName } from '@/lib/majors'

export type ParsedEvent = {
  name: string
  date: string                      // YYYY-MM-DD
  isMajor: boolean
  money: Record<string, number>
  /** A pool is zero-sum: every dollar won came from someone. */
  balanced: boolean
}

export type ParseResult = {
  events: ParsedEvent[]
  players: string[]
  errors: string[]
  warnings: string[]
}

/** Sheets export tabs; a pasted range can also be comma-separated. */
function splitCells(line: string): string[] {
  return (line.includes('\t') ? line.split('\t') : line.split(',')).map(c => c.trim())
}

/**
 * Money as the sheets write it: `$60`, `-$15`, `($15)` for negatives, `—` or
 * blank for nothing. Returns null when the cell isn't a number at all.
 */
export function parseMoneyCell(cell: string): number | null {
  const raw = cell.trim()
  if (raw === '' || raw === '—' || raw === '-' || raw === '–') return 0
  const negative = /^\(.*\)$/.test(raw)
  const cleaned = raw.replace(/[()$,\s]/g, '')
  if (cleaned === '') return 0
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return negative ? -Math.abs(n) : n
}

/**
 * Accepts `YYYY-MM-DD` and the `M/D/YYYY` the sheets use. Anything else is
 * rejected rather than guessed at — a wrong year silently files a whole
 * tournament under the wrong season.
 */
export function parseDateCell(cell: string, fallbackYear?: number): string | null {
  const raw = cell.trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return raw

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const [, m, d, y] = slash
    const year = y.length === 2 ? 2000 + Number(y) : Number(y)
    return `${year}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`
  }

  // A bare M/D only works when the season year is already known.
  const short = raw.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (short && fallbackYear) {
    const [, m, d] = short
    return `${fallbackYear}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`
  }

  return null
}

/**
 * Parse a pasted money ledger.
 *
 * Expected shape — a header row naming the columns, then one row per event:
 *
 *   Tournament   Date        Chase   Max    Hayden
 *   Sentry       2024-01-07  -15     60     -15
 *
 * `roster` is the league's players; only columns whose header matches a roster
 * name (case-insensitively) are read, so extra sheet columns are ignored rather
 * than mangled. `seasonYear` fills in bare M/D dates.
 */
export function parseHistoricalPaste(
  text: string,
  roster: string[],
  seasonYear?: number,
): ParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '')

  if (lines.length < 2) {
    return { events: [], players: [], errors: ['Paste a header row and at least one tournament row.'], warnings }
  }

  const header = splitCells(lines[0])
  const rosterByLower = new Map(roster.map(p => [p.toLowerCase(), p]))

  // Locate the player columns by name, and the tournament/date columns by
  // position — the sheets always lead with those two.
  const playerCols: { index: number; player: string }[] = []
  header.forEach((h, i) => {
    const match = rosterByLower.get(h.toLowerCase())
    if (match && !playerCols.some(c => c.player === match)) playerCols.push({ index: i, player: match })
  })

  if (playerCols.length === 0) {
    return {
      events: [], players: [],
      errors: [`No player columns found. The header row must name players from this league: ${roster.join(', ')}.`],
      warnings,
    }
  }

  const dateCol = header.findIndex(h => /^date$/i.test(h))
  const nameCol = header.findIndex(h => /^(tournament|event|name)$/i.test(h))
  if (nameCol === -1) errors.push('No "Tournament" column found in the header row.')
  if (dateCol === -1) errors.push('No "Date" column found in the header row.')
  if (errors.length > 0) return { events: [], players: playerCols.map(c => c.player), errors, warnings }

  const events: ParsedEvent[] = []
  const seenKeys = new Set<string>()

  lines.slice(1).forEach((line, i) => {
    const rowNum = i + 2   // 1-indexed, and the header is row 1
    const cells = splitCells(line)
    const name = (cells[nameCol] ?? '').trim()
    if (name === '') return   // blank spacer rows are normal in the sheets

    const date = parseDateCell(cells[dateCol] ?? '', seasonYear)
    if (!date) {
      errors.push(`Row ${rowNum} (${name}): couldn't read the date "${cells[dateCol] ?? ''}". Use YYYY-MM-DD or M/D/YYYY.`)
      return
    }

    const money: Record<string, number> = {}
    let bad = false
    for (const { index, player } of playerCols) {
      const value = parseMoneyCell(cells[index] ?? '')
      if (value === null) {
        errors.push(`Row ${rowNum} (${name}): "${cells[index]}" isn't a money value for ${player}.`)
        bad = true
        continue
      }
      money[player] = value
    }
    if (bad) return

    const key = `${name.toLowerCase()}|${date}`
    if (seenKeys.has(key)) {
      warnings.push(`Row ${rowNum}: "${name}" on ${date} appears more than once in this paste.`)
    }
    seenKeys.add(key)

    // A pool only redistributes money, so a season's rows should each net to
    // zero. A non-zero row usually means a column was missed on the way over.
    const sum = Object.values(money).reduce((s, v) => s + v, 0)
    const balanced = sum === 0
    if (!balanced) {
      warnings.push(`Row ${rowNum} (${name}): the money nets to ${sum > 0 ? '+' : ''}${sum}, not zero — a player column may be missing.`)
    }

    events.push({ name, date, isMajor: isMajorName(name), money, balanced })
  })

  if (events.length === 0 && errors.length === 0) {
    errors.push('No tournament rows found below the header.')
  }

  return { events, players: playerCols.map(c => c.player), errors, warnings }
}

/** Per-player totals across a parsed paste — for reconciling against the sheet. */
export function importTotals(events: ParsedEvent[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const e of events) {
    for (const [player, value] of Object.entries(e.money)) {
      totals[player] = (totals[player] ?? 0) + value
    }
  }
  return totals
}
