# Pub Golf: project guide for Claude

Generic, shareable pub golf app. It's the successor to Peckham Pub Golf (`~/Desktop/Projects/pub-golf/index.html`). The owner (Andras) hands it to friends who run their own round. The admin page is the only place where the course (venues, drinks, activities), rules and penalties can be changed.

## Layout
- `index.html` players, `admin.html` organiser (PIN), `board.html` TV. Plain HTML/CSS/JS, no build step.
- `assets/core.js` holds the presets, `LocalStore`, scoring (`PG.holeScore`, `PG.leaderboard`) and the shared score sheet. `assets/style.css` holds the shared styles.
- `PLAN.md` is the full plan and backend design. `README.md` is the organiser guide.

## Rules
- Pages only call `PG.store.*` (async, admin methods take the PIN first). Keep that contract so the planned Supabase adapter can drop in.
- Backend is **parked** at the owner's request (2026-10-10). When it starts, use a **new** Supabase project. Never use `elasiuqzlnranvprsagx` (old Peckham) or the DMC World Tour project.
- Main page must stay blank while the status is `draft`. No course details leak before Live.
- No sample/Peckham course template (owner said no). The demo data (`?demo=1`) uses made-up pubs.
- Soft options always score the same par. Drinking more never earns anything.
- Never type, ask for or store the owner's real admin PIN.
- Netlify publishes `dist/` only.

## Test
`python -m http.server 8765 --bind 127.0.0.1`, then `/?demo=reset`, `/admin.html?demo=1`, `/board.html?demo=1`.
