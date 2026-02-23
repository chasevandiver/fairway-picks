# ⛳ Fairway Picks — Setup Guide

A full-stack golf pick'em league tracker with live PGA Tour scores, snake draft, and money tracking.

---

## What You're Getting

- 🔐 **Player login** — each of your 5 friends taps their name to sign in
- 📋 **Snake Draft** — real-time draft that updates for everyone simultaneously
- ⛳ **Live Leaderboard** — pulls live scores from ESPN every 2 minutes
- 💰 **Money Tracking** — auto-calculates who owes what each week and season-long
- 📈 **History** — every past tournament recorded permanently
- ⚙️ **Admin Panel** — only Eric (or whoever you set) can manage tournaments

---

## Step 1 — Create Your Supabase Project (Free)

1. Go to **[supabase.com](https://supabase.com)** → "Start your project" → sign up free
2. Click **"New Project"**
   - Name it `fairway-picks`
   - Pick a region close to you
   - Set a database password (save it)
3. Wait ~2 minutes for it to spin up
4. Go to **Database → SQL Editor → New Query**
5. Paste the entire contents of `supabase/migrations/001_initial_schema.sql` and click **Run**
6. Go to **Settings → API** and copy:
   - **Project URL** → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Step 2 — Deploy to Vercel (Free)

### Option A: GitHub (recommended)
1. Create a free [GitHub](https://github.com) account if you don't have one
2. Create a new repo called `fairway-picks`
3. Upload all the files from this folder to the repo
4. Go to **[vercel.com](https://vercel.com)** → sign up with GitHub → "New Project"
5. Import your `fairway-picks` repo
6. Under **Environment Variables**, add:
   ```
   NEXT_PUBLIC_SUPABASE_URL = paste_your_supabase_url_here
   NEXT_PUBLIC_SUPABASE_ANON_KEY = paste_your_supabase_anon_key_here
   ```
7. Click **Deploy** — Vercel will give you a URL like `fairway-picks.vercel.app`

### Option B: Vercel CLI (if you're comfortable with terminal)
```bash
npm install -g vercel
cd fairway-picks
npm install
vercel
# Follow the prompts, add env vars when asked
```

---

## Step 3 — First Time Setup

1. Open your Vercel URL
2. Tap **Eric** to log in (Eric is set as admin by default)
3. Go to **⚙️ Admin** tab
4. Fill in the tournament name, course, and date
5. Set the draft order (or leave default)
6. Click **Activate Tournament**
7. Go to **Draft** tab → click **Start Draft** and have everyone pick their golfers

---

## How Each Week Works

1. **Admin sets up the tournament** (name, course, date, draft order)
2. **Everyone opens the site** on their phone — no app download needed
3. **Snake draft happens** — the site shows who's on the clock in real time
4. **Scores update automatically** every 2 minutes from ESPN
5. **After the tournament**, admin clicks **Finalize & Record Results**
   - Money is automatically calculated and added to season totals
   - Results are saved to history permanently

---

## Changing the Admin

Open `src/app/page.tsx` and find this line (around line 245):

```ts
const isAdmin = currentPlayer === 'Eric'
```

Change `'Eric'` to whoever should be admin, or make it a list:
```ts
const isAdmin = ['Eric', 'Max'].includes(currentPlayer ?? '')
```

## Changing the Players

Open `src/lib/types.ts` and edit the `PLAYERS` array:
```ts
export const PLAYERS: Player[] = ['Eric', 'Max', 'Hayden', 'Andrew', 'Brennan']
```

---

## Payout Rules (Configurable)

In `src/lib/types.ts`:
```ts
export const PAYOUT_RULES = {
  lowestStrokes: 10,  // $10 per other player
  outrightWinner: 10, // $10 per other player
  top3: 5,            // $5 per other player
}
```

---

## Tech Stack (all free tier)

| Service | What it does | Cost |
|---------|-------------|------|
| **Vercel** | Hosts the website | Free |
| **Supabase** | Database + real-time sync | Free (500MB, plenty) |
| **ESPN API** | Live golf scores | Free (public) |
| **Next.js** | The app framework | Free / open source |

---

## File Structure

```
fairway-picks/
├── src/
│   ├── app/
│   │   ├── page.tsx          ← Main app (all tabs)
│   │   ├── layout.tsx        ← HTML root
│   │   ├── globals.css       ← All styles
│   │   └── api/scores/
│   │       └── route.ts      ← ESPN score fetcher endpoint
│   └── lib/
│       ├── supabase.ts       ← DB client
│       ├── types.ts          ← Types + constants
│       ├── scoring.ts        ← Money/standings math
│       └── espn.ts           ← ESPN API + fallback data
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  ← Run this in Supabase
├── package.json
├── next.config.js
├── tsconfig.json
└── .env.example              ← Copy to .env.local with your keys
```

