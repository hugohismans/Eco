// Chapitre 7 : la fête foraine (niveaux 61 à 70).
//
// Les échos partent d'ailleurs (« Q »), puis deviennent des reflets : ils rejouent nos
// gestes en inversant la gauche et la droite. Chaque niveau est joué par un petit robot
// qui suit la solution prévue, à travers la vraie Session (step, replay) ; puis on
// vérifie que l'idée du niveau est nécessaire : seul, sans le bon geste, au mauvais
// endroit ou au mauvais moment, on n'y arrive pas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseLevel } from '../src/sim/level.js';
import { Session } from '../src/sim/session.js';
import {
  IN_LEFT, IN_RIGHT, IN_JUMP, IN_UP, IN_DASH, IN_GRAB, SUB, TILE, GRID_W, GRID_H, ACTOR_W,
  T_SOLID, T_ICE, T_GHOST, T_GATE_R,
} from '../src/sim/constants.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (file) => JSON.parse(readFileSync(join(here, '../src/levels', file), 'utf8'));
const load = (file) => parseLevel(raw(file));
/** Le même niveau, modifié (sans chrono, une case changée…) pour les vérifications. */
const loadWith = (file, extra = {}) => parseLevel({ ...raw(file), ...extra });
/** La grille d'un niveau où l'on a remplacé quelques cases : [[col, rangée, caractère], …]. */
function gridWith(file, cells) {
  const grid = raw(file).grid.map((row) => row.split(''));
  for (const [c, r, ch] of cells) grid[r][c] = ch;
  return grid.map((row) => row.join(''));
}
const colCenter = (c) => c * TILE + TILE / 2;
const rowTop = (r) => r * TILE * SUB;
/** Bord gauche d'une colonne, en sous-pixels. */
const colLeft = (c) => c * TILE * SUB;
const L = IN_LEFT, R = IN_RIGHT, J = IN_JUMP, U = IN_UP, X = IN_DASH, G = IN_GRAB;
/** L'abscisse symétrique (en sous-pixels) d'un personnage placé en x. */
const mirrorX = (x) => GRID_W * TILE * SUB - x - ACTOR_W;

/** Robot : quelques gestes simples, tick par tick, sur une session. */
class Bot {
  constructor(session) {
    this.s = session;
    this.deaths = 0;
  }
  get p() { return this.s.world.player; }
  get w() { return this.s.world; }
  /** Centre du joueur, en pixels. */
  get cx() { return (this.p.x + (this.p.w >> 1)) / SUB; }
  get feet() { return this.p.y + this.p.h; }
  get done() { return this.s.state !== 'playing'; }
  step(bits) {
    if (this.s.state !== 'playing') return false;
    const wasDead = this.s.world.player.dead;
    this.s.step(bits);
    if (!wasDead && this.s.world.player.dead) this.deaths++;
    return this.s.state === 'playing';
  }
  idle(n) { for (let i = 0; i < n; i++) if (!this.step(0)) return; }
  /** Tient une entrée n ticks. */
  hold(bits, n) { for (let i = 0; i < n; i++) if (!this.step(bits)) return; }
  /** Attend (ou tient une entrée) jusqu'au tick `t` de la tentative. */
  untilTick(t, bits = 0) { this.holdUntil(bits, () => this.w.tick >= t, 3000); }
  /** Marche jusqu'à ce que le centre soit à ~3 px de `x`, puis s'arrête. */
  walkTo(x, max = 900) {
    for (let i = 0; i < max; i++) {
      const d = x - this.cx;
      if (Math.abs(d) <= 3 && this.p.onGround) break;
      if (!this.step(d > 0 ? IN_RIGHT : IN_LEFT)) return;
    }
    for (let i = 0; i < 20 && this.p.vx !== 0; i++) this.step(0);
  }
  /** Saut plein en tenant une direction, jusqu'à retomber. */
  jump(dir = 0, max = 120) {
    const d = dir > 0 ? IN_RIGHT : dir < 0 ? IN_LEFT : 0;
    this.step(d);
    for (let i = 0; i < 17; i++) this.step(d | IN_JUMP);
    for (let i = 0; i < max && !this.p.onGround; i++) this.step(d);
  }
  /** Tient une entrée jusqu'à ce que `pred()` soit vrai. */
  holdUntil(bits, pred, max = 900) {
    for (let i = 0; i < max && !pred(); i++) if (!this.step(bits)) return;
  }
  /** Marche dans une direction jusqu'à buter contre quelque chose (mur, porte, tourniquet). */
  untilBlocked(bits, max = 900) {
    const t0 = this.w.tick;
    this.holdUntil(bits, () => this.p.vx === 0 && this.p.onGround && this.w.tick > t0 + 8, max);
  }
  /** Va jusqu'à la sortie en tenant une direction. */
  exit(bits, max = 900) {
    this.holdUntil(bits, () => this.done, max);
    return this.s.outcome;
  }
}

// --- Instantanés légers d'un monde, pour essayer beaucoup de gestes -------------------

const LISTS = ['actors', 'buttons', 'doors', 'crumbles', 'springs', 'lasers', 'levers', 'platforms', 'blocks', 'winds'];
function snap(w) {
  const o = { tick: w.tick, outcome: w.outcome };
  for (const k of LISTS) o[k] = w[k].map((x) => ({ ...x }));
  return o;
}
function restore(w, o) {
  w.tick = o.tick;
  w.outcome = o.outcome;
  for (const k of LISTS) w[k].forEach((x, i) => Object.assign(x, o[k][i]));
}

/**
 * Essaie, depuis le monde `w`, une large famille de bonds : direction tenue (puis
 * changée), saut (moment, durée), second appui (saut au mur), dash (direction, moment),
 * agrippement. Les capacités absentes du niveau ne sont pas essayées.
 * Renvoie vrai si l'un d'eux atteint `goal(world)`.
 */
function anyLeap(w, goal, { dirs = [R, L, 0], jts = [0, 4], maxK = 130 } = {}) {
  const s0 = snap(w);
  const dashDirs = w.abilities.has('dash') ? [0, R, L, U, U | R, U | L] : [0];
  const grabs = w.abilities.has('grab') ? [0, G | U] : [0];
  const rejumps = w.abilities.has('walljump') ? [-1, 12, 20] : [-1];
  const das = [4, 8, 12, 16, 20, 24, 28, 32];
  try {
    for (const dir of dirs) for (const after of dir ? [dir, 0] : [0]) for (const afterAt of dir ? [0, 16] : [0]) {
      for (const jt of jts) for (const jlen of [8, 18]) for (const rj of rejumps) for (const gr of grabs) {
        for (const dd of dashDirs) for (const da of dd ? das : [0]) {
          restore(w, s0);
          for (let k = 0; k < maxK; k++) {
            let b = k >= afterAt ? after : dir;
            if (k >= jt && k < jt + jlen) b |= J;
            if (rj >= 0 && k >= rj && k < rj + 18) b |= J;
            if (rj >= 0 && k === rj - 1) b &= ~J;
            if (dd && k === da) b |= X | dd;
            if (gr && k > da) b |= gr;
            w.step(b);
            if (w.player.dead) break;
            if (goal(w)) return true;
            if (w.player.onGround && k > jt + 3 && k > da && (rj < 0 || k > rj + 3)) break;
          }
        }
      }
    }
    return false;
  } finally {
    restore(w, s0);
  }
}

const button = (s, id) => s.world.buttons.find((b) => b.id === id);
const door = (s, id) => s.world.doors.find((d) => d.id === id);
const isSolid = (level, c, r) => level.tiles[r * GRID_W + c] === T_SOLID;
/** La colonne `c` est un mur plein de haut en bas (entre les rangées r0 et r1). */
const wallColumn = (level, c, r0 = 0, r1 = GRID_H - 1) => {
  for (let r = r0; r <= r1; r++) if (!isSolid(level, c, r)) return false;
  return true;
};
/**
 * Les cases que le joueur pourrait occuper en partant de son départ, portes fermées
 * (ou ouvertes) : un remplissage de proche en proche, sans se soucier de la hauteur des
 * sauts. C'est un majorant : ce qui n'y est pas est hors d'atteinte, quoi qu'on fasse.
 */
function reachableCells(level, doorsOpen = false) {
  const blocked = new Set();
  if (!doorsOpen) {
    for (const d of level.doors) {
      for (let r = d.row; r < d.row + d.rows; r++) for (let c = d.col; c < d.col + d.cols; c++) blocked.add(r * GRID_W + c);
    }
  }
  const free = (c, r) => c >= 0 && c < GRID_W && r >= 0 && r < GRID_H
    && ![T_SOLID, T_ICE, T_GHOST].includes(level.tiles[r * GRID_W + c]) && !blocked.has(r * GRID_W + c);
  const start = Math.floor(level.spawn.y / (TILE * SUB)) * GRID_W + Math.floor(level.spawn.x / (TILE * SUB));
  const seen = new Set([start]);
  const todo = [start];
  while (todo.length) {
    const k = todo.pop();
    const c = k % GRID_W, r = (k - c) / GRID_W;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (r + dr) * GRID_W + c + dc;
      if (free(c + dc, r + dr) && !seen.has(n)) { seen.add(n); todo.push(n); }
    }
  }
  return seen;
}
const exitCells = (level) => {
  const out = [];
  const e = level.exit;
  for (let r = e.row; r < e.row + e.rows; r++) for (let c = e.col; c < e.col + e.cols; c++) out.push(r * GRID_W + c);
  return out;
};
/** Le joueur a-t-il gagné avec au moins 1,5 s d'avance sur le chrono ? */
const inTime = (s) => s.world.tick <= s.level.duration - 90;

// --- Le chapitre dans son ensemble ------------------------------------------------------

const F = {
  61: '61-autre-entree.json', 62: '62-palais-glaces.json', 63: '63-face-a-face.json',
  64: '64-tourniquets.json', 65: '65-miroirs-deformants.json', 66: '66-train-fantome.json',
  67: '67-grande-roue.json', 68: '68-envers.json', 69: '69-galerie-glaces.json', 70: '70-funiculaire.json',
};
const DECOR_TYPES = new Set([
  'bench', 'lamp', 'pendant', 'window', 'clock', 'poster', 'sign', 'counter', 'board', 'radiator', 'plant',
  'walllamp', 'gantry', 'train', 'neon', 'painting', 'statue', 'skylight', 'rope', 'seat', 'lighthouse',
  'boat', 'buoy', 'garland', 'wheel', 'carousel', 'stall', 'mirror',
]);
const THEMES = {
  61: 'foire', 62: 'glaces', 63: 'glaces', 64: 'foire', 65: 'glaces',
  66: 'foire', 67: 'foire', 68: 'glaces', 69: 'glaces', 70: 'foire',
};

test('chapitre 7 : dix pièces bien formées', () => {
  for (const [num, file] of Object.entries(F)) {
    const def = raw(file);
    const level = parseLevel(def);
    assert.equal(file, `${num}-${level.id}.json`, file);
    assert.equal(def.chapter, 7, file);
    assert.equal(def.theme, THEMES[num], file);
    assert.ok(typeof def.name === 'string' && def.name.length > 0, file);
    assert.ok(def.narration.endsWith(' (provisoire)'), file);
    assert.ok(def.decor.length >= 4 && def.decor.length <= 8, `${file} : décor`);
    for (const d of def.decor) assert.ok(DECOR_TYPES.has(d.type), `${file} : décor ${d.type}`);
    for (const d of def.decor.filter((x) => x.type === 'sign')) assert.ok(d.text.length <= 10, `${file} : enseigne`);
    assert.equal(level.exit.rows, 2, `${file} : sortie haute de deux cases`);
    // Un seul niveau sans reflet : le premier, où l'écho part seulement d'ailleurs.
    assert.equal(level.echoMirror, num !== '61', file);
    assert.ok(level.echoSpawn, `${file} : départ des échos`);
    if (num === '70') {
      assert.equal(def.duration, null);
      assert.equal(def.exitStyle, 'train');
      assert.equal(level.chapterEnd, true);
      assert.ok(def.decor.some((d) => d.type === 'train' && d.variant === 'funiculaire' && d.layer === 'front'));
    } else {
      assert.ok(def.duration > 0, file);
      assert.equal(level.chapterEnd, false, file);
    }
  }
  // Les trois capacités, sauf là où elles ruineraient l'idée (voir chaque niveau).
  const abilities = (n) => [...load(F[n]).abilities];
  for (const n of [61, 62, 64, 65, 66, 70]) assert.deepEqual(abilities(n), ['walljump', 'grab', 'dash'], F[n]);
  for (const n of [63, 68]) assert.deepEqual(abilities(n), ['walljump', 'grab'], `${F[n]} : pas de dash (3 cases)`);
  for (const n of [67, 69]) assert.deepEqual(abilities(n), [], F[n]);
});

test('chapitre 7 : les départs P et Q des pièces à reflets sont symétriques', () => {
  for (const n of [62, 63, 64, 65, 66, 67, 68, 69, 70]) {
    const level = load(F[n]);
    assert.equal(level.echoSpawn.x, mirrorX(level.spawn.x), F[n]);
    assert.equal(level.echoSpawn.y, level.spawn.y, F[n]);
  }
});

test('chapitre 7 : porte fermée, la sortie est murée ; et l’on ne va pas tenir soi-même le bouton d’en face', () => {
  // Partout où une porte garde la sortie, elle est la seule ouverture (aucune capacité n'y change rien).
  for (const n of [61, 62, 64, 65, 66, 67, 69, 70]) {
    const level = load(F[n]);
    const cells = reachableCells(level);
    for (const k of exitCells(level)) assert.equal(cells.has(k), false, `${F[n]} : sortie atteinte sans ouvrir la porte`);
    const open = reachableCells(level, true);
    for (const k of exitCells(level)) assert.equal(open.has(k), true, `${F[n]} : sortie accessible, porte ouverte`);
  }
  // Là où le milieu est muré, le bouton du reflet est hors d'atteinte, même portes ouvertes.
  for (const [n, id] of [[61, 'a'], [62, 'a'], [65, 'a'], [66, 'b']]) {
    const level = load(F[n]);
    const b = level.buttons.find((x) => x.id === id);
    assert.equal(reachableCells(level, true).has(b.row * GRID_W + b.col), false, `${F[n]} : bouton ${id}`);
  }
  // 66 : et la plaque « a » n'est que de notre côté ; aucun reflet ne peut la tenir.
  const l66 = load(F[66]);
  const a = l66.buttons.find((x) => x.id === 'a');
  assert.ok(a.col < 13 && l66.echoSpawn.x > colLeft(14));
});

// --- 61. L'autre entrée ------------------------------------------------------------------

test('61 autre entrée : l’écho part de Q et refait nos pas ; au repère, il est sur le bouton', () => {
  const s = new Session(load(F[61]));
  const bot = new Bot(s);
  bot.walkTo(colCenter(8)); // sous la lanterne
  const walked = bot.p.x - s.level.spawn.x;
  s.replay();
  const echo = s.world.actors[0];
  assert.equal(echo.x, s.level.echoSpawn.x, 'il part de Q, dans l’autre allée');
  assert.equal(echo.mirror, false, 'un écho, pas encore un reflet');
  bot.untilBlocked(R);
  bot.holdUntil(0, () => echo.finished, 300);
  assert.equal(echo.x - s.level.echoSpawn.x, walked, 'les mêmes pas, ailleurs');
  assert.equal(button(s, 'a').pressed, true, 'sous l’autre lanterne : le bouton');
  assert.equal(bot.exit(R), 'exit');
  assert.ok(inTime(s));
});

test('61 autre entrée : aller jusqu’à sa porte suffit, le mur arrête l’écho sur le bouton', () => {
  const s = new Session(load(F[61]));
  const bot = new Bot(s);
  bot.untilBlocked(R);
  assert.equal(bot.p.x + bot.p.w, colLeft(10), 'contre notre porte, fermée');
  s.replay();
  assert.equal(bot.exit(R), 'exit');
  const echo = s.world.actors[0];
  assert.equal(echo.x + echo.w, colLeft(24), 'contre son mur');
  assert.ok(echo.x - s.level.echoSpawn.x < s.level.exit.x - s.level.spawn.x, 'il a moins marché que nous');
});

test('61 autre entrée : seul, ou si l’on ne marche pas assez, la porte reste fermée', () => {
  const s = new Session(load(F[61]));
  const bot = new Bot(s);
  bot.untilBlocked(R);
  bot.idle(60);
  assert.equal(door(s, '1').open, 0, 'seul');
  s.restart();
  bot.walkTo(colCenter(5));
  s.replay();
  bot.untilBlocked(R);
  bot.idle(120);
  assert.equal(button(s, 'a').pressed, false, 'l’écho s’est arrêté avant le bouton');
  assert.equal(door(s, '1').open, 0);
  assert.equal(s.state, 'playing');
  // Les deux allées sont séparées par une palissade pleine, et la cabane de la sortie est close.
  const level = s.level;
  assert.ok(wallColumn(level, 13), 'palissade');
  for (const c of [10, 11, 12]) assert.ok(isSolid(level, c, 10), 'toit de la cabane');
});

// --- 62. Le palais des glaces --------------------------------------------------------------

test('62 palais des glaces : on marche vers la glace, le reflet vient vers nous, sur le bouton', () => {
  const s = new Session(load(F[62]));
  const bot = new Bot(s);
  bot.untilBlocked(R);
  assert.equal(bot.p.x + bot.p.w, colLeft(13), 'contre la glace');
  const mine = bot.p.x;
  s.replay();
  const refl = s.world.actors[0];
  assert.equal(refl.mirror, true);
  assert.equal(refl.x, mirrorX(s.level.spawn.x), 'il part de Q, en face');
  bot.untilBlocked(L);
  assert.equal(bot.p.x, colLeft(4), 'devant notre porte, encore fermée');
  bot.holdUntil(L, () => bot.done, 300);
  assert.equal(s.outcome, 'exit');
  assert.equal(refl.x, mirrorX(mine), 'le reflet est où nous étions, de l’autre côté de la glace');
  assert.equal(button(s, 'a').pressed, true);
  assert.ok(inTime(s));
});

test('62 palais des glaces : seul, ou en allant vers la porte, ou en s’arrêtant en chemin : rien', () => {
  const s = new Session(load(F[62]));
  const bot = new Bot(s);
  // Seul, puis avec un reflet qui a fait comme nous : il s'éloigne de la glace.
  bot.untilBlocked(L);
  bot.idle(30);
  assert.equal(door(s, '1').open, 0);
  s.replay();
  bot.untilBlocked(L);
  bot.idle(120);
  const refl = s.world.actors[0];
  assert.equal(refl.x + refl.w, colLeft(24), 'il est allé au fond, de son côté');
  assert.equal(button(s, 'a').pressed, false);
  assert.equal(door(s, '1').open, 0);
  // Un reflet arrêté à mi-chemin n'atteint pas le bouton.
  s.restart();
  bot.walkTo(colCenter(9));
  s.replay();
  bot.untilBlocked(L);
  bot.idle(120);
  assert.equal(button(s, 'a').pressed, false);
  assert.equal(s.state, 'playing');
  // La glace : un mur plein au milieu ; on ne va pas tenir le bouton soi-même.
  assert.ok(wallColumn(s.level, 13) && wallColumn(s.level, 14));
  for (const c of [1, 2, 3]) assert.ok(isSolid(s.level, c, 10), 'toit de la sortie');
});

// --- 63. Face à face -------------------------------------------------------------------------

/** 63 : la tentative du reflet : marcher jusqu'à l'abscisse x (px), s'arrêter, « Rejouer ». */
function meetAt(bot, x) {
  bot.walkTo(x);
  bot.s.replay();
}

test('63 face à face : on s’arrête au milieu, le reflet aussi ; sa tête est la marche', () => {
  const s = new Session(load(F[63]));
  const bot = new Bot(s);
  meetAt(bot, 224);
  const refl = s.world.actors[0];
  bot.walkTo(224);
  bot.holdUntil(0, () => refl.finished, 60);
  assert.ok(Math.abs(refl.x - bot.p.x) <= 8 * SUB, 'face à face, au milieu');
  bot.jump(0);
  assert.equal(bot.p.ground, refl, 'debout sur la tête du reflet');
  bot.jump(0);
  assert.equal(s.outcome, 'exit');
  assert.ok(inTime(s));
});

test('63 face à face : à une case et demie près, on se rejoint encore', () => {
  for (const d of [-24, -12, 12, 24]) {
    const s = new Session(load(F[63]));
    const bot = new Bot(s);
    meetAt(bot, 224 + d);
    const refl = s.world.actors[0];
    bot.holdUntil(0, () => refl.finished, 400);
    bot.walkTo((refl.x + (refl.w >> 1)) / SUB);
    bot.jump(0);
    assert.equal(bot.p.ground, refl, `d=${d}`);
    bot.jump(d > 0 ? 1 : -1);
    assert.equal(s.outcome, 'exit', `d=${d}`);
  }
});

test('63 face à face : sans tête au milieu, la corniche est hors d’atteinte', () => {
  const lv = loadWith(F[63], { duration: null });
  // Seul : sauts, saut au mur, escalade, depuis le dessous de la corniche et les côtés.
  for (const x of [170, 200, 224, 250, 280]) {
    const s = new Session(lv);
    const bot = new Bot(s);
    bot.walkTo(x);
    assert.equal(anyLeap(s.world, (w) => w.won), false, `seul, depuis x=${x}`);
  }
  // Un reflet arrêté ailleurs qu'au milieu : sa tête ne mène nulle part.
  for (const x of [120, 160]) {
    const s = new Session(lv);
    const bot = new Bot(s);
    meetAt(bot, x);
    const refl = s.world.actors[0];
    bot.holdUntil(0, () => refl.finished, 400);
    bot.walkTo((refl.x + (refl.w >> 1)) / SUB);
    bot.jump(0);
    assert.equal(bot.p.ground, refl);
    assert.equal(anyLeap(s.world, (w) => w.won), false, `depuis la tête du reflet, x=${x}`);
  }
});

// --- 64. Les tourniquets ----------------------------------------------------------------------

test('64 tourniquets : le mien me laisse passer, le sien l’arrête sur le bouton', () => {
  const s = new Session(load(F[64]));
  const bot = new Bot(s);
  bot.untilBlocked(R);
  assert.equal(bot.p.x + bot.p.w, colLeft(11), 'passé le tourniquet, contre la porte');
  s.replay();
  const refl = s.world.actors[0];
  bot.untilBlocked(R);
  bot.holdUntil(R, () => bot.done, 300);
  assert.equal(s.outcome, 'exit');
  assert.equal(refl.x, colLeft(22), 'le reflet est arrêté net par son tourniquet');
  assert.equal(button(s, 'a').pressed, true);
  assert.ok(inTime(s));
});

test('64 tourniquets : peu importe combien de temps on marche', () => {
  // De « à peine passé le tourniquet » à « deux secondes à pousser la porte ».
  for (const more of [-60, -30, 0, 120]) {
    const s = new Session(load(F[64]));
    const bot = new Bot(s);
    if (more < 0) bot.walkTo(colCenter(11) + more); else { bot.untilBlocked(R); bot.hold(R, more); }
    s.replay();
    const refl = s.world.actors[0];
    bot.untilBlocked(R);
    bot.holdUntil(R, () => bot.done, 400);
    assert.equal(s.outcome, 'exit', `marche ${more}`);
    assert.equal(refl.x, colLeft(22), `marche ${more}`);
  }
  // Et l'on ne revient pas en arrière : le tourniquet ne s'ouvre que dans un sens.
  const s = new Session(load(F[64]));
  const bot = new Bot(s);
  bot.walkTo(colCenter(9));
  bot.untilBlocked(L);
  assert.equal(bot.p.x, colLeft(7), 'arrêté au retour');
  assert.equal(s.level.tiles[12 * GRID_W + 6], T_GATE_R);
  assert.equal(s.level.tiles[12 * GRID_W + 21], T_GATE_R, 'le même, de son côté (pas son image)');
});

test('64 tourniquets : seul, rien ; sans son tourniquet, le reflet irait trop loin', () => {
  const s = new Session(load(F[64]));
  const bot = new Bot(s);
  bot.untilBlocked(R);
  bot.idle(60);
  assert.equal(door(s, '1').open, 0, 'seul');
  // La même pièce sans le tourniquet du reflet : il dépasse le bouton, la porte se referme.
  const t = new Session(loadWith(F[64], { grid: gridWith(F[64], [[21, 11, '.'], [21, 12, '.']]) }));
  const b2 = new Bot(t);
  b2.untilBlocked(R);
  t.replay();
  b2.untilBlocked(R);
  b2.idle(120);
  const refl = t.world.actors[0];
  assert.equal(refl.x, colLeft(17), 'il a continué jusqu’au guichet');
  assert.equal(button(t, 'a').pressed, false);
  assert.equal(door(t, '1').open, 0);
  assert.equal(t.state, 'playing');
});

// --- 65. Les miroirs déformants ---------------------------------------------------------------

/**
 * 65 : marcher vers la porte en sautant « par-dessus rien » : le saut est lancé quand notre
 * bord droit est à d1 (puis d2) pixels du miroir déformant (colonnes 6 et 9), tenu `len` ticks.
 */
function mimeStairs(bot, d1 = 12, d2 = 12, len = 12) {
  const right = () => (bot.p.x + bot.p.w) / SUB;
  for (const [col, d] of [[6, d1], [9, d2]]) {
    if (d === null) continue;
    bot.holdUntil(R, () => right() >= col * TILE - d, 400);
    bot.hold(R | J, len);
    bot.holdUntil(R, () => bot.p.onGround, 60);
  }
  bot.untilBlocked(R);
}

test('65 miroirs déformants : on saute par-dessus rien, le reflet gravit son escalier', () => {
  const s = new Session(load(F[65]));
  const bot = new Bot(s);
  mimeStairs(bot);
  assert.equal(bot.feet, rowTop(13), 'de notre côté, le sol est resté plat');
  s.replay();
  const refl = s.world.actors[0];
  bot.untilBlocked(R);
  assert.equal(bot.exit(R), 'exit');
  assert.equal(refl.y + refl.h, rowTop(11), 'le reflet est en haut de ses deux marches');
  assert.equal(refl.x, colLeft(16), 'contre le mur, sur le bouton');
  assert.equal(button(s, 'a').pressed, true);
  assert.ok(inTime(s));
});

test('65 miroirs déformants : tout saut lancé dans la case et demie avant le repère passe', () => {
  const wins = (d1, d2, len) => {
    const s = new Session(load(F[65]));
    const bot = new Bot(s);
    mimeStairs(bot, d1, d2, len);
    s.replay();
    bot.untilBlocked(R);
    bot.holdUntil(R, () => bot.done, 300);
    return s.outcome === 'exit';
  };
  // Un saut normal ou tenu : de « contre la marche » à une case et demie avant.
  for (const d1 of [0, 8, 16, 24]) for (const d2 of [0, 8, 16, 24]) for (const len of [9, 12, 18]) {
    assert.equal(wins(d1, d2, len), true, `sauts à ${d1} et ${d2} px, tenus ${len} ticks`);
  }
  // Une pichenette (le plus petit saut) retombe plus tôt : une bonne case de marge quand même.
  for (const d1 of [4, 12, 20]) for (const d2 of [0, 8, 16]) for (const len of [1, 6]) {
    assert.equal(wins(d1, d2, len), true, `pichenettes à ${d1} et ${d2} px (${len} ticks)`);
  }
  // Trop tôt (plus de deux cases avant) : on retombe avant la marche.
  for (const len of [1, 12, 18]) assert.equal(wins(40, 12, len), false, `saut à 40 px (${len} ticks)`);
});

test('65 miroirs déformants : sans sauter, le reflet bute sur la première marche ; un saut, sur la seconde', () => {
  const s = new Session(load(F[65]));
  const bot = new Bot(s);
  bot.untilBlocked(R);
  bot.idle(30);
  assert.equal(door(s, '1').open, 0, 'seul');
  s.replay();
  bot.untilBlocked(R);
  bot.idle(120);
  let refl = s.world.actors[0];
  assert.equal(refl.x, colLeft(22), 'au pied de la première marche');
  assert.equal(door(s, '1').open, 0);
  s.restart();
  mimeStairs(bot, 12, null);
  s.replay();
  bot.untilBlocked(R);
  bot.idle(120);
  refl = s.world.actors[0];
  assert.equal(refl.x, colLeft(19), 'au pied de la seconde');
  assert.equal(refl.y + refl.h, rowTop(12));
  assert.equal(button(s, 'a').pressed, false);
  assert.equal(s.state, 'playing');
  // On ne passe pas de l'autre côté : mur plein, et la sortie est sous un toit.
  assert.ok(wallColumn(s.level, 14) && wallColumn(s.level, 15, 0, 9));
  for (const c of [12, 13]) assert.ok(isSolid(s.level, c, 10));
});

// --- 66. Le train fantôme ---------------------------------------------------------------------

/** 66 : la tentative du reflet : marcher jusqu'à notre porte fermée. */
function ghostRecord(bot) {
  bot.untilBlocked(R);
  bot.s.replay();
}
/** 66, en direct : tenir la plaque `a` (après `late` ticks) jusqu'à ce que le reflet ait passé sa porte. */
function holdTheDoor(bot, late = 0) {
  const refl = bot.w.actors[0];
  bot.idle(late);
  bot.walkTo(colCenter(3));
  bot.holdUntil(0, () => refl.x + refl.w <= colLeft(19) || bot.w.tick > 400, 500);
}

test('66 train fantôme : je lui tiens la porte, il me tient la mienne', () => {
  const s = new Session(load(F[66]));
  const bot = new Bot(s);
  ghostRecord(bot);
  const refl = s.world.actors[0];
  bot.walkTo(colCenter(3));
  assert.equal(button(s, 'a').pressed, true, 'sur la plaque');
  bot.idle(12);
  assert.equal(door(s, '2').open, 12, 'sa porte est ouverte avant qu’il n’arrive');
  assert.ok(refl.x > colLeft(20) + 16 * SUB, 'il est encore en chemin');
  bot.holdUntil(0, () => refl.x + refl.w <= colLeft(19), 300);
  assert.equal(button(s, 'b').pressed, true, 'il a passé sa porte : il est sur le bouton');
  assert.ok(door(s, '1').open > 0, 'la nôtre s’ouvre');
  assert.equal(bot.exit(R), 'exit');
  assert.equal(refl.x, colLeft(18), 'contre son mur, sur le bouton');
  assert.equal(door(s, '2').open, 0, 'sa porte s’est refermée derrière lui');
  assert.ok(inTime(s));
});

test('66 train fantôme : on a près d’une seconde pour aller sur la plaque', () => {
  for (const late of [0, 20, 40, 55]) {
    const s = new Session(load(F[66]));
    const bot = new Bot(s);
    ghostRecord(bot);
    holdTheDoor(bot, late);
    assert.equal(bot.exit(R), 'exit', `parti après ${late} ticks`);
  }
});

test('66 train fantôme : si personne ne lui tient la porte, le reflet s’use contre elle', () => {
  // On marche droit vers notre porte, comme à l'enregistrement.
  const s = new Session(load(F[66]));
  const bot = new Bot(s);
  bot.untilBlocked(R);
  bot.idle(30);
  assert.equal(door(s, '1').open, 0, 'seul');
  s.replay();
  bot.untilBlocked(R);
  bot.idle(200);
  let refl = s.world.actors[0];
  assert.equal(refl.x, colLeft(20), 'arrêté devant sa porte');
  assert.equal(door(s, '1').open, 0);
  // On passe sur la plaque sans s'y arrêter, ou on y arrive trop tard : même chose.
  for (const mode of ['bref', 'tard']) {
    const t = new Session(load(F[66]));
    const b2 = new Bot(t);
    ghostRecord(b2);
    if (mode === 'tard') b2.idle(110);
    b2.walkTo(colCenter(3));
    if (mode === 'tard') b2.idle(60);
    b2.untilBlocked(R);
    b2.idle(200);
    refl = t.world.actors[0];
    assert.ok(refl.x > colLeft(18) + 14 * SUB, `${mode} : il s’est arrêté trop court`);
    assert.equal(button(t, 'b').pressed, false, mode);
    assert.equal(t.state, 'playing', mode);
  }
  // Personne ne change de côté.
  assert.ok(wallColumn(s.level, 13) && wallColumn(s.level, 14));
  for (const c of [10, 11, 12, 17, 18, 19]) assert.ok(isSolid(s.level, c, 10), 'toits');
});

// --- 67. La grande roue -----------------------------------------------------------------------

/** 67 : la tentative du reflet : attendre le tick `at`, sauter vers la nacelle, pousser jusqu'en haut. */
function wheelRecord(bot, at) {
  bot.untilTick(at);
  bot.hold(R | J, 14);
  bot.untilTick(at + 230, R);
  bot.s.replay();
}
/** 67 : monter dans notre nacelle (elle part dès le début), puis jusque devant la porte. */
function rideMine(bot) {
  bot.hold(R | J, 14);
  bot.holdUntil(R, () => bot.p.onGround, 60);
  assert.equal(bot.p.ground.kind, 'platform', 'dans notre nacelle');
  bot.holdUntil(R, () => bot.feet === rowTop(7) && bot.p.ground.kind !== 'platform', 300);
  bot.untilBlocked(R);
  assert.equal(bot.p.x + bot.p.w, colLeft(9), 'en haut, devant la porte');
}

test('67 grande roue : on saute quand SA nacelle est en bas ; puis on prend la nôtre', () => {
  const s = new Session(load(F[67]));
  const bot = new Bot(s);
  const [mine, his] = s.world.platforms;
  assert.ok(mine.y > his.y, 'au départ, la nôtre est en bas, la sienne en haut');
  // On attend que la sienne soit arrivée en bas : la nôtre est alors en haut.
  bot.holdUntil(0, () => s.world.platforms[1].t === s.world.platforms[1].len, 300);
  assert.equal(s.world.platforms[0].y, rowTop(6), 'la nôtre est en haut');
  const at = s.world.tick + 10;
  bot.untilTick(at);
  bot.hold(R | J, 14);
  bot.holdUntil(R, () => bot.p.onGround, 60);
  assert.equal(bot.feet, rowTop(13), 'nous, on a sauté dans le vide : au fond de notre puits, sans mal');
  bot.untilTick(at + 230, R);
  s.replay();
  // Tentative suivante : le reflet monte dans sa nacelle ; nous, dans la nôtre, tout de suite.
  const refl = s.world.actors[0];
  rideMine(bot);
  assert.equal(door(s, '1').open, 0, 'elle attend le reflet');
  let rode = false;
  bot.holdUntil(R, () => { rode ||= refl.ground?.kind === 'platform'; return bot.done; }, 600);
  assert.equal(rode, true, 'le reflet a pris sa nacelle');
  assert.equal(s.outcome, 'exit');
  assert.equal(refl.y + refl.h, rowTop(7));
  assert.equal(button(s, 'a').pressed, true);
  assert.ok(inTime(s));
});

test('67 grande roue : sauter, rester immobile le temps du trajet, puis faire le pas de sortie', () => {
  for (const stepAt of [195, 220, 245]) {
    const s = new Session(load(F[67]));
    const bot = new Bot(s);
    bot.untilTick(100);
    bot.hold(R | J, 14);
    bot.holdUntil(R, () => bot.p.onGround, 60);
    bot.untilTick(stepAt); // sa nacelle monte, s'arrête en haut (ticks 213 à 253)
    bot.hold(R, 20);
    s.replay();
    rideMine(bot);
    assert.equal(bot.exit(R, 400), 'exit', `pas de sortie au tick ${stepAt}`);
  }
});

test('67 grande roue : une bonne seconde pour sauter ; quand NOTRE nacelle est là, le reflet rate la sienne', () => {
  const pressed = (at) => {
    const s = new Session(load(F[67]));
    const bot = new Bot(s);
    wheelRecord(bot, at);
    bot.untilTick(at + 240);
    return [button(s, 'a').pressed, s.world.actors[0]];
  };
  for (const at of [45, 60, 80, 100, 120, 130]) assert.equal(pressed(at)[0], true, `saut au tick ${at}`);
  for (const at of [0, 15, 30, 150, 190]) {
    const [ok, refl] = pressed(at);
    assert.equal(ok, false, `saut au tick ${at}`);
    assert.equal(refl.y + refl.h, rowTop(13), 'le reflet est au fond de son puits');
  }
  // Sauter tout de suite, dans notre nacelle : on monte, mais la porte ne s'ouvrira pas.
  const s = new Session(load(F[67]));
  const bot = new Bot(s);
  wheelRecord(bot, 0);
  rideMine(bot);
  bot.idle(200);
  assert.equal(door(s, '1').open, 0);
  assert.equal(s.state, 'playing');
  // Ce reflet raté, au fond de son puits, ne gêne pas la nacelle : le suivant peut la prendre.
  s.replay();
  wheelRecord(bot, 100);
  assert.equal(s.world.actors.length, 4, 'trois reflets, dont deux ratés');
  rideMine(bot);
  assert.equal(bot.exit(R, 400), 'exit');
});

test('67 grande roue : sans nacelle, personne ne monte', () => {
  // Les nacelles arrêtées où elles sont : la nôtre en bas, la sienne en haut.
  const def = raw(F[67]);
  const lv = parseLevel({ ...def, duration: null, platforms: def.platforms.map((p) => ({ ...p, invert: false })) });
  const up = (w) => w.player.y + w.player.h <= rowTop(7) && w.player.onGround && w.player.ground.kind !== 'platform';
  const s = new Session(lv);
  const bot = new Bot(s);
  assert.equal(anyLeap(s.world, up), false, 'depuis le sol');
  bot.hold(R | J, 14);
  bot.holdUntil(R, () => bot.p.onGround, 60);
  assert.equal(bot.p.ground.kind, 'platform');
  bot.untilBlocked(R);
  assert.equal(anyLeap(s.world, up), false, 'depuis la nacelle restée en bas');
  // Et l'on ne passe pas sous les kiosques : les puits sont fermés par un mur.
  for (const r of [7, 8, 9, 10, 11, 12]) assert.ok(isSolid(lv, 8, r) && isSolid(lv, 19, r));
  // Du fond du puits, on ressort d'un saut (rien n'est perdu), mais pas plus haut.
  const u = new Session(loadWith(F[67], { duration: null }));
  const b3 = new Bot(u);
  b3.untilTick(100);
  b3.hold(R | J, 14);
  b3.holdUntil(R, () => b3.p.onGround, 60);
  assert.equal(b3.feet, rowTop(13));
  b3.jump(-1);
  assert.equal(b3.feet, rowTop(11), 'ressorti du puits');
  // De la nacelle, même tout en haut, on ne saute pas sur le toit du kiosque (le fronton l'interdit).
  const t = new Session(loadWith(F[67], { duration: null }));
  const b2 = new Bot(t);
  b2.hold(R | J, 14);
  b2.holdUntil(0, () => b2.p.onGround, 60);
  assert.equal(b2.p.ground.kind, 'platform');
  const onRoof = (w) => w.player.onGround && w.player.ground.kind !== 'platform' && w.player.y + w.player.h <= rowTop(4);
  for (let k = 0; k < 14; k++) {
    b2.idle(10);
    if (b2.p.ground?.kind !== 'platform') break;
    assert.equal(anyLeap(t.world, onRoof, { dirs: [R, 0], jts: [0, 3] }), false, `depuis la nacelle, tick ${t.world.tick}`);
  }
  assert.ok(t.world.tick > 120, 'essayé pendant toute la montée et l’arrêt en haut');
});

// --- 68. L'envers du décor ---------------------------------------------------------------------

test('68 envers du décor : pour qu’il vienne ici, on va là-bas', () => {
  const s = new Session(load(F[68]));
  const bot = new Bot(s);
  const here68 = colCenter(8) + 8, there = GRID_W * TILE - here68;
  bot.walkTo(there); // sous l'autre corniche, celle qui n'a pas de porte
  assert.ok(bot.cx > GRID_W * TILE / 2, 'de l’autre côté de la salle');
  s.replay();
  const refl = s.world.actors[0];
  bot.walkTo(here68);
  bot.holdUntil(0, () => refl.finished, 400);
  assert.ok(Math.abs((refl.x + (refl.w >> 1)) / SUB - here68) <= 6, 'le reflet est venu chez nous, sous la sortie');
  bot.walkTo((refl.x + (refl.w >> 1)) / SUB);
  bot.jump(0);
  assert.equal(bot.p.ground, refl);
  bot.jump(0);
  assert.equal(s.outcome, 'exit');
  assert.ok(inTime(s));
});

test('68 envers du décor : se placer ici envoie le reflet là-bas ; seul, la corniche est trop haute', () => {
  const lv = loadWith(F[68], { duration: null });
  const here68 = colCenter(8) + 8;
  const s = new Session(lv);
  const bot = new Bot(s);
  bot.walkTo(here68);
  assert.equal(anyLeap(s.world, (w) => w.won), false, 'seul, sous la sortie');
  s.replay();
  const refl = s.world.actors[0];
  bot.walkTo(here68);
  bot.holdUntil(0, () => refl.finished, 400);
  assert.ok(refl.x > colLeft(18), 'le reflet est sous l’autre corniche');
  assert.equal(anyLeap(s.world, (w) => w.won), false, 'toujours rien sous la nôtre');
  // Monter sur sa tête, là-bas, ne mène qu'à la corniche sans porte.
  bot.walkTo((refl.x + (refl.w >> 1)) / SUB);
  bot.jump(0);
  assert.equal(bot.p.ground, refl);
  assert.equal(anyLeap(s.world, (w) => w.won), false);
  // Par le mur de gauche (escalade, saut au mur) : trop loin.
  for (const climb of [0, 30, 60, 90]) {
    const t = new Session(lv);
    const b2 = new Bot(t);
    b2.untilBlocked(L);
    b2.hold(L | J, 6);
    b2.hold(L | G | U, climb);
    b2.hold(L | G, 2);
    assert.equal(anyLeap(t.world, (w) => w.won, { dirs: [R], jts: [0] }), false, `depuis le mur, après ${climb} ticks de grimpe`);
  }
});

// --- 69. La galerie des glaces ------------------------------------------------------------------

/** 69, reflet du tourniquet : monter sur la passerelle, la suivre, franchir le tourniquet. */
function galleryGate(bot) {
  bot.walkTo(colCenter(8));
  bot.jump(1);
  assert.equal(bot.feet, rowTop(11), 'sur la passerelle');
  bot.holdUntil(R, () => bot.feet === rowTop(13) && bot.p.onGround, 300);
  bot.idle(5);
  bot.s.replay();
}
/** 69, reflet « viens ici » : traverser toute la galerie, jusqu'au mur d'en face. */
function galleryCross(bot) {
  bot.untilBlocked(R, 600);
  bot.idle(3);
  bot.s.replay();
}
/** 69, reflet « mime » : traverser, puis sauter sur place, par-dessus rien. */
function galleryCrossAndJump(bot) {
  bot.untilBlocked(R, 600);
  bot.idle(3);
  bot.jump(0);
  bot.idle(3);
  bot.s.replay();
}
/** 69 : aller au pied du mur de gauche et attendre que les reflets aient fini. */
function galleryWait(bot) {
  bot.untilBlocked(L, 200);
  bot.holdUntil(0, () => bot.w.actors.every((a) => a === bot.p || (a.finished && a.onGround)), 900);
}

test('69 galerie des glaces : trois reflets — le tourniquet, « viens ici », le saut mimé — dans l’ordre', () => {
  const s = new Session(load(F[69]));
  const bot = new Bot(s);
  galleryGate(bot);
  galleryCross(bot);
  galleryCrossAndJump(bot);
  const [gate, base, top] = s.world.actors;
  galleryWait(bot);
  assert.equal(gate.x, colLeft(17), 'le premier est arrêté par son tourniquet, sur le bouton');
  assert.equal(button(s, 'a').pressed, true);
  assert.equal(base.x, colLeft(1), 'le deuxième est venu de notre côté, au pied du mur');
  assert.equal(top.ground, base, 'le troisième a sauté sur sa tête');
  bot.jump(0);
  assert.equal(bot.p.ground, base);
  bot.jump(0);
  assert.equal(bot.p.ground, top);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(9), 'sur la corniche');
  assert.equal(bot.exit(R), 'exit');
  assert.ok(inTime(s));
});

test('69 galerie des glaces : avec deux reflets, on échoue', () => {
  // Sans le reflet du tourniquet : on monte, mais la porte est fermée.
  const s = new Session(load(F[69]));
  const bot = new Bot(s);
  galleryCross(bot);
  galleryCrossAndJump(bot);
  galleryWait(bot);
  bot.jump(0);
  bot.jump(0);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(9), 'sur la corniche');
  bot.untilBlocked(R);
  assert.equal(bot.p.x + bot.p.w, colLeft(3), 'devant la porte fermée');
  assert.equal(anyLeap(s.world, (w) => w.won), false);
  // Sans le reflet qui saute : une seule tête, la corniche est trop haute (4 cases).
  const lv = loadWith(F[69], { duration: null });
  const t = new Session(lv);
  const b2 = new Bot(t);
  galleryGate(b2);
  galleryCross(b2);
  galleryWait(b2);
  b2.jump(0);
  assert.equal(b2.p.ground, t.world.actors[1]);
  const onLedge = (w) => w.won || (w.player.y + w.player.h <= rowTop(9) && w.player.onGround);
  assert.equal(anyLeap(t.world, onLedge), false, 'depuis une seule tête');
  // Sans le reflet venu se placer : celui qui saute retombe par terre.
  const u = new Session(lv);
  const b3 = new Bot(u);
  galleryGate(b3);
  galleryCrossAndJump(b3);
  galleryWait(b3);
  b3.jump(0);
  assert.equal(b3.p.ground, u.world.actors[1]);
  assert.equal(anyLeap(u.world, onLedge), false);
});

test('69 galerie des glaces : l’ordre compte (on ne monte que sur un plus ancien)', () => {
  const s = new Session(loadWith(F[69], { duration: null }));
  const bot = new Bot(s);
  galleryGate(bot);
  galleryCrossAndJump(bot); // celui qui saute d'abord : personne sous lui
  galleryCross(bot);
  galleryWait(bot);
  const [, jumper, walker] = s.world.actors;
  assert.equal(jumper.y + jumper.h, rowTop(13), 'il est retombé par terre');
  assert.equal(walker.y + walker.h, rowTop(13), 'et le suivant est à côté de lui, pas dessus');
  bot.jump(0);
  assert.equal(bot.p.ground.kind, 'echo');
  const onLedge = (w) => w.won || (w.player.y + w.player.h <= rowTop(9) && w.player.onGround);
  assert.equal(anyLeap(s.world, onLedge), false);
  // Sans échafaudage, la passerelle du tourniquet ne mène pas à la corniche non plus.
  const t = new Session(loadWith(F[69], { duration: null }));
  const b2 = new Bot(t);
  b2.walkTo(colCenter(8));
  b2.jump(1);
  b2.walkTo(colCenter(8));
  assert.equal(b2.feet, rowTop(11));
  assert.equal(anyLeap(t.world, onLedge), false);
});

// --- 70. Le funiculaire --------------------------------------------------------------------------

/** 70 : monter au funiculaire par les marches de gauche et entrer. */
function boardFunicular(bot) {
  bot.walkTo(colCenter(6) + 4);
  bot.jump(1);
  assert.equal(bot.feet, rowTop(11), 'sur la marche');
  bot.jump(1);
  assert.equal(bot.feet, rowTop(10), 'sur le quai du funiculaire');
}

test('70 funiculaire : sans chrono ; chaque reflet est là où l’on n’était pas', () => {
  const s = new Session(load(F[70]));
  const bot = new Bot(s);
  assert.equal(s.ticksLeft, null, 'pas de chrono');
  // Premier reflet : on traverse, jusqu'à la plaque de droite.
  bot.untilBlocked(R, 600);
  assert.equal(button(s, 'b').pressed, true);
  s.replay();
  // Second reflet : la plaque de gauche.
  bot.untilBlocked(L, 600);
  assert.equal(button(s, 'a').pressed, true);
  s.replay();
  const [first, second] = s.world.actors;
  boardFunicular(bot);
  assert.equal(door(s, '1').open, 0, 'le premier reflet traverse encore');
  bot.holdUntil(0, () => door(s, '1').open === 12, 600);
  assert.equal(first.x, colLeft(1), 'celui qui nous a vus à droite est à gauche');
  assert.equal(second.x + second.w, colLeft(27), 'celui qui nous a vus à gauche est à droite');
  assert.equal(bot.exit(R), 'exit');
  assert.equal(s.level.chapterEnd, true);
});

test('70 funiculaire : un seul reflet ne suffit pas', () => {
  const s = new Session(load(F[70]));
  const bot = new Bot(s);
  // Seul sur une plaque : rien.
  bot.untilBlocked(L, 600);
  bot.idle(30);
  assert.equal(door(s, '1').open, 0);
  // Un reflet à droite, nous à gauche : la porte s'ouvre… tant qu'on reste sur la plaque.
  s.replay();
  bot.untilBlocked(L, 600);
  bot.holdUntil(0, () => door(s, '1').open === 12, 600);
  assert.equal(button(s, 'a').count, 1);
  assert.equal(button(s, 'b').count, 1);
  bot.walkTo(colCenter(6) + 4);
  assert.equal(door(s, '1').open, 0, 'refermée dès qu’on quitte la plaque');
  bot.jump(1);
  bot.jump(1);
  bot.untilBlocked(R);
  assert.equal(bot.p.x + bot.p.w, colLeft(9), 'devant la porte fermée');
  assert.equal(s.state, 'playing');
  // Deux reflets qui ont fait la même chose sont sur la même plaque.
  const t = new Session(load(F[70]));
  const b2 = new Bot(t);
  for (let k = 0; k < 2; k++) { b2.untilBlocked(R, 600); t.replay(); }
  b2.idle(300);
  assert.equal(button(t, 'a').count, 2);
  assert.equal(button(t, 'b').count, 0);
  assert.equal(door(t, '1').open, 0);
});
