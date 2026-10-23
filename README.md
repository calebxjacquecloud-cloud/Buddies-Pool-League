# 🎱 BUDDIES Thursday Pool

The web app for the weekly Thursday pool tournament at **BUDDIES**, 504 E Colfax Ave, Denver, CO 80203.
Practice round 6:30pm · Tournament 7:00pm.

- **Host dashboard** on the bar's iPad: register players, start the bracket, tap winners.
- **TV mode** mirrored to the TV (or opened directly on a smart TV): the whole bracket, live.
- **Players follow along on their phones**: a personal link shows their next opponent, how many matches until they're up, and their stats.
- **Double elimination** with byes, grand-final bracket reset, undo, corrections, withdrawals and late entries.
- **Stats over time**: leaderboard (all-time and by season), titles, win %, streaks, week-by-week history.
- **Text messages** (Twilio) when the tournament starts, with a no-Twilio fallback that works on day one.

Everything runs in the cloud (Netlify + Supabase), so nothing has to stay running on your own computer.

---

## Contents

1. [How a Thursday works](#how-a-thursday-works)
2. [Setup guide (step by step)](#setup-guide)
   1. [Create the database (Supabase)](#step-1--create-the-database-supabase)
   2. [Put the site online (Netlify)](#step-2--put-the-site-online-netlify)
   3. [Optional: load demo data](#step-3--optional-load-demo-data)
   4. [Set up text messages (Twilio)](#step-4--set-up-text-messages-twilio)
   5. [Set up the iPad and TV](#step-5--set-up-the-ipad-and-the-tv)
3. [Bracket rules the app follows](#bracket-rules-the-app-follows)
4. [Privacy and security](#privacy-and-security)
5. [Troubleshooting](#troubleshooting)
6. [For developers](#for-developers)

---

## How a Thursday works

1. Open the app on the iPad (home-screen icon) → **Host** → enter the PIN → **＋ New Thursday Tournament** (the date defaults to today).
2. **Add players.** Start typing a name: returning players pop up, so tap them. New players: tap **＋ Add new player**, optionally add a mobile number. If a name looks like an existing player ("Jen Alvarez" vs "Jenn Alvarez"), the app asks before creating a duplicate.
3. Check the settings (number of pool tables, random draw, bracket reset, "up next" texts), then tap **🎱 Start Tournament**. The bracket is drawn, texts go out, and you can tap **📺 TV Mode**.
4. On the **Matches** tab, each table shows two big buttons. **Tap the winner.** The bracket, the TV and everyone's phones update by themselves. Made a mistake? Tap **Undo** in the message that pops up (or the ↶ Undo button). To fix an older result, open the **Bracket** tab and tap that match.
5. When the final is decided, the champion screen appears and the results are saved to history automatically.

**Players tab:** share each player's personal link (💬 **Share via Messages** opens the iPad's Messages app with the text ready), add a late player, or **Withdraw** someone who left.
**Texts tab:** see who got the start text, and resend if any failed.

---

## Setup guide

You'll create three free accounts: **GitHub** (you already have it; it holds the code), **Supabase** (the database) and **Netlify** (the website). Twilio (texting) is optional and can come later.

> 💡 Until Supabase is connected, the site runs in **demo mode**: it works, but data is saved only in that one browser. A blue banner at the top tells you when you're in demo mode. The demo host PIN is `1234`.

### Step 1 — Create the database (Supabase)

1. Go to **https://supabase.com** → **Start your project** → sign in with GitHub.
2. Click **New project**.
   - **Name:** `buddies-pool`
   - **Database password:** click *Generate a password* and save it somewhere safe (you won't need it day to day).
   - **Region:** pick **West US** (closest to Denver).
   - Click **Create new project** and wait a minute or two.
3. Create the tables:
   - In the left sidebar, open **SQL Editor** → **New query**.
   - In GitHub, open [`supabase/migrations/20261023000000_init.sql`](supabase/migrations/20261023000000_init.sql), click **Copy raw file** (the copy icon), paste it into the Supabase editor, and click **Run**.
   - You should see "Success. No rows returned."
4. Check that live updates are on: **Database → Publications → `supabase_realtime`** should list `tournaments`, `entrants` and `tournament_events`. (The SQL you ran turns this on. If they're missing, toggle them on here.)
5. Copy your keys: go to **Project Settings (gear icon) → API Keys** (on older dashboards: **Settings → API**). You need three values:
   - **Project URL**, e.g. `https://abcdxyz.supabase.co` (shown under **Project Settings → Data API**, or at the top of the API page)
   - **Publishable key** (starts with `sb_publishable_`). On the *Legacy API keys* tab this is called the **anon / public** key. Either works.
   - **Secret key** (starts with `sb_secret_`; click *Reveal*). On the legacy tab this is the **service_role** key. **Keep this one private.** It can change anything.

### Step 2 — Put the site online (Netlify)

1. Go to **https://app.netlify.com** → sign up / log in **with GitHub**.
2. **Add new project** (or *Add new site*) → **Import an existing project** → **GitHub** → authorize → pick **Buddies-Pool-League**.
3. Netlify reads the settings from `netlify.toml` automatically. You should see: branch **`main`**, build command `npm run build`, publish directory `dist`, functions directory `netlify/functions`. Leave those as they are.
4. **Before** clicking Deploy, open **Add environment variables** (or do it after: **Site configuration → Environment variables → Add a variable**). Add each of these:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase **publishable** (anon) key |
   | `SUPABASE_URL` | your Supabase Project URL (same as above) |
   | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase **secret** (service_role) key |
   | `HOST_PIN` | the PIN bar staff will type, e.g. a 6-digit number. **Don't use 1234.** |

   Only the two `VITE_` values end up in the website itself; they're safe to be public because the database only lets the public *read*. The secret key and the PIN are only used on Netlify's servers.
5. Click **Deploy**. After a minute your site is live at something like `https://random-name-123.netlify.app`.
6. Give it a nicer name: **Site configuration → Change site name** → e.g. `buddies-pool` → `https://buddies-pool.netlify.app`.
   - Using your own domain (e.g. `pool.buddiesdenver.com`)? Add it under **Domain management**, then add an env var `PUBLIC_SITE_URL` = `https://pool.buddiesdenver.com` so texted links use it.
7. **Any time you change an environment variable, redeploy:** **Deploys → Trigger deploy → Deploy site**.
8. Test it: open the site, tap **Host**, enter your PIN, create a tournament. The blue "demo mode" banner should be gone.

From now on, every change pushed to the `main` branch on GitHub redeploys the site automatically.

### Step 3 — Optional: load demo data

Want to see the leaderboard and stats filled in before your first real night? On any computer with [Node.js 22](https://nodejs.org):

```bash
git clone https://github.com/calebxjacquecloud-cloud/Buddies-Pool-League.git
cd Buddies-Pool-League
npm install
cp .env.example .env      # then edit .env: fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run seed              # adds 20 fake players and 6 past Thursdays
```

Demo players use fake 555-01xx phone numbers and seeding never sends texts. To remove the demo data later, delete those tournaments from the host dashboard (or ask a developer to clear the tables).

### Step 4 — Set up text messages (Twilio)

The app is fully usable **without** this step: use **💬 Share via Messages** on the Players tab, or let players scan the QR code on the TV. Do this when you're ready for automatic texts.

> ⚠️ **US carriers require registration before texts deliver reliably.** Unregistered business texts get blocked. Approval takes anywhere from a few days to a few weeks, so start early. Twilio charges small per-message and monthly registration fees; see Twilio's current pricing.

1. **Create an account** at **https://www.twilio.com/try-twilio** and verify your email and phone.
2. **Upgrade** the account (add a payment method). Trial accounts can only text numbers you've verified yourself.
3. **Choose a number type and register it.** Pick **one**:
   - **Option A: Toll-free number (often the simplest for one small business).**
     Console → **Phone Numbers → Buy a number** → filter *Toll-free* → buy one.
     Then **Messaging → Regulatory Compliance → Toll-Free Verifications** (or open the number and click *Submit verification*) and fill in the form (details below).
   - **Option B: Local Denver number (303/720) with US A2P 10DLC.**
     Buy a local number, then go to **Messaging → Regulatory Compliance → A2P 10DLC** (*Onboarding*):
     1. Register your **Brand** (BUDDIES' legal business name, EIN, address; or *Sole Proprietor* if there's no EIN).
     2. Create a **Messaging Service** (**Messaging → Services → Create**) and add your number to its *Sender Pool*.
     3. Register a **Campaign** on that Messaging Service.

   What to enter for the use case, in either form:
   - **Use case:** Account notifications / mixed, low volume.
   - **Description:** "Notifications for a weekly pool tournament at BUDDIES bar in Denver: a text when the tournament starts with a link to the player's bracket, and optionally when their match is next."
   - **How people opt in:** "Players give their mobile number to bar staff when registering for the tournament and agree to receive tournament texts. Every message says Reply STOP to opt out."
   - **Sample messages:**
     - `🎱 BUDDIES Thursday Pool has started! See your bracket, stats, and when you're up next: https://buddies-pool.netlify.app/p/abc123 Reply STOP to opt out.`
     - `🎱 BUDDIES: You're up next on table 1 vs Sam! https://buddies-pool.netlify.app/p/abc123 Reply STOP to opt out.`
   - **Opt-out keywords:** STOP (Twilio handles STOP/START/HELP replies automatically).
4. **Add the Twilio keys to Netlify** (Site configuration → Environment variables), then redeploy:

   | Key | Where to find it |
   |---|---|
   | `TWILIO_ACCOUNT_SID` | Twilio Console home page → *Account Info* (starts with `AC`) |
   | `TWILIO_AUTH_TOKEN` | same place (click *Show*) |
   | `TWILIO_MESSAGING_SERVICE_SID` | **Messaging → Services** → your service (starts with `MG`). Recommended for 10DLC. |
   | `TWILIO_FROM_NUMBER` | *or*, instead of a Messaging Service, your Twilio number in `+1XXXXXXXXXX` format |

5. **Point STOP replies at the app** so it never texts people who opted out:
   - Using a **Messaging Service**: **Messaging → Services → your service → Integration** → *Incoming Messages* → **Send a webhook** → Request URL:
     `https://YOUR-SITE.netlify.app/.netlify/functions/sms-inbound` → **Save**.
   - Using just a **phone number**: **Phone Numbers → Manage → Active numbers** → click the number → *Messaging Configuration* → **A message comes in** → *Webhook* → the same URL, **HTTP POST** → **Save configuration**.
   - The app checks Twilio's signature on every webhook, so only Twilio can mark numbers as opted out. If you use a custom domain, use that domain in the URL and set `PUBLIC_SITE_URL` to match.
6. **Test:** create a test tournament with your own number, start it, and check that the text arrives. Reply `STOP`; in **Host → Players** your number should show *Opted out*. Reply `START` to opt back in.

### Step 5 — Set up the iPad and the TV

**Install the app on the iPad:**
1. Open **Safari** and go to `https://YOUR-SITE.netlify.app/host`.
2. Tap the **Share** button (square with an arrow) → **Add to Home Screen** → **Add**.
3. Open **BUDDIES Pool** from the home screen. It runs full-screen without Safari's address bar.
4. Enter the host PIN. The iPad stays signed in for the night (12 hours). Changing `HOST_PIN` in Netlify signs every device out.
5. Recommended: **Settings → Display & Brightness → Auto-Lock → Never** during the tournament (the app also asks the screen to stay awake).

**Show the bracket on the TV (two ways):**
- **AirPlay mirroring:** on the iPad, open Control Center → **Screen Mirroring** → pick the Apple TV / AirPlay TV. Then tap **📺 TV Mode** in the app. To get back, tap the screen and press **Exit TV**.
- **Directly on a smart TV or a second device** (so the iPad stays free): open the TV's web browser and go to `https://YOUR-SITE.netlify.app/tv/<tournament id>`. The easiest way to get that address: on the iPad, open the tournament's public page (Live → Bracket → **📺 TV view**) and copy the URL. TV mode is read-only and updates by itself.

TV mode shows a **QR code**; players scan it, tap their name, and get their personal page with no texting needed.

---

## Bracket rules the app follows

- **Double elimination.** First loss drops you to the losers bracket; second loss eliminates you.
- **4 to 64 players.** The bracket is padded to the next power of 2 (8, 16, 32, 64) with **byes**. Byes go to the top seeds, advance automatically, and never count as wins or losses.
- **Seeding:** random draw by default. Turn off *Random draw* to set the order yourself (▲▼ arrows, seed 1 at the top) or tap **Shuffle**.
- **Losers-bracket crossover:** players dropping from the winners bracket are placed in the opposite section of the losers bracket (standard reverse / swap-halves pattern), so they don't immediately replay someone from their own section. In the last few rounds rematches can't always be avoided; that's normal for double elimination.
- **Grand final:** winners-bracket champion vs losers-bracket champion. If the losers-bracket champion wins, a **bracket reset** match decides it (setting, on by default).
- **Play order / tables:** matches are queued in standard order. With more than one table, each table gets the next ready match when it frees up.
- **Undo** removes the last result. **Correcting an older result** recalculates everything after it; results that no longer make sense (because different players would have met) are listed and erased after you confirm.
- **Withdrawals:** the player's remaining matches become **forfeits** (walkovers). Forfeits don't count as wins or losses for anyone. A withdrawn player's matches already played still count.
- **Late entry:** before any result, anyone can be added (the bracket is redrawn when you start). After results exist, a late player can take an **open bye slot**, but only if the player who had that bye hasn't played their next match yet and the bracket doesn't need to grow. Otherwise the app explains why it's blocked.
- **Placements:** 1st and 2nd from the final; then by the losers-bracket round where you were eliminated, with shared places (3rd, 4th, 5th–6th, 7th–8th, 9th–12th…).
- **Stats** count only finished tournaments and only matches actually played (every match stores its winner **and** loser).

---

## Privacy and security

- **Phone numbers are private.** They're stored in a table the public can't read, are only shown to the host, and never appear on the TV, the bracket or public pages. Stored in standard `+1XXXXXXXXXX` format.
- **The public can only read.** The website uses Supabase's publishable key with Row Level Security: read-only access to names, brackets and results. Every change goes through a Netlify Function that checks the host's signed session first.
- **Host PIN** is checked on the server (never in the browser), with a limit on wrong guesses per network address (8 per 15 minutes).
- **Personal links** use long random tokens (impossible to guess) and show nothing private.
- **Opt-outs** are recorded from Twilio's webhook (signature-verified), and opted-out numbers are never texted.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Blue "Demo mode" banner on the live site | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing or misspelled in Netlify. Fix them, then **Trigger deploy**. |
| "Wrong PIN" though it's right | Check `HOST_PIN` in Netlify (no spaces), then redeploy. |
| "Server is missing SUPABASE_URL…" | Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Netlify and redeploy. |
| Yellow "Reconnecting…" badge | The device lost internet. Nothing is lost: results live in the database. It catches up automatically when Wi-Fi returns. |
| "The bracket changed on another device" | Two people tapped at once; the screen has refreshed. Check the bracket and tap again if needed. |
| TV/phones don't update live | Supabase → Database → Publications → `supabase_realtime` must include `tournaments`, `entrants`, `tournament_events`. Pages also refresh when reopened. |
| Texts don't arrive | Check the Texts tab for the error. Most often the number/campaign isn't approved yet (Step 4), or the player replied STOP. Use Share via Messages meanwhile. |
| Supabase project "paused" | Free projects pause after a period of inactivity. The app pings the database daily to prevent this; if it happens anyway, click **Restore** in the Supabase dashboard. |

---

## For developers

**Stack:** React 19 + Vite + TypeScript + Tailwind CSS 4 · Netlify (static site + Functions) · Supabase (Postgres + Realtime) · Twilio REST API.

```bash
npm install
npm run dev        # http://localhost:5173. Demo mode unless .env has Supabase keys
npm test           # bracket engine, service layer, functions, SQL migration (PGlite)
npm run typecheck
npm run build
npm run seed       # demo data into Supabase (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
```

To run with real Netlify Functions locally, use the Netlify CLI: `npx netlify-cli dev` (reads `.env`).

### Folder structure

```
src/
  engine/            Pure double-elimination engine (no framework, no I/O) + tests
  shared/            Code shared by browser and functions:
    service.ts         every host action (validation, writes, texts)
    store.ts           storage interface; memoryStore.ts = in-memory implementation
    stats.ts           leaderboard/player stats; names.ts, phone.ts, messages.ts
    seed.ts            demo data generator
  data/              Browser data layer: SupabaseBackend (prod) / DemoBackend (no config)
  components/        Bracket, TV fit-to-screen, QR, UI kit
  hooks/             live data, host actions, stats, wake lock
  pages/             public pages, TV, player view, host/ (dashboard, registration, run view)
netlify/
  functions/         api (host actions), host-login, player-link, sms-inbound, keep-alive (daily)
  lib/               SupabaseStore, auth (signed host sessions), Twilio client + signature check
  tests/             function handler tests
supabase/migrations/ SQL schema, indexes, RLS policies, RPCs (+ migration.test.ts)
scripts/seed.ts      seeds Supabase with demo data
```

### How it works

- **Event-sourced brackets.** A tournament stores its seeds plus an ordered list of events (`result`, `withdraw`). The engine (`src/engine`) replays them to compute the whole bracket, queue, statuses and placements. Undo = drop the last event; a correction rewrites one event and drops later ones that no longer replay. `write_events` (SQL) applies changes atomically and rejects stale writes from a second device.
- **Derived data** (`matches` with winner + loser, `entrants.final_place`, tournament status/champion) is recomputed after every change for fast stats queries.
- **Live updates:** clients subscribe to Supabase Realtime on `tournaments` / `entrants` / `tournament_events` and refetch; every change bumps `tournaments.updated_at` so deletes (undo) propagate too.
- **Bracket structure:** size `2^k`; winners rounds `k`; losers rounds `2(k-1)`; odd losers rounds pair survivors, even rounds take winners-bracket droppers with crossover; GF1 + conditional GF2.

### Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | publishable/anon key (read-only via RLS) |
| `SUPABASE_URL` | functions | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | functions | secret/service_role key; never expose to the browser |
| `HOST_PIN` | functions | host PIN; also part of the session signing key |
| `PUBLIC_SITE_URL` | functions | base URL for texted links (defaults to Netlify's `URL`) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | functions | Twilio credentials |
| `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER` | functions | sender |
| `VITE_DEMO_PIN` | browser (demo only) | PIN in demo mode (default `1234`) |
