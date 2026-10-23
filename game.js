'use strict';
/* =====================================================================
   DUCK DUCK GOOSE: MAFIA EDITION  --  CORE
   Everything hangs off the global `Game` object. Add features by filling in
   the stub modules (chores, combat, meeting, ui) -- never edit the movement,
   map, camera or roles modules to do it.

   HOW MODULES CONNECT
   - Each module:  Game.modules.name = { init(), update(dt), draw(ctx,cam), onEvent(type,data) }
   - Game.order.update / world / screen list which modules run and in what order.
   - layer 'world' modules draw in world pixels (camera applied).
     layer 'screen' modules draw in canvas pixels (HUD, overlays).
   - Event bus:  Game.emit(type,data)  /  Game.on(type,fn)
       reserved events: bodyReported, meetingStart, meetingEnd, playerKilled, choreDone, gameOver
       also fired by core: gameStart, gameReady, phaseChange, keydown, keyup, menuReturn
   - Hooks (arrays of functions): Game.hooks.preUpdate/postUpdate/preDraw/postDraw/canMove
       canMove functions get the player and return false to block walking (mini-games etc).
   - Phases: "menu" | "playing" | "meeting" | "gameover"  (Game.setPhase)
   - A module that throws is auto-disabled (non-core only) so walking never breaks.
   ===================================================================== */

// ===== CONSTANTS =====
const TS = 16, MAP_W = 240, MAP_H = 180;
const T = { GRASS:0, PATH:1, WATER:2, TREE:3, WALL:4, ROOF:5, FLOOR:6, SAND:7, SWAMP:8, SWAMPWATER:9, ROCK:10,
            MOUNTAIN:11, COBBLE:12, FIRE:13, DOOR:14, BRIDGE:15, CROP:16, FENCE:17, CACTUS:18, APPLE:19, DEAD:20, PALM:21 };
const T_COUNT = 22;
const SOLID = new Uint8Array(T_COUNT);
[T.WATER,T.TREE,T.WALL,T.ROOF,T.SWAMPWATER,T.ROCK,T.FIRE,T.FENCE,T.CACTUS,T.APPLE,T.DEAD,T.PALM].forEach(t => SOLID[t] = 1);
const ANIMATED = new Uint8Array(T_COUNT);
[T.WATER,T.SWAMPWATER,T.FIRE].forEach(t => ANIMATED[t] = 1);
const CLEARABLE = new Uint8Array(T_COUNT);
[T.TREE,T.ROCK,T.CACTUS,T.APPLE,T.DEAD,T.PALM].forEach(t => CLEARABLE[t] = 1);

// ===== UTILITIES =====
const rand = n => Math.floor(Math.random() * n);
const pick = a => a[rand(a.length)];
function shuffle(a){ for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y){ let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
function shade(hex, a){ const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v + a)));
  return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }

// ===== CORE: Game object, event bus, hooks =====
const Game = {
  config: {
    tile: TS, mapW: MAP_W, mapH: MAP_H, scale: 3, seed: 1337,
    minPlayers: 5, maxPlayers: 16,
    playerSpeed: 58, botSpeed: 46,                    // pixels per second (world pixels)
    geeseFor(n){ return Math.min(3, n >= 9 ? 3 : 2); }, // 5-8 players -> 2 Geese, 9-16 -> 3. Never more than 3.
    doctors: 1, detectives: 1,
    // settings reserved for the modules you add later (kept here so there is ONE config object)
    chores:  { perPlayer: 3 },
    combat:  { peckCooldown: 25, peckRange: 20 },
    meeting: { discussionTime: 50, votingTime: 25, emergencyBells: 1, cooldown: 20,
               floorVoteWeight: 1.5, anonymousVotes: true, revealExactRole: false },
    names: ['Mia','Sam','Poppy','Ollie','Juniper','Hazel','Basil','Clover','Wren','Fern','Rowan','Willow','Maple','Sage',
            'Briar','Thistle','Pippin','Marigold','Tansy','Hawthorn','Bramble','Elm','Daisy','Finch','Moss','Linden',
            'Rue','Hollis','Tilly','Barley','Olive','Cedar','Juno','Penny','Rye','Ginger','Biscuit','Cricket','Nettle','Posy']
  },
  state: {
    phase: 'menu', time: 0, paused: false, players: [], me: null, map: null, showMap: false, startTime: 0,
    cam: { x: 0, y: 0, w: 640, h: 360, shakeT: 0, shakeAmp: 0 },
    stats: { pecks: 0, meetings: 0, chores: 0 }
  },
  modules: {},
  hooks: { preUpdate: [], postUpdate: [], preDraw: [], postDraw: [], canMove: [] },
  order: {
    update: ['input','map','sprites','roles','movement','ai','camera','ambient','minimap','hud','menu','chores','combat','meeting','ui'],
    world:  ['map','chores','combat','movement'],
    screen: ['ambient','minimap','hud','ui','meeting']
  }
};
const _listeners = {};
Game.on = function(type, fn){ if (!_listeners[type]) _listeners[type] = []; _listeners[type].push(fn);
  return () => { _listeners[type] = _listeners[type].filter(f => f !== fn); }; };
function _fail(name, mod, err){ console.error('[module ' + name + ']', err);
  if (!mod.core) { mod.disabled = true; console.warn('Module "' + name + '" disabled after an error; movement is unaffected.'); } }
Game.emit = function(type, data){
  for (const name of Object.keys(Game.modules)) { const m = Game.modules[name];
    if (m && !m.disabled && m.onEvent) { try { m.onEvent(type, data); } catch (e) { _fail(name, m, e); } } }
  const ls = _listeners[type]; if (ls) for (const fn of ls.slice()) { try { fn(data); } catch (e) { console.error(e); } }
};
Game.setPhase = function(p){ const from = Game.state.phase; Game.state.phase = p; Game.emit('phaseChange', { from, to: p }); };
Game.canRun = function(){ return Game.state.phase === 'playing' && !Game.state.paused; };
Game.shake = function(amp, dur){ const c = Game.state.cam; c.shakeAmp = amp; c.shakeT = dur; };
Game.toggleMap = function(){ const S = Game.state; if (S.phase === 'playing' && !S.paused) S.showMap = !S.showMap; };
function runHooks(name, arg){ for (const f of Game.hooks[name]) { try { f(arg); } catch (e) { console.error(e); } } }

// ===== MODULE: map (generation + tile art + drawing) =====
const REGIONS = [
  { id:'orchard',  name:'Orchard & Meadow',  x0:0,   y0:0,   x1:80,  y1:60,  roadX:40,  base:T.GRASS },
  { id:'forest',   name:'Forest',            x0:80,  y0:0,   x1:160, y1:60,  roadX:120, base:T.GRASS },
  { id:'mountain', name:'Mountain & Mines',  x0:160, y0:0,   x1:240, y1:60,  roadX:200, base:T.MOUNTAIN },
  { id:'farm',     name:'Farmlands',         x0:0,   y0:60,  x1:80,  y1:120, roadX:40,  base:T.GRASS },
  { id:'town',     name:'Town Center',       x0:80,  y0:60,  x1:160, y1:120, roadX:120, base:T.GRASS },
  { id:'desert',   name:'Desert',            x0:160, y0:60,  x1:240, y1:180, roadX:200, base:T.SAND },
  { id:'swamp',    name:'Swamp',             x0:0,   y0:120, x1:80,  y1:180, roadX:40,  base:T.SWAMP },
  { id:'lake',     name:'Lake & Beach',      x0:80,  y0:120, x1:160, y1:180, roadX:120, base:T.GRASS }
];
// [name, region, x, y, w, h]  -- bottom wall has the door; connector path runs along the row below it to the region road.
const BUILDINGS = [
  ['General Store','town',88,74,8,7], ['Saloon','town',100,74,8,7], ['Library','town',133,74,8,7],
  ['Clock Tower','town',101,100,5,7], ['Town Hall','town',134,100,9,7],
  ['Farmhouse','farm',10,74,8,7], ['Barn','farm',24,74,9,7], ['Coop','farm',48,74,6,7], ['Windmill','farm',60,74,6,7],
  ['Greenhouse','farm',10,100,8,7],
  ['Old Cabin','forest',95,40,7,6], ["Hunter's Camp",'forest',136,30,6,6],
  ['Mine Entrance','mountain',183,20,7,6], ['Blacksmith','mountain',172,44,8,7], ['Observatory','mountain',210,44,7,7],
  ['Abandoned Caravan','desert',172,130,7,6], ['Sand Pyramid','desert',212,145,9,7],
  ["Witch's Hut",'swamp',10,140,7,6], ['Fog Cave','swamp',55,140,7,6],
  ['Lighthouse','lake',84,121,5,7], ['Beach Shack','lake',102,122,6,6], ['Boathouse','lake',140,122,7,6]
];
// [name, region, x, y, trailToRoad]
const POIS = [
  ['Campfire Circle','town',120,85,false],
  ['Crop Fields','farm',61,106,false], ['Scarecrow Hill','farm',70,66,true],
  ['Mushroom Grove','forest',100,15,true], ['Hollow Log','forest',140,12,true], ['Giant Oak','forest',104,28,true],
  ['Waterfall','mountain',224,24,true],
  ['Oasis','desert',178,100,true], ['Cactus Maze','desert',220,117,true],
  ['Rickety Boardwalk','swamp',56,160,false],
  ['Fishing Docks','lake',136,146,false], ['Tide Pools','lake',83,155,false],
  ['Beehives','orchard',65,15,true], ['Picnic Hill','orchard',15,45,true], ['Stone Bridge','orchard',40,29,false]
];

function generateMap(seed){
  const W = MAP_W, H = MAP_H, tiles = new Uint8Array(W * H), rnd = mulberry32(seed);
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x, y, t) => { if (inb(x, y)) tiles[y * W + x] = t; };
  const get = (x, y) => inb(x, y) ? tiles[y * W + x] : T.TREE;
  const each = (r, fn) => { for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) fn(x, y); };
  const ell = (cx, cy, rx, ry, fn) => { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1) fn(x, y); } };
  const REG = {}; REGIONS.forEach(r => REG[r.id] = r);
  const inRegion = (r, x, y) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;

  // 1. base ground per region
  REGIONS.forEach(r => each(r, (x, y) => set(x, y, r.base)));

  // 2. region features
  each(REG.orchard, (x, y) => { if (x % 4 === 1 && y % 4 === 1 && rnd() < 0.85) set(x, y, T.APPLE); });
  for (let y = 28; y <= 30; y++) for (let x = 0; x < 80; x++) set(x, y, T.WATER);            // river
  each(REG.forest, (x, y) => { if (rnd() < 0.32) set(x, y, T.TREE); });
  each(REG.mountain, (x, y) => { if (rnd() < 0.16) set(x, y, T.ROCK); });
  for (let y = 2; y <= 13; y++) { for (let x = 222; x <= 226; x++) set(x, y, T.WATER);       // waterfall + pool
    set(220, y, T.ROCK); set(221, y, T.ROCK); set(227, y, T.ROCK); set(228, y, T.ROCK); }
  ell(224, 16, 6, 4, (x, y) => set(x, y, T.WATER));
  each(REG.farm, (x, y) => { if (rnd() < 0.03) set(x, y, T.TREE); });
  for (let y = 98; y <= 114; y++) for (let x = 46; x <= 76; x++) set(x, y, T.CROP);          // crop field
  for (let x = 46; x <= 76; x++) { if (x < 59 || x > 62) { set(x, 97, T.FENCE); set(x, 115, T.FENCE); } }
  each(REG.town, (x, y) => { if (rnd() < 0.015) set(x, y, T.TREE); });
  each(REG.desert, (x, y) => { if (rnd() < 0.022) set(x, y, T.CACTUS); });
  for (let y = 108; y <= 126; y++) for (let x = 208; x <= 232; x++) if (rnd() < 0.30) set(x, y, T.CACTUS); // cactus maze
  ell(178, 108, 7, 5, (x, y) => set(x, y, T.WATER));                                         // oasis
  for (let a = 0; a < 6.28; a += 0.45) { const px = Math.round(178 + Math.cos(a) * 9.5), py = Math.round(108 + Math.sin(a) * 7.5);
    if (get(px, py) === T.SAND) set(px, py, T.PALM); }
  each(REG.swamp, (x, y) => { if (rnd() < 0.05) set(x, y, T.DEAD); });
  for (let i = 0; i < 45; i++) { const cx = rnd() * 80, cy = 120 + rnd() * 60, rr = 2 + rnd() * 3;
    ell(cx, cy, rr, rr * 0.7, (x, y) => { if (inRegion(REG.swamp, x, y) && get(x, y) === T.SWAMP) set(x, y, T.SWAMPWATER); }); }
  for (let y = 158; y <= 163; y++) for (let x = 44; x <= 72; x++) set(x, y, T.SWAMPWATER);   // boardwalk pond
  each(REG.lake, (x, y) => { if (rnd() < 0.03) set(x, y, T.TREE); });
  each(REG.lake, (x, y) => { const dx = (x - 120) / 40, dy = (y - 155) / 25; if (dx * dx + dy * dy <= 1) set(x, y, T.SAND); });
  each(REG.lake, (x, y) => { const dx = (x - 120) / 34, dy = (y - 155) / 20; if (dx * dx + dy * dy <= 1) set(x, y, T.WATER); });
  each(REG.lake, (x, y) => { if (get(x, y) === T.SAND && rnd() < 0.02) set(x, y, T.PALM); });
  for (let y = 146; y <= 147; y++) for (let x = 122; x <= 138; x++) set(x, y, T.BRIDGE);     // fishing pier into the lake
  for (let y = 160; y <= 161; y++) for (let x = 42; x <= 70; x++) set(x, y, T.BRIDGE);       // swamp boardwalk

  // 3. impassable border
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) set(x, y, T.TREE);

  // helpers that never destroy buildings; carving over water makes a bridge
  const NOCARVE = new Set([T.WALL, T.ROOF, T.FLOOR, T.DOOR]);
  const carve = (x, y) => { if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) return; const c = get(x, y);
    if (NOCARVE.has(c) || c === T.BRIDGE) return; set(x, y, (c === T.WATER || c === T.SWAMPWATER) ? T.BRIDGE : T.PATH); };
  const carveRow = (y, xa, xb) => { for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) carve(x, y); };

  // 4. main roads: three vertical avenues + one horizontal avenue (each 3 tiles wide)
  for (const rx of [40, 120, 200]) for (let y = 2; y <= H - 3; y++) for (let x = rx - 1; x <= rx + 1; x++) carve(x, y);
  for (let y = 89; y <= 91; y++) for (let x = 2; x <= W - 3; x++) carve(x, y);

  // 5. buildings (hollow rooms you can walk into) + connector paths
  const buildings = [];
  for (const [name, rid, bx, by, bw, bh] of BUILDINGS) {
    const r = REG[rid];
    for (let y = by - 1; y <= by + bh; y++) for (let x = bx - 1; x <= bx + bw; x++) if (CLEARABLE[get(x, y)]) set(x, y, r.base);
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      if (y <= by + 1) set(x, y, T.ROOF);
      else if (y === by + bh - 1 || x === bx || x === bx + bw - 1) set(x, y, T.WALL);
      else set(x, y, T.FLOOR);
    }
    const dx = bx + (bw >> 1), dy = by + bh - 1; set(dx, dy, T.DOOR);
    carveRow(by + bh, dx, r.roadX);
    buildings.push({ name, region: rid, x: bx, y: by, w: bw, h: bh, door: { x: dx, y: dy }, out: { x: dx, y: by + bh } });
  }

  // 6. landmarks (signposts) with trails
  const pois = [];
  for (const [name, rid, px, py, trail] of POIS) {
    const r = REG[rid];
    for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) if (CLEARABLE[get(x, y)]) set(x, y, r.base);
    if (trail) carveRow(py, px, r.roadX);
    pois.push({ name, region: rid, x: px, y: py });
  }

  // 7. Campfire Circle plaza at the very center
  const cf = { x: 120, y: 90 };
  for (let y = cf.y - 7; y <= cf.y + 7; y++) for (let x = cf.x - 7; x <= cf.x + 7; x++)
    if ((x - cf.x) ** 2 + (y - cf.y) ** 2 <= 49 && !NOCARVE.has(get(x, y))) set(x, y, T.COBBLE);
  set(cf.x, cf.y, T.FIRE);

  // 8. flood fill from the plaza so bots only ever target tiles that can actually be reached
  const reach = new Uint8Array(W * H), q = new Int32Array(W * H); let qh = 0, qt = 0;
  const s0 = (cf.y + 4) * W + cf.x; reach[s0] = 1; q[qt++] = s0;
  while (qh < qt) { const id = q[qh++], x = id % W, y = (id / W) | 0;
    for (const [ax, ay] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + ax, ny = y + ay;
      if (!inb(nx, ny)) continue; const ni = ny * W + nx; if (reach[ni] || SOLID[tiles[ni]]) continue; reach[ni] = 1; q[qt++] = ni; } }

  const hubs = [], unreachable = [];
  const addHub = (name, x, y) => { if (reach[y * W + x]) hubs.push({ name, x, y }); else unreachable.push(name); };
  buildings.forEach(b => addHub(b.name, b.out.x, b.out.y));
  pois.forEach(p => addHub(p.name, p.x, p.y));
  for (let a = 0; a < 6.28; a += 0.8) addHub('Campfire', Math.round(cf.x + Math.cos(a) * 5), Math.round(cf.y + Math.sin(a) * 5));

  return { tiles, W, H, buildings, pois, hubs, reach, unreachable, campfire: cf, regions: REGIONS };
}

function paintTile(c, t, v, rng){
  const R = (col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const grass = () => { R('#5da948', 0, 0, 16, 16);
    for (let i = 0; i < 12; i++) R(rng() < .5 ? '#69b653' : '#4f9a3e', (rng() * 16) | 0, (rng() * 16) | 0, 1, 1 + ((rng() * 2) | 0)); };
  const sand = () => { R('#e8d28f', 0, 0, 16, 16);
    for (let i = 0; i < 14; i++) R(rng() < .5 ? '#d6bd78' : '#f3e3a8', (rng() * 16) | 0, (rng() * 16) | 0, 1, 1); };
  const mountain = () => { R('#a4aab3', 0, 0, 16, 16);
    for (let i = 0; i < 12; i++) R(rng() < .5 ? '#8e949e' : '#b9bfc8', (rng() * 16) | 0, (rng() * 16) | 0, 1, 1); };
  const swamp = () => { R('#4d6a3b', 0, 0, 16, 16);
    for (let i = 0; i < 4; i++) R('#3d5530', (rng() * 13) | 0, (rng() * 14) | 0, 3, 2);
    for (let i = 0; i < 6; i++) R('#6c7f3f', (rng() * 16) | 0, (rng() * 16) | 0, 1, 1); };
  const cobble = vv => { R('#7a756c', 0, 0, 16, 16);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) R((r + k + vv) % 3 === 0 ? '#b0aba0' : '#9d988d', k * 5 - (r % 2 ? 2 : 0) + 1, r * 4, 4, 3); };
  const wall = vv => { R('#8c5a2f', 0, 0, 16, 16); R('#a8723d', 0, 0, 16, 1);
    R('#6a4222', 0, 5, 16, 1); R('#6a4222', 0, 10, 16, 1); R('#6a4222', 0, 15, 16, 1);
    R('#6a4222', (vv * 5 + 3) % 14 + 1, 0, 1, 5); R('#6a4222', (vv * 3 + 9) % 14 + 1, 6, 1, 4); };
  const tree = (pal, apples) => { grass();
    const P = [['#2f7d32','#4aa84a','#215c25'],['#d2761f','#eb9a3c','#a35812'],['#b5412a','#d65e44','#862e1d'],['#d9b032','#efce57','#aa8820']][pal];
    R(P[0], 3, 0, 10, 2); R(P[0], 1, 2, 14, 8); R(P[0], 3, 10, 10, 2); R(P[1], 4, 1, 5, 2); R(P[1], 2, 4, 4, 3);
    R(P[2], 8, 8, 6, 3); R(P[2], 4, 10, 8, 2); R('#6b4424', 6, 12, 4, 4); R('#4e3018', 9, 12, 1, 4);
    if (apples) [[4,4],[10,3],[7,7],[11,8],[3,8]].forEach(([x, y]) => R('#d83a3a', x, y, 2, 2)); };
  switch (t) {
    case T.GRASS: grass();
      if (v === 3) { const col = ['#f5e663','#f2f2f2','#f08fb3','#b58cf0'][(rng() * 4) | 0], x = 3 + ((rng() * 9) | 0), y = 3 + ((rng() * 9) | 0);
        R('#3f8a35', x, y + 2, 1, 3); R(col, x - 1, y, 3, 2); R('#e8c23a', x, y, 1, 1); }
      if (v === 2) { const x = 3 + ((rng() * 9) | 0), y = 4 + ((rng() * 8) | 0); R('#3f8a35', x, y, 1, 3); R('#3f8a35', x + 2, y + 1, 1, 2); R('#4f9a3e', x + 1, y - 1, 1, 3); }
      break;
    case T.PATH: R('#c8a56b', 0, 0, 16, 16);
      for (let i = 0; i < 10; i++) R(rng() < .5 ? '#b38d55' : '#dcc08c', (rng() * 16) | 0, (rng() * 16) | 0, 1, 1);
      if (v & 1) R('#9c7c4c', (rng() * 13) | 0, (rng() * 14) | 0, 2, 1); break;
    case T.WATER: R('#3f90d8', 0, 0, 16, 16);
      for (let k = 0; k < 4; k++) { const x = (k * 6 + v * 4) % 12; R('#7cc4f2', x, k * 4 + 1, 4, 1); R('#2f78c0', (x + 6) % 12, k * 4 + 3, 3, 1); } break;
    case T.TREE: tree([0, 0, 1, 3][v], false); break;
    case T.WALL: wall(v); break;
    case T.ROOF: R(['#b4473b','#a63e34','#b84f42','#9c3a30'][v], 0, 0, 16, 16);
      for (let r = 0; r < 4; r++) { R('#7e2a22', 0, r * 4 + 3, 16, 1); R('#7e2a22', r % 2 ? 4 : 10, r * 4, 1, 3); }
      R('#d2685a', 0, 0, 16, 1); break;
    case T.FLOOR: R('#c89558', 0, 0, 16, 16); R('#a87a42', 0, 0, 16, 1); R('#a87a42', 0, 8, 16, 1);
      R('#a87a42', v * 3 + 2, 0, 1, 8); R('#a87a42', (v * 5 + 9) % 16, 8, 1, 8); break;
    case T.SAND: sand(); if (v === 3) R('#b8a066', (rng() * 12) | 0, (rng() * 12) | 0, 2, 1); break;
    case T.SWAMP: swamp(); if (v === 3) { const x = (rng() * 12) | 0; R('#8aa04a', x, 4, 1, 5); R('#8aa04a', x + 2, 6, 1, 4); } break;
    case T.SWAMPWATER: R('#2c5a4b', 0, 0, 16, 16); R('#5f8f3c', (v * 5 + 3) % 12, 3, 3, 2); R('#3d7a5a', (v * 3 + 8) % 12, 10, 4, 1);
      R('#8fc0a0', (v * 7 + 2) % 14, 7, 1, 1); break;
    case T.ROCK: mountain(); R('#6f7480', 2, 4, 12, 10); R('#8a909c', 3, 4, 10, 3); R('#555a66', 2, 12, 12, 2); R('#9fa5b0', 4, 5, 4, 2); break;
    case T.MOUNTAIN: mountain(); if (v === 3) { R('#f0f4f8', 3, 4, 8, 5); R('#d4dce6', 3, 8, 8, 1); } break;
    case T.COBBLE: cobble(v); break;
    case T.FIRE: cobble(0); R('#5a3a1e', 3, 11, 10, 3); R('#7a5230', 3, 11, 10, 1);
      { const h = 5 + (v % 2) * 2; R('#e8632b', 5, 11 - h, 6, h); R('#f5a623', 6, 12 - h, 4, h - 1); R('#ffe066', 7, 13 - h, 2, h - 3); } break;
    case T.DOOR: wall(v); R('#2d1a0c', 3, 1, 10, 15); R('#5a3a1e', 4, 2, 8, 14); R('#e8c34a', 10, 9, 1, 2); break;
    case T.BRIDGE: R('#b78a52', 0, 0, 16, 16); for (let k = 0; k < 4; k++) R('#8a6232', 0, k * 4 + 3, 16, 1);
      R('#6b4a22', 1, 1, 1, 1); R('#6b4a22', 14, 1, 1, 1); R('#6b4a22', 1, 9, 1, 1); R('#6b4a22', 14, 9, 1, 1); break;
    case T.CROP: R('#7a5230', 0, 0, 16, 16); R('#5e3c20', 0, 4, 16, 1); R('#5e3c20', 0, 10, 16, 1);
      for (let k = 0; k < 4; k++) { const col = v < 2 ? '#4fae3a' : v === 2 ? '#e8892b' : '#e0c050'; R(col, k * 4 + 1, 2 + (k % 2) * 6, 2, 3); } break;
    case T.FENCE: grass(); R('#9a6a3a', 1, 5, 3, 10); R('#9a6a3a', 12, 5, 3, 10); R('#b07c45', 0, 6, 16, 2); R('#b07c45', 0, 11, 16, 2); R('#6a4222', 0, 8, 16, 1); break;
    case T.CACTUS: sand(); R('#3f9b4a', 6, 3, 4, 12); R('#3f9b4a', 2, 7, 4, 2); R('#3f9b4a', 2, 5, 2, 4); R('#3f9b4a', 10, 8, 4, 2); R('#3f9b4a', 12, 6, 2, 4);
      R('#63c06a', 7, 3, 1, 12); R('#e8f0c0', 6, 6, 1, 1); R('#e8f0c0', 9, 10, 1, 1); break;
    case T.APPLE: tree(0, true); break;
    case T.DEAD: swamp(); R('#4a3a2a', 7, 4, 2, 12); R('#4a3a2a', 4, 6, 3, 1); R('#4a3a2a', 9, 8, 4, 1); R('#4a3a2a', 3, 4, 1, 3); R('#4a3a2a', 12, 6, 1, 3); break;
    case T.PALM: sand(); R('#9a7040', 7, 6, 2, 10); R('#3fa055', 1, 2, 14, 2); R('#3fa055', 3, 0, 10, 2); R('#3fa055', 0, 4, 5, 2); R('#3fa055', 11, 4, 5, 2); R('#2d7a40', 5, 4, 6, 1); break;
  }
}
function buildAtlas(){
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 16 * T_COUNT; const c = cv.getContext('2d');
  for (let t = 0; t < T_COUNT; t++) for (let v = 0; v < 4; v++) {
    c.save(); c.translate(v * 16, t * 16); c.beginPath(); c.rect(0, 0, 16, 16); c.clip();
    paintTile(c, t, v, mulberry32(t * 131 + v * 17 + 5)); c.restore();
  }
  return cv;
}
function tileVariant(t, x, y){
  const h = (hash2(x, y) >>> 5) % 16;
  if (t === T.GRASS) return h === 0 ? 3 : h < 3 ? 2 : h & 1;
  if (t === T.MOUNTAIN) return h < 2 ? 3 : h & 1;
  return h & 3;
}

Game.makeMap = generateMap;
Game.T = T; Game.SOLID = SOLID;
Game.modules.map = {
  core: true, atlas: null,
  init(){ Game.state.map = generateMap(Game.config.seed); this.atlas = buildAtlas(); },
  update(dt){ Game.state.time += dt; },
  draw(ctx, cam){
    const map = Game.state.map, tiles = map.tiles, W = map.W, atlas = this.atlas;
    const x0 = Math.max(0, Math.floor(cam.x / TS)), y0 = Math.max(0, Math.floor(cam.y / TS));
    const x1 = Math.min(W - 1, Math.floor((cam.x + cam.w) / TS) + 1), y1 = Math.min(map.H - 1, Math.floor((cam.y + cam.h) / TS) + 1);
    const frame = (Game.state.time * 4 | 0) & 3;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const t = tiles[ty * W + tx]; const v = ANIMATED[t] ? frame : tileVariant(t, tx, ty);
      ctx.drawImage(atlas, v * 16, t * 16, 16, 16, tx * TS, ty * TS, 16, 16);
    }
    // signposts for landmarks
    for (const p of map.pois) { const px = p.x * TS + 8, py = p.y * TS + 14;
      if (px < cam.x - 20 || px > cam.x + cam.w + 20 || py < cam.y - 20 || py > cam.y + cam.h + 20) continue;
      ctx.fillStyle = '#4a2c14'; ctx.fillRect(px - 1, py - 9, 3, 9); ctx.fillRect(px - 6, py - 14, 12, 7);
      ctx.fillStyle = '#d9a55f'; ctx.fillRect(px - 5, py - 13, 10, 5); ctx.fillStyle = '#7a5230'; ctx.fillRect(px - 3, py - 11, 6, 1); }
    // labels
    ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = '#2a1a0c'; ctx.fillStyle = '#fff4d0';
    const label = (txt, x, y) => { if (x < cam.x - 80 || x > cam.x + cam.w + 80 || y < cam.y - 20 || y > cam.y + cam.h + 20) return;
      ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y); };
    for (const b of map.buildings) label(b.name, (b.x + b.w / 2) * TS, b.y * TS - 3);
    for (const p of map.pois) label(p.name, p.x * TS + 8, p.y * TS - 6);
  }
};

// ===== MODULE: sprites (randomized pixel characters) =====
const SKINS = ['#f6d5b8','#eec39a','#d9a577','#b87b4f','#8a5a3a','#5e3b25'];
const HAIRS = ['#2b1b12','#5a3a22','#8a5a2b','#c9953c','#e8d27a','#b5402b','#d9d9d9','#3a4aa8','#8a3ab8','#2e8a5a'];
const SHIRTS = ['#c94a3b','#3b7fc9','#4aa84a','#e0b13a','#8a4ab8','#e07a9b','#2f8f8f','#e8e8e8','#d2761f','#3a3f55','#a0522d','#6bb554'];
const PANTS = ['#3a4a7a','#5a4632','#2f3a2f','#6a3a3a','#4a4a55','#7a6a4a','#2a2a38','#8a7a62'];
const SHOES = ['#3b2410','#222222','#7a4a22','#9a2f2f','#e8e0d0'];
const ACCENTS = ['#c94a3b','#3b7fc9','#e0b13a','#e07a9b','#4aa84a','#8a4ab8'];

function randomLook(used){
  let L, tries = 0;
  do { L = { skin: pick(SKINS), hairStyle: rand(6), hair: pick(HAIRS), shirtStyle: rand(3), shirt: pick(SHIRTS), pants: pick(PANTS),
             acc: rand(6), accent: pick(ACCENTS), shoes: pick(SHOES) };
       L.sig = [L.skin, L.hairStyle, L.hair, L.shirtStyle, L.shirt, L.pants, L.acc, L.accent, L.shoes].join('|'); }
  while (used && used.has(L.sig) && tries++ < 500);
  return L;
}
// Draws one 16x24 frame. dir: 0 down, 1 left, 2 right, 3 up.  step: 0..3 walk cycle.  squish: idle breathing frame.
function drawChar(c, L, dir, step, squish){
  const R = (col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const bob = (step === 1 || step === 3) ? 1 : 0, hy = (squish ? 1 : 0) - bob;
  const ht = 5 + hy, tt = 13 + hy, FEET = 24, LEG = 19;
  const side = (dir === 1 || dir === 2), back = (dir === 3), front = (dir === 0), skin = L.skin;
  const leg = (x, lift, col, shoe, toe) => { const fb = FEET - (lift ? 1 : 0); R(col, x, LEG, 4, fb - 2 - LEG); R(shoe, x, fb - 2, 4, 2);
    if (toe) R(shoe, toe < 0 ? x - 1 : x + 4, fb - 1, 1, 1); };
  if (!side) { leg(4, step === 1, L.pants, L.shoes, 0); leg(8, step === 3, L.pants, L.shoes, 0); }
  else { const off = step === 1 ? -2 : step === 3 ? 2 : 0, toe = dir === 1 ? -1 : 1;
    leg(6 + off, step === 3, shade(L.pants, -30), shade(L.shoes, -25), toe); leg(6 - off, step === 1, L.pants, L.shoes, toe); }
  // torso + arms
  const tw = side ? 6 : 8, tx = side ? 5 : 4, th = LEG - tt, sleeve = shade(L.shirt, -25);
  R(L.shirt, tx, tt, tw, th);
  if (L.shirtStyle === 1) for (let r = 1; r < th; r += 2) R(shade(L.shirt, 40), tx, tt + r, tw, 1);
  if (L.shirtStyle === 2) { R(L.pants, tx + 1, tt + 2, tw - 2, th - 2); R(L.pants, tx + 1, tt, 1, 2); R(L.pants, tx + tw - 2, tt, 1, 2); }
  if (!side) { R(sleeve, 3, tt + 1, 1, th - 2); R(sleeve, 12, tt + 1, 1, th - 2); R(skin, 3, tt + th - 2, 1, 2); R(skin, 12, tt + th - 2, 1, 2); }
  else { const ax = 7 + (step === 1 ? -1 : step === 3 ? 1 : 0); R(sleeve, ax, tt + 1, 2, th - 3); R(skin, ax, tt + th - 3, 2, 2); }
  // head
  R(skin, 4, ht, 8, 8);
  // hair
  const hc = L.hair, s = L.hairStyle;
  if (back) {
    if (s === 3) R(hc, 4, ht - 1, 8, 4); else if (s === 1 || s === 5) R(hc, 3, ht - 1, 10, s === 1 ? 11 : 9); else R(hc, 4, ht - 1, 8, 9);
  } else {
    if (s === 3) R(hc, 4, ht, 8, 2); else R(hc, 4, ht - 1, 8, 3);
    if (front) {
      if (s === 0) { R(hc, 4, ht + 2, 1, 2); R(hc, 11, ht + 2, 1, 2); }
      if (s === 1) { R(hc, 3, ht, 1, 8); R(hc, 12, ht, 1, 8); R(hc, 4, ht + 2, 1, 2); R(hc, 11, ht + 2, 1, 2); }
      if (s === 5) { R(hc, 3, ht + 1, 2, 7); R(hc, 11, ht + 1, 2, 7); }
    } else {
      const bx = dir === 1 ? 8 : 4;
      if (s !== 3) R(hc, bx, ht + 2, 4, s === 1 ? 9 : s === 5 ? 8 : 5);
      R(hc, dir === 1 ? 4 : 11, ht + 2, 1, 1);
    }
  }
  if (s === 2) { R(hc, 4, ht - 2, 2, 1); R(hc, 7, ht - 3, 2, 2); R(hc, 10, ht - 2, 2, 1); }
  if (s === 4) { if (back || front) R(hc, 6, ht - 3, 4, 3); else R(hc, dir === 1 ? 9 : 4, ht - 3, 3, 3); }
  // face
  if (front) { R('#222', 5, ht + 4, 1, 2); R('#222', 10, ht + 4, 1, 2); R(shade(skin, -40), 7, ht + 6, 2, 1); }
  else if (side) R('#222', dir === 1 ? 5 : 10, ht + 4, 1, 2);
  // accessories
  const ac = L.accent;
  switch (L.acc) {
    case 1: R('#e3c66f', 2, ht - 1, 12, 2); R('#e3c66f', 4, ht - 4, 8, 3); R('#a8452f', 4, ht - 2, 8, 1); break;
    case 2: R(ac, 4, ht - 2, 8, 3);
      if (front) R(shade(ac, -40), 4, ht + 1, 8, 1); else if (dir === 1) R(shade(ac, -40), 2, ht + 1, 4, 1); else if (dir === 2) R(shade(ac, -40), 10, ht + 1, 4, 1); break;
    case 3: { const bx = side ? (dir === 1 ? 10 : 3) : 9; R(ac, bx, ht - 1, 3, 3); R(shade(ac, -50), bx + 1, ht, 1, 1); } break;
    case 4: if (front) { for (const gx of [4, 8]) { R('#222', gx, ht + 3, 4, 1); R('#222', gx, ht + 5, 4, 1); R('#222', gx, ht + 3, 1, 3); R('#222', gx + 3, ht + 3, 1, 3); } }
      else if (side) { const gx = dir === 1 ? 4 : 8; R('#222', gx, ht + 3, 4, 1); R('#222', gx, ht + 5, 4, 1); R('#222', gx, ht + 3, 1, 3); R('#222', gx + 3, ht + 3, 1, 3); } break;
    case 5: R(ac, side ? 5 : 4, tt - 1, side ? 6 : 8, 2); if (!side) R(ac, 9, tt + 1, 2, 4); break;
  }
}
function makeSheet(L){   // 5 columns (4 walk + 1 breathing) x 4 directions, each cell 16x24
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 80; cv.height = 96; const c = cv.getContext('2d');
  for (let d = 0; d < 4; d++) for (let col = 0; col < 5; col++) { c.save(); c.translate(col * 16, d * 24);
    drawChar(c, L, d, col < 4 ? col : 0, col === 4); c.restore(); }
  return cv;
}
function pickName(taken){
  const pool = Game.config.names.filter(n => !taken.has(n.toLowerCase()));
  const n = pool.length ? pick(pool) : 'Villager' + (taken.size + 1);
  taken.add(n.toLowerCase()); return n;
}
function makePlayer(id, name, look, isHuman){
  const C = Game.config;
  return { id, name, look, sheet: makeSheet(look), x: 0, y: 0, dir: 0, moving: false, animT: 0, role: null,
    alive: true, ghost: false, noclip: false, isHuman,
    speed: isHuman ? C.playerSpeed : C.botSpeed + rand(11) - 4,
    ai: isHuman ? null : { state: 'idle', wait: Math.random() * 2, path: null, pi: 0, stuck: 0 } };
}
Game.drawChar = drawChar;
Game.modules.sprites = {
  core: true, randomLook, makeSheet,
  createPlayers(count, name, look){
    const taken = new Set([name.toLowerCase()]), used = new Set([look.sig]);
    const players = [makePlayer(0, name, look, true)];
    for (let i = 1; i < count; i++) { const L = randomLook(used); used.add(L.sig); players.push(makePlayer(i, pickName(taken), L, false)); }
    return players;
  }
};

// ===== MODULE: roles =====
const ROLE_INFO = {
  goose:     { name: 'GOOSE',     color: '#d94b3b', icon: '\uD83E\uDDA2', text: 'You are the mafia. Secretly eliminate the villagers without getting caught.' },
  doctor:    { name: 'DOCTOR',    color: '#3bb0d9', icon: '\uD83E\uDE7A', text: 'Each round you can shield one villager from a peck.' },
  detective: { name: 'DETECTIVE', color: '#e0b13a', icon: '\uD83D\uDD0D', text: 'Each round you can investigate one villager to learn if they are a Goose.' },
  villager:  { name: 'VILLAGER',  color: '#5fb04a', icon: '\uD83C\uDF3E', text: 'Do your chores and work out who the Geese are.' }
};
Game.ROLE_INFO = ROLE_INFO;
Game.modules.roles = {
  core: true,
  assign(players){
    const C = Game.config, n = players.length, g = C.geeseFor(n), order = shuffle(players.slice()); let i = 0;
    for (let k = 0; k < g; k++) order[i++].role = 'goose';
    for (let k = 0; k < C.doctors; k++) order[i++].role = 'doctor';
    for (let k = 0; k < C.detectives; k++) order[i++].role = 'detective';
    while (i < n) order[i++].role = 'villager';
    Game.emit('rolesAssigned', { players });
  }
};

// ===== MODULE: movement (collision + player walking + drawing characters) =====
function solidPx(px, py){
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return SOLID[Game.state.map.tiles[ty * MAP_W + tx]] === 1;
}
// feet box is 8 wide x 6 tall, with (x,y) at the bottom centre of the character
Game.isBlocked = function(x, y, e){
  if (e && e.noclip) return x - 4 < 0 || x + 4 > MAP_W * TS || y - 6 < 0 || y > MAP_H * TS;
  return solidPx(x - 4, y - 6) || solidPx(x + 3.99, y - 6) || solidPx(x - 4, y - 0.01) || solidPx(x + 3.99, y - 0.01);
};
Game.moveEntity = function(e, vx, vy, dt, speed){
  const dx = vx * speed * dt, dy = vy * speed * dt; let moved = 0;
  if (dx !== 0 && !Game.isBlocked(e.x + dx, e.y, e)) { e.x += dx; moved += Math.abs(dx); }
  if (dy !== 0 && !Game.isBlocked(e.x, e.y + dy, e)) { e.y += dy; moved += Math.abs(dy); }
  if (moved > 0) { if (Math.abs(vx) > Math.abs(vy)) e.dir = vx < 0 ? 1 : 2; else e.dir = vy < 0 ? 3 : 0; }
  return moved;
};
Game.animate = function(e, moved, dt){
  if (moved > 0.01) { e.moving = true; e.animT += dt * 10; } else { e.moving = false; e.animT = 0; }
};
Game.modules.movement = {
  core: true,
  update(dt){
    const me = Game.state.me; if (!me) return;
    if (Game.canRun() && Game.hooks.canMove.every(f => f(me) !== false)) {
      const v = Game.modules.input.vector(); let m = 0;
      if (v.x || v.y) { const len = Math.hypot(v.x, v.y); m = Game.moveEntity(me, v.x / len, v.y / len, dt, me.speed * Math.min(1, len)); }
      Game.animate(me, m, dt);
    } else Game.animate(me, 0, dt);
  },
  draw(ctx, cam){
    const S = Game.state; if (!S.players.length) return;
    const list = S.players.filter(p => p.x > cam.x - 30 && p.x < cam.x + cam.w + 30 && p.y > cam.y - 20 && p.y < cam.y + cam.h + 50)
      .sort((a, b) => a.y - b.y);
    ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = '#1a1208';
    for (const e of list) {
      const x = Math.round(e.x), y = Math.round(e.y), bobGhost = e.ghost ? Math.round(Math.sin(S.time * 3 + e.id) * 2) - 3 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x - 5, y - 2, 10, 2); ctx.fillRect(x - 4, y - 3, 8, 1); ctx.fillRect(x - 4, y, 8, 1);
      const col = e.moving ? (e.animT | 0) % 4 : (((S.time * 1.5 + e.id) | 0) % 2 ? 4 : 0);
      if (e.ghost) ctx.globalAlpha = 0.5;
      if (e.sheet) ctx.drawImage(e.sheet, col * 16, e.dir * 24, 16, 24, x - 8, y - 24 + bobGhost, 16, 24);
      ctx.globalAlpha = 1;
      const mate = S.me && S.me.role === 'goose' && e.role === 'goose' && e !== S.me;
      ctx.fillStyle = e === S.me ? '#ffe27a' : mate ? '#ff6a5a' : '#ffffff';
      ctx.strokeText(e.name, x, y - 27 + bobGhost); ctx.fillText(e.name, x, y - 27 + bobGhost);
    }
  }
};

// ===== MODULE: ai (bots wander with A* pathfinding) =====
const AS = { g: new Float32Array(MAP_W * MAP_H), from: new Int32Array(MAP_W * MAP_H),
             seen: new Uint32Array(MAP_W * MAP_H), closed: new Uint32Array(MAP_W * MAP_H), cur: 0 };
function findPath(sx, sy, tx, ty){
  const map = Game.state.map, tiles = map.tiles, W = MAP_W, H = MAP_H;
  if (tx < 0 || ty < 0 || tx >= W || ty >= H || SOLID[tiles[ty * W + tx]]) return null;
  const start = sy * W + sx, goal = ty * W + tx; if (start === goal) return [];
  const cur = ++AS.cur, ids = [], fs = [];
  const swap = (i, j) => { const a = ids[i]; ids[i] = ids[j]; ids[j] = a; const b = fs[i]; fs[i] = fs[j]; fs[j] = b; };
  const push = (id, f) => { ids.push(id); fs.push(f); let i = ids.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (fs[p] <= fs[i]) break; swap(i, p); i = p; } };
  const pop = () => { const top = ids[0], li = ids.pop(), lf = fs.pop();
    if (ids.length) { ids[0] = li; fs[0] = lf; let i = 0; const n = ids.length;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < n && fs[l] < fs[m]) m = l; if (r < n && fs[r] < fs[m]) m = r; if (m === i) break; swap(i, m); i = m; } }
    return top; };
  AS.g[start] = 0; AS.seen[start] = cur; push(start, Math.abs(sx - tx) + Math.abs(sy - ty));
  let expansions = 0; const D = [1, -1, W, -W];
  while (ids.length) {
    const id = pop(); if (AS.closed[id] === cur) continue; AS.closed[id] = cur;
    if (id === goal) { const path = []; let n = goal; while (n !== start) { path.push({ x: n % W, y: (n / W) | 0 }); n = AS.from[n]; } return path.reverse(); }
    if (++expansions > 90000) return null;
    const x = id % W, y = (id / W) | 0;
    for (let k = 0; k < 4; k++) {
      if (k === 0 && x + 1 >= W || k === 1 && x - 1 < 0 || k === 2 && y + 1 >= H || k === 3 && y - 1 < 0) continue;
      const nid = id + D[k], t = tiles[nid]; if (SOLID[t] || AS.closed[nid] === cur) continue;
      const ng = AS.g[id] + ((t === T.PATH || t === T.COBBLE || t === T.BRIDGE) ? 1 : 1.35);
      if (AS.seen[nid] !== cur || ng < AS.g[nid]) { AS.g[nid] = ng; AS.seen[nid] = cur; AS.from[nid] = id;
        push(nid, ng + Math.abs((nid % W) - tx) + Math.abs(((nid / W) | 0) - ty)); }
    }
  }
  return null;
}
Game.findPath = findPath;
Game.modules.ai = {
  queue: [],
  init(){},
  update(dt){
    if (!Game.canRun()) return;
    for (const b of Game.state.players) {
      if (b.isHuman || (!b.alive && !b.ghost)) continue;
      const a = b.ai;
      if (a.state === 'idle') { a.wait -= dt; Game.animate(b, 0, dt); if (a.wait <= 0) { a.state = 'queue'; this.queue.push(b); } }
      else if (a.state === 'walk') this.follow(b, dt);
    }
    const b = this.queue.shift(); if (b) this.plan(b);   // one A* search per frame keeps the game smooth
  },
  pickTarget(b){
    const map = Game.state.map, sx = (b.x / TS) | 0, sy = (b.y / TS) | 0;
    if (Math.random() < 0.6 && map.hubs.length) { const h = pick(map.hubs); return { x: h.x, y: h.y }; }
    for (let i = 0; i < 40; i++) { const tx = sx + rand(101) - 50, ty = sy + rand(101) - 50;
      if (tx > 1 && ty > 1 && tx < MAP_W - 2 && ty < MAP_H - 2 && map.reach[ty * MAP_W + tx] && !SOLID[map.tiles[ty * MAP_W + tx]]) return { x: tx, y: ty }; }
    return null;
  },
  plan(b){
    const a = b.ai, t = this.pickTarget(b);
    const path = t ? findPath((b.x / TS) | 0, (b.y / TS) | 0, t.x, t.y) : null;
    if (!path || !path.length) { a.state = 'idle'; a.wait = 0.3 + Math.random(); return; }
    a.path = path; a.pi = 0; a.state = 'walk'; a.stuck = 0;
  },
  follow(b, dt){
    const a = b.ai; let wp, dx = 0, dy = 0, tx = 0, ty = 0;
    while ((wp = a.path[a.pi])) { tx = wp.x * TS + 8; ty = wp.y * TS + 11; dx = tx - b.x; dy = ty - b.y; if (Math.hypot(dx, dy) < 1.5) a.pi++; else break; }
    if (!wp) { a.state = 'idle'; a.wait = 1 + Math.random() * 5; Game.animate(b, 0, dt); return; }   // arrived: hang around a bit
    const d = Math.hypot(dx, dy), m = Game.moveEntity(b, dx / d, dy / d, dt, b.speed);
    Game.animate(b, m, dt);
    if (m < b.speed * dt * 0.25) { a.stuck += dt; if (a.stuck > 0.8) { a.state = 'idle'; a.wait = 0.2; } } else a.stuck = 0;
  }
};

// ===== MODULE: camera =====
Game.modules.camera = {
  core: true,
  target(){
    const S = Game.state; if (S.me) return { x: S.me.x, y: S.me.y - 10 };
    const cf = S.map.campfire, t = S.time;   // menu: slow drift around the campfire
    return { x: cf.x * TS + 8 + Math.sin(t * 0.12) * 220, y: cf.y * TS + 8 + Math.cos(t * 0.09) * 110 };
  },
  clamp(){
    const cam = Game.state.cam, ww = MAP_W * TS, wh = MAP_H * TS;
    cam.x = cam.w >= ww ? (ww - cam.w) / 2 : Math.max(0, Math.min(ww - cam.w, cam.x));
    cam.y = cam.h >= wh ? (wh - cam.h) / 2 : Math.max(0, Math.min(wh - cam.h, cam.y));
  },
  snap(){ const cam = Game.state.cam, t = this.target(); cam.x = t.x - cam.w / 2; cam.y = t.y - cam.h / 2; this.clamp(); },
  update(dt){
    const cam = Game.state.cam, t = this.target(), k = 1 - Math.pow(0.001, dt);
    cam.x += (t.x - cam.w / 2 - cam.x) * k; cam.y += (t.y - cam.h / 2 - cam.y) * k; this.clamp();
    if (cam.shakeT > 0) cam.shakeT -= dt;
  }
};

// ===== MODULE: input (keyboard + touch joystick) =====
const MOVE_KEYS = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
Game.modules.input = {
  core: true, keys: new Set(), joy: { x: 0, y: 0 }, touch: false,
  init(){
    const self = this, $ = id => document.getElementById(id);
    this.touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.code;
      if (MOVE_KEYS.has(k)) { self.keys.add(k); e.preventDefault(); }
      else if (k === 'KeyM' && !e.repeat) Game.toggleMap();
      else if (k === 'Escape') Game.state.showMap = false;
      Game.emit('keydown', { code: k, event: e });   // later modules: Game.on('keydown', ({code}) => ...)  (E, Q, R, V ...)
    });
    addEventListener('keyup', e => { self.keys.delete(e.code); Game.emit('keyup', { code: e.code }); });
    addEventListener('blur', () => self.keys.clear());
    const joy = $('joy'), knob = $('knob'); let jid = null, cx = 0, cy = 0;
    const setJoy = e => { let dx = e.clientX - cx, dy = e.clientY - cy; const max = 45, d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      self.joy.x = dx / max; self.joy.y = dy / max; };
    joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; setJoy(e); e.preventDefault(); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === jid) setJoy(e); });
    const end = e => { if (e.pointerId === jid) { jid = null; self.joy.x = self.joy.y = 0; knob.style.transform = 'translate(-50%,-50%)'; } };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    $('mapBtn').addEventListener('click', () => Game.toggleMap());
  },
  vector(){
    let x = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    let y = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
    const jx = Math.abs(this.joy.x) > 0.15 ? this.joy.x : 0, jy = Math.abs(this.joy.y) > 0.15 ? this.joy.y : 0;
    x += jx; y += jy; const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
    return { x, y };
  },
  onEvent(type){
    if (type === 'gameStart' && this.touch) { document.getElementById('joy').classList.remove('hidden'); document.getElementById('actions').classList.remove('hidden'); }
    if (type === 'menuReturn') { document.getElementById('joy').classList.add('hidden'); document.getElementById('actions').classList.add('hidden'); this.keys.clear(); }
  }
};

// ===== MODULE: ambient (falling leaves + day/night tint) =====
Game.modules.ambient = {
  layer: 'screen', leaves: [],
  init(){ for (let i = 0; i < 22; i++) this.leaves.push({ x: Math.random(), y: Math.random(), vx: 10 + Math.random() * 20, vy: 14 + Math.random() * 18,
    c: pick(['#d2761f','#b5412a','#d9b032','#8a9a3a']), ph: Math.random() * 6 }); },
  update(dt){ for (const l of this.leaves) { l.x += l.vx * dt / 1000; l.y += l.vy * dt / 600; l.ph += dt * 2; if (l.x > 1.05) l.x = -0.05; if (l.y > 1.05) { l.y = -0.05; l.x = Math.random(); } } },
  draw(ctx){
    const w = ctx.canvas.width, h = ctx.canvas.height, t = Game.state.time;
    const day = 0.5 + 0.5 * Math.cos(t / 300 * Math.PI * 2), a = 0.38 * Math.pow(1 - day, 1.3);   // 5 minute day/night cycle
    if (a > 0.01) { ctx.fillStyle = 'rgba(25,25,85,' + a.toFixed(3) + ')'; ctx.fillRect(0, 0, w, h); }
    for (const l of this.leaves) { ctx.fillStyle = l.c; ctx.fillRect(Math.round(l.x * w + Math.sin(l.ph) * 8), Math.round(l.y * h), 6, 4); }
  }
};

// ===== MODULE: minimap (corner minimap + full map overlay with M) =====
const MINI = ['#5da948','#c8a56b','#3f90d8','#2f7d32','#8c5a2f','#b4473b','#c89558','#e8d28f','#4d6a3b','#2c5a4b','#6f7480',
              '#a4aab3','#8d887f','#e8632b','#3d2512','#b78a52','#7a5230','#9a6a3a','#3f9b4a','#4a9a40','#4a3a2a','#3fa055'];
function woodPanel(ctx, x, y, w, h){ ctx.fillStyle = '#4a2c14'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8); ctx.fillStyle = '#b07c45'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#8a5a32'; ctx.fillRect(x, y, w, h); }
Game.modules.minimap = {
  layer: 'screen', cv: null,
  init(){
    const map = Game.state.map, cv = document.createElement('canvas'); cv.width = MAP_W; cv.height = MAP_H;
    const c = cv.getContext('2d'), img = c.createImageData(MAP_W, MAP_H), d = new Uint32Array(img.data.buffer);
    const pal = MINI.map(h => { const n = parseInt(h.slice(1), 16); return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255); });
    for (let i = 0; i < map.tiles.length; i++) d[i] = pal[map.tiles[i]];
    c.putImageData(img, 0, 0); this.cv = cv;
  },
  draw(ctx, cam){
    const S = Game.state; if (S.phase === 'menu' || !S.me) return;
    const w = ctx.canvas.width, h = ctx.canvas.height, blink = ((S.time * 3) | 0) % 2;
    if (!S.showMap) {
      const mw = Math.min(180, w * 0.34), mh = mw * 0.75, mx = w - mw - 14, my = 14;
      woodPanel(ctx, mx, my, mw, mh); ctx.imageSmoothingEnabled = false; ctx.drawImage(this.cv, 0, 0, MAP_W, MAP_H, mx, my, mw, mh);
      const f = mw / MAP_W; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
      ctx.strokeRect(mx + cam.x / TS * f, my + cam.y / TS * f, cam.w / TS * f, cam.h / TS * f);
      ctx.fillStyle = blink ? '#ffe27a' : '#ff5a3a'; ctx.fillRect(mx + S.me.x / TS * f - 2, my + S.me.y / TS * f - 2, 4, 4);
    } else {
      ctx.fillStyle = 'rgba(8,6,16,.82)'; ctx.fillRect(0, 0, w, h);
      const sc = Math.min((w - 60) / MAP_W, (h - 110) / MAP_H), mw = MAP_W * sc, mh = MAP_H * sc, mx = (w - mw) / 2, my = (h - mh) / 2 + 12;
      woodPanel(ctx, mx, my, mw, mh); ctx.imageSmoothingEnabled = false; ctx.drawImage(this.cv, 0, 0, MAP_W, MAP_H, mx, my, mw, mh);
      ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#1a1208';
      ctx.font = 'bold ' + Math.max(11, Math.round(sc * 5)) + 'px monospace'; ctx.fillStyle = '#ffe9a8';
      for (const r of REGIONS) { const tx = mx + (r.x0 + r.x1) / 2 * sc, ty = my + (r.y0 + 10) * sc; ctx.strokeText(r.name.toUpperCase(), tx, ty); ctx.fillText(r.name.toUpperCase(), tx, ty); }
      ctx.font = 'bold ' + Math.max(8, Math.round(sc * 3.2)) + 'px monospace'; ctx.fillStyle = '#fff4d0'; ctx.lineWidth = 2;
      const lab = (n, x, y) => { ctx.strokeText(n, mx + x * sc, my + y * sc); ctx.fillText(n, mx + x * sc, my + y * sc); };
      Game.state.map.buildings.forEach(b => lab(b.name, b.x + b.w / 2, b.y - 1)); Game.state.map.pois.forEach(p => lab(p.name, p.x + 0.5, p.y - 1));
      ctx.fillStyle = blink ? '#ffe27a' : '#ff5a3a'; ctx.fillRect(mx + S.me.x / TS * sc - 4, my + S.me.y / TS * sc - 4, 8, 8);
      ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'; ctx.fillText('MAP  -  press M to close', w / 2, my - 14);
    }
  }
};

// ===== MODULE: hud (role badge, alive count, controls hint) =====
Game.modules.hud = {
  layer: 'screen',
  draw(ctx){
    const S = Game.state; if (S.phase === 'menu' || !S.me) return;
    const info = ROLE_INFO[S.me.role]; if (!info) return;
    const alive = S.players.filter(p => p.alive).length;
    woodPanel(ctx, 14, 14, 200, 52);
    ctx.textAlign = 'left'; ctx.font = 'bold 13px monospace'; ctx.fillStyle = '#ffe9a8'; ctx.fillText('ROLE', 24, 34);
    ctx.fillStyle = info.color; ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.strokeText(info.name, 70, 34); ctx.fillText(info.name, 70, 34);
    ctx.fillStyle = '#ffe9a8'; ctx.fillText('ALIVE ' + alive + '/' + S.players.length, 24, 56);
    const age = S.time - S.startTime, a = Math.max(0, Math.min(1, (14 - age) / 2));
    if (a > 0 && !S.paused) { ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.fillStyle = '#fff4d0'; ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 3; ctx.font = 'bold 14px monospace';
      const msg = Game.modules.input.touch ? 'Joystick: walk   M: map' : 'WASD / Arrows: walk     M: map';
      ctx.strokeText(msg, ctx.canvas.width / 2, ctx.canvas.height - 24); ctx.fillText(msg, ctx.canvas.width / 2, ctx.canvas.height - 24); ctx.globalAlpha = 1; }
  }
};

// ===== MODULE: menu (start screen + role card) =====
Game.modules.menu = {
  look: null, sheet: null,
  init(){
    const $ = id => document.getElementById(id), self = this, C = Game.config;
    const name = $('nameInput'), count = $('countInput'), out = $('countOut');
    this.newLook = () => { self.look = randomLook(); self.sheet = makeSheet(self.look);
      const c = $('preview').getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, 64, 96); c.drawImage(self.sheet, 0, 0, 16, 24, 0, 0, 64, 96); };
    const upd = () => { const n = +count.value; out.textContent = 'Players: ' + n + '  (' + C.geeseFor(n) + ' Geese)'; };
    $('rerollBtn').onclick = this.newLook; count.oninput = upd; upd(); this.newLook();
    const start = () => { const nm = (name.value || '').trim().slice(0, 12) || 'Sprout'; $('menu').classList.add('hidden'); Game.startGame(nm, +count.value, self.look); };
    $('startBtn').onclick = start; name.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
    $('card').onclick = () => $('card').classList.add('flipped');
    $('roleGo').onclick = () => { $('roleOverlay').classList.add('hidden'); Game.state.paused = false; Game.state.startTime = Game.state.time; Game.emit('gameReady'); };
  },
  showRoleCard(){
    const $ = id => document.getElementById(id), S = Game.state, me = S.me, info = ROLE_INFO[me.role];
    $('roleIcon').textContent = info.icon; $('roleName').textContent = info.name; $('roleName').style.color = info.color; $('roleText').textContent = info.text;
    $('roleMates').textContent = me.role === 'goose' ? 'Fellow Geese: ' + S.players.filter(p => p.role === 'goose' && p !== me).map(p => p.name).join(', ') : '';
    $('cardBack').style.background = '#8a5a32'; $('card').classList.remove('flipped'); $('roleGo').disabled = true; $('roleOverlay').classList.remove('hidden');
    setTimeout(() => { $('card').classList.add('flipped'); setTimeout(() => { $('roleGo').disabled = false; }, 800); }, 700);
  }
};

// ===== STUB MODULES (fill these in later; they are already called by the main loop) =====
// ---- MODULE: chores ---- station placement, mini-games, shared progress bar.  Emit Game.emit('choreDone',{player,chore}).
//      Tip: block walking during a mini-game with  Game.hooks.canMove.push(p => !miniGameOpen);
Game.modules.chores = { init(){}, update(dt){}, draw(ctx, cam){}, onEvent(type, data){} };
// ---- MODULE: combat ---- peck (Q), body markers, ghosts (set p.ghost=true; p.noclip=true), secret passages (V), report (R).
//      Emit 'playerKilled' and 'bodyReported'.  Game.shake(3,0.2) for screen shake.
Game.modules.combat = { init(){}, update(dt){}, draw(ctx, cam){}, onEvent(type, data){} };
// ---- MODULE: meeting ---- listen for 'bodyReported'; call Game.setPhase('meeting') (movement/AI freeze automatically);
//      run Duck-Duck-Goose chase, discussion, voting, ejection; then Game.setPhase('playing') and emit 'meetingEnd'.
Game.modules.meeting = { layer: 'screen', init(){}, update(dt){}, draw(ctx, cam){}, onEvent(type, data){} };
// ---- MODULE: ui ---- extra HUD (chore bar, cooldown timer, event log, action buttons). Add buttons inside #actions.
Game.modules.ui = { layer: 'screen', init(){}, update(dt){}, draw(ctx, cam){}, onEvent(type, data){} };

// ===== ROUND SETUP =====
// Pure game state (no DOM): create players, assign roles, ring them around the campfire.
Game.newRound = function(count, name, look){
  const S = Game.state, C = Game.config;
  count = Math.max(C.minPlayers, Math.min(C.maxPlayers, count | 0));
  const players = Game.modules.sprites.createPlayers(count, name, look);
  Game.modules.roles.assign(players);
  const cf = S.map.campfire;
  players.forEach((p, i) => { const ang = Math.PI / 2 + i * (Math.PI * 2 / count);
    p.x = Math.round(cf.x + Math.cos(ang) * 4.5) * TS + 8; p.y = Math.round(cf.y + Math.sin(ang) * 4.5) * TS + 11; p.dir = 0; });
  S.players = players; S.me = players[0]; S.showMap = false; S.stats = { pecks: 0, meetings: 0, chores: 0 };
  return players;
};
Game.startGame = function(name, count, look){
  const S = Game.state;
  Game.newRound(count, name, look);
  S.paused = true;                       // frozen until the role card is dismissed
  Game.modules.camera.snap();
  Game.setPhase('playing');
  Game.emit('gameStart', { players: S.players });
  Game.modules.menu.showRoleCard();
};
Game.returnToMenu = function(){
  const S = Game.state; S.players = []; S.me = null; S.paused = false; S.showMap = false;
  Game.setPhase('menu'); Game.emit('menuReturn'); document.getElementById('menu').classList.remove('hidden');
};

// ===== MAIN LOOP (fixed timestep) =====
let canvas, ctx;
function resize(){
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  Game.config.scale = window.innerWidth < 700 ? 2 : 3;
  const cam = Game.state.cam; cam.w = canvas.width / Game.config.scale; cam.h = canvas.height / Game.config.scale;
  ctx.imageSmoothingEnabled = false;
}
function update(dt){
  runHooks('preUpdate', dt);
  for (const n of Game.order.update) { const m = Game.modules[n]; if (m && !m.disabled && m.update) { try { m.update(dt); } catch (e) { _fail(n, m, e); } } }
  runHooks('postUpdate', dt);
}
function draw(){
  const S = Game.state, cam = S.cam, sc = Game.config.scale;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#14121f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  runHooks('preDraw', ctx);
  let ox = 0, oy = 0; if (cam.shakeT > 0) { ox = Math.round((Math.random() * 2 - 1) * cam.shakeAmp); oy = Math.round((Math.random() * 2 - 1) * cam.shakeAmp); }
  const sx = Math.round(cam.x) + ox, sy = Math.round(cam.y) + oy;
  ctx.setTransform(sc, 0, 0, sc, -sx * sc, -sy * sc);                       // world layer: integer world pixels -> crisp pixel art
  for (const n of Game.order.world) { const m = Game.modules[n]; if (m && !m.disabled && m.draw) { try { m.draw(ctx, cam); } catch (e) { _fail(n, m, e); } } }
  ctx.setTransform(1, 0, 0, 1, 0, 0);                                        // screen layer: HUD and overlays
  for (const n of Game.order.screen) { const m = Game.modules[n]; if (m && !m.disabled && m.draw) { try { m.draw(ctx, cam); } catch (e) { _fail(n, m, e); } } }
  runHooks('postDraw', ctx);
}
function boot(){
  canvas = document.getElementById('game'); ctx = canvas.getContext('2d');
  resize(); addEventListener('resize', resize);
  for (const n of Game.order.update) { const m = Game.modules[n]; if (m && m.init) { try { m.init(); } catch (e) { _fail(n, m, e); } } }
  Game.modules.camera.snap();
  const STEP = 1 / 60; let last = performance.now(), acc = 0;
  (function frame(now){
    let dt = (now - last) / 1000; last = now; if (dt > 0.25) dt = 0.25; acc += dt;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    draw(); requestAnimationFrame(frame);
  })(last);
}
if (typeof document !== 'undefined') window.addEventListener('DOMContentLoaded', boot);
