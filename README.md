# Pub Golf

A pub golf scorecard for any town. The organiser sets the venues, drinks and activities from a PIN-protected admin page. Players join on their phones and score each hole. Scores roll up into a live leaderboard, and there's a TV board for the pub.

| Page | Who uses it |
|---|---|
| `/` | Players. The page stays blank until the organiser sets the round to **Live**. |
| `/admin` | Organiser (PIN): course, live control, score fixes, settings, tools |
| `/board` | TV or laptop: leaderboard, current hole, join QR |

## Organiser quick start
1. Open `/admin` and choose a PIN (6 to 12 digits). Only the first visitor can set it.
2. **Course**: add each pub. For every hole, pick a drink, a soft option and an activity from the lists, or choose *Custom…* to type your own. Then set the par and the activity rule:
   - **Forfeit**: do the activity instead of drinking and score par.
   - **Bonus**: do the activity for −1.
   - **Must-do**: skipping it adds strokes.
3. **Settings**: game name and date, penalties, rules text, the drink and activity choice lists, and an optional promo card.
4. **Live**: set the round to Live and share the player link, or put `/board` on a screen for the QR code. Use *Next hole* as the group moves, *Lock* to close a hole, and *Message everyone* for a banner on every phone.
5. **Scores**: tap any cell to fix a score. **Tools**: export or import a course file, download a results CSV, change the PIN, reset.

## Scoring
- A hole's score is gulps + penalties. A forfeit scores par. Didn't finish scores par + 2 (you can change this).
- Bonus takes off 1 and a skipped must-do adds its strokes.
- Lowest to-par wins. A tie goes to fewer penalties, then it's shared (T2).
- Soft options score the same as the main drink.

## Current limitation: local mode
There's no backend yet. Data lives in the browser's `localStorage` and syncs only between tabs on the **same device**. That's fine for trying the app out, but not for a real round with several phones. Live multi-phone sync needs the Supabase backend (see `PLAN.md` §6). `assets/core.js` exposes one async store API, so a Supabase adapter can replace `LocalStore` without changing the pages.

## Run locally
```bash
python -m http.server 8765 --bind 127.0.0.1
```
Then open http://127.0.0.1:8765/. Add `?demo=1` to any page to load fake data, or `?demo=reset` to start the demo again. Demo data is stored separately from real data.

## Deploy
Netlify publishes `dist/` only (see `netlify.toml`). No build tools are needed beyond `cp`.
