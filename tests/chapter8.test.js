// Chapitre 8 : l'observatoire (niveaux 71 à 80).
//
// Chaque niveau est joué par un petit robot qui suit la solution prévue, à
// travers la vraie Session (step, replay, restart) ; puis on vérifie que l'idée
// du niveau est nécessaire : seul, ou sans l'astuce, ou par un raccourci
// plausible (saut, dash, courte échelle), on n'y arrive pas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseLevel } from '../src/sim/level.js';
import { Session } from '../src/sim/session.js';
import { World } from '../src/sim/world.js';
import {
  IN_LEFT, IN_RIGHT, IN_JUMP, IN_UP, IN_DOWN, IN_DASH, IN_GRAB, SUB, TILE, DOOR_TICKS,
} from '../src/sim/constants.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (file) => JSON.parse(readFileSync(join(here, '../src/levels', file), 'utf8'));
const load = (file) => parseLevel(raw(file));
/** Le même niveau, modifié (sans chrono…) pour les vérifications. */
const loadWith = (file, extra = {}) => parseLevel({ ...raw(file), ...extra });
const colCenter = (c) => c * TILE + TILE / 2;
const rowTop = (r) => r * TILE * SUB;
const L = IN_LEFT, R = IN_RIGHT, J = IN_JUMP, U = IN_UP, D = IN_DOWN, X = IN_DASH, G = IN_GRAB;

/** Robot : quelques gestes simples, tick par tick, sur une session. */
class Bot {
  constructor(session) {
    this.s = session;
    /** Nombre de fois où le joueur est mort (faisceau). */
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
  /** Attend que la tentative se termine (chrono). */
  untilAttemptEnds(bits = 0) {
    const a = this.s.attempt;
    while (this.s.attempt === a && this.s.state === 'playing') this.step(bits);
  }
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
  /** Va jusqu'à la sortie en tenant une direction. */
  exit(bits, max = 900) {
    this.holdUntil(bits, () => this.done || this.p.dead, max);
    return this.s.outcome;
  }
  /** Bute contre une marche d'une case (dans le sens `dir`), puis monte dessus d'un petit saut. */
  hopOnStep(dir) {
    const d = dir > 0 ? IN_RIGHT : IN_LEFT;
    this.holdUntil(d, () => this.p.vx === 0 && this.p.onGround && this.w.tick > 5, 300);
    this.hold(d | IN_JUMP, 10);
    this.holdUntil(0, () => this.p.onGround, 60);
  }
}

// --- Instantanés légers d'un monde, pour essayer beaucoup de gestes -------------------

const LISTS = [
  'actors', 'buttons', 'doors', 'crumbles', 'springs', 'lasers', 'levers', 'platforms', 'blocks', 'winds',
  'receivers', 'mirrors',
];
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
 * Pose le joueur à un endroit (centre x et pieds, en pixels), comme s'il s'y tenait sur
 * un appui (un rebord, la tête d'un écho, le bout d'un pont) : il peut y sauter, y dasher.
 */
function place(w, xPx, feetPx) {
  const p = w.player;
  p.x = Math.round((xPx - 5) * SUB);
  p.y = Math.round((feetPx - 22) * SUB);
  p.vx = 0; p.vy = 0;
  p.onGround = true; p.ground = { kind: 'static', dx: 0, dy: 0 };
  p.dashes = w.abilities.has('dash') ? 1 : 0;
  p.dashCooldown = 0; p.dashing = 0; p.coyote = 6; p.stamina = 300; p.dead = false;
  p.climbing = false; p.lastWallSide = 0; p.jumpBuffer = 0; p.prevJump = false; p.prevDash = false; p.facing = 1;
  w.computeBeams();
}

/**
 * Essaie, depuis le monde `w`, une large famille de bonds : direction tenue (puis
 * relâchée ou inversée), saut (moment, durée), dash (direction, moment), second appui
 * sur saut (saut au mur), agrippement. Renvoie vrai si l'un d'eux atteint `goal(world)`.
 */
function anyLeap(w, goal, { dirs = [R], jts = [0, 3], das = [3, 8, 13, 18, 24, 30], grab = true, maxK = 150 } = {}) {
  const s0 = snap(w);
  const dashDirs = [0, R, L, U, U | R, U | L, D | R];
  try {
    for (const dir of dirs) for (const [after, afterAt] of [[dir, 0], [0, 16], [dir === R ? L : R, 24]]) {
      for (const jt of jts) for (const jl of [18, 7]) for (const gr of grab ? [0, G | U] : [0]) for (const dd of dashDirs) {
        for (const da of dd ? das : [0]) for (const j2 of [0, 26]) {
          restore(w, s0);
          for (let k = 0; k < maxK; k++) {
            let b = k >= afterAt ? after : dir;
            if (k >= jt && k < jt + jl) b |= J;
            if (j2 && k >= j2 && k < j2 + 12) b |= J;
            if (dd && k === da) b = (b & ~(L | R)) | X | dd;
            if (gr && k > da + 10) b |= gr;
            w.step(b);
            if (w.player.dead) break;
            if (goal(w)) return true;
            if (w.player.onGround && k > jt + 3 && k > da + 10) break;
          }
        }
      }
    }
    return false;
  } finally {
    restore(w, s0);
  }
}

const button = (w, id) => w.buttons.find((b) => b.id === id);
const receiver = (w, id) => w.receivers.find((r) => r.id === id);
const door = (w, id) => w.doors.find((d) => d.id === id);
const laserAt = (w, col, row) => w.lasers.find((l) => l.col === col && l.row === row);
/** Bord droit du joueur, en pixels. */
const rightEdge = (w) => (w.player.x + w.player.w) / SUB;
/** Le faisceau a-t-il une portion horizontale qui couvre l'abscisse `xPx` (rangée `row`) ? */
function beamCovers(l, xPx, row) {
  return l.on && l.segs.some((sg) => sg.dy === 0 && Math.floor(sg.y0 / (TILE * SUB)) === row
    && Math.min(sg.x0, sg.x1) <= xPx * SUB && Math.max(sg.x0, sg.x1) >= xPx * SUB);
}

// --- Le chapitre dans son ensemble ------------------------------------------------------

const CHAPTER8 = [
  ['71-passerelle.json', 'passerelle'], ['72-ombre-portee.json', 'ombre-portee'],
  ['73-miroir-tournant.json', 'miroir-tournant'], ['74-trappe.json', 'trappe'],
  ['75-escalier-lumiere.json', 'escalier-lumiere'], ['76-persistance.json', 'persistance'],
  ['77-planetaire.json', 'planetaire'], ['78-verrou.json', 'verrou'],
  ['79-chambre-noire.json', 'chambre-noire'], ['80-grande-lunette.json', 'grande-lunette'],
];
const DECOR_TYPES = new Set([
  'bench', 'lamp', 'pendant', 'window', 'clock', 'poster', 'sign', 'counter', 'board', 'radiator', 'plant',
  'walllamp', 'gantry', 'train', 'neon', 'painting', 'statue', 'skylight', 'rope', 'seat', 'lighthouse', 'boat',
  'buoy', 'telescope', 'starchart', 'orrery',
]);
/** Capacités retirées quand l'idée du niveau ne leur résiste pas (voir chaque niveau). */
const ABILITIES = { 'escalier-lumiere': [], persistance: ['walljump', 'grab'] };

test('chapitre 8 : dix pièces bien formées', () => {
  for (const [file, id] of CHAPTER8) {
    const def = raw(file);
    const level = parseLevel(def);
    assert.equal(level.id, id, file);
    assert.equal(def.chapter, 8, file);
    assert.ok(['colline', 'coupole'].includes(def.theme), file);
    assert.ok(typeof def.name === 'string' && def.name.length > 0, file);
    assert.ok(def.narration.endsWith(' (provisoire)'), file);
    assert.ok(def.decor.length >= 4 && def.decor.length <= 8, `${file} : décor`);
    for (const d of def.decor) assert.ok(DECOR_TYPES.has(d.type), `${file} : décor ${d.type}`);
    for (const d of def.decor.filter((x) => x.type === 'sign')) assert.ok(d.text.length <= 10, `${file} : enseigne`);
    assert.deepEqual([...level.abilities], ABILITIES[id] ?? ['walljump', 'grab', 'dash'], file);
    assert.equal(level.exit.rows, 2, `${file} : sortie de deux cases de haut`);
    assert.equal(level.chapterEnd, id === 'grande-lunette', file);
    if (id === 'grande-lunette') {
      assert.equal(def.duration, null);
      assert.ok(def.decor.some((d) => d.type === 'telescope'));
    } else {
      assert.ok(def.duration > 0, file);
    }
  }
  assert.equal(raw('71-passerelle.json').theme, 'colline');
  assert.equal(raw('75-escalier-lumiere.json').theme, 'colline');
  assert.equal(load('75-escalier-lumiere.json').maxEchoes, 1);
  assert.equal(load('78-verrou.json').maxEchoes, 1);
});

// --- 71. La passerelle -----------------------------------------------------------------

test('71 passerelle : l’écho tient la plaque, on marche sur la lumière', () => {
  const s = new Session(load('71-passerelle.json'));
  const bot = new Bot(s);
  const bridge = () => laserAt(s.world, 8, 6);
  assert.equal(bridge().on, false, 'pont éteint au départ');
  bot.walkTo(colCenter(5));
  bot.idle(3);
  assert.equal(bridge().on, true, 'la plaque allume le pont');
  bot.untilAttemptEnds();
  assert.equal(s.attemptCount, 2);
  // On traverse : à mi-ravin, on est debout sur la lumière, au ras du bord.
  bot.holdUntil(R, () => bot.cx >= colCenter(14));
  assert.equal(button(s.world, 'a').pressed, true, 'l’écho est sur la plaque');
  assert.equal(overlapsButton(s.world.actors[0], button(s.world, 'a')), true);
  assert.equal(bot.p.onGround, true);
  assert.equal(bot.feet, rowTop(6), 'debout sur le pont');
  assert.equal(beamCovers(bridge(), bot.cx, 6), true);
  assert.equal(bot.exit(R), 'exit');
  assert.equal(bot.deaths, 0);
  assert.ok(s.level.duration - s.world.tick >= 90, 'au moins 1,5 s d’avance');
});

function overlapsButton(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test('71 passerelle : seul, le pont s’éteint dès qu’on quitte la plaque', () => {
  const s = new Session(load('71-passerelle.json'));
  const bot = new Bot(s);
  const bridge = () => laserAt(s.world, 8, 6);
  bot.walkTo(colCenter(5));
  bot.idle(3);
  assert.equal(bridge().on, true);
  bot.holdUntil(R, () => bot.cx >= colCenter(7));
  assert.equal(bridge().on, false, 'plus personne sur la plaque');
  // On continue : on tombe dans le ravin, sur le faisceau.
  bot.holdUntil(R, () => bot.p.dead, 200);
  assert.equal(bot.deaths, 1);
  assert.equal(s.state, 'playing');
});

test('71 passerelle : le ravin ne se saute pas, même depuis la tête d’échos', () => {
  const w = new World(loadWith('71-passerelle.json', { duration: null }));
  const reached = (wd) => rightEdge(wd) >= 20 * TILE - 1;
  // Témoin : la recherche trouve bien un bond de cinq cases (saut + dash).
  place(w, 8 * TILE + 12, 96);
  assert.equal(anyLeap(w, (wd) => rightEdge(wd) >= 14 * TILE), true);
  // Depuis le bord (pieds au sol), puis depuis une, deux, trois têtes empilées au bord.
  for (const feet of [96, 74, 52, 30]) {
    place(w, 8 * TILE + 12, feet);
    assert.equal(anyLeap(w, reached), false, `bond depuis ${96 - feet} px au-dessus du bord`);
  }
  // Un écho lâché dans le ravin ne fait pas d'ombre aux faisceaux du fond : il passe dessous.
  const s = new Session(load('71-passerelle.json'));
  const bot = new Bot(s);
  bot.holdUntil(R, () => bot.cx >= colCenter(8) + 2);
  bot.hold(R | J, 12);
  s.replay();
  bot.idle(200);
  const e = s.world.actors[0];
  assert.ok(e.y + e.h > rowTop(13), 'l’écho est au fond');
  for (const l of [laserAt(s.world, 8, 7), laserAt(s.world, 20, 7)]) {
    assert.equal(l.hit, null);
    assert.equal(Math.abs(l.ex - l.ox), 11 * TILE * SUB, 'le faisceau barre tout le ravin');
  }
});

// --- 72. L'ombre portée ----------------------------------------------------------------

/** 72 : saut au-dessus de la fosse, « Rejouer » en plein vol. */
function ombreEcho(bot) {
  bot.holdUntil(R, () => bot.cx >= 122);
  bot.holdUntil(R | J, () => bot.cx >= 150, 40);
}
/** 72 : franchir la fosse (trois cases) d'un saut et d'un dash. */
function ombreCross(bot) {
  bot.holdUntil(R, () => bot.cx >= 122);
  bot.hold(R | J, 8);
  bot.step(R | J | X);
  bot.holdUntil(R, () => bot.p.onGround || bot.p.dead, 80);
}

test('72 ombre portée : l’écho lâché dans le faisceau fait de l’ombre au récepteur', () => {
  const s = new Session(load('72-ombre-portee.json'));
  const bot = new Bot(s);
  assert.equal(receiver(s.world, 's').pressed, true, 'récepteur éclairé au départ');
  assert.equal(door(s.world, '1').open, 0, 'porte fermée');
  ombreEcho(bot);
  assert.equal(bot.p.onGround, false, 'en plein vol');
  assert.ok(bot.cx > 8 * TILE + 5 && bot.cx < 11 * TILE - 5, 'au-dessus de la fosse');
  s.replay();
  assert.equal(s.attemptCount, 2);
  const e = s.world.actors[0];
  bot.holdUntil(0, () => e.onGround && e.y + e.h === rowTop(12), 300);
  bot.idle(DOOR_TICKS + 2);
  assert.equal(e.y + e.h, rowTop(12), 'l’écho est au fond de la fosse');
  assert.equal(laserAt(s.world, 7, 11).hit, e, 'le faisceau s’arrête sur lui');
  assert.equal(receiver(s.world, 's').pressed, false, 'il fait nuit plus loin');
  assert.equal(door(s.world, '1').open, DOOR_TICKS, 'la porte s’ouvre');
  ombreCross(bot);
  assert.equal(bot.exit(R), 'exit');
  assert.equal(bot.deaths, 0);
  assert.ok(s.level.duration - s.world.tick >= 90);
});

test('72 ombre portée : seul, la porte reste fermée ; sauter dans la fosse tue', () => {
  const s = new Session(load('72-ombre-portee.json'));
  const bot = new Bot(s);
  // Se laisser tomber dans la fosse : mort, la tentative reprend.
  bot.holdUntil(R, () => bot.p.dead, 200);
  assert.equal(bot.deaths, 1);
  bot.idle(60);
  assert.equal(s.attemptCount, 2, 'la tentative reprend');
  assert.equal(s.world.actors.length, 1, 'sans écho');
  // Franchir la fosse (saut + dash) : la porte est fermée, le récepteur toujours éclairé.
  ombreCross(bot);
  assert.equal(bot.p.dead, false);
  bot.holdUntil(R, () => bot.done, 300);
  assert.equal(s.state, 'playing');
  assert.ok(bot.cx < 22 * TILE, 'arrêté par la porte');
  assert.equal(receiver(s.world, 's').pressed, true);
  // Un saut simple ne franchit pas la fosse (trois cases).
  s.restart();
  bot.holdUntil(R, () => bot.cx >= 124);
  bot.jump(1);
  assert.equal(bot.deaths, 2);
});

test('72 ombre portée : un écho resté au bord de la fosse ne fait pas d’ombre', () => {
  const s = new Session(load('72-ombre-portee.json'));
  const bot = new Bot(s);
  bot.walkTo(7 * TILE + 8);
  s.replay();
  bot.idle(150);
  assert.equal(receiver(s.world, 's').pressed, true);
  assert.equal(door(s.world, '1').open, 0);
});

// --- 73. Le miroir tournant ------------------------------------------------------------

/** 73, écho : podium de gauche, pont de gauche, îlot, levier. */
function miroirEcho(bot) {
  bot.hopOnStep(-1);
  bot.jump(0);
  bot.walkTo(colCenter(1));
  bot.step(D);
  bot.idle(3);
}

test('73 miroir tournant : l’écho bascule le levier, le pont change de côté', () => {
  const s = new Session(load('73-miroir-tournant.json'));
  const bot = new Bot(s);
  const light = () => laserAt(s.world, 13, 0);
  assert.equal(beamCovers(light(), colCenter(8), 5), true, 'au départ, le pont va à gauche');
  assert.equal(beamCovers(light(), colCenter(20), 5), false);
  bot.hopOnStep(-1);
  assert.equal(bot.feet, rowTop(7), 'sur le podium');
  assert.equal(beamCovers(light(), colCenter(8), 5), true, 'debout sur le podium, on ne coupe pas le rayon');
  bot.jump(0);
  assert.equal(bot.feet, rowTop(5), 'on monte sur le pont par-dessous');
  bot.walkTo(colCenter(1));
  bot.step(D);
  bot.idle(3);
  assert.equal(s.world.mirrors[0].flipped, true);
  assert.equal(beamCovers(light(), colCenter(8), 5), false, 'plus de pont à gauche');
  assert.equal(beamCovers(light(), colCenter(20), 5), true, 'il va à droite');
  bot.untilAttemptEnds();
  // Nous : podium de droite, attendre la bascule, monter, sortir.
  bot.hopOnStep(1);
  assert.equal(bot.feet, rowTop(7));
  bot.holdUntil(0, () => s.world.mirrors[0].flipped, 600);
  assert.ok(s.world.tick > 120, 'il faut attendre l’écho');
  assert.equal(overlapsButton(s.world.actors[0], s.world.levers[0]), true, 'c’est l’écho qui a basculé');
  bot.idle(3);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(5), 'sur le pont de droite');
  assert.equal(bot.exit(R), 'exit');
  assert.equal(bot.deaths, 0);
  assert.ok(s.level.duration - s.world.tick >= 90);
});

test('73 miroir tournant : seul, celui qui bascule reste sur l’îlot', () => {
  const s = new Session(loadWith('73-miroir-tournant.json', { duration: null }));
  const bot = new Bot(s);
  miroirEcho(bot);
  assert.equal(s.world.mirrors[0].flipped, true);
  // Depuis le bord de l'îlot, aucun bond ne rejoint le podium (9 cases de vide, faisceau au fond).
  const w = s.world;
  for (const x of [TILE + 8, 2 * TILE + 3]) {
    place(w, x, 80);
    assert.equal(anyLeap(w, (wd) => rightEdge(wd) >= 11 * TILE - 1), false, `retour depuis x=${x}`);
  }
  // Et en marchant, on tombe sur le faisceau.
  place(w, TILE + 8, 80);
  bot.holdUntil(R, () => bot.p.dead, 200);
  assert.equal(bot.deaths, 1);
  // Rebasculer rend le pont de gauche, mais reprend celui de droite.
  bot.idle(60);
  miroirEcho(bot);
  bot.step(D);
  bot.idle(3);
  assert.equal(s.world.mirrors[0].flipped, false);
});

test('73 miroir tournant : sans le pont de droite, la sortie est hors d’atteinte', () => {
  const w = new World(loadWith('73-miroir-tournant.json', { duration: null }));
  const reached = (wd) => wd.won || rightEdge(wd) >= 25 * TILE - 1;
  // Depuis le podium de droite (au sol, puis sur une ou deux têtes), et depuis le dessus du miroir.
  for (const [x, feet] of [[15 * TILE + 12, 112], [15 * TILE + 12, 90], [15 * TILE + 12, 68], [13 * TILE + 12, 80], [13 * TILE + 12, 58]]) {
    place(w, x, feet);
    assert.equal(anyLeap(w, reached), false, `bond depuis x=${x}, pieds à ${feet}`);
  }
});

test('73 miroir tournant : deux échos qui basculent s’annulent', () => {
  const s = new Session(load('73-miroir-tournant.json'));
  const bot = new Bot(s);
  miroirEcho(bot);
  bot.untilAttemptEnds();
  miroirEcho(bot);
  assert.equal(s.world.levers[0].pressed, false, 'l’écho et nous au même instant : le levier revient');
  bot.untilAttemptEnds();
  assert.equal(s.world.actors.length, 3);
  bot.hopOnStep(1);
  let flipped = false;
  const a = s.attempt;
  while (s.attempt === a && s.state === 'playing') { bot.step(0); flipped ||= s.world.mirrors[0].flipped; }
  assert.equal(flipped, false, 'le miroir n’a jamais tourné');
  assert.equal(s.state, 'playing');
});

// --- 74. La trappe de lumière ----------------------------------------------------------

/** 74 : monter sur le pont, puis aller se mettre sous le rayon, contre le mur (sur le miroir). */
function trappeCut(bot) {
  bot.jump(0);
  bot.holdUntil(L, () => bot.p.vx === 0 && bot.cx < 40, 300);
}
const SHAFT_74 = 17 * TILE;

test('74 trappe : l’écho met la main dans le rayon, le pont s’efface sous nos pieds', () => {
  const s = new Session(load('74-trappe.json'));
  const bot = new Bot(s);
  const light = () => laserAt(s.world, 1, 0);
  assert.equal(beamCovers(light(), colCenter(20), 5), true, 'le pont est allumé d’un bout à l’autre');
  // Écho : attendre cinq secondes, puis couper.
  bot.idle(300);
  trappeCut(bot);
  assert.equal(bot.feet, rowTop(5), 'debout sur le miroir');
  assert.equal(light().hit, bot.p, 'le rayon s’arrête sur nous');
  assert.equal(light().segs.length, 1, 'plus de pont');
  bot.untilAttemptEnds();
  // Nous : monter sur le pont, s'arrêter au-dessus de la cheminée, attendre.
  bot.jump(0);
  assert.equal(bot.feet, rowTop(5));
  bot.walkTo(SHAFT_74);
  assert.ok(s.world.tick < 240, 'en place plus d’une seconde avant l’écho');
  assert.equal(bot.p.onGround, true);
  assert.equal(beamCovers(light(), bot.cx, 5), true);
  bot.holdUntil(0, () => !bot.p.onGround, 400);
  assert.ok(s.world.tick >= 300, 'le pont tient jusqu’à ce que l’écho bouge');
  assert.equal(beamCovers(light(), bot.cx, 5), false, 'coupé en amont');
  bot.holdUntil(0, () => bot.done, 200);
  assert.equal(s.outcome, 'exit');
  assert.equal(bot.deaths, 0);
  assert.ok(s.level.duration - s.world.tick >= 90);
});

test('74 trappe : seul, on ne peut pas couper le rayon et être dessus', () => {
  const s = new Session(load('74-trappe.json'));
  const bot = new Bot(s);
  bot.jump(0);
  bot.walkTo(SHAFT_74);
  // Sauter sur place ne coupe rien : on retombe sur le pont.
  bot.jump(0);
  assert.equal(bot.feet, rowTop(5));
  bot.untilAttemptEnds();
  assert.equal(s.state, 'playing');
  assert.equal(s.attemptCount, 2);
  // Ailleurs qu'au-dessus de la cheminée, le pont coupé nous lâche sur le faisceau.
  bot.idle(300);
  trappeCut(bot);
  bot.untilAttemptEnds();
  bot.jump(0);
  bot.walkTo(colCenter(11));
  bot.holdUntil(0, () => bot.p.dead, 400);
  assert.equal(bot.deaths, 1);
});

test('74 trappe : un écho posé d’emblée dans le rayon empêche de monter sur le pont', () => {
  const s = new Session(loadWith('74-trappe.json', { duration: null }));
  const bot = new Bot(s);
  trappeCut(bot);
  s.replay();
  const e = s.world.actors[0];
  bot.holdUntil(0, () => e.finished && laserAt(s.world, 1, 0).hit === e, 300);
  bot.idle(5);
  assert.equal(laserAt(s.world, 1, 0).segs.length, 1, 'le rayon s’arrête sur l’écho');
  bot.jump(0);
  assert.equal(bot.feet, rowTop(7), 'plus de pont : on retombe au sol');
  // Du bord (au sol, sur un bout de pont, sur des têtes), aucun bond n'atteint la cheminée.
  const w = s.world;
  const reached = (wd) => wd.won || rightEdge(wd) >= 15 * TILE - 1;
  for (const feet of [112, 90, 80, 58, 38]) {
    place(w, 5 * TILE + 12, feet);
    assert.equal(anyLeap(w, reached), false, `bond depuis le bord, pieds à ${feet}`);
  }
});

// --- 75. L'escalier de lumière ---------------------------------------------------------

const STEP_ROWS = { a: 11, b: 9, c: 7 };
const stepOn = (w, id) => laserAt(w, 23, STEP_ROWS[id]).on;

test('75 escalier de lumière : l’écho va de plaque en plaque, on monte au même rythme', () => {
  const s = new Session(load('75-escalier-lumiere.json'));
  const bot = new Bot(s);
  // Écho : s'attarder sur a, puis sur b, puis rester sur c.
  bot.walkTo(colCenter(3));
  assert.equal(stepOn(s.world, 'a'), true);
  bot.untilTick(240);
  bot.walkTo(colCenter(5));
  assert.deepEqual(['a', 'b', 'c'].map((id) => stepOn(s.world, id)), [true, true, false], 'la minuterie de a court encore');
  bot.untilTick(380);
  bot.walkTo(colCenter(7));
  bot.untilAttemptEnds();
  // Nous : sous les marches, puis une marche à chaque plaque.
  bot.walkTo(colCenter(18));
  assert.equal(stepOn(s.world, 'a'), true);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(11), 'première marche');
  bot.holdUntil(0, () => stepOn(s.world, 'b'), 600);
  bot.idle(10);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(9), 'deuxième marche');
  bot.holdUntil(0, () => stepOn(s.world, 'c'), 600);
  assert.equal(stepOn(s.world, 'a'), false, 'la première s’est éteinte derrière nous');
  bot.idle(10);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(7), 'troisième marche');
  assert.equal(overlapsButton(s.world.actors[0], button(s.world, 'c')), true, 'l’écho est sur la dernière plaque');
  assert.equal(bot.exit(R), 'exit');
  assert.ok(s.level.duration - s.world.tick >= 90);
});

/** 75 : courir sous les marches et grimper tout ce qui est allumé ; renvoie la hauteur atteinte (rangée des pieds). */
function escalierClimb(bot, s) {
  bot.holdUntil(R, () => bot.cx >= colCenter(14) + 2, 400);
  let best = bot.feet;
  for (let i = 0; i < 4 && !bot.done; i++) {
    bot.jump(1);
    best = Math.min(best, bot.feet);
    bot.holdUntil(R, () => bot.cx >= colCenter(17) + 4 || bot.done, 100);
  }
  bot.holdUntil(R, () => bot.done || bot.w.tick > 700, 700);
  return Math.min(best, bot.feet);
}

test('75 escalier de lumière : seul, les marches s’éteignent avant qu’on y soit', () => {
  const s = new Session(load('75-escalier-lumiere.json'));
  const bot = new Bot(s);
  // Passer sur les trois plaques en courant, puis grimper.
  const top = escalierClimb(bot, s);
  assert.equal(s.state, 'playing');
  assert.equal(top, rowTop(13), 'on n’a même pas eu la première marche');
  assert.equal(stepOn(s.world, 'a'), false);
});

test('75 escalier de lumière : un écho resté sur une seule plaque ne suffit pas', () => {
  // Resté sur a : la première marche est là, la troisième manque.
  const s = new Session(load('75-escalier-lumiere.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(3));
  bot.untilAttemptEnds();
  const top = escalierClimb(bot, s);
  assert.equal(s.state, 'playing');
  assert.equal(top, rowTop(11), 'la première marche, pas plus');
  assert.equal(stepOn(s.world, 'c'), false);
  // Resté sur c : la troisième est allumée, mais on n'atteint pas la première à temps.
  const t = new Session(load('75-escalier-lumiere.json'));
  const bt = new Bot(t);
  bt.walkTo(colCenter(7));
  bt.untilAttemptEnds();
  assert.equal(escalierClimb(bt, t), rowTop(13));
  assert.equal(stepOn(t.world, 'c'), true);
  assert.equal(t.state, 'playing');
});

test('75 escalier de lumière : ni dash, ni saut au mur ; un seul écho', () => {
  const lv = load('75-escalier-lumiere.json');
  assert.deepEqual([...lv.abilities], []);
  assert.equal(lv.maxEchoes, 1);
  // Depuis la tête d'un écho au sol, la deuxième marche (allumée seule) reste trop haute (42 px).
  const def = raw('75-escalier-lumiere.json');
  const w = new World(parseLevel({
    ...def, duration: null, lasers: def.lasers.map((l) => (l.row === 9 ? { col: l.col, row: l.row, bridge: true } : l)),
  }));
  assert.equal(laserAt(w, 23, 9).on, true);
  place(w, colCenter(18), 208 - 22);
  assert.equal(anyLeap(w, (wd) => wd.player.onGround && wd.player.y + wd.player.h <= rowTop(9), { dirs: [0, R] }), false);
});

// --- 76. La persistance ----------------------------------------------------------------

/** 76 : monter à l'étage par les deux paliers de gauche. */
function persistanceClimb(bot) {
  bot.walkTo(colCenter(2) - 2);
  bot.jump(0);
  bot.jump(0);
  bot.step(J);
  bot.hold(J, 8);
  bot.holdUntil(R | J, () => bot.p.onGround, 60);
}
const bothLit = (w) => receiver(w, 's').pressed && receiver(w, 't').pressed;

test('76 persistance : l’écho fait aller et venir le miroir, les deux récepteurs restent actifs', () => {
  const s = new Session(load('76-persistance.json'));
  const bot = new Bot(s);
  assert.equal(receiver(s.world, 's').lit, true, 'au départ, la lumière va à gauche');
  assert.equal(receiver(s.world, 't').pressed, false);
  assert.equal(door(s.world, '1').open, 0);
  // Écho : aller au levier, et le basculer toutes les secondes et demie jusqu'à la fin.
  bot.walkTo(colCenter(25));
  let toggles = 0;
  while (s.attempt === 1) { bot.step(D); toggles++; bot.hold(0, 89); }
  assert.ok(toggles >= 5);
  // Nous : monter, attendre devant la première porte, passer les deux.
  persistanceClimb(bot);
  assert.equal(bot.feet, rowTop(7), 'à l’étage');
  bot.holdUntil(R, () => bot.p.vx === 0 && bot.cx > 100, 300);
  assert.ok(bot.cx < 8 * TILE, 'devant la première porte, fermée');
  bot.holdUntil(R, () => bot.cx > 9 * TILE, 400);
  // Entre les deux portes : une seule lumière, mais les deux récepteurs tiennent.
  let always = true;
  let sides = new Set();
  bot.holdUntil(R, () => {
    always &&= bothLit(s.world) && door(s.world, '2').target;
    sides.add(receiver(s.world, 's').lit ? 's' : 't');
    assert.ok(!(receiver(s.world, 's').lit && receiver(s.world, 't').lit), 'jamais les deux éclairés à la fois');
    return bot.cx > 23 * TILE || bot.done;
  }, 600);
  assert.equal(always, true, 'les deux récepteurs sont restés actifs pendant toute la traversée');
  assert.equal(sides.size, 2, 'la lumière a changé de côté en chemin');
  assert.equal(bot.exit(R), 'exit');
  assert.ok(s.level.duration - s.world.tick >= 90);
});

test('76 persistance : seul, la porte se referme bien avant qu’on l’atteigne', () => {
  const s = new Session(load('76-persistance.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(25));
  bot.step(D);
  bot.idle(3);
  assert.equal(bothLit(s.world), true, 'un basculement : les deux actifs, un instant');
  const t0 = s.world.tick;
  bot.idle(DOOR_TICKS);
  assert.equal(door(s.world, '1').open, DOOR_TICKS);
  persistanceClimb(bot);
  assert.ok(s.world.tick - t0 > 300, 'le chemin est bien plus long que la rémanence (150)');
  assert.equal(bothLit(s.world), false);
  bot.holdUntil(R, () => bot.done || (bot.p.vx === 0 && bot.cx > 100), 300);
  bot.hold(R, 30);
  assert.equal(s.attemptCount, 1, 'toujours la même tentative');
  assert.equal(s.state, 'playing');
  assert.ok(bot.cx < 8 * TILE, 'arrêté par la première porte');
  assert.equal(door(s.world, '1').open, 0);
});

test('76 persistance : un écho qui ne bascule qu’une fois ne suffit pas (deux portes)', () => {
  const s = new Session(load('76-persistance.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(25));
  bot.step(D);
  bot.untilAttemptEnds();
  // On attend devant la première porte : elle s'ouvre, on passe…
  persistanceClimb(bot);
  bot.holdUntil(R, () => bot.p.vx === 0 && bot.cx > 100, 300);
  bot.holdUntil(R, () => bot.cx > 9 * TILE, 400);
  assert.ok(bot.cx > 9 * TILE, 'première porte passée');
  // … mais la seconde s'est refermée avant qu'on y soit.
  bot.holdUntil(R, () => bot.done || (bot.p.vx === 0 && bot.cx > 300), 600);
  assert.equal(s.state, 'playing');
  assert.ok(bot.cx < 22 * TILE);
  assert.equal(door(s.world, '2').open, 0);
  bot.untilAttemptEnds();
  assert.equal(s.state, 'playing');
});

// --- 77. Le planétaire -----------------------------------------------------------------

test('77 planétaire : les quatre positions des deux miroirs', () => {
  const w = new World(load('77-planetaire.json'));
  const m1 = w.mirrors.find((m) => m.col === 14);
  const m2 = w.mirrors.find((m) => m.col === 1);
  const light = laserAt(w, 14, 0);
  const state = (a, b) => {
    m1.flipped = a; m2.flipped = b;
    w.computeBeams();
    return { couloir: beamCovers(light, colCenter(10), 12), s: receiver(w, 's').lit, t: receiver(w, 't').lit };
  };
  assert.deepEqual(state(false, false), { couloir: true, s: false, t: false }, 'au repos : le rayon enfile le couloir');
  assert.deepEqual(state(false, true), { couloir: false, s: true, t: false }, 'plaque b : vers s, le couloir est libre');
  assert.deepEqual(state(true, false), { couloir: false, s: false, t: true }, 'plaque a : vers t');
  assert.deepEqual(state(true, true), { couloir: false, s: false, t: true }, 'a l’emporte : le premier miroir est en amont');
  // Le faisceau du couloir s'arrête sur la porte 1 fermée.
  state(false, false);
  assert.equal(light.ex, 20 * TILE * SUB);
});

/** 77, écho B : se laisser tomber dans le trou de la galerie, « Rejouer » en plein vol. */
function planetaireDrop(bot) {
  bot.holdUntil(R, () => bot.feet > 130 * SUB, 200);
}
/** 77 : descendre par le trou et marcher jusqu'au sas, entre les deux portes. */
function planetaireToSas(bot, s) {
  bot.holdUntil(0, () => door(s.world, '1').open === DOOR_TICKS, 300);
  bot.holdUntil(R, () => (bot.p.onGround && bot.feet > 150 * SUB) || bot.p.dead, 200);
  bot.holdUntil(R, () => bot.cx > 21.5 * TILE || bot.p.dead || (bot.p.vx === 0 && bot.cx > 300), 400);
}

test('77 planétaire : un écho sur la plaque du couloir en feu, l’autre sur a après notre passage', () => {
  const s = new Session(load('77-planetaire.json'));
  const bot = new Bot(s);
  // Écho B : tombe par le trou, sur la plaque b, dans le rayon.
  planetaireDrop(bot);
  assert.equal(bot.p.onGround, false);
  assert.ok(Math.abs(bot.cx - colCenter(9)) <= 3, 'dans le trou, au-dessus de la plaque');
  s.replay();
  const eb = s.world.actors[0];
  bot.holdUntil(0, () => button(s.world, 'b').pressed, 300);
  bot.idle(DOOR_TICKS + 2);
  assert.equal(overlapsButton(eb, button(s.world, 'b')), true);
  assert.equal(beamCovers(laserAt(s.world, 14, 0), colCenter(12), 12), false, 'le couloir est libre');
  assert.equal(receiver(s.world, 's').pressed, true);
  assert.equal(door(s.world, '1').open, DOOR_TICKS);
  // Écho A : attendre, puis la plaque a.
  bot.untilTick(330);
  bot.walkTo(colCenter(5));
  bot.idle(DOOR_TICKS + 2);
  assert.equal(receiver(s.world, 't').pressed, true, 'a : la lumière part vers t');
  assert.equal(receiver(s.world, 's').pressed, false);
  assert.equal(door(s.world, '1').open, 0, 'la porte 1 se referme');
  assert.equal(door(s.world, '2').open, DOOR_TICKS);
  bot.untilAttemptEnds();
  // Nous : descendre, traverser le couloir, attendre dans le sas.
  planetaireToSas(bot, s);
  assert.ok(bot.cx > 21 * TILE && bot.cx < 24 * TILE, 'dans le sas');
  assert.ok(s.world.tick < 300, 'avant que l’écho n’appuie sur a');
  assert.equal(door(s.world, '2').open, 0);
  assert.equal(bot.exit(R), 'exit');
  assert.equal(door(s.world, '1').open, 0, 'la porte 1 s’est refermée derrière nous');
  assert.equal(bot.deaths, 0);
  assert.ok(s.level.duration - s.world.tick >= 90);
});

test('77 planétaire : seul, le couloir brûle', () => {
  const s = new Session(load('77-planetaire.json'));
  const bot = new Bot(s);
  // Par le trou : on meurt avant de toucher la plaque.
  bot.holdUntil(R, () => bot.p.dead, 300);
  assert.equal(bot.deaths, 1);
  assert.equal(button(s.world, 'b').pressed, false);
  bot.idle(60);
  // Par le bout de la galerie : pareil.
  bot.jump(1);
  bot.holdUntil(R, () => bot.p.dead, 300);
  assert.equal(bot.deaths, 2);
  bot.idle(60);
  // La plaque a éteint le couloir, mais on ne peut pas être à deux endroits.
  bot.walkTo(colCenter(5));
  bot.idle(5);
  assert.equal(beamCovers(laserAt(s.world, 14, 0), colCenter(12), 12), false);
  bot.holdUntil(R, () => bot.cx > colCenter(7));
  bot.idle(3);
  assert.equal(beamCovers(laserAt(s.world, 14, 0), colCenter(12), 12), true, 'on quitte a : le feu revient');
});

test('77 planétaire : sans l’écho de a, ou s’il appuie trop tôt, on reste bloqué', () => {
  // Un seul écho (sur b) : la porte 2 ne s'ouvre jamais.
  const s = new Session(load('77-planetaire.json'));
  const bot = new Bot(s);
  planetaireDrop(bot);
  s.replay();
  planetaireToSas(bot, s);
  assert.ok(bot.cx > 21 * TILE, 'dans le sas');
  bot.untilAttemptEnds(R);
  assert.equal(s.state, 'playing');

  // Écho sur a dès le début : le couloir est sombre, mais la porte 1 ne s'ouvre jamais.
  for (const wait of [0, 100]) {
    const t = new Session(load('77-planetaire.json'));
    const bt = new Bot(t);
    planetaireDrop(bt);
    t.replay();
    bt.idle(wait);
    bt.walkTo(colCenter(5));
    bt.untilAttemptEnds();
    assert.equal(t.world.actors.length, 3);
    if (wait === 0) {
      bt.idle(60);
      assert.equal(door(t.world, '1').open, 0, 'a d’abord : s n’est jamais éclairé');
      bt.holdUntil(R, () => (bt.p.onGround && bt.feet > 150 * SUB) || bt.p.dead, 200);
    } else {
      planetaireToSas(bt, t);
    }
    bt.holdUntil(R, () => bt.done || bt.p.dead || (bt.p.vx === 0 && bt.cx > 300), 400);
    assert.equal(bt.deaths, 0, 'le couloir est sombre');
    assert.ok(bt.cx < 20 * TILE, `arrêté par la porte 1 (a pressée après ${wait} ticks)`);
    bt.untilAttemptEnds(R);
    assert.equal(t.state, 'playing');
  }
});

// --- 78. Le verrou de lumière ----------------------------------------------------------

/** 78, écho : la marche, la corniche (à travers le rayon), le bouton b. */
function verrouEcho(bot) {
  bot.hopOnStep(-1);
  bot.jump(-1);
  bot.walkTo(colCenter(1));
}
const RAY_78 = (w) => laserAt(w, 22, 11);

test('78 verrou : la porte fermée arrête le rayon, grande ouverte elle le laisse passer', () => {
  const w = new World(load('78-verrou.json'));
  const d1 = door(w, '1');
  assert.equal(RAY_78(w).ex, 20 * TILE * SUB, 'fermée : le rayon s’arrête sur la porte');
  for (let open = 0; open <= DOOR_TICKS; open++) {
    d1.open = open;
    w.computeBeams();
    assert.equal(receiver(w, 's').lit, open >= DOOR_TICKS - 2, `ouverture ${open}/${DOOR_TICKS}`);
  }
  assert.equal(RAY_78(w).ex, TILE * SUB, 'ouverte : il va jusqu’au récepteur');
  // Debout sous le rayon, on ne le coupe pas ; le tourniquet non plus.
  assert.equal(RAY_78(w).hit, null);
});

test('78 verrou : l’écho monte tenir b, puis on arme le verrou et on marche', () => {
  const s = new Session(load('78-verrou.json'));
  const bot = new Bot(s);
  verrouEcho(bot);
  assert.equal(bot.feet, rowTop(10), 'sur la corniche');
  assert.equal(button(s.world, 'b').pressed, true);
  assert.equal(door(s.world, '2').target, true);
  bot.untilAttemptEnds();
  // Nous : attendre que l'écho soit passé, puis la plaque a.
  bot.holdUntil(0, () => button(s.world, 'b').pressed, 400);
  bot.walkTo(colCenter(9));
  bot.idle(DOOR_TICKS + 3);
  assert.equal(receiver(s.world, 's').pressed, true, 'le rayon passe par la porte ouverte');
  // On quitte la plaque : la porte se tient ouverte toute seule.
  bot.holdUntil(R, () => bot.cx > colCenter(13));
  assert.equal(button(s.world, 'a').pressed, false);
  assert.equal(door(s.world, '1').open, DOOR_TICKS, 'verrouillée par sa propre lumière');
  assert.equal(receiver(s.world, 's').pressed, true);
  assert.equal(overlapsButton(s.world.actors[0], button(s.world, 'b')), true, 'l’écho tient b');
  // Marcher, sans sauter, jusqu'au pied de l'estrade ; y monter ; sortir.
  bot.holdUntil(R, () => bot.p.vx === 0 && bot.cx > 300, 400);
  assert.ok(bot.cx > 20 * TILE, 'porte 1 passée');
  bot.hold(R | J, 17);
  bot.holdUntil(R, () => bot.p.onGround, 60);
  assert.equal(bot.feet, rowTop(11));
  assert.equal(bot.exit(R), 'exit');
  assert.ok(s.level.duration - s.world.tick >= 90);
});

test('78 verrou : armé avant le passage de l’écho, le verrou saute quand il traverse le rayon', () => {
  const s = new Session(load('78-verrou.json'));
  const bot = new Bot(s);
  verrouEcho(bot);
  bot.untilAttemptEnds();
  // On file sur a tout de suite : la porte s'ouvre et se verrouille…
  bot.walkTo(colCenter(9));
  bot.holdUntil(0, () => receiver(s.world, 's').pressed, 60);
  assert.equal(receiver(s.world, 's').pressed, true);
  assert.equal(button(s.world, 'b').pressed, false, 'l’écho n’est pas encore monté');
  // … mais l'écho monte sur la marche, dans le rayon : la porte retombe avant qu'on y soit.
  let cutBy = null;
  bot.holdUntil(R, () => {
    if (!cutBy && RAY_78(s.world).hit) cutBy = RAY_78(s.world).hit;
    return bot.done || (bot.p.vx === 0 && bot.cx > 200);
  }, 400);
  assert.equal(cutBy, s.world.actors[0], 'c’est l’écho qui a coupé le rayon');
  assert.ok(bot.cx < 19 * TILE, 'arrêté par la porte 1');
  assert.equal(door(s.world, '1').open, 0);
  assert.equal(RAY_78(s.world).ex, 20 * TILE * SUB, 'et le rayon ne repasse plus');
  bot.hold(R, 120);
  assert.equal(s.state, 'playing');
  assert.equal(door(s.world, '2').open, DOOR_TICKS, 'la porte 2, elle, est ouverte');
  // Même en dash, on n'arrive pas avant.
  s.restart();
  verrouEcho(bot);
  bot.untilAttemptEnds();
  bot.holdUntil(R, () => bot.cx > colCenter(9) - 4);
  bot.holdUntil(0, () => door(s.world, '1').open >= 10, 100);
  for (let i = 0; i < 8 && !bot.done; i++) { bot.step(R | X); bot.hold(R, 16); }
  assert.ok(bot.cx < 19 * TILE);
  assert.equal(s.state, 'playing');
});

test('78 verrou : seul, ou en sautant en chemin, on ne passe pas', () => {
  // Seul : le verrou tient, la porte 1 se passe, mais personne ne tient b.
  const s = new Session(load('78-verrou.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(9));
  bot.idle(DOOR_TICKS + 3);
  bot.holdUntil(R, () => bot.p.vx === 0 && bot.cx > 300, 400);
  assert.ok(bot.cx > 20 * TILE, 'porte 1 passée grâce au verrou');
  bot.hold(R | J, 17);
  bot.holdUntil(R, () => bot.p.onGround, 60);
  bot.holdUntil(R, () => bot.done, 300);
  assert.equal(s.state, 'playing');
  assert.ok(bot.cx < 24 * TILE, 'arrêté par la porte 2');
  // L'écho ne peut pas tenir a puis aller à b : le tourniquet ne se repasse pas.
  s.restart();
  bot.walkTo(colCenter(9));
  bot.holdUntil(L, () => bot.p.vx === 0, 200);
  bot.step(L | X);
  bot.hold(L, 30);
  assert.ok(bot.cx > 9 * TILE, 'on ne revient pas par le tourniquet');

  // Avec l'écho sur b : un saut en chemin coupe le rayon, la porte 1 retombe.
  const t = new Session(load('78-verrou.json'));
  const bt = new Bot(t);
  verrouEcho(bt);
  bt.untilAttemptEnds();
  bt.holdUntil(0, () => button(t.world, 'b').pressed, 400);
  bt.walkTo(colCenter(9));
  bt.idle(DOOR_TICKS + 3);
  bt.holdUntil(R, () => bt.cx > colCenter(12));
  assert.equal(door(t.world, '1').open, DOOR_TICKS);
  bt.jump(1);
  assert.equal(receiver(t.world, 's').pressed, false, 'le saut a coupé le rayon');
  bt.holdUntil(R, () => bt.done || (bt.p.vx === 0 && bt.cx > 200), 300);
  assert.ok(bt.cx < 19 * TILE, 'arrêté par la porte 1');
  assert.equal(door(t.world, '1').open, 0);
});

// --- 79. La chambre noire --------------------------------------------------------------

/** 79 : descendre au sous-sol par le trou de la galerie. */
function chambreDown(bot) {
  bot.holdUntil(R, () => bot.feet > 100 * SUB, 200);
  bot.holdUntil(0, () => bot.p.onGround, 100);
}
/** 79, écho 1 : sauter vers la fosse, « Rejouer » en plein vol au-dessus. */
function chambreShadow(bot) {
  chambreDown(bot);
  bot.holdUntil(L, () => bot.cx <= 119, 100);
  bot.holdUntil(L | J, () => bot.cx <= 98, 40);
}
/** 79, écho 2 : sauter la fosse, passer la porte, tenir la plaque b. */
function chambrePlate(bot) {
  chambreDown(bot);
  bot.holdUntil(0, () => door(bot.w, '1').open === DOOR_TICKS, 200);
  bot.holdUntil(L, () => bot.cx <= 119, 100);
  bot.hold(L | J, 17);
  bot.holdUntil(L, () => bot.p.onGround || bot.p.dead, 60);
  bot.holdUntil(L, () => bot.p.dead || (bot.p.vx === 0 && bot.cx < 80), 300);
}
/** 79, écho 3 : monter sur la passerelle et aller sous le rayon, contre le mur. */
function chambreCut(bot) {
  bot.jump(0);
  bot.holdUntil(L, () => bot.p.vx === 0 && bot.cx < 40, 300);
}
const SHAFT_79 = 21 * TILE;
const walkway = (w) => laserAt(w, 1, 0);
const barrier = (w) => laserAt(w, 19, 8);

test('79 chambre noire : ombre, miroir, pont coupé ; trois échos', () => {
  const s = new Session(load('79-chambre-noire.json'));
  const bot = new Bot(s);
  assert.equal(barrier(s.world).on, true, 'la cheminée est barrée');
  assert.equal(beamCovers(walkway(s.world), colCenter(12), 4), false, 'pas de passerelle');
  // 1. L'ombre : un écho lâché dans la fosse, sur le faisceau.
  chambreShadow(bot);
  assert.equal(bot.p.onGround, false);
  s.replay();
  // 2. Le miroir : la porte s'ouvre, un écho va tenir la plaque b.
  chambrePlate(bot);
  assert.equal(bot.deaths, 0);
  assert.equal(receiver(s.world, 's').pressed, false, 'le premier écho fait de l’ombre');
  assert.equal(button(s.world, 'b').pressed, true);
  bot.idle(3);
  assert.equal(s.world.mirrors[0].flipped, true);
  assert.equal(beamCovers(walkway(s.world), colCenter(12), 4), true, 'la passerelle apparaît');
  assert.equal(barrier(s.world).on, false, 'et la barrière s’éteint');
  bot.untilAttemptEnds();
  // 3. Le pont coupé : un écho attend, puis va se mettre sous le rayon.
  bot.untilTick(540);
  chambreCut(bot);
  assert.equal(walkway(s.world).hit, bot.p);
  bot.untilAttemptEnds();
  assert.equal(s.world.actors.length, 4);
  // Nous : sur la passerelle, au-dessus de la cheminée.
  bot.holdUntil(0, () => s.world.mirrors[0].flipped, 600);
  bot.idle(5);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(4));
  bot.walkTo(SHAFT_79);
  assert.ok(s.world.tick < 540 - 60, 'en place une seconde avant le troisième écho');
  bot.holdUntil(0, () => !bot.p.onGround, 400);
  assert.ok(s.world.tick >= 540);
  assert.equal(button(s.world, 'b').pressed, true, 'la plaque est toujours tenue');
  assert.equal(barrier(s.world).on, false);
  bot.holdUntil(0, () => bot.done, 200);
  assert.equal(s.outcome, 'exit');
  assert.equal(bot.deaths, 0);
  assert.ok(s.level.duration - s.world.tick >= 90);
});

test('79 chambre noire : avec deux échos, on échoue', () => {
  // Ombre + plaque, sans troisième écho : la passerelle tient, on reste dessus.
  const s = new Session(load('79-chambre-noire.json'));
  const bot = new Bot(s);
  chambreShadow(bot);
  s.replay();
  chambrePlate(bot);
  bot.untilAttemptEnds();
  bot.holdUntil(0, () => s.world.mirrors[0].flipped, 600);
  bot.idle(5);
  bot.jump(0);
  bot.walkTo(SHAFT_79);
  bot.jump(0);
  const a = s.attempt;
  while (s.attempt === a && s.state === 'playing') {
    bot.step(0);
    if (s.attempt === a) assert.equal(bot.feet <= rowTop(4), true, 'toujours sur la passerelle');
  }
  assert.equal(s.state, 'playing');

  // Ombre + écho sous le rayon, sans plaque : pas de passerelle du tout.
  const t = new Session(load('79-chambre-noire.json'));
  const bt = new Bot(t);
  chambreShadow(bt);
  t.replay();
  bt.untilTick(540);
  bt.jump(0);
  assert.equal(bt.feet, rowTop(6), 'pas de passerelle où monter');
  bt.untilAttemptEnds();
  bt.walkTo(colCenter(6));
  bt.jump(0);
  assert.equal(bt.feet, rowTop(6));
  assert.equal(barrier(t.world).on, true);
  bt.untilAttemptEnds();
  assert.equal(t.state, 'playing');

  // Plaque + écho sous le rayon, sans ombre : la porte reste fermée, la plaque hors d'atteinte.
  const u = new Session(load('79-chambre-noire.json'));
  const bu = new Bot(u);
  chambreDown(bu);
  bu.holdUntil(L, () => bu.cx <= 119, 100);
  bu.hold(L | J, 17);
  bu.holdUntil(L, () => bu.p.onGround || bu.p.dead, 60);
  bu.holdUntil(L, () => bu.p.dead || (bu.p.vx === 0 && bu.cx < 80), 300);
  assert.equal(bu.deaths, 0);
  assert.ok(bu.cx > 4 * TILE, 'arrêté par la porte 1');
  assert.equal(receiver(u.world, 's').pressed, true);
  assert.equal(button(u.world, 'b').pressed, false);
  bu.untilAttemptEnds();
  assert.equal(u.world.mirrors[0].flipped, false);
});

test('79 chambre noire : si l’écho quitte la plaque, la barrière se rallume sous nous', () => {
  const s = new Session(load('79-chambre-noire.json'));
  const bot = new Bot(s);
  chambreShadow(bot);
  s.replay();
  // L'écho tient b, puis s'en va à 9 s : la passerelle disparaît… et la barrière revient.
  chambrePlate(bot);
  bot.untilTick(540);
  bot.walkTo(40);
  assert.equal(button(s.world, 'b').pressed, false);
  bot.untilAttemptEnds();
  bot.holdUntil(0, () => s.world.mirrors[0].flipped, 600);
  bot.idle(5);
  bot.jump(0);
  bot.walkTo(SHAFT_79);
  bot.holdUntil(0, () => bot.p.dead || bot.done, 400);
  assert.equal(bot.deaths, 1, 'tombé sur la barrière');
  assert.equal(s.state, 'playing');
});

test('79 chambre noire : la cheminée est hors de portée d’un bond', () => {
  const w = new World(loadWith('79-chambre-noire.json', { duration: null }));
  assert.equal(beamCovers(walkway(w), colCenter(12), 4), false);
  const reached = (wd) => wd.won || rightEdge(wd) >= 19 * TILE - 1;
  // Depuis le bord du vide (au sol, sur des têtes, à hauteur de passerelle).
  for (const feet of [96, 74, 64, 42]) {
    place(w, 9 * TILE + 12, feet);
    assert.equal(anyLeap(w, reached), false, `bond depuis le bord, pieds à ${feet}`);
  }
});

// --- 80. La grande lunette -------------------------------------------------------------

/** 80 : monter au balcon et basculer le levier. */
function lunetteLever(bot) {
  bot.holdUntil(L, () => bot.p.vx === 0 && bot.p.onGround && bot.w.tick > 5 && bot.cx < 8 * TILE, 300);
  bot.hold(L | J, 17);
  bot.holdUntil(L, () => bot.p.onGround, 60);
  bot.holdUntil(L, () => bot.cx < 5 * TILE + 4, 100);
  bot.jump(-1);
  bot.walkTo(colCenter(2));
  bot.step(D);
  bot.idle(3);
}

test('80 grande lunette : un levier, une plaque tenue par un écho, et l’étoile ouvre la coupole', () => {
  const s = new Session(load('80-grande-lunette.json'));
  const bot = new Bot(s);
  const star = () => laserAt(s.world, 8, 0);
  assert.equal(s.level.duration, null);
  assert.equal(s.level.chapterEnd, true);
  assert.equal(beamCovers(star(), colCenter(4), 4), true, 'au repos, la lumière se perd à gauche');
  // Écho : la plaque. Seule, elle ne suffit pas.
  bot.walkTo(colCenter(15));
  bot.idle(5);
  assert.equal(s.world.mirrors.find((m) => m.col === 20).flipped, true);
  assert.equal(receiver(s.world, 's').pressed, false);
  s.replay();
  // Nous : le levier. La lumière va au second miroir, remonte au récepteur.
  lunetteLever(bot);
  assert.equal(bot.feet, rowTop(9), 'sur le balcon');
  assert.equal(beamCovers(star(), colCenter(14), 4), true);
  assert.equal(receiver(s.world, 's').pressed, true);
  assert.equal(overlapsButton(s.world.actors[0], button(s.world, 'a')), true, 'l’écho tient la plaque');
  assert.equal(bot.exit(R), 'exit');
});

test('80 grande lunette : un seul écho peut aussi tout faire (levier, puis plaque)', () => {
  const s = new Session(load('80-grande-lunette.json'));
  const bot = new Bot(s);
  lunetteLever(bot);
  bot.walkTo(colCenter(15));
  bot.idle(DOOR_TICKS + 3);
  assert.equal(door(s.world, '1').open, DOOR_TICKS);
  s.replay();
  bot.holdUntil(0, () => door(s.world, '1').open === DOOR_TICKS, 900);
  assert.equal(bot.exit(R), 'exit');
});

test('80 grande lunette : seul, la plaque remonte et la coupole se referme', () => {
  const s = new Session(load('80-grande-lunette.json'));
  const bot = new Bot(s);
  // Le levier seul : la lumière va au second miroir, puis tombe au sol.
  lunetteLever(bot);
  assert.equal(beamCovers(laserAt(s.world, 8, 0), colCenter(14), 4), true);
  assert.equal(receiver(s.world, 's').pressed, false);
  assert.equal(laserAt(s.world, 8, 0).ey, rowTop(13), 'elle finit par terre');
  // Sur la plaque : tout s'aligne, la porte s'ouvre.
  bot.walkTo(colCenter(15));
  bot.idle(DOOR_TICKS + 3);
  assert.equal(door(s.world, '1').open, DOOR_TICKS);
  // On la quitte, même en dash : la porte est refermée avant qu'on y soit.
  bot.step(R | X);
  bot.hold(R, 16);
  bot.step(R | X);
  bot.holdUntil(R, () => bot.done || (bot.p.vx === 0 && bot.cx > 300), 300);
  assert.equal(s.state, 'playing');
  assert.ok(bot.cx < 23 * TILE, 'arrêté par la porte');
  assert.equal(door(s.world, '1').open, 0);
  assert.equal(receiver(s.world, 's').pressed, false);
});
