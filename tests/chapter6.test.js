// Chapitre 6 : la mer (niveaux 51 à 60).
//
// Chaque niveau est joué par un petit robot qui suit la solution prévue, à
// travers la vraie Session (step, replay, restart) ; puis on vérifie que l'idée
// du niveau est nécessaire : seul, ou sans l'astuce, ou par un raccourci
// plausible, on n'y arrive pas (la marée nous noie, la lampe efface l'écho…).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseLevel } from '../src/sim/level.js';
import { Session } from '../src/sim/session.js';
import { World } from '../src/sim/world.js';
import {
  IN_LEFT, IN_RIGHT, IN_JUMP, IN_UP, IN_DOWN, IN_DASH, IN_GRAB, SUB, TILE,
} from '../src/sim/constants.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (file) => JSON.parse(readFileSync(join(here, '../src/levels', file), 'utf8'));
const load = (file) => parseLevel(raw(file));
/** Le même niveau, modifié (sans chrono, sans marée…) pour les vérifications. */
const loadWith = (file, extra = {}) => parseLevel({ ...raw(file), ...extra });
const colCenter = (c) => c * TILE + TILE / 2;
const rowTop = (r) => r * TILE * SUB;
const L = IN_LEFT, R = IN_RIGHT, J = IN_JUMP, U = IN_UP, D = IN_DOWN, X = IN_DASH, G = IN_GRAB;

/** Robot : quelques gestes simples, tick par tick, sur une session. */
class Bot {
  constructor(session) {
    this.s = session;
    /** Nombre de fois où le joueur est mort (faisceau, noyade). */
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
  /** Rejoue une bande compressée [[entrée, nombre de ticks], …]. */
  play(rle) { for (const [bits, n] of rle) this.hold(bits, n); }
}

/** Saut puis dash vers le haut (sous un trou), en se décalant ensuite de `side`. */
function jumpDashUp(bot, side) {
  bot.hold(J, 12);
  bot.step(J | U | X);
  bot.hold(J, 9);
  bot.holdUntil(side, () => bot.p.onGround, 60);
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
 * changée), saut (moment), dash (direction, moment), et en option l'agrippement.
 * Renvoie vrai si l'un d'eux atteint `goal(world)`.
 */
function anyLeap(w, goal, { dirs = [R], jts = [0, 4], das = [4, 8, 12, 16, 20, 24, 28, 32], grab = true, maxK = 140 } = {}) {
  const s0 = snap(w);
  const dashDirs = [0, R, L, U, U | R, U | L];
  try {
    for (const dir of dirs) for (const after of [dir, 0]) for (const afterAt of [0, 16]) {
      for (const jt of jts) for (const gr of grab ? [0, G | U] : [0]) for (const dd of dashDirs) {
        for (const da of dd ? das : [0]) {
          restore(w, s0);
          for (let k = 0; k < maxK; k++) {
            let b = k >= afterAt ? after : dir;
            if (k >= jt && k < jt + 18) b |= J;
            if (dd && k === da) b |= X | dd;
            if (gr && k > da) b |= gr;
            w.step(b);
            if (w.player.dead) break;
            if (goal(w)) return true;
            if (w.player.onGround && k > jt + 3 && k > da) break;
          }
        }
      }
    }
    return false;
  } finally {
    restore(w, s0);
  }
}

// --- Le chapitre dans son ensemble ------------------------------------------------------

const CHAPTER6 = [
  ['51-terminus.json', 'terminus'], ['52-plage.json', 'plage'], ['53-jetee.json', 'jetee'],
  ['54-phare.json', 'phare'], ['55-cabines.json', 'cabines'], ['56-port.json', 'port'],
  ['57-digue.json', 'digue'], ['58-grotte.json', 'grotte'],
  ['59-maree-haute.json', 'maree-haute'], ['60-dernier-train.json', 'dernier-train'],
];
const DECOR_TYPES = new Set([
  'bench', 'lamp', 'pendant', 'window', 'clock', 'poster', 'canopy', 'facade', 'sign', 'counter',
  'board', 'radiator', 'plant', 'walllamp', 'gantry', 'train', 'painting', 'statue', 'skylight',
  'rope', 'lighthouse', 'boat', 'buoy',
]);

test('chapitre 6 : dix pièces bien formées', () => {
  for (const [file, id] of CHAPTER6) {
    const def = raw(file);
    const level = parseLevel(def);
    assert.equal(level.id, id, file);
    assert.equal(def.chapter, 6, file);
    assert.ok(['mer', 'terminus'].includes(def.theme), file);
    assert.ok(typeof def.name === 'string' && def.name.length > 0, file);
    assert.ok(def.narration.endsWith(' (provisoire)'), file);
    assert.ok(def.decor.length >= 4 && def.decor.length <= 8, `${file} : décor`);
    for (const d of def.decor) assert.ok(DECOR_TYPES.has(d.type), `${file} : décor ${d.type}`);
    for (const d of def.decor.filter((x) => x.type === 'sign')) assert.ok(d.text.length <= 10, `${file} : enseigne`);
    assert.deepEqual([...level.abilities], ['walljump', 'grab', 'dash'], file);
    if (id === 'dernier-train') {
      assert.equal(def.duration, null);
      assert.equal(def.theme, 'terminus');
      assert.equal(def.exitStyle, 'train');
      assert.ok(def.decor.some((d) => d.type === 'train' && d.variant === 'nuit' && d.layer === 'front'));
      assert.ok(def.decor.some((d) => d.type === 'bench'));
      // Le choix final (monter ou rester) est passé au niveau 90 : ici, on change de chapitre.
      assert.equal(level.chapterEnd, true);
      assert.equal(level.stay, null);
    } else {
      assert.ok(def.duration > 0, file);
    }
  }
  assert.equal(raw('51-terminus.json').theme, 'terminus');
});

// --- 51. Le terminus -------------------------------------------------------------------

/** 51, écho : attendre que le joueur ait passé le faisceau, puis appuyer sur la minuterie. */
function terminusEcho(bot, wait) {
  bot.idle(wait);
  bot.walkTo(colCenter(1));
  bot.untilAttemptEnds(0);
}

test('51 terminus : l’écho appuie au bon moment, la porte est ouverte quand on arrive', () => {
  const s = new Session(load('51-terminus.json'));
  const bot = new Bot(s);
  terminusEcho(bot, 60);
  assert.equal(s.attemptCount, 2);
  assert.equal(bot.exit(R), 'exit');
  assert.equal(bot.deaths, 0);
});

test('51 terminus : seul, appuyer puis courir ne suffit pas ; un écho trop pressé allume le faisceau', () => {
  // Seul : on appuie, le faisceau s'allume entre nous et la porte, jusqu'à la fin de la minuterie.
  const s = new Session(loadWith('51-terminus.json', { duration: null }));
  const bot = new Bot(s);
  bot.walkTo(colCenter(1));
  assert.equal(s.world.lasers[0].on, true, 'le faisceau s’allume');
  // Course au dash vers la porte : on se jette dans le faisceau.
  for (let i = 0; i < 200 && !bot.p.dead; i++) bot.step(i % 8 === 0 ? R | X : R);
  assert.equal(bot.deaths, 1);
  // On attend qu'il s'éteigne : la porte se ferme en même temps.
  s.restart();
  bot.walkTo(colCenter(1));
  bot.walkTo(colCenter(7));
  bot.holdUntil(0, () => !s.world.lasers[0].on, 300);
  for (let i = 0; i < 300 && !bot.done; i++) bot.step(i % 8 === 0 ? R | X : R);
  assert.equal(s.state, 'playing');
  assert.ok(bot.cx < colCenter(25), 'arrêté par la porte refermée');

  // Un écho qui appuie tout de suite : le faisceau nous barre la route.
  const t = new Session(load('51-terminus.json'));
  const b2 = new Bot(t);
  terminusEcho(b2, 0);
  b2.holdUntil(R, () => b2.p.dead || b2.done, 400);
  assert.equal(b2.p.dead, true);
});

test('51 terminus : un écho qui fait écran dans le faisceau ne suffit pas (la porte est trop loin)', () => {
  const s = new Session(load('51-terminus.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(9));
  bot.untilAttemptEnds(0);
  bot.walkTo(colCenter(1));
  for (let i = 0; i < 260 && !bot.done && !bot.p.dead; i++) bot.step(i % 8 === 0 ? R | X : R);
  assert.equal(s.outcome, null);
  assert.equal(bot.p.dead, false, 'l’écho arrête bien le faisceau…');
  assert.ok(bot.cx < colCenter(25), '…mais la minuterie est finie avant la porte');
});

// --- 52. La plage ----------------------------------------------------------------------

/** 52 : l'écho va s'asseoir sur le bouton, et l'on « Rejoue » avant la marée. */
function plageEcho(bot) {
  bot.walkTo(colCenter(6));
  bot.s.replay();
}

test('52 plage : l’écho tient le bouton sous la mer ; à marée haute, sa tête est une île', () => {
  const s = new Session(load('52-plage.json'));
  const bot = new Bot(s);
  plageEcho(bot);
  bot.walkTo(colCenter(6));
  bot.jump(0);
  assert.equal(bot.p.ground.kind, 'echo', 'debout sur la tête de l’écho');
  bot.holdUntil(0, () => s.world.tick >= 262, 400);
  assert.ok(s.world.waterY() < rowTop(12), 'la mer a recouvert la plage…');
  assert.equal(bot.p.dead, false, '…mais pas l’île');
  assert.equal(bot.exit(R), 'exit');
  assert.equal(bot.deaths, 0);
});

test('52 plage : sans l’île, la marée nous rattrape ; sans l’écho, le faisceau barre les rochers', () => {
  // Avec l'écho sur le bouton, on court (au dash) vers les rochers : noyé en route.
  const s = new Session(load('52-plage.json'));
  const bot = new Bot(s);
  plageEcho(bot);
  for (let i = 0; i < 400 && !bot.done && !bot.p.dead; i++) bot.step(i % 8 === 0 ? R | X : R);
  assert.equal(bot.p.dead, true, 'noyé');
  // On attend sur le sable, à côté de l'écho : noyé aussi.
  const t = new Session(load('52-plage.json'));
  const b2 = new Bot(t);
  plageEcho(b2);
  b2.walkTo(colCenter(5));
  b2.holdUntil(0, () => b2.p.dead, 300);
  assert.equal(b2.p.dead, true);
  // Seul : le faisceau reste allumé devant les rochers.
  const u = new Session(loadWith('52-plage.json', { water: null, duration: null }));
  const b3 = new Bot(u);
  b3.holdUntil(R, () => b3.p.dead || b3.done, 600);
  assert.equal(b3.p.dead, true);
});

// --- 53. La jetée ----------------------------------------------------------------------

/** 53 : traverser la jetée (sauter le trou, puis les planches fragiles) jusqu'au bouton b. */
function crossPier(bot) {
  bot.holdUntil(R, () => bot.cx >= colCenter(3), 400);
  bot.hold(R | J, 14);
  bot.holdUntil(R, () => bot.p.onGround, 60);
  bot.holdUntil(R, () => bot.cx >= colCenter(11) - 2, 400);
  for (const gap of [14, 17, 20]) {
    bot.holdUntil(R, () => bot.cx >= gap * TILE - 9, 200);
    bot.hold(R | J, 8);
    bot.holdUntil(R, () => bot.p.onGround, 60);
  }
  bot.walkTo(colCenter(22));
}
const button = (s, id) => s.world.buttons.find((b) => b.id === id);
const door = (s, id) => s.world.doors.find((d) => d.id === id);

test('53 jetée : l’écho bute contre la porte ; plus tard, elle s’ouvre et il va où l’on se noierait', () => {
  const s = new Session(load('53-jetee.json'));
  const bot = new Bot(s);
  // Écho : descendre au rivage et pousser contre la porte, jusqu'à la fin du chrono.
  bot.untilAttemptEnds(R);
  assert.equal(s.attemptCount, 2);
  crossPier(bot);
  assert.equal(button(s, 'b').pressed, true, 'on tient b : la porte du rivage s’ouvre');
  assert.ok(s.world.waterY() < rowTop(12) - 24 * SUB, 'la mer a envahi le bassin');
  bot.holdUntil(0, () => door(s, '1').open === 12, 300);
  const echo = s.world.actors[0];
  assert.equal(echo.y + echo.h, rowTop(7), 'l’écho, renvoyé par le ressort, est sur la plaque');
  assert.equal(bot.exit(R), 'exit');
  assert.equal(bot.deaths, 0);
});

test('53 jetée : y aller soi-même, c’est se noyer ; un écho qui s’arrête trop tôt reste devant la porte', () => {
  // Un écho tient b (il a traversé la jetée), le joueur attend devant la porte du rivage.
  const s = new Session(load('53-jetee.json'));
  const bot = new Bot(s);
  crossPier(bot);
  s.replay();
  bot.holdUntil(R, () => bot.p.dead || bot.done, 600);
  assert.equal(bot.p.dead, true, 'noyé dans le bassin');
  // L'écho qui « Rejoue » dès qu'il touche la porte n'avance plus quand elle s'ouvre.
  const t = new Session(load('53-jetee.json'));
  const b2 = new Bot(t);
  b2.holdUntil(R, () => b2.p.onGround && b2.p.vx === 0 && b2.w.tick > 20, 300);
  t.replay();
  crossPier(b2);
  b2.idle(200);
  assert.equal(button(t, 'a').pressed, false);
  assert.equal(door(t, '1').open, 0);
});

// --- 54. Le phare ----------------------------------------------------------------------

/** 54 : passer une trappe, par un saut et un dash vers le haut, côté `side`. */
function upThrough(bot, col, side) {
  bot.walkTo(side === L ? col * TILE + 6 : col * TILE + 26);
  jumpDashUp(bot, side);
}
function phareE1(bot) {
  bot.walkTo(colCenter(21));
  bot.untilAttemptEnds(0);
}
/** 54, écho 2 : attendre en bas que la lampe soit passée, monter, appuyer sur b. */
function phareE2(bot, at) {
  bot.walkTo(colCenter(7));
  bot.holdUntil(0, () => door(bot.s, '1').open === 12 && bot.w.tick >= at, 900);
  upThrough(bot, 7, L);
  bot.walkTo(colCenter(6));
  bot.untilAttemptEnds(0);
}

test('54 phare : la lampe efface l’écho ; il appuie juste après son passage, on attend en haut', () => {
  const s = new Session(load('54-phare.json'));
  const bot = new Bot(s);
  phareE1(bot);
  phareE2(bot, 438);
  bot.walkTo(colCenter(8));
  bot.holdUntil(0, () => door(s, '1').open === 12, 300);
  upThrough(bot, 7, R);
  assert.equal(bot.feet, rowTop(10), 'premier palier');
  bot.walkTo(colCenter(19));
  assert.equal(door(s, '2').open, 0, 'on attend sous la trappe');
  bot.holdUntil(0, () => door(s, '2').open === 12, 400);
  upThrough(bot, 19, L);
  assert.equal(bot.feet, rowTop(7), 'second palier');
  assert.equal(bot.exit(L), 'exit');
  assert.equal(bot.deaths, 0);
  assert.equal(s.world.actors[1].dead, true, 'l’écho de b a été effacé depuis');
});

test('54 phare : l’écho qui monte tout de suite est effacé ; seul, la minuterie est trop courte', () => {
  const s = new Session(load('54-phare.json'));
  const bot = new Bot(s);
  phareE1(bot);
  phareE2(bot, 0);
  // Le joueur monte avec lui et file vers la trappe.
  bot.walkTo(colCenter(8));
  bot.holdUntil(0, () => door(s, '1').open === 12, 300);
  upThrough(bot, 7, R);
  bot.walkTo(colCenter(19));
  assert.equal(s.world.actors[1].dead, true, 'effacé par la lampe');
  bot.idle(100);
  assert.equal(door(s, '2').open, 0);
  // Seul (un écho en bas) : on tient b, puis on court au dash vers la trappe.
  const t = new Session(loadWith('54-phare.json', { duration: null }));
  const b2 = new Bot(t);
  b2.walkTo(colCenter(21));
  t.replay();
  b2.walkTo(colCenter(7));
  b2.holdUntil(0, () => door(t, '1').open === 12, 300);
  upThrough(b2, 7, L);
  b2.walkTo(colCenter(6));
  assert.equal(button(t, 'b').pressed, true);
  for (let i = 0; i < 60; i++) b2.step(i % 8 === 0 ? R | X : R);
  b2.walkTo(colCenter(19) - 2);
  assert.equal(door(t, '2').open, 0, 'la trappe s’est refermée');
});

// --- 55. Les cabines de plage --------------------------------------------------------------

const plate55 = (s) => button(s, 'a');
/** 55 : un écho va au fond de la cabine (en sautant le trou de la jetée), puis Rejouer. */
function toCorner(bot) {
  bot.holdUntil(L, () => bot.cx <= colCenter(16) - 4, 300);
  bot.hold(L | J, 16);
  bot.holdUntil(L, () => bot.p.onGround && bot.feet === rowTop(13) && bot.p.vx === 0 && bot.cx < colCenter(3), 400);
  bot.s.replay();
}
/** 55 : par le trou de la jetée, pousser la valise jusqu'à la plaque. */
function pushSuitcase(bot) {
  bot.holdUntil(L, () => bot.feet === rowTop(13), 200);
  bot.holdUntil(L, () => plate55(bot.s).count >= 4 || bot.w.blocks[0].x < 16 * SUB || bot.w.tick > 600, 600);
}

test('55 cabines : trois échos au fond, la valise poussée contre eux ; la mer ne l’emporte pas', () => {
  const s = new Session(load('55-cabines.json'));
  const bot = new Bot(s);
  for (let k = 0; k < 3; k++) toCorner(bot);
  assert.equal(s.world.actors.length, 4);
  pushSuitcase(bot);
  assert.equal(plate55(s).count, 4, 'trois échos et la valise');
  // Sortir de la cabine et grimper sur son toit, vers la sortie.
  bot.walkTo(colCenter(6));
  bot.hold(L | J, 14);
  bot.step(L | J | U | X);
  bot.hold(L | J, 12);
  bot.holdUntil(L, () => bot.p.onGround, 60);
  assert.equal(door(s, '1').open, 12);
  assert.equal(bot.exit(L), 'exit');
  assert.equal(bot.deaths, 0);
  assert.ok(s.world.tick < 460, 'avant la marée');
});

test('55 cabines : la valise d’abord, puis les échos : il n’y a plus de place', () => {
  const s = new Session(load('55-cabines.json'));
  const bot = new Bot(s);
  // Des échos qui traînent : ils arrivent à la cabine bien après la valise.
  for (let k = 0; k < 3; k++) { bot.idle(200); toCorner(bot); }
  pushSuitcase(bot);
  bot.idle(250);
  assert.ok(plate55(s).count < 4, `seulement ${plate55(s).count} corps sur la plaque`);
  assert.equal(door(s, '1').open, 0);
});

test('55 cabines : trois échos au plus, et la marée noie qui reste sur la plage', () => {
  const s = new Session(loadWith('55-cabines.json', { duration: null }));
  const bot = new Bot(s);
  for (let k = 0; k < 4; k++) toCorner(bot);
  assert.equal(s.world.actors.length, 4, 'trois échos et le joueur');
  bot.idle(250);
  assert.equal(plate55(s).count, 3, 'la plaque en demande quatre');
  // Celui qui attend dans la cabine se noie : la tentative n'est pas gardée.
  const t = new Session(load('55-cabines.json'));
  const b2 = new Bot(t);
  b2.holdUntil(L, () => b2.p.onGround && b2.feet === rowTop(13) && b2.p.vx === 0 && b2.cx < colCenter(3), 400);
  b2.holdUntil(0, () => b2.p.dead, 600);
  assert.equal(b2.p.dead, true);
  b2.idle(60);
  assert.equal(t.history.length, 0, 'pas d’écho');
});

// --- 56. Le port -------------------------------------------------------------------------

/** 56, écho : sauter de la barque, monter sur la passerelle, attendre, se laisser tomber sur a. */
function portEcho(bot, at) {
  bot.hold(L, 3);
  bot.hold(L | J, 10);
  bot.holdUntil(L, () => bot.p.onGround, 40);
  bot.walkTo(colCenter(5));
  bot.jump(-1);
  assert.equal(bot.feet, rowTop(10), 'sur la passerelle');
  bot.walkTo(colCenter(2));
  bot.untilTick(at);
  bot.holdUntil(L, () => !bot.p.onGround, 30);
  bot.hold(0, 6);
  assert.equal(bot.p.dead, false);
  bot.s.replay(); // en plein vol, avant de toucher l'eau
}

test('56 port : la barque nous monte ; l’écho tombe sur le bouton, sous la mer, après notre passage', () => {
  const s = new Session(load('56-port.json'));
  const bot = new Bot(s);
  portEcho(bot, 200);
  const boat = s.world.platforms[0];
  bot.holdUntil(0, () => boat.t === boat.len, 300);
  bot.holdUntil(R, () => bot.cx > colCenter(10), 100);
  assert.equal(bot.feet, rowTop(4), 'sur le quai');
  bot.idle(30);
  assert.equal(button(s, 'a').pressed, true, 'l’écho est tombé sur le bouton');
  assert.ok(s.world.waterY() < rowTop(12) - 17 * SUB, 'sous la mer');
  assert.equal(bot.exit(R), 'exit');
  assert.equal(bot.deaths, 0);
});

test('56 port : l’écho posé tout de suite coule la barque ; y aller tard, c’est se noyer', () => {
  const s = new Session(load('56-port.json'));
  const bot = new Bot(s);
  bot.hold(L, 3);
  bot.hold(L | J, 10);
  bot.holdUntil(L, () => bot.p.onGround, 40);
  bot.walkTo(colCenter(1));
  s.replay();
  let top = Infinity;
  for (let i = 0; i < 300 && s.world.platforms[0].t > 0; i++) { bot.step(0); top = Math.min(top, bot.feet); }
  assert.equal(s.world.platforms[0].t, 0, 'la barque est redescendue à quai');
  assert.ok(top > rowTop(4) + 32 * SUB, 'on n’a pas approché le quai');
  bot.holdUntil(0, () => bot.p.dead, 200);
  assert.equal(bot.p.dead, true, 'et la marée nous prend sur la barque');
  // Marcher jusqu'au bouton quand la mer est haute : noyé.
  const t = new Session(load('56-port.json'));
  const b2 = new Bot(t);
  b2.hold(L, 3);
  b2.hold(L | J, 10);
  b2.holdUntil(L, () => b2.p.onGround, 40);
  b2.walkTo(colCenter(5));
  b2.jump(-1);
  b2.untilTick(200);
  b2.walkTo(colCenter(3));
  b2.holdUntil(L, () => b2.p.dead, 200);
  assert.equal(b2.p.dead, true, 'noyé sur le bouton');
  assert.equal(t.history.length, 0, 'cette tentative ne devient pas un écho');
});

test('56 port : pas de tour d’échos jusqu’au quai (deux échos au plus, coin du quai en glace)', () => {
  // La barque immobile : un écho debout au bout de la passerelle, on saute de sa tête.
  const lv = loadWith('56-port.json', {
    water: null, duration: null,
    platforms: [{ col: 7, row: 12, cols: 2, to: { col: 7, row: 12 }, buttons: ['a'] }],
  });
  assert.equal(lv.maxEchoes, 2);
  const onQuay = (w) => w.player.x + w.player.w > 144 * SUB && w.player.y + w.player.h <= rowTop(4) + 22 * SUB
    && (w.player.onGround || w.player.climbing);
  const toPerch = (bot, x) => {
    bot.hold(L, 3);
    bot.hold(L | J, 10);
    bot.holdUntil(L, () => bot.p.onGround, 40);
    bot.walkTo(colCenter(5));
    bot.jump(-1);
    bot.walkTo(x);
    bot.idle(5);
  };
  for (const x of [56, 72]) {
    const s = new Session(lv);
    const bot = new Bot(s);
    toPerch(bot, x);
    s.replay();
    toPerch(bot, x);
    bot.hold(J, 12);
    bot.holdUntil(0, () => bot.p.onGround, 40);
    assert.equal(bot.p.ground.kind, 'echo');
    assert.equal(anyLeap(s.world, onQuay, { jts: [0, 2, 4] }), false, `depuis la tête, x=${x}`);
  }
});

// --- 57. La digue ------------------------------------------------------------------------

// Bandes trouvées par une recherche de gestes (saut, dash), rejouées telles quelles :
// écho 1 : saut + dash au-dessus de la première brèche, « Rejouer » en plein vol ;
// écho 2 : sur la tête de l'écho 1, sur l'îlot, puis même chose au-dessus de la seconde ;
// joueur : les deux têtes, l'îlot, la digue d'en face.
const DIGUE = [
  [[2, 29], [0, 4], [2, 1], [6, 14], [70, 1], [6, 3], [2, 10]],
  [[2, 26], [0, 54], [2, 9], [66, 1], [2, 2], [0, 12], [2, 4], [1, 4], [0, 8], [2, 12], [4, 4], [2, 1], [66, 1],
    [2, 2], [0, 16], [2, 71], [0, 4], [2, 1], [6, 14], [70, 1], [6, 3], [2, 10]],
  [[2, 26], [0, 134], [2, 13], [66, 1], [2, 2], [0, 8], [2, 8], [1, 4], [0, 8], [2, 12], [4, 4], [2, 1], [66, 1],
    [2, 2], [0, 16], [2, 70], [0, 4], [6, 6], [2, 4], [0, 2], [66, 1], [0, 34], [6, 6], [2, 12], [82, 1], [2, 26],
    [0, 8], [2, 22]],
];
const S57 = rowTop(8);

test('57 digue : deux échos tombés dans les brèches ; leurs têtes rechargent le dash, contre le vent', () => {
  const s = new Session(load('57-digue.json'));
  const bot = new Bot(s);
  bot.play(DIGUE[0]);
  s.replay();
  bot.play(DIGUE[1]);
  s.replay();
  for (const e of s.world.actors.slice(0, 2)) assert.equal(e.kind, 'echo');
  bot.play(DIGUE[2]);
  assert.equal(s.outcome, 'exit');
  assert.equal(bot.deaths, 0);
  const [e1, e2] = s.world.actors;
  assert.equal(e1.y + e1.h, rowTop(11), 'écho 1 au fond de la première brèche');
  assert.equal(e2.y + e2.h, rowTop(11), 'écho 2 au fond de la seconde');
  assert.ok(e1.x < 11 * TILE * SUB && e2.x > 16 * TILE * SUB);
});

test('57 digue : sans tête où se poser, aucune brèche ne se franchit (saut, dash, mur, à toute rafale)', () => {
  const lv = loadWith('57-digue.json', { duration: null });
  const onIsland = (w) => w.player.x + w.player.w > 176 * SUB && w.player.y + w.player.h <= S57 + 22 * SUB
    && (w.player.onGround || w.player.climbing);
  for (const x of [50, 74]) {
    const s = new Session(lv);
    const bot = new Bot(s);
    bot.walkTo(x);
    const base = snap(s.world);
    for (let d = 0; d < 120; d += 20) {
      restore(s.world, base);
      for (let i = 0; i < d; i++) s.world.step(0);
      assert.equal(anyLeap(s.world, onIsland), false, `depuis x=${x}, après ${d} ticks`);
    }
  }
  // Avec un seul écho : on atteint l'îlot, mais pas la digue d'en face.
  const s = new Session(load('57-digue.json'));
  const bot = new Bot(s);
  bot.play(DIGUE[0]);
  s.replay();
  bot.play(DIGUE[1].slice(0, 15));
  assert.ok(bot.p.onGround && bot.feet === S57 && bot.cx > 176, 'sur l’îlot');
  bot.walkTo(colCenter(15) - 2);
  const farSide = (w) => w.player.x + w.player.w > 352 * SUB && w.player.y + w.player.h <= S57 + 22 * SUB
    && (w.player.onGround || w.player.climbing);
  assert.equal(anyLeap(s.world, farSide), false);
});

test('57 digue : la marée finit par recouvrir les têtes', () => {
  const s = new Session(load('57-digue.json'));
  const bot = new Bot(s);
  bot.play(DIGUE[0]);
  s.replay();
  // Le joueur va se poser sur la tête de l'écho 1, et y reste.
  bot.play(DIGUE[1].slice(0, 8));
  assert.equal(bot.p.ground?.kind, 'echo');
  bot.holdUntil(0, () => bot.p.dead, 600);
  assert.equal(bot.p.dead, true, 'noyé sur l’île');
  assert.ok(s.world.tick > 500);
});

// --- 58. La grotte -----------------------------------------------------------------------

const lever = (s, id) => s.world.levers.find((l) => l.id === id);
/** 58, écho : descendre, basculer k (faisceau éteint), puis j tout au fond (avant la mer). */
function grotteEcho(bot) {
  bot.holdUntil(R, () => bot.feet > rowTop(4), 200);
  bot.holdUntil(0, () => bot.p.onGround, 100);
  bot.walkTo(colCenter(7));
  bot.step(D);
  bot.step(0);
  bot.holdUntil(R, () => bot.feet > rowTop(10), 100);
  bot.holdUntil(0, () => bot.p.onGround, 60);
  bot.walkTo(colCenter(8));
  bot.step(D);
  bot.step(0);
  assert.equal(bot.p.dead, false);
  bot.s.replay();
}
/** 58, joueur : sauter le puits, passer la première porte, attendre la seconde. */
function grottePlayer(bot) {
  bot.idle(15); // laisser l'écho tomber dans le puits avant de le sauter
  bot.holdUntil(R, () => bot.cx >= colCenter(4) + 2, 100);
  bot.hold(R | J, 8);
  bot.holdUntil(R, () => bot.p.onGround, 40);
  assert.equal(bot.feet, rowTop(4), 'resté en haut');
  bot.holdUntil(R, () => bot.cx > colCenter(15) || bot.p.dead, 400);
}

test('58 grotte : un écho bascule k puis j ; entre les deux, on a passé la première porte', () => {
  const s = new Session(load('58-grotte.json'));
  const bot = new Bot(s);
  grotteEcho(bot);
  grottePlayer(bot);
  assert.ok(bot.cx > colCenter(15), 'entre les deux portes');
  assert.equal(bot.exit(R), 'exit');
  assert.equal(bot.deaths, 0);
  assert.equal(lever(s, 'j').pressed && lever(s, 'k').pressed, true);
  assert.equal(door(s, '1').open, 0, 'la première porte s’est refermée derrière nous');
});

test('58 grotte : deux échos qui font la même chose s’annulent ; j trop tard, c’est la noyade', () => {
  const s = new Session(load('58-grotte.json'));
  const bot = new Bot(s);
  grotteEcho(bot);
  grotteEcho(bot);
  bot.idle(200);
  assert.equal(lever(s, 'k').pressed, false, 'k basculé deux fois');
  assert.equal(lever(s, 'j').pressed, false, 'j basculé deux fois');
  assert.equal(door(s, '1').open, 0);
  // Au fond de la grotte, après la marée : noyé avant d'atteindre j.
  const t = new Session(load('58-grotte.json'));
  const b2 = new Bot(t);
  b2.holdUntil(R, () => b2.feet > rowTop(4), 200);
  b2.holdUntil(0, () => b2.p.onGround, 100);
  b2.walkTo(colCenter(10));
  b2.untilTick(160);
  b2.holdUntil(R, () => b2.feet > rowTop(10), 100);
  b2.holdUntil(0, () => b2.p.onGround || b2.p.dead, 60);
  b2.holdUntil(L, () => b2.p.dead, 300);
  assert.equal(b2.p.dead, true);
  assert.equal(lever(t, 'j').pressed, false);
});

test('58 grotte : on ne remonte pas du fond (saut, dash, murs de glace) : seul, rien à faire', () => {
  const lv = loadWith('58-grotte.json', { lasers: [], water: null, duration: null });
  const up = (w) => w.player.y + w.player.h <= rowTop(4) && w.player.onGround;
  for (const x of [40, 72, 88, 104, 150]) {
    const w = new World(lv, [], 1);
    w.player.x = (x - 5) * SUB;
    w.player.y = rowTop(10) - w.player.h;
    for (let i = 0; i < 5; i++) w.step(0);
    assert.equal(anyLeap(w, up, { dirs: [R, L, 0], jts: [0, 2] }), false, `depuis x=${x}`);
  }
  // Seul, basculer k soi-même ferme la première porte pour de bon.
  const s = new Session(load('58-grotte.json'));
  const bot = new Bot(s);
  grottePlayer(bot);
  assert.ok(bot.cx < colCenter(10), 'arrêté par la première porte');
});

// --- 59. La marée haute ------------------------------------------------------------------

/** 59 : deux échos sur la plaque lourde, au fond de la plage. */
function hautePlate(bot) {
  for (let k = 0; k < 2; k++) {
    bot.holdUntil(L, () => bot.p.vx === 0 && bot.w.tick > 5, 200);
    bot.s.replay();
  }
}
/** 59 : passer la porte de la plage et aller sous le trou du plafond. */
function toHoleBase(bot) {
  bot.holdUntil(R, () => door(bot.s, '1').open === 12 && bot.cx > colCenter(8), 300);
  bot.walkTo(colCenter(16));
}
/** 59 : monter sur la tête de l'écho-échelle (le 3e). */
function ontoLadder(bot) {
  const ladder = bot.w.actors[2];
  bot.walkTo((ladder.x + (ladder.w >> 1)) / SUB);
  bot.hold(J, 12);
  bot.holdUntil(0, () => bot.p.onGround, 40);
}
/** 59, écho du bouton : attendre sur l'échelle, monter quand la lampe s'éteint, appuyer sur b. */
function hauteButton(bot, at) {
  toHoleBase(bot);
  ontoLadder(bot);
  bot.untilTick(at);
  jumpDashUp(bot, R);
  bot.hold(R, 10);
  bot.s.replay();
}
function hauteFinal(bot) {
  toHoleBase(bot);
  ontoLadder(bot);
  bot.idle(3);
  jumpDashUp(bot, L);
  bot.holdUntil(L, () => bot.p.vx === 0 && bot.p.onGround && bot.cx < colCenter(13), 300);
}

test('59 marée haute : quatre échos — la plaque, l’échelle, le bouton sous la lampe — et la mer qui monte', () => {
  const s = new Session(load('59-maree-haute.json'));
  const bot = new Bot(s);
  hautePlate(bot);
  toHoleBase(bot);
  s.replay(); // l'échelle
  hauteButton(bot, 300);
  assert.equal(s.world.actors.length, 5, 'quatre échos et le joueur');
  hauteFinal(bot);
  assert.equal(bot.feet, rowTop(7), 'en haut de la falaise, devant la porte');
  assert.ok(s.world.waterY() < rowTop(13) - 17 * SUB, 'la plage est sous la mer');
  bot.holdUntil(0, () => door(s, '2').open === 12, 300);
  assert.equal(bot.exit(L), 'exit');
  assert.equal(bot.deaths, 0);
  assert.equal(s.world.actors[3].dead, true, 'la lampe a effacé l’écho du bouton');
});

test('59 marée haute : l’écho du bouton qui monte trop tôt s’efface avant notre arrivée', () => {
  const s = new Session(load('59-maree-haute.json'));
  const bot = new Bot(s);
  hautePlate(bot);
  toHoleBase(bot);
  s.replay();
  hauteButton(bot, 0);
  hauteFinal(bot);
  bot.idle(250);
  assert.equal(door(s, '2').open, 0);
  assert.equal(s.state, 'playing');
});

test('59 marée haute : il faut l’échelle, deux corps sur la plaque, et attendre sur une tête', () => {
  // Sans échelle : le plafond reste hors d'atteinte (saut, dash, murs).
  const lv = loadWith('59-maree-haute.json', { water: null, lasers: [], duration: null, doors: { 1: { buttons: ['a'], invert: true }, 2: { buttons: ['b'] } } });
  const up = (w) => w.player.y + w.player.h <= rowTop(7) && w.player.onGround;
  for (const x of [168, 230, 262, 300, 420]) {
    const w = new World(lv, [], 1);
    w.player.x = (x - 5) * SUB;
    for (let i = 0; i < 30; i++) w.step(0);
    assert.equal(anyLeap(w, up, { dirs: [R, L, 0], jts: [0, 2] }), false, `depuis x=${x}`);
  }
  // Un seul écho sur la plaque : la porte de la plage reste fermée.
  const s = new Session(load('59-maree-haute.json'));
  const bot = new Bot(s);
  bot.holdUntil(L, () => bot.p.vx === 0 && bot.w.tick > 5, 200);
  s.replay();
  bot.walkTo(colCenter(8));
  bot.idle(100);
  assert.equal(door(s, '1').open, 0);
  // Attendre en bas, dans l'eau, au lieu de sur l'échelle : noyé.
  const t = new Session(load('59-maree-haute.json'));
  const b2 = new Bot(t);
  hautePlate(b2);
  toHoleBase(b2);
  t.replay();
  toHoleBase(b2);
  b2.walkTo(colCenter(14));
  b2.holdUntil(0, () => b2.p.dead, 400);
  assert.equal(b2.p.dead, true);
});

// --- 60. Le dernier train ----------------------------------------------------------------

test('60 dernier train : sans chrono ; un écho et soi sur la plaque, la minuterie tient la grille', () => {
  const s = new Session(load('60-dernier-train.json'));
  const bot = new Bot(s);
  assert.equal(s.ticksLeft, null, 'pas de chrono');
  assert.equal(s.level.exitStyle, 'train');
  bot.walkTo(colCenter(7));
  bot.idle(20);
  s.replay();
  bot.walkTo(colCenter(7));
  bot.idle(5);
  assert.equal(button(s, 'a').count, 2);
  bot.holdUntil(0, () => door(s, '1').open === 12, 100);
  bot.holdUntil(R, () => bot.cx > colCenter(15) - 2, 200);
  assert.ok(button(s, 'a').pressed, 'la minuterie tient encore');
  bot.jump(1);
  assert.equal(bot.exit(R), 'exit');
  assert.equal(s.outcome, 'exit');
});

test('60 dernier train : seul, la grille reste fermée', () => {
  const s = new Session(load('60-dernier-train.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(7));
  bot.idle(60);
  assert.equal(button(s, 'a').pressed, false, 'un seul corps');
  bot.holdUntil(R, () => bot.cx > colCenter(15), 200);
  assert.ok(bot.cx < colCenter(15), 'la grille est fermée');
  assert.equal(s.state, 'playing');
});
