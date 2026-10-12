# Pub Golf: build plan

A shareable, location-agnostic pub golf app. Anyone can set up a course for any town. Only the organiser can change it, and only from the admin page. The organiser sets the venues ("sites"), the drinks, and the activity for every hole.

It's the successor to Peckham Pub Golf (`Desktop/Projects/pub-golf/index.html`, one file, hard-coded holes). It reuses the proven DMC World Tour patterns: PIN-gated admin RPCs, anonymous sign-in, live sync, a `dist/`-only Netlify publish, and `?demo=1`.

Status 2026-10-10: **front end built and tested in local mode** (`index.html`, `admin.html`, `board.html`, `assets/`). Backend parked by owner.

### Owner decisions (2026-10-10)
- **One site per organiser, not multi-game.** Main page blank until the organiser goes Live. Organiser enters venues manually in `/admin` (PIN).
- Drinks, soft options and activities come **pre-populated as choice lists**, each hole can pick from them or type a custom value; lists themselves are editable in admin Settings.
- Promo (H4NDR3X Spotify card): optional, off by default.
- No Peckham template.
- Supabase: not now. Front end runs on `LocalStore` (one device); the adapter swap is the next step when wanted.

---

## 1. What changes from Peckham Pub Golf

| Peckham version | Pub Golf |
|---|---|
| 9 holes hard-coded in JS | Holes live in the database. Admin adds, edits, reorders and deletes them. |
| One course, one town | Many games. Each has its own code, admin PIN, course and players. |
| Drink and forfeit fixed per hole | Per hole: venue, drink, soft option, par and activity, all editable. |
| Rules and penalties in HTML | Rules, penalty list and values are editable per game. |
| Players write their own row directly (`pg_players.update`) | All writes go through RPCs. Players can touch only their own scores. Admin can correct any score. |
| Shared old Supabase project `elasiuqzlnranvprsagx` | New, dedicated Supabase project |
| Built-in Spotify promo | Optional "sponsor / now playing" card, set in admin (off by default) |

---

## 2. The three variables (admin-only)

Each **hole** has these fields:

- **Site**: venue name, address, map link (auto-built from the address), optional photo URL, optional "aim to arrive by" time and notes (for example "cash only" or "upstairs bar").
- **Drink**: main drink, a soft or zero-alcohol option that scores the same par, and the **par** (1-10).
- **Activity**: free text plus a **mode**:
  - `forfeit`: do it instead of the drink and score par (this is the Peckham rule)
  - `bonus`: optional; doing it takes −1 off the hole
  - `required`: everyone does it; skipping it adds +N (N set per hole)
  - `none`

Admin also gets:

- **Libraries** to pick from, so nothing needs typing from scratch: about 30 preset drinks with suggested pars and about 40 preset activities (the 9 Peckham forfeits are included). The organiser can save their own presets per game.
- **Course templates**: "Blank 9", "Blank 18", "Peckham (sample)", and "Duplicate an existing game" (needs the PIN of the source game).
- **Penalties**: an editable list of (label, strokes), seeded with the Peckham five.
- **Rules text**: editable "How to play" and "Etiquette" bullets.
- **Branding**: game name, date, accent colour, optional logo or poster image URL.

---

## 3. Who uses it

**Player** (`/`, on a phone)
- Joins with the game code (or QR) and a display name. Rejoins on the same device with no login.
- **Scorecard**: the current hole is highlighted with its venue, map link, drink and soft option, par and activity. Score entry is gulps (stepper), or Forfeit, or DNF, plus penalty chips with a live total.
- **Leaderboard**: live, sorted by to-par then total, with "Thru N". The player's own row is pinned.
- **Course**: all holes with their venues and maps, so the walking route is visible up front.
- **Rules** tab, and a banner for organiser broadcasts.
- Works on a bad connection: queued writes, a live/amber/red strip (same as DMC), and retry on reconnect.

**Organiser** (`/admin`, PIN)
- **Setup**: course editor (drag to reorder, or up/down buttons on mobile), libraries, penalties, rules, branding.
- **Live control**: game status (`draft` → `live` → `finished`), the current hole pointer (players see "Now at hole 4"), lock and unlock holes, and a broadcast message.
- **Scores**: a grid of every player × hole. Admin can edit any cell (gulps, F, DNF, penalties), and every edit is logged. Admin can rename, merge or remove players.
- **Tools**: change the PIN, reset scores, wipe players, duplicate the game, CSV export.

**Big screen** (`/board?g=CODE`, TV or laptop): leaderboard, current hole card, join QR and broadcast ticker. Read-only and needs no sign-in.

**Print** (`/print`, not built yet): an A4 course sheet with QR, holes and rules, plus a paper scorecard backup.

**Friend who wants their own game**: the landing page has a "Start a new course" button. It asks for a game name and a PIN entered twice, then shows the code, the player link and the admin link in one share sheet. No accounts.

---

## 4. Scoring (configurable, defaults = Peckham)

- Hole score = gulps + penalties − bonus.
- **Forfeit** = par (+ penalties). **DNF** = par + 2 (configurable). A blank hole doesn't count yet.
- To-par = Σ(score − par) over completed holes. Lowest wins. A tie on to-par goes to fewer penalties, then shared.
- Soft drinks score exactly the same as the alcoholic option.
- A hole accepts scores only when it's open: game `live` and the hole not locked. "No playing ahead" is an optional setting that allows scoring only up to the current hole.
- Scores are recalculated in SQL (a view), so the leaderboard can't be faked by a client.

---

## 5. Safety and venues

- Every hole has a soft option at the same par. Forfeit (or the activity) is always allowed instead of drinking. The app never rewards drinking more.
- Water between holes and pacing are in the default rules. Defaults are 9 holes with a maximum of 18. An optional "last orders" time shows a countdown.
- Admin checklist: tell venues you're coming and keep group sizes manageable. Each hole can hold the venue's phone number.
- No photos of the public and no personal data beyond a display name. Games auto-delete 30 days after their date (scheduled SQL job), and the organiser can delete one sooner.

---

## 6. Tech

- **Stack**: plain HTML, CSS and JS, no build step, supabase-js **2.117.2** pinned from jsDelivr (same as DMC). Pages: `index.html`, `admin.html`, `board.html`, `print.html`, plus `assets/` and a shared `app.js` / `style.css`.
- **Hosting**: Netlify, auto-deploy from a **private** GitHub repo `pub-golf`. `netlify.toml` publishes only `dist/` (pages + assets), with redirects for `/admin`, `/board` and `/print`, and the DMC security headers and CSP.
- **Backend**: a **new Supabase project** `pub-golf` (never `elasiuqzlnranvprsagx`, never the DMC project). Migrations live in `supabase/migrations/`, the API contract in `supabase/CONTRACT.md`, and tests in `supabase/tests/`.

### Data model
```
games    id, code (6 chars, unique), name, event_date, status, current_hole,
         settings jsonb (dnf_strokes, no_play_ahead, last_orders, branding, promo),
         rules jsonb, penalties jsonb, pin_hash (bcrypt), created_by, created_at
holes    id, game_id, seq, venue, address, map_url, photo_url, arrive_by, notes,
         drink, soft_drink, par, activity, activity_mode, activity_strokes, locked
players  id (= auth.uid), game_id, name, created_at, removed
scores   player_id, hole_id, gulps, result ('played'|'forfeit'|'dnf'|'bonus'),
         penalties jsonb, updated_by ('player'|'admin'), updated_at
feed     game_id, kind ('broadcast'|'admin_edit'|'status'), body, created_at
presets  game_id null = global, kind ('drink'|'activity'), payload jsonb
```
`leaderboard` view: totals, to-par, thru and penalty count per player.

### Security (DMC pattern, hardened)
- RLS on everywhere. **Direct inserts, updates and deletes are denied on all tables.** Clients write only through `SECURITY DEFINER` RPCs.
- Public read: `get_game(code)` returns the game (no `pin_hash`), holes, leaderboard and feed. Realtime runs on `scores`, `holes`, `games` and `feed`, filtered by `game_id`.
- Player RPCs (anonymous auth): `join_game(code, name)`, `submit_score(hole_id, gulps, result, penalties)` (own row only, hole must be open), `rename_self`, `leave_game`.
- Admin RPCs take `p_code, p_pin` first: `admin_check_pin`, `admin_update_game`, `admin_upsert_hole`, `admin_delete_hole`, `admin_reorder_holes`, `admin_set_status`, `admin_set_current_hole`, `admin_lock_hole`, `admin_edit_score`, `admin_remove_player`, `admin_merge_players`, `admin_broadcast`, `admin_reset`, `admin_set_pin`, `admin_duplicate_game`, `admin_delete_game`.
- Wrong PIN costs about a 1 s delay, and 10 failures lock out for 15 minutes per game. `create_game` is rate-limited to 5 per anonymous user per day. The PIN is 6 or more digits, stored only as a bcrypt hash, and kept only in `sessionStorage` on the admin's device.
- Input limits: name ≤ 24 chars, text fields ≤ 200, par 1-10, ≤ 18 holes, ≤ 60 players per game.

---

## 7. Build phases

| # | Phase | Output | Done when |
|---|---|---|---|
| 0 | Scaffold | repo, `netlify.toml`, Supabase project, `CLAUDE.md` | empty pages deploy |
| 1 | Backend | migrations 0001-000N, `CONTRACT.md`, seed presets and Peckham template | `rls_checks`, `scoring_checks`, `e2e_game` SQL tests pass |
| 2 | Player page | `index.html` | full round in `?demo=1` and against a real DB |
| 3 | Admin page | `admin.html` | create game, edit all 3 variables, run a round, fix a score |
| 4 | Board + print | `board.html`, `print.html` | TV view live; A4 sheet prints on one page |
| 5 | Landing / create flow | `index.html` (no code) + share sheet | a friend can create a game in under 2 minutes |
| 6 | Review | independent Opus review of security, scoring and UX on a phone | all findings fixed |
| 7 | Dry run | 3 phones, 3 holes, live site | `docs/DRY-RUN.md` passes |
| 8 | Share | `docs/ORGANISER-GUIDE.md` (1 page) + link | the friend sets up a course alone |

Phases 2, 3 and 4 run as parallel agents split by file, after phase 1 fixes the contract.

---

## 8. Next steps
1. **Backend** (when the owner says go): new Supabase project + `SupabaseStore` adapter matching `PG.store`'s API; first-run PIN claim must move server-side (in local mode anyone opening `/admin` first sets the PIN).
2. Private GitHub repo + Netlify site.
3. Dry run with 3 phones, then a one-page organiser guide for friends.
4. Optional: `print.html` (A4 course sheet + QR), multi-game mode if more friends want it at once.
