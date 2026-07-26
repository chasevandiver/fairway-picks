# ⛳ Fore Picks (Fairway Picks)

A full-stack golf pick'em league tracker — live PGA Tour scores, snake drafts,
automatic money tracking, and shareable leagues. Built with Next.js 14
(App Router) + Supabase, deployed on Vercel.

## Features

- **Multi-league**: create a league, share an invite link (`/join/CODE`), and
  members join with one tap. Each league has its own rules, roster, history,
  and money.
- **Email code sign-in** (6-digit OTP, no passwords) with sessions that
  persist between visits — sign in once per device.
- **Live leaderboard** pulling ESPN scores every ~2 minutes, with cut/WD
  handling, score-change flashes, and a public read-only view at
  `/view/CODE` for leagues with public view enabled.
- **Snake draft** with realtime updates across devices.
- **Configurable rules**: picks per player, payout amounts, cut/WD penalties,
  majors multiplier, tiebreakers. Active tournaments freeze a rules snapshot
  so mid-season edits never rewrite history.
- **Money tracking** derived from finalized results (single source of truth),
  plus season stats, head-to-head records, and a season recap.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier works).
2. In the SQL editor, run the migrations in `supabase/migrations/` **in
   order**: `001` → `002` → `003` → `005` → `006` → `007` → `008` → `009` → `010`.
   (`004` is a guarded one-time repair — skip it; it aborts if run.)
   For `006`, `008`, and `009`, run the matching scripts in
   `supabase/verification/` before and after and compare the output.
3. In **Auth → Providers → Email**, enable email OTP sign-in.
4. Recommended (so infrequent players stay signed in between tournaments):
   in **Auth → Sessions**, leave "Inactivity timeout" disabled and keep
   refresh-token rotation on its defaults.

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in all three values:

| Variable | Where to find it | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API | browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API | browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API (**secret**) | server API routes only |

All three are **required** — the app's read API (`/api/league-data`,
`/api/init-user`) and the invite-link page use the service-role key
server-side (it is never sent to the browser).

### 3. Deploy (Vercel)

1. Import the repo in Vercel; set the project **Root Directory** to
   `fairway-picks/`.
2. Add the three environment variables above.
3. Deploy. Push-to-main auto-deploys from there.

### 4. First-time league setup

Open the site → **Create a league** → sign in with your email → share the
invite link with your group. The creator is the league's commissioner and
gets the Admin tab (activate tournaments, finalize results, edit rules and
the invite code).

## Development

```bash
cd fairway-picks
npm install
npm run dev        # local dev server
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (next/core-web-vitals)
npm test           # vitest — scoring + ESPN parser tests
npm run build      # production build
```

CI (GitHub Actions) runs typecheck, lint, tests, and a production build on
every push and pull request.

## Project layout

```
fairway-picks/
├── src/
│   ├── app/
│   │   ├── page.tsx              # App shell: auth bootstrap, state, handlers
│   │   ├── auth/                 # Email OTP sign-in
│   │   ├── create/               # League creation wizard
│   │   ├── dashboard/            # Your leagues
│   │   ├── join/[code]/          # Invite links (join via RPC)
│   │   ├── league/[id]/          # Bookmarkable league URL
│   │   ├── view/[code]/          # Public read-only league view
│   │   └── api/
│   │       ├── league-data/      # Authorized league reads (service role)
│   │       ├── init-user/        # Profile + membership for the caller
│   │       └── scores/           # ESPN proxy with 120s revalidate
│   ├── components/
│   │   ├── app/                  # Sidebar, PlayerCard, modals, Toast…
│   │   └── tabs/                 # Leaderboard, Picks, Money, Draft, Admin…
│   └── lib/
│       ├── scoring.ts            # Standings + money engine (rules-aware)
│       ├── espn.ts               # ESPN scoreboard parser
│       ├── rules.ts              # LeagueRules types + defaults
│       ├── roster.ts             # League roster derivation
│       ├── founding.ts           # Founding-league constants
│       └── apiAuth.ts            # Bearer-token auth for API routes
├── supabase/
│   ├── migrations/               # 001–010, run in order
│   ├── verification/             # Pre/postflight checks for risky migrations
│   └── rollback/                 # Rollbacks (run in reverse order)
└── .github/workflows/ci.yml     # typecheck + lint + test + build
```

## Scoring rules (defaults)

- **Weekly winner** — lowest combined (adjusted) score collects $10 from each
  other player; exact ties split the pot.
- **Outright winner** — picking the tournament winner collects $10 from each
  other player.
- **Top 3 bonus** — each golfer finishing 2nd–3rd collects $5 from each other
  player.
- **Cut/WD** — a cut golfer's missed weekend counts as a repeat of R1+R2
  (equivalently: doubled 36-hole score). Configurable per league, as are all
  dollar amounts, the majors multiplier, and the tiebreaker.
