# Rubric Scoring App — Build Plan

## Overview

A mobile-first web app where a session organiser creates a scoring session (e.g. "Team 3 — Design Freeze"), judges join by entering their name, score one criterion at a time on their phone, and a live dashboard shows aggregated results once everyone is done. Built entirely on free-tier infrastructure.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React + Vite | Component model handles the multi-step scoring flow cleanly |
| Styling | Tailwind CSS | Utility-first, great for responsive/mobile-first without a design system overhead |
| Backend / DB | Supabase | Free tier: Postgres + Realtime + Auth-lite + Storage |
| Charts | Recharts | Lightweight, works well in React |
| PDF export | jsPDF + html2canvas | Client-side, no server needed |
| Hosting | Vercel (free) | CI/CD from GitHub, zero config for Vite apps |

**Zero ongoing cost.** Supabase free tier covers 500MB DB, 2GB bandwidth, and Realtime connections. Vercel free covers unlimited static deployments.

---

## Database Schema

```sql
-- Who's in the system (name-only login)
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- Reusable criterion templates
create table templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,           -- e.g. "Standard Phase 3–4 Rubric"
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Individual criteria inside a template
create table template_criteria (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete cascade,
  name text not null,           -- e.g. "Execution quality"
  description text,
  sort_order int not null default 0
);

-- A scoring session (one team, one phase gate)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,    -- short join code, e.g. "T3-DZ"
  title text not null,          -- e.g. "Team 3 — Design Freeze"
  cohort text,                  -- e.g. "Batch 2025"
  phase text,                   -- e.g. "Phase 3"
  template_id uuid references templates(id),
  status text default 'open',   -- open | scoring | complete
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Criteria actually used in a session
-- (copied from template + optional session-specific additions)
create table session_criteria (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  name text not null,
  description text,
  is_session_specific boolean default false,  -- highlights phase-specific criterion
  sort_order int not null default 0
);

-- Judges registered to a session
create table session_judges (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  user_id uuid references users(id),
  joined_at timestamptz default now(),
  completed_at timestamptz           -- null until they submit all scores
);

-- Individual scores
create table scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  criterion_id uuid references session_criteria(id) on delete cascade,
  judge_id uuid references users(id),
  score int check (score between 1 and 4),
  updated_at timestamptz default now(),
  unique(session_id, criterion_id, judge_id)  -- one score per judge per criterion
);
```

**Row-level security:** Enable RLS on all tables. Judges can only read/write their own scores. Organisers can read all scores for sessions they created.

---

## App Pages & Flow

```
/                     Landing — enter your name
/home                 Dashboard — your sessions + history
/sessions/new         Create a session
/sessions/[id]        Session lobby — judges join, organiser waits
/sessions/[id]/score  Scoring flow — one criterion at a time (mobile)
/sessions/[id]/results  Live dashboard + export
/templates            Manage reusable templates
```

### Page-by-page detail

#### `/` — Name login
- Single input: "What's your name?"
- On submit: upsert into `users` table, store `user_id` in localStorage
- No passwords. Name is the identity. If the name already exists, you are that person.
- Redirect to `/home`

#### `/home` — Dashboard
- Two tabs: **Active sessions** | **History**
- Active: sessions the user has joined or created that aren't complete
- History: completed sessions, grouped by cohort
- FAB button: "Create session" → `/sessions/new`
- Each session card shows: title, phase, judge count, completion status

#### `/sessions/new` — Create session
- Fields: Title, Phase, Cohort (optional)
- Criteria source: pick a template OR build from scratch
- Template picker shows saved templates with preview of criteria
- If template selected: criteria load in, organiser can add session-specific criteria at the bottom (these are flagged differently in the rubric)
- Session generates a short join code (e.g. `T3DZ`) and a shareable link
- On create: redirect to `/sessions/[id]` lobby

#### `/sessions/[id]` — Lobby
- Organiser view: shows join code + QR code + shareable link, list of judges who have joined, "Start scoring" button (locks the session, no new judges can join)
- Judge view: "You're in — waiting for the organiser to start"
- Realtime: judge list updates live as people join
- Once organiser hits Start → all judges get redirected to the scoring flow

#### `/sessions/[id]/score` — Scoring flow (the key mobile screen)
- One criterion per screen — full height, no scrolling
- Progress bar at top: "3 of 5"
- Criterion name + description
- Four large tap targets for scores 1–4, each showing the level name and a one-line descriptor
- "Back" and "Next" buttons; "Next" disabled until a score is selected
- Scores saved to Supabase on each "Next" (not just at the end — resumable)
- Final screen: review summary of all scores before submit
- On submit: `completed_at` set on `session_judges` row
- Redirect to `/sessions/[id]/results` (shows waiting state if other judges aren't done)

#### `/sessions/[id]/results` — Dashboard
- Locked behind completion (or organiser can unlock early)
- Summary cards: overall average, per-criterion averages
- Bar chart: each criterion with stacked bars per judge score
- Table: judge-by-judge breakdown, colour-coded by score level
- Grade band banner: Exemplary / Proficient / Developing / Needs development
- Export button: generates PDF
- Realtime: updates live as remaining judges submit

#### `/templates` — Template manager
- List of saved templates
- Create / edit / duplicate / delete
- Drag to reorder criteria within a template
- One template can be "default" — pre-selected in the session creator

---

## Component Architecture

```
src/
├── pages/
│   ├── Login.jsx
│   ├── Home.jsx
│   ├── NewSession.jsx
│   ├── SessionLobby.jsx
│   ├── ScoringFlow.jsx
│   ├── Results.jsx
│   └── Templates.jsx
│
├── components/
│   ├── layout/
│   │   ├── AppShell.jsx        # nav + back button wrapper
│   │   └── BottomNav.jsx       # mobile bottom nav
│   ├── scoring/
│   │   ├── CriterionCard.jsx   # full-screen criterion + score picker
│   │   ├── ScoreButton.jsx     # individual 1–4 tap target
│   │   ├── ProgressBar.jsx
│   │   └── ReviewSummary.jsx   # pre-submit review screen
│   ├── results/
│   │   ├── ScoreDashboard.jsx
│   │   ├── CriterionChart.jsx  # bar chart per criterion
│   │   ├── JudgeTable.jsx
│   │   └── GradeBanner.jsx
│   ├── session/
│   │   ├── JoinCode.jsx        # code + QR display
│   │   ├── JudgeList.jsx       # realtime judge roster
│   │   └── SessionCard.jsx     # home page card
│   └── shared/
│       ├── NameInput.jsx
│       ├── LoadingSpinner.jsx
│       └── ExportButton.jsx
│
├── hooks/
│   ├── useSession.js           # session data + realtime sub
│   ├── useScores.js            # scores + submit logic
│   ├── useUser.js              # name/localStorage identity
│   └── useRealtime.js          # generic Supabase channel hook
│
├── lib/
│   ├── supabase.js             # client init
│   ├── pdf.js                  # jsPDF export logic
│   └── utils.js                # join code generator, grade bands, etc.
│
└── App.jsx                     # routes
```

---

## Supabase Setup Steps

1. Create a free project at supabase.com
2. Run the SQL schema above in the SQL editor
3. Enable Row Level Security on all tables, add policies:
   - `users`: anyone can insert their own row; anyone can read (needed for name lookup)
   - `sessions`: anyone can read; only creator can update status
   - `scores`: judges can insert/update their own scores; anyone in the session can read all scores (for the dashboard)
   - `session_judges`: anyone can insert (joining); read all for the session
4. Enable Realtime on `scores` and `session_judges` tables (in Database → Replication)
5. Copy the project URL and anon key into a `.env` file:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
6. Never commit `.env` — add to `.gitignore`. Add env vars to Vercel dashboard for production.

---

## Mobile Scoring UX — Detail

The scoring flow is the most important screen. Design rules:

- **Full viewport height** per criterion — no scroll
- **Score buttons**: minimum 64px tall, full width, with level name + one-line descriptor. Large touch targets.
- **Thumb zone**: score buttons in bottom 60% of screen, progress bar and criterion name at top
- **Auto-advance option**: after tapping a score, a 300ms delay then auto-advance to next criterion (with a skip button for correction)
- **Haptic feedback**: `navigator.vibrate(30)` on score selection (where supported)
- **Offline resilience**: store scores in localStorage as a backup; sync to Supabase on each Next tap
- **Resume**: if a judge closes the tab and reopens, pull existing scores from Supabase and resume from where they left off
- **Landscape lock suggestion**: show a "rotate to portrait" nudge if device is landscape

---

## PDF Export

Generated client-side using jsPDF + html2canvas — no server:

1. Render a hidden `<div id="pdf-source">` with the full results layout
2. `html2canvas` captures it as an image
3. `jsPDF` embeds the image into a PDF page
4. Auto-download as `[session-title]-results.pdf`

PDF contents:
- Header: session title, date, phase, cohort
- Grade band summary
- Per-criterion score table (judge columns + average column)
- Bar chart (captured from the dashboard)
- Footer: generated by [app name], timestamp

---

## Build Order

Build in this order — each step is usable before the next is started:

1. **Supabase schema + RLS** — foundation for everything
2. **Name login + localStorage identity** — unblocks all other pages
3. **Create session + template picker** — organiser can create a session
4. **Lobby + join code** — judges can join
5. **Scoring flow (mobile)** — the core feature; get this feeling great on phone
6. **Score persistence + resume** — reliability
7. **Realtime updates** — lobby judge list + results live refresh
8. **Results dashboard** — aggregation, charts, grade band
9. **PDF export** — polish feature
10. **Templates CRUD** — reusability
11. **History page** — cohort grouping, past sessions

---

## Deployment

```bash
# Local dev
npm create vite@latest rubric-app -- --template react
cd rubric-app
npm install @supabase/supabase-js tailwindcss recharts jspdf html2canvas react-router-dom
npx tailwindcss init -p

# Deploy
# 1. Push to GitHub
# 2. Connect repo to vercel.com (free)
# 3. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel env vars
# 4. Every push to main auto-deploys
```

**Custom domain**: Vercel gives a free `.vercel.app` subdomain. You can add a custom domain later if needed — Vercel supports it for free.

---

## What Stays Free

| Service | Free limit | Your usage |
|---|---|---|
| Supabase DB | 500 MB | Negligible for text scores |
| Supabase Realtime | 200 concurrent connections | Fine for panel sizes |
| Supabase bandwidth | 2 GB / month | Fine |
| Vercel hosting | Unlimited deploys | Free forever for hobby |
| jsPDF / html2canvas | Open source | Free |

The only cost scenario: if this goes to hundreds of concurrent users. For an internship program panel, you're nowhere near that.
