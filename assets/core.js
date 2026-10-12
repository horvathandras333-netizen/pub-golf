/* Pub Golf core: presets, data store, scoring and the shared score sheet.
   Pages talk only to PG.store. Every store method is async and admin methods
   take the PIN first, mirroring the planned Supabase RPCs, so a Supabase
   adapter can replace LocalStore later without touching the pages. */
(function () {
'use strict';
const PG = (window.PG = {});

/* ---------- presets: starting choices, editable per game in admin ---------- */
PG.DEFAULT_DRINKS = [
  ['Pint of lager', 4], ['Pint of IPA', 4], ['Pint of ale / bitter', 4], ['Pint of Guinness', 5],
  ['Pint of cider', 4], ['Half pint (any)', 2], ['Bottle of beer', 3], ['Can of Red Stripe', 3],
  ['Glass of wine (175 ml)', 3], ['Glass of prosecco', 2], ['Gin & tonic', 3], ['Vodka & mixer', 3],
  ['Rum & cola', 3], ['Whisky & ginger', 3], ['Double spirit & mixer', 3], ['Any cocktail', 3],
  ['Aperol spritz', 3], ['House shot + a half', 4], ['Single shot', 1], ['Baby Guinness', 1],
  ['Alcohol-free pint', 4], ['Soft drink (pint glass)', 4], ['Glass of water', 2]
].map(([name, par]) => ({ name, par }));

PG.DEFAULT_SOFTS = ['Alcohol-free beer', 'Lime & soda', 'Lemonade', 'Cola', 'Ginger beer',
  'Orange juice', 'Mocktail', 'Sparkling water', 'Water'];

PG.DEFAULT_ACTIVITIES = [
  'Introduce yourself to a stranger and learn one fact about them.',
  'Give the group a 30-second tour-guide spiel about where you are standing.',
  'Speak only in a posh accent until the next pub.',
  'Tell the group a joke. If nobody laughs, tell another.',
  'Deliver a 20-second TED talk on a topic the group picks.',
  'Earn three genuine smiles from three different strangers.',
  'Do an impression of someone in the group. They guess who.',
  'Make up a 4-line rhyme about the round and perform it.',
  'Give an awards-show speech thanking the group for the round.',
  'Order your next drink in a foreign accent.',
  'Pay the bar staff a specific, genuine compliment.',
  'Sing the chorus of a song the group picks.',
  'Speak only in questions until the next pub.',
  'Teach the group a word in another language.',
  'Hum a song. The group gets three guesses.',
  'Keep a straight face for 30 seconds while the group tries to crack you.',
  'Name 10 countries in 20 seconds.',
  'Draw the pub sign from memory on a napkin.',
  'Swap a hat, scarf or jacket with a teammate until the next pub.',
  'Tell the group your most embarrassing moment.',
  'Ask a stranger for their favourite pub nearby and why.',
  'Talk like a pirate until the next pub.',
  'Get the whole group into a photo pulling the same face.',
  'Balance a beer mat on your head for 10 seconds.',
  'Do your best sports commentary of the next person ordering.',
  'Find someone in the pub who shares your birthday month.',
  'Recite the alphabet backwards from M.',
  'Hold a plank for 20 seconds.',
  'Narrate the group like a nature documentary for 30 seconds.',
  'Every sentence must rhyme until your drink arrives.'
];

PG.DEFAULT_PENALTIES = [
  ['Spilling your drink', 1], ['Drinking with your nominated "putting" hand', 1],
  ['A loo break mid-hole', 1], ['Saying "drink", "drunk" or "pub"', 3]
].map(([label, strokes], i) => ({ id: 'p' + (i + 1), label, strokes }));

PG.DEFAULT_RULES = {
  how: [
    'Par is the number of gulps to finish the drink. Count yours and enter it.',
    'Lowest total wins. Scores sync live to everyone’s phone.',
    'Every hole has a soft option at the same par. It scores exactly the same.',
    'Some holes have an activity: a forfeit you can do instead of drinking (scores par), a bonus (−1) or a must-do.'
  ],
  etiquette: [
    'One drink per hole, no playing ahead.',
    'Soft and zero-alcohol drinks count. Pace yourself.',
    'Water between holes is free and advised.',
    'Tip the bar staff hosting your course.'
  ]
};

PG.MODES = { none: 'No activity', forfeit: 'Forfeit: do it instead, score par', bonus: 'Bonus: do it for −1', required: 'Must-do: skip it for +strokes' };
PG.MODE_TAG = { forfeit: 'Forfeit', bonus: 'Bonus −1', required: 'Must-do' };
const MAX_HOLES = 18, MAX_PLAYERS = 60;

/* ---------- helpers ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 12);
const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const err = code => new Error(code);
const hhmm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : '';
PG.uid = uid;
PG.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
PG.fmtPar = n => n === 0 ? 'E' : n > 0 ? '+' + n : '−' + Math.abs(n);
PG.parClass = n => n < 0 ? 'under' : n > 0 ? 'over' : 'level';
PG.mapUrl = h => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([h.venue, h.address].filter(Boolean).join(', '));
PG.fmtDate = d => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };

const ERRORS = {
  bad_pin: 'Wrong PIN.', no_pin: 'No admin PIN set yet.', pin_set: 'A PIN is already set.',
  weak_pin: 'PIN must be 6 to 12 digits.', not_live: 'The round is not live.', no_player: 'Player not found. Join again.',
  no_hole: 'Hole not found.', hole_locked: 'This hole is locked by the organiser.', not_yet: 'No playing ahead. Wait for the organiser to open this hole.',
  name_required: 'Enter a name.', name_taken: 'That name is taken.', max_players: 'The game is full.',
  max_holes: 'Maximum ' + MAX_HOLES + ' holes.', no_holes: 'Add at least one hole first.', venue_required: 'Each hole needs a venue name.',
  no_forfeit: 'This hole has no forfeit.', bad_file: 'That file is not a Pub Golf course export.'
};
PG.errText = e => ERRORS[e && e.message] || (e && e.message) || 'Something went wrong.';

/* ---------- state ---------- */
function fresh() {
  return {
    v: 1,
    game: {
      name: 'Pub Golf', date: '', status: 'draft', current: null,
      settings: { dnf: 2, noAhead: false, lastOrders: '', promo: { on: false, title: 'Spent It Right', artist: 'H4NDR3X', url: 'https://open.spotify.com/track/57lPAvbtgTxVUJHFEC2Ipm' } },
      rules: clone(PG.DEFAULT_RULES),
      penalties: clone(PG.DEFAULT_PENALTIES),
      presets: { drinks: clone(PG.DEFAULT_DRINKS), softs: PG.DEFAULT_SOFTS.slice(), activities: PG.DEFAULT_ACTIVITIES.slice() }
    },
    holes: [], players: [], scores: {}, feed: [], auth: null
  };
}

function cleanHole(h, id) {
  const activity = str(h.activity, 200);
  return {
    id, venue: str(h.venue, 60), address: str(h.address, 120), arrive: hhmm(h.arrive), notes: str(h.notes, 200),
    drink: str(h.drink, 80), soft: str(h.soft, 80), par: clamp(int(h.par, 4), 1, 10),
    activity, mode: activity && PG.MODES[h.mode] ? h.mode : 'none',
    strokes: clamp(int(h.strokes, 1), 1, 5), locked: !!h.locked
  };
}

function cleanEntry(e, hole, game) {
  const result = ['played', 'forfeit', 'dnf'].includes(e.result) ? e.result : 'played';
  if (result === 'forfeit' && hole.mode !== 'forfeit') throw err('no_forfeit');
  const pens = {};
  for (const p of game.penalties) { const n = clamp(int(e.pens && e.pens[p.id], 0), 0, 9); if (n) pens[p.id] = n; }
  return {
    result, gulps: result === 'played' ? clamp(int(e.gulps, 1), 1, 30) : 0,
    bonus: hole.mode === 'bonus' && result === 'played' && !!e.bonus,
    skipped: hole.mode === 'required' && !!e.skipped, pens, at: Date.now()
  };
}

/* ---------- scoring ---------- */
function penStrokes(e, game) {
  let s = 0, n = 0;
  for (const p of game.penalties) { const c = (e.pens && e.pens[p.id]) || 0; s += c * p.strokes; n += c; }
  return { s, n };
}
PG.holeScore = (h, e, game) => {
  if (!e) return null;
  const pen = penStrokes(e, game).s;
  let v = e.result === 'forfeit' ? h.par : e.result === 'dnf' ? h.par + game.settings.dnf : e.gulps;
  /* check the hole's current rule: admin may change it after scores are in */
  if (e.bonus && h.mode === 'bonus') v -= 1;
  if (e.skipped && h.mode === 'required') v += h.strokes;
  return Math.max(0, v + pen);
};
PG.leaderboard = st => {
  const rows = st.players.map(p => {
    const sc = st.scores[p.id] || {};
    let total = 0, par = 0, thru = 0, pens = 0;
    const cells = st.holes.map(h => {
      const e = sc[h.id], v = PG.holeScore(h, e, st.game);
      if (v != null) { total += v; par += h.par; thru++; pens += penStrokes(e, st.game).n; }
      return { v, e };
    });
    return { p, total, toPar: total - par, thru, pens, cells };
  });
  rows.sort((a, b) => (!a.thru - !b.thru) || a.toPar - b.toPar || a.pens - b.pens || b.thru - a.thru || a.p.name.localeCompare(b.p.name));
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.pos = prev && prev.thru && r.thru && prev.toPar === r.toPar && prev.pens === r.pens ? prev.pos : i + 1;
  });
  rows.forEach(r => { r.tie = rows.filter(x => x.pos === r.pos && x.thru).length > 1; });
  return rows;
};
PG.coursePar = st => st.holes.reduce((a, h) => a + h.par, 0);
PG.holeIndex = (st, id) => st.holes.findIndex(h => h.id === id);
/* Why a hole can't be scored by a player right now, or '' if it can. */
PG.blockReason = (st, h) => {
  if (st.game.status !== 'live') return 'not_live';
  if (h.locked) return 'hole_locked';
  if (st.game.settings.noAhead) {
    const ci = PG.holeIndex(st, st.game.current);
    if (ci < 0 || PG.holeIndex(st, h.id) > ci) return 'not_yet';
  }
  return '';
};
PG.exportCourse = st => ({
  kind: 'pub-golf-course', v: 1, name: st.game.name,
  holes: st.holes.map(({ id, locked, ...h }) => h),
  rules: st.game.rules, penalties: st.game.penalties, presets: st.game.presets, settings: { dnf: st.game.settings.dnf }
});
PG.resultsCsv = st => {
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const head = ['Pos', 'Player', ...st.holes.map((h, i) => 'H' + (i + 1)), 'Total', 'ToPar', 'Thru', 'Penalties'];
  const lines = PG.leaderboard(st).map(r => [r.thru ? (r.tie ? 'T' : '') + r.pos : '', r.p.name,
    ...r.cells.map(c => c.e ? (c.e.result === 'forfeit' ? 'F' : c.e.result === 'dnf' ? 'DNF' : '') + (c.e.result === 'played' ? c.v : '(' + c.v + ')') : ''),
    r.thru ? r.total : '', r.thru ? PG.fmtPar(r.toPar) : '', r.thru, r.pens]);
  return [head, ...lines].map(l => l.map(q).join(',')).join('\r\n');
};
PG.download = (name, text, type) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
};

/* ---------- PIN hashing (local mode only; the backend will use bcrypt) ---------- */
async function hash(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261; for (const c of data) { h ^= c; h = Math.imul(h, 16777619); }
  return 'f' + (h >>> 0).toString(16);
}
const validPin = p => { if (!/^\d{6,12}$/.test(String(p || ''))) throw err('weak_pin'); };

/* ---------- LocalStore: localStorage, synced across tabs on one device ---------- */
function LocalStore(key) {
  let s = read(), subs = [];
  function read() {
    try { const x = JSON.parse(localStorage.getItem(key)); if (x && x.v === 1) return Object.assign(fresh(), x); } catch (e) {}
    return fresh();
  }
  const view = () => { const v = clone(s); v.hasPin = !!s.auth; delete v.auth; return v; };
  const emit = () => { const v = view(); subs.forEach(f => f(v)); };
  function commit() {
    s.feed = s.feed.slice(-100);
    try { localStorage.setItem(key, JSON.stringify(s)); } catch (e) { throw err('Could not save on this device (storage full or blocked).'); }
    emit();
  }
  window.addEventListener('storage', e => { if (e.key === key) { s = read(); emit(); } });
  const feed = (kind, body) => s.feed.push({ id: uid(), kind, body, at: Date.now() });
  async function guard(pin) {
    if (!s.auth) throw err('no_pin');
    if (await hash(String(pin || ''), s.auth.salt) !== s.auth.hash) { await sleep(800); throw err('bad_pin'); }
  }
  /* Re-read before every write so two tabs never overwrite each other's changes. */
  async function adm(pin, fn) { s = read(); await guard(pin); const r = fn(s); commit(); return r; }
  const hole = id => { const h = s.holes.find(x => x.id === id); if (!h) throw err('no_hole'); return h; };
  const player = id => { const p = s.players.find(x => x.id === id); if (!p) throw err('no_player'); return p; };
  const strList = (a, max, n) => (Array.isArray(a) ? a : []).map(x => str(x, max)).filter(Boolean).slice(0, n);

  return {
    mode: 'local', key,
    async get() { s = read(); return view(); },
    subscribe(fn) { subs.push(fn); return () => { subs = subs.filter(f => f !== fn); }; },

    /* ----- player ----- */
    async join(name, claim) {
      s = read(); name = str(name, 24);
      if (!name) throw err('name_required');
      if (s.game.status !== 'live') throw err('not_live');
      const ex = s.players.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (ex) { if (claim) return ex; throw err('name_taken'); }
      if (s.players.length >= MAX_PLAYERS) throw err('max_players');
      const p = { id: uid(), name, joined: Date.now() };
      s.players.push(p); commit(); return p;
    },
    async submit(pid, hid, entry) {
      s = read(); player(pid); const h = hole(hid);
      const why = PG.blockReason(s, h); if (why) throw err(why);
      const sc = s.scores[pid] || (s.scores[pid] = {});
      if (entry) sc[hid] = cleanEntry(entry, h, s.game); else delete sc[hid];
      commit(); return true;
    },

    /* ----- admin ----- */
    async initPin(pin) {
      s = read(); if (s.auth) throw err('pin_set'); validPin(pin);
      const salt = uid(); s.auth = { salt, hash: await hash(pin, salt) }; commit(); return true;
    },
    async checkPin(pin) { s = read(); await guard(pin); return true; },
    async setPin(pin, np) {
      validPin(np); s = read(); await guard(pin);
      const salt = uid(); s.auth = { salt, hash: await hash(np, salt) }; commit(); return true;
    },
    updateGame: (pin, patch) => adm(pin, s => {
      const g = s.game, st = g.settings;
      if ('name' in patch) g.name = str(patch.name, 40) || 'Pub Golf';
      if ('date' in patch) g.date = /^\d{4}-\d{2}-\d{2}$/.test(patch.date) ? patch.date : '';
      const ps = patch.settings || {};
      if ('dnf' in ps) st.dnf = clamp(int(ps.dnf, 2), 0, 5);
      if ('noAhead' in ps) st.noAhead = !!ps.noAhead;
      if ('lastOrders' in ps) st.lastOrders = hhmm(ps.lastOrders);
      if (ps.promo) {
        const pr = ps.promo;
        st.promo = { on: !!pr.on, title: str(pr.title, 60), artist: str(pr.artist, 60), url: /^https:\/\//.test(pr.url || '') ? str(pr.url, 300) : '' };
      }
      if (patch.rules) g.rules = { how: strList(patch.rules.how, 200, 12), etiquette: strList(patch.rules.etiquette, 200, 12) };
      if (patch.penalties) g.penalties = patch.penalties.map(p => ({ id: str(p.id, 12) || uid(), label: str(p.label, 80), strokes: clamp(int(p.strokes, 1), 1, 5) })).filter(p => p.label).slice(0, 10);
      if (patch.presets) {
        const pr = patch.presets;
        if (pr.drinks) g.presets.drinks = pr.drinks.map(d => ({ name: str(d.name, 80), par: clamp(int(d.par, 4), 1, 10) })).filter(d => d.name).slice(0, 60);
        if (pr.softs) g.presets.softs = strList(pr.softs, 80, 40);
        if (pr.activities) g.presets.activities = strList(pr.activities, 200, 80);
      }
      return clone(g);
    }),
    saveHole: (pin, h) => adm(pin, s => {
      const i = s.holes.findIndex(x => x.id === h.id);
      if (!str(h.venue, 60)) throw err('venue_required');
      if (i < 0 && s.holes.length >= MAX_HOLES) throw err('max_holes');
      const c = cleanHole(h, i < 0 ? uid() : h.id);
      if (i < 0) s.holes.push(c); else { c.locked = s.holes[i].locked; s.holes[i] = c; }
      return clone(c);
    }),
    deleteHole: (pin, id) => adm(pin, s => {
      hole(id); s.holes = s.holes.filter(h => h.id !== id);
      Object.values(s.scores).forEach(sc => delete sc[id]);
      if (s.game.current === id) s.game.current = null;
      return true;
    }),
    moveHole: (pin, id, dir) => adm(pin, s => {
      const i = PG.holeIndex(s, id), j = i + (dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= s.holes.length) return false;
      [s.holes[i], s.holes[j]] = [s.holes[j], s.holes[i]]; return true;
    }),
    setStatus: (pin, status) => adm(pin, s => {
      if (!['draft', 'live', 'finished'].includes(status)) return false;
      if (status === 'live' && !s.holes.length) throw err('no_holes');
      if (status === 'live' && !s.game.current) s.game.current = s.holes[0].id;
      s.game.status = status; feed('status', status); return true;
    }),
    setCurrent: (pin, id) => adm(pin, s => { if (id) hole(id); s.game.current = id || null; return true; }),
    lockHole: (pin, id, locked) => adm(pin, s => { hole(id).locked = !!locked; return true; }),
    editScore: (pin, pid, hid, entry) => adm(pin, s => {
      const p = player(pid), h = hole(hid), sc = s.scores[pid] || (s.scores[pid] = {});
      if (entry) sc[hid] = cleanEntry(entry, h, s.game); else delete sc[hid];
      feed('edit', 'Score edited: ' + p.name + ', hole ' + (PG.holeIndex(s, hid) + 1)); return true;
    }),
    renamePlayer: (pin, pid, name) => adm(pin, s => {
      name = str(name, 24); if (!name) throw err('name_required');
      if (s.players.some(p => p.id !== pid && p.name.toLowerCase() === name.toLowerCase())) throw err('name_taken');
      player(pid).name = name; return true;
    }),
    removePlayer: (pin, pid) => adm(pin, s => { player(pid); s.players = s.players.filter(p => p.id !== pid); delete s.scores[pid]; return true; }),
    broadcast: (pin, msg) => adm(pin, s => { msg = str(msg, 200); feed(msg ? 'broadcast' : 'clear', msg); return true; }),
    resetScores: pin => adm(pin, s => { s.scores = {}; s.feed = []; return true; }),
    wipePlayers: pin => adm(pin, s => { s.players = []; s.scores = {}; s.feed = []; return true; }),
    importCourse: (pin, c) => adm(pin, s => {
      if (!c || c.kind !== 'pub-golf-course' || !Array.isArray(c.holes)) throw err('bad_file');
      s.holes = c.holes.slice(0, MAX_HOLES).map(h => cleanHole(h, uid())).filter(h => h.venue);
      s.scores = {}; s.game.current = null; s.game.status = 'draft';
      if (c.name) s.game.name = str(c.name, 40);
      return s.holes.length;
    }).then(async n => {
      /* rules, penalties and choice lists go through the same validation as manual edits */
      await this_.updateGame(pin, { rules: c.rules || undefined, penalties: c.penalties || undefined, presets: c.presets || undefined, settings: c.settings || {} });
      return n;
    }),
    factoryReset: pin => adm(pin, s => { Object.assign(s, fresh()); return true; })
  };
}

/* ---------- demo data (?demo=1, ?demo=reset) ---------- */
function demoState() {
  const s = fresh();
  s.game.name = 'Demo Open'; s.game.status = 'live';
  s.game.date = new Date().toLocaleDateString('en-CA');
  const H = [
    ['The Red Lion', '1 High Street', 'Pint of lager', 'Alcohol-free beer', 4, 0, 'forfeit'],
    ['The Crown', '22 Market Square', 'Pint of Guinness', 'Lime & soda', 5, 2, 'bonus'],
    ['The Fox & Hounds', '7 Mill Lane', 'Gin & tonic', 'Ginger beer', 3, 3, 'forfeit'],
    ['The Railway Tavern', 'Station Road', 'Pint of cider', 'Lemonade', 4, 4, 'required'],
    ['The Kings Arms', '40 Church Street', 'Any cocktail', 'Mocktail', 3, 6, 'forfeit'],
    ['The Rose & Crown', '3 Green Lane', 'House shot + a half', 'Cola', 4, 8, 'bonus']
  ];
  s.holes = H.map(([venue, address, drink, soft, par, a, mode], i) =>
    cleanHole({ venue, address, drink, soft, par, activity: PG.DEFAULT_ACTIVITIES[a], mode, strokes: 2, arrive: (19 + Math.floor(i / 2)) + ':' + (i % 2 ? '30' : '00') }, 'h' + (i + 1)));
  s.game.current = 'h4';
  /* 'F' only on forfeit-mode holes (1, 3, 5) */
  const P = { Sam: [3, 4, 'F'], Priya: [5, 6, 2], Jordan: ['F', 5, 3], Alex: [2, 4], Charlie: [] };
  Object.entries(P).forEach(([name, sc], i) => {
    const id = 'd' + i; s.players.push({ id, name, joined: Date.now() }); s.scores[id] = {};
    sc.forEach((v, j) => {
      const h = s.holes[j];
      s.scores[id][h.id] = cleanEntry(v === 'F' ? { result: 'forfeit' } : { result: 'played', gulps: v, pens: i === 1 && j === 0 ? { p1: 1 } : {} }, h, s.game);
    });
  });
  s.feed.push({ id: 'f1', kind: 'broadcast', body: 'Welcome to the Demo Open! Head to The Railway Tavern for hole 4.', at: Date.now() });
  return s;
}

/* ---------- boot ---------- */
const q = new URLSearchParams(location.search);
PG.demo = q.has('demo');
const KEY = PG.demo ? 'pubgolf:demo' : 'pubgolf:v1';
try { if (PG.demo && (q.get('demo') === 'reset' || !localStorage.getItem(KEY))) localStorage.setItem(KEY, JSON.stringify(demoState())); } catch (e) { console.error('demo seed failed', e); }
const this_ = PG.store = LocalStore(KEY);
PG.me = {
  get() { try { return localStorage.getItem(KEY + ':me'); } catch (e) { return null; } },
  set(id) { try { id ? localStorage.setItem(KEY + ':me', id) : localStorage.removeItem(KEY + ':me'); } catch (e) {} }
};

/* ---------- shared UI ---------- */
PG.toast = msg => {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
};
PG.liveStrip = () => {
  let l = document.getElementById('live');
  if (!l) { l = document.createElement('div'); l.id = 'live'; document.body.appendChild(l); }
  l.dataset.s = 'local';
  l.innerHTML = '<i></i>' + (PG.demo ? 'Demo mode · fake data on this device' : 'Local mode · syncs between tabs on this device only');
};
PG.latestBroadcast = st => { const f = st.feed.filter(x => x.kind === 'broadcast' || x.kind === 'clear').pop(); return f && f.kind === 'broadcast' ? f : null; };
PG.promoHtml = st => {
  const p = st.game.settings.promo;
  if (!p || !p.on || !p.url) return '';
  return '<a class="promo" href="' + PG.esc(p.url) + '" target="_blank" rel="noopener"><span class="promo-ic" aria-hidden="true">♫</span>' +
    '<span class="promo-mid"><span class="promo-eb">Now playing · since you’re here</span><b>' + PG.esc(p.title) + '</b><span>' + PG.esc(p.artist) + ' · on Spotify</span></span><span class="promo-go">Play ▶</span></a>';
};

/* Score sheet: bottom-sheet editor used by players (own card) and admin (any cell). */
PG.sheet = ({ st, hole, entry, who, onSave, onClear }) => {
  const g = st.game, no = PG.holeIndex(st, hole.id) + 1;
  const e = entry ? clone(entry) : { result: 'played', gulps: hole.par, pens: {}, bonus: false, skipped: false };
  e.pens = e.pens || {};
  const ov = document.createElement('div');
  ov.className = 'sheet-ov';
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t"></div>';
  const box = ov.firstChild;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = ev => { if (ev.key === 'Escape') close(); };
  function draw() {
    const v = PG.holeScore(hole, e, g), diff = v - hole.par;
    const seg = (k, label) => '<button type="button" data-r="' + k + '" class="' + (e.result === k ? 'on' : '') + '">' + label + '</button>';
    box.innerHTML =
      '<div class="sheet-hd"><div><div class="eyebrow">Hole ' + no + (who ? ' · ' + PG.esc(who) : '') + '</div><h2 id="sh-t">' + PG.esc(hole.venue) + '</h2>' +
      '<div class="sheet-sub">' + PG.esc(hole.drink || 'Any drink') + (hole.soft ? ' · or ' + PG.esc(hole.soft) : '') + ' · <b>Par ' + hole.par + '</b></div></div>' +
      '<button type="button" class="x" data-a="close" aria-label="Close">✕</button></div>' +
      '<div class="seg">' + seg('played', 'Drank it') + (hole.mode === 'forfeit' ? seg('forfeit', 'Did forfeit') : '') + seg('dnf', 'Didn’t finish') + '</div>' +
      (e.result === 'played' ? '<div class="stepper"><button type="button" data-a="g-" aria-label="One fewer gulp">−</button><div><b>' + e.gulps + '</b><span>gulps</span></div><button type="button" data-a="g+" aria-label="One more gulp">+</button></div>' : '') +
      (e.result === 'forfeit' ? '<p class="sheet-note"><b>Forfeit:</b> ' + PG.esc(hole.activity) + '<br>Scores par.</p>' : '') +
      (e.result === 'dnf' ? '<p class="sheet-note">Didn’t finish scores par + ' + g.settings.dnf + '.</p>' : '') +
      (hole.mode === 'bonus' && e.result === 'played' ? '<label class="tick"><input type="checkbox" data-a="bonus"' + (e.bonus ? ' checked' : '') + '> Did the bonus (−1): ' + PG.esc(hole.activity) + '</label>' : '') +
      (hole.mode === 'required' ? '<label class="tick"><input type="checkbox" data-a="skip"' + (e.skipped ? ' checked' : '') + '> Skipped the must-do (+' + hole.strokes + '): ' + PG.esc(hole.activity) + '</label>' : '') +
      (g.penalties.length ? '<div class="eyebrow dark">Penalties</div><div class="pens">' + g.penalties.map(p => {
        const c = e.pens[p.id] || 0;
        return '<div class="pen-row' + (c ? ' on' : '') + '"><span class="pen-l">' + PG.esc(p.label) + ' <em>+' + p.strokes + '</em></span>' +
          '<span class="pen-c"><button type="button" data-p="' + p.id + '" data-d="-1" aria-label="Remove one">−</button><b>' + c + '</b><button type="button" data-p="' + p.id + '" data-d="1" aria-label="Add one">+</button></span></div>';
      }).join('') + '</div>' : '') +
      '<div class="sheet-ft"><div class="sheet-tot">Hole score <b>' + v + '</b><span class="' + PG.parClass(diff) + '">' + PG.fmtPar(diff) + '</span></div>' +
      '<div class="sheet-btns">' + (entry ? '<button type="button" class="btn ghost" data-a="clear">Clear</button>' : '') + '<button type="button" class="btn" data-a="save">Save</button></div></div>';
  }
  box.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.r) { e.result = b.dataset.r; if (e.result === 'played' && !e.gulps) e.gulps = hole.par; draw(); return; }
    if (b.dataset.p) { e.pens[b.dataset.p] = clamp((e.pens[b.dataset.p] || 0) + +b.dataset.d, 0, 9); draw(); return; }
    const a = b.dataset.a;
    if (a === 'close') return close();
    if (a === 'g-' || a === 'g+') { e.gulps = clamp((e.gulps || 1) + (a === 'g+' ? 1 : -1), 1, 30); draw(); return; }
    if (a === 'save' || a === 'clear') {
      b.disabled = true;
      try { await (a === 'save' ? onSave(e) : onClear()); close(); }
      catch (x) { PG.toast(PG.errText(x)); b.disabled = false; }
    }
  });
  box.addEventListener('change', ev => {
    if (ev.target.dataset.a === 'bonus') e.bonus = ev.target.checked;
    if (ev.target.dataset.a === 'skip') e.skipped = ev.target.checked;
    draw();
  });
  ov.addEventListener('click', ev => { if (ev.target === ov) close(); });
  document.addEventListener('keydown', onKey);
  draw(); document.body.appendChild(ov);
  const first = box.querySelector('.seg button.on'); first && first.focus();
};
})();
