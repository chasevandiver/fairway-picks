import { LEGACY_PLAYER_NAMES } from '@/lib/founding'

// The founding league's historical roster — used only for founding-league
// claiming and legacy stats. Custom leagues derive their roster from members.
export const LEGACY_PLAYERS: string[] = [...LEGACY_PLAYER_NAMES]

// ─── 2026 PGA Tour Schedule ───────────────────────────────────────────────────
export const PGA_SCHEDULE = [
  { name: 'The Sentry',                        course: 'Plantation Course at Kapalua',       date: '2026-01-08' },
  { name: 'Sony Open in Hawaii',                course: 'Waialae Country Club',               date: '2026-01-15' },
  { name: 'The American Express',               course: 'PGA West / La Quinta CC',            date: '2026-01-22' },
  { name: 'Farmers Insurance Open',             course: 'Torrey Pines Golf Course',           date: '2026-01-29' },
  { name: 'AT&T Pebble Beach Pro-Am',           course: 'Pebble Beach Golf Links',            date: '2026-02-05' },
  { name: 'WM Phoenix Open',                    course: 'TPC Scottsdale',                     date: '2026-02-12' },
  { name: 'Genesis Invitational',               course: 'Riviera Country Club',               date: '2026-02-19' },
  { name: 'Puerto Rico Open',                   course: 'Grand Reserve Country Club',         date: '2026-02-26' },
  { name: 'Mexico Open at Vidanta',             course: 'Vidanta Vallarta',                   date: '2026-02-26' },
  { name: 'Cognizant Classic in The Palm Beaches', course: 'PGA National Resort',             date: '2026-02-26' },
  { name: 'Arnold Palmer Invitational',         course: 'Bay Hill Club & Lodge',              date: '2026-03-05' },
  { name: 'THE PLAYERS Championship',           course: 'TPC Sawgrass',                       date: '2026-03-12' },
  { name: 'Valspar Championship',               course: 'Innisbrook Resort (Copperhead)',      date: '2026-03-19' },
  { name: 'Texas Children\'s Houston Open',     course: 'Memorial Park Golf Course',          date: '2026-03-26' },
  { name: 'Valero Texas Open',                  course: 'TPC San Antonio (Oaks)',             date: '2026-04-02' },
  { name: 'Masters Tournament',                 course: 'Augusta National Golf Club',         date: '2026-04-09' },
  { name: 'RBC Heritage',                       course: 'Harbour Town Golf Links',            date: '2026-04-16' },
  { name: 'Zurich Classic of New Orleans',      course: 'TPC Louisiana',                      date: '2026-04-23' },
  { name: 'Myrtle Beach Classic',               course: 'Dunes Golf and Beach Club',          date: '2026-04-30' },
  { name: 'Cadillac Championship',              course: 'TPC Potomac at Avenel Farm',         date: '2026-04-30' },
  { name: 'Truist Championship',                course: 'Quail Hollow Club',                  date: '2026-05-07' },
  { name: 'AT&T Byron Nelson',                  course: 'TPC Craig Ranch',                    date: '2026-05-14' },
  { name: 'PGA Championship',                   course: 'Aronimink Golf Club',                date: '2026-05-21' },
  { name: 'Charles Schwab Challenge',           course: 'Colonial Country Club',              date: '2026-05-28' },
  { name: 'the Memorial Tournament',            course: 'Muirfield Village Golf Club',        date: '2026-06-04' },
  { name: 'RBC Canadian Open',                  course: 'Hamilton Golf & Country Club',       date: '2026-06-11' },
  { name: 'U.S. Open',                          course: 'Oakmont Country Club',               date: '2026-06-18' },
  { name: 'Travelers Championship',             course: 'TPC River Highlands',                date: '2026-06-25' },
  { name: 'Rocket Mortgage Classic',            course: 'Detroit Golf Club',                  date: '2026-07-02' },
  { name: 'John Deere Classic',                 course: 'TPC Deere Run',                      date: '2026-07-09' },
  { name: 'The Open Championship',              course: 'Royal Portrush Golf Club',           date: '2026-07-16' },
  { name: 'Barracuda Championship',             course: 'Tahoe Mountain Club',                date: '2026-07-16' },
  { name: 'Genesis Scottish Open',              course: 'The Renaissance Club',               date: '2026-07-09' },
  { name: '3M Open',                            course: 'TPC Twin Cities',                    date: '2026-07-23' },
  { name: 'Olympic Men\'s Golf',                course: 'Real Club de Golf de Sevilla',       date: '2026-07-30' },
  { name: 'Wyndham Championship',               course: 'Sedgefield Country Club',            date: '2026-08-06' },
  { name: 'FedEx St. Jude Championship',        course: 'TPC Southwind',                      date: '2026-08-13' },
  { name: 'BMW Championship',                   course: 'Aronimink Golf Club',                date: '2026-08-20' },
  { name: 'TOUR Championship',                  course: 'East Lake Golf Club',                date: '2026-08-27' },
]

export const NAV_ITEMS = [
  { key: 'live',    icon: '⛳', label: 'Leaderboard' },
  { key: 'picks',   icon: '🏌️', label: 'Picks' },
  { key: 'money',   icon: '💰', label: 'Money' },
  { key: 'draft',   icon: '📋', label: 'Draft' },
  { key: 'history', icon: '📈', label: 'History' },
  { key: 'stats',   icon: '🏅', label: 'Stats' },
  { key: 'recap',   icon: '🏆', label: 'Season Recap' },
  { key: 'admin',   icon: '⚙️', label: 'Admin',   adminOnly: true },
]

export const MAJORS_HISTORY = [
  { year: 2020, name: 'Masters',        winner: 'Chase',         logo: '🌲' },
  { year: 2020, name: 'PGA Championship', winner: 'Max',         logo: '🏆' },
  { year: 2020, name: 'US Open',        winner: 'Chase',         logo: '🦅' },
  { year: 2021, name: 'Masters',        winner: 'Chase',         logo: '🌲' },
  { year: 2021, name: 'PGA Championship', winner: 'Hayden',      logo: '🏆' },
  { year: 2021, name: 'US Open',        winner: 'Chase',         logo: '🦅' },
  { year: 2021, name: 'The Open',       winner: 'Chase',         logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { year: 2022, name: 'Masters',        winner: 'Chase',         logo: '🌲' },
  { year: 2022, name: 'PGA Championship', winner: 'Hayden',      logo: '🏆' },
  { year: 2022, name: 'US Open',        winner: 'Chase',         logo: '🦅' },
  { year: 2022, name: 'The Open',       winner: 'Chase',         logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { year: 2023, name: 'Masters',        winner: 'JHall',         logo: '🌲' },
  { year: 2023, name: 'PGA Championship', winner: 'Andrew',      logo: '🏆' },
  { year: 2023, name: 'US Open',        winner: 'Brennan',       logo: '🦅' },
  { year: 2023, name: 'The Open',       winner: 'Brennan/Hayden (Tie)', logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { year: 2024, name: 'Masters',        winner: 'Brennan',       logo: '🌲' },
  { year: 2024, name: 'PGA Championship', winner: 'Max',         logo: '🏆' },
  { year: 2024, name: 'US Open',        winner: 'Andrew',        logo: '🦅' },
  { year: 2024, name: 'The Open',       winner: 'Max',           logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { year: 2025, name: 'Masters',        winner: 'Andrew',        logo: '🌲' },
  { year: 2025, name: 'PGA Championship', winner: 'Max',         logo: '🏆' },
  { year: 2025, name: 'US Open',        winner: 'Max',           logo: '🦅' },
  { year: 2025, name: 'The Open',       winner: 'Max',           logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
]

export const MAJOR_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  'Masters':          { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.35)', text: '#f59e0b', label: 'Masters' },
  'PGA Championship': { bg: 'rgba(99,179,237,0.08)',  border: 'rgba(99,179,237,0.3)',  text: '#60a5fa', label: 'PGA' },
  'US Open':          { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', text: '#f87171', label: 'US Open' },
  'The Open':         { bg: 'rgba(192,132,252,0.08)', border: 'rgba(192,132,252,0.3)', text: '#c084fc', label: 'The Open' },
}

export const ALL_STATS = [
  { player: 'Chase',   first: 19, second: 25, third: 26, majors: 8,   winners: 10, top3: 18, cut: 68 },
  { player: 'Max',     first: 33, second: 23, third: 22, majors: 6,   winners: 15, top3: 28, cut: 50 },
  { player: 'Hayden',  first: 28, second: 26, third: 30, majors: 2.5, winners: 12, top3: 24, cut: 65 },
  { player: 'Andrew',  first: 18, second: 27, third: 14, majors: 2,   winners: 14, top3: 22, cut: 61 },
  { player: 'Brennan', first: 13, second: 7,  third: 7,  majors: 2.5, winners: 6,  top3: 9,  cut: 19 },
  { player: 'Eric',    first: 0,  second: 0,  third: 0,  majors: 0,   winners: 0,  top3: 0,  cut: 0  },
]
