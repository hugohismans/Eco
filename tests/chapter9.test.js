// Chapitre 9 : le retour (niveaux 81 à 90).
//
// Chaque niveau est joué par un petit robot qui suit la solution prévue, à travers
// la vraie Session (step, replay, restart, fin du chrono) ; puis on vérifie que
// l'idée du niveau est nécessaire : en une vie, sans relais, dans le mauvais ordre,
// sans cale, avec une valise ordinaire… on n'y arrive pas.
// Tout le chapitre se joue sans capacité : on marche, on saute, on pousse.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseLevel } from '../src/sim/level.js';
import { Session } from '../src/sim/session.js';
import { World } from '../src/sim/world.js';
import { overlaps } from '../src/sim/physics.js';
import { IN_LEFT, IN_RIGHT, IN_JUMP, IN_DOWN, SUB, TILE } from '../src/sim/constants.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (file) => JSON.parse(readFileSync(join(here, '../src/levels', file), 'utf8'));
const load = (file) => parseLevel(raw(file));
/** Le même niveau, modifié (sans chrono, moins d'échos…) pour les vérifications. */
const loadWith = (file, extra = {}) => parseLevel({ ...raw(file), ...extra });
/** Le même niveau, un caractère de la grille remplacé partout par un autre. */
const loadSwap = (file, from, to, extra = {}) => parseLevel({
  ...raw(file), ...extra, grid: raw(file).grid.map((r) => r.split(from).join(to)),
});
const colCenter = (c) => c * TILE + TILE / 2;
const rowTop = (r) => r * TILE * SUB;
const px = (v) => v / SUB;
const L = IN_LEFT, R = IN_RIGHT, J = IN_JUMP, D = IN_DOWN;

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
  hold(bits, n) { for (let i = 0; i < n; i++) if (!this.step(bits)) return; }
  /** Attend que la tentative se termine (chrono). */
  untilAttemptEnds(bits = 0) {
    const a = this.s.attempt;
    while (this.s.attempt === a && this.s.state === 'playing') this.step(bits);
  }
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
  /** Tient une entrée jusqu'à ce que `pred()` soit vrai (ou que la tentative change). */
  holdUntil(bits, pred, max = 900) {
    const a = this.s.attempt;
    for (let i = 0; i < max && !pred() && this.s.attempt === a; i++) if (!this.step(bits)) return;
  }
  /** Va jusqu'à la sortie en tenant une direction ; s'arrête si la tentative se termine. */
  exit(bits, max = 900) {
    this.holdUntil(bits, () => this.done, max);
    return this.s.outcome;
  }
  /** Saute par-dessus un bloc (une malle), dans le sens `dir`. */
  hop(m, dir) {
    const bit = dir > 0 ? R : L;
    this.holdUntil(bit, () => (dir > 0 ? this.p.x + this.p.w >= m.x - 6 * SUB : this.p.x <= m.x + m.w + 6 * SUB), 300);
    this.hold(bit | J, 16);
    this.holdUntil(bit, () => this.p.onGround, 60);
  }
  /** Monte sur la tête de l'écho (ou sur la malle) qui se trouve juste ici, sans bouger. */
  hopUp() {
    this.hold(J, 14);
    this.holdUntil(0, () => this.p.onGround, 60);
  }
}

const button = (s, id) => s.world.buttons.find((b) => b.id === id);
const door = (s, id) => s.world.doors.find((d) => d.id === id);
const block = (s, i = 0) => s.world.blocks[i];
/** La malle est-elle posée sur ce bouton ? */
const blockOn = (s, id, i = 0) => overlaps(block(s, i), button(s, id));

/**
 * Depuis le monde `w` (joueur au sol), essaie une famille de sauts : direction tenue,
 * élan de quelques ticks, saut plein. Vrai si l'un d'eux atteint `goal(world)`.
 */
function anyJump(level, from, goal, { echoes = [], carry = null } = {}) {
  for (const dir of [R, L, 0]) for (let run = 0; run <= 24; run += 3) for (const jt of [17, 12, 8]) {
    const w = new World(level, echoes, 1, { spawn: from, carry });
    for (let k = 0; k < 6; k++) w.step(0);
    for (let k = 0; k < run; k++) w.step(dir);
    for (let k = 0; k < 70; k++) {
      w.step(k < jt ? dir | J : dir);
      if (goal(w)) return true;
    }
  }
  return false;
}
/** Position de départ : debout au sol de la rangée `row`, centre à `x` px. */
const standAt = (x, row) => ({ x: (x - 5) * SUB, y: rowTop(row + 1) - 22 * SUB });

// --- Le chapitre dans son ensemble ------------------------------------------------------

const CHAPTER9 = [
  ['81-quai-aube.json', 'quai-aube'], ['82-correspondance.json', 'correspondance'],
  ['83-marchepied.json', 'marchepied'], ['84-portillon.json', 'portillon'],
  ['85-pas-perdus-matin.json', 'pas-perdus-matin'], ['86-deux-quais.json', 'deux-quais'],
  ['87-seul.json', 'seul'], ['88-consigne-matin.json', 'consigne-matin'],
  ['89-premier-train.json', 'premier-train'], ['90-quai-matin.json', 'quai-matin'],
];
const DECOR_TYPES = new Set([
  'bench', 'lamp', 'pendant', 'window', 'clock', 'poster', 'canopy', 'counter', 'board',
  'radiator', 'plant', 'walllamp', 'gantry', 'sign', 'train',
]);

test('chapitre 9 : dix pièces bien formées, sans capacité', () => {
  for (const [file, id] of CHAPTER9) {
    const def = raw(file);
    const level = parseLevel(def);
    assert.equal(level.id, id, file);
    assert.equal(def.chapter, 9, file);
    assert.ok(['aube', 'matin'].includes(def.theme), file);
    assert.ok(typeof def.name === 'string' && def.name.length > 0, file);
    assert.ok(def.narration.endsWith(' (provisoire)'), file);
    assert.ok(def.decor.length >= 4 && def.decor.length <= 8, `${file} : décor`);
    for (const d of def.decor) assert.ok(DECOR_TYPES.has(d.type), `${file} : décor ${d.type}`);
    for (const d of def.decor.filter((x) => x.type === 'sign')) assert.ok(d.text.length <= 10, `${file} : enseigne`);
    assert.deepEqual([...level.abilities], [], file);
    assert.equal(level.chapterEnd, false, file);
    if (id === 'quai-matin') {
      assert.equal(def.duration, null);
      assert.equal(def.exitStyle, 'train');
      assert.equal(level.maxEchoes, 4);
      assert.ok(def.decor.some((d) => d.type === 'train' && d.variant === 'matin' && d.layer === 'front'));
      assert.ok(def.decor.some((d) => d.type === 'bench'));
      assert.ok(level.stay && level.endings.exit && level.endings.stay);
    } else {
      assert.ok(def.duration > 0, file);
    }
  }
  const echoes = CHAPTER9.map(([file]) => load(file).maxEchoes);
  assert.deepEqual(echoes, [0, null, 1, 2, 1, 2, 0, 3, 1, 4]);
});

// --- 81. Le quai, à l'aube -------------------------------------------------------------

const F81 = '81-quai-aube.json';

test('81 quai, à l’aube : aucun écho ; la malle avance vie après vie, et reste où on la laisse', () => {
  const s = new Session(load(F81));
  const bot = new Bot(s);
  const x0 = block(s).x;
  assert.equal(block(s).persist, true);
  // Première vie : on pousse jusqu'au bout des quatre secondes.
  bot.untilAttemptEnds(L);
  assert.equal(s.attempt, 2);
  assert.equal(s.world.actors.length, 1, 'personne ne refait nos pas');
  const x1 = block(s).x;
  assert.ok(x1 < x0 - 120 * SUB, 'la malle a bien avancé…');
  assert.equal(button(s, 'a').pressed, false, '…mais pas jusqu’à la plaque');
  // Deuxième vie : on la retrouve là où on l'a laissée, et on finit le travail.
  bot.holdUntil(L, () => button(s, 'a').pressed, 300);
  assert.equal(s.attempt, 2);
  assert.equal(blockOn(s, 'a'), true);
  bot.hold(L, 30);
  assert.equal(block(s).x, TILE * SUB, 'le mur l’arrête : on ne peut pas la dépasser');
  assert.equal(blockOn(s, 'a'), true);
  // Trop tard pour rejoindre la sortie dans la même vie.
  bot.exit(R, 400);
  assert.equal(s.attempt, 3);
  assert.equal(s.state, 'playing');
  // Troisième vie : la porte est déjà ouverte.
  bot.idle(2);
  assert.equal(door(s, '1').target, true);
  assert.equal(bot.exit(R, 400), 'exit');
  assert.ok(s.world.tick < s.level.duration - 90, `sortie au tick ${s.world.tick}`);
});

test('81 quai, à l’aube : en une vie, c’est trop loin ; une valise ordinaire revient à sa place', () => {
  // Une seule vie, sans chrono pour mesurer : la plaque n'est atteinte qu'après les quatre secondes.
  const free = new Session(loadWith(F81, { duration: null }));
  const fb = new Bot(free);
  fb.holdUntil(L, () => button(free, 'a').pressed, 600);
  assert.ok(free.world.tick > load(F81).duration + 20, `plaque atteinte au tick ${free.world.tick}`);
  // Avec une valise : elle revient à chaque vie, on n'arrive jamais plus loin.
  const s = new Session(loadSwap(F81, 'M', 'B'));
  const bot = new Bot(s);
  const x0 = block(s).x;
  for (let life = 0; life < 5; life++) {
    bot.untilAttemptEnds(L);
    assert.equal(block(s).x, x0, 'revenue');
    assert.equal(s.state, 'playing');
  }
  bot.exit(R, 300);
  assert.equal(s.state, 'playing', 'la porte reste fermée');
  assert.equal(s.world.actors.length, 1);
});

// --- 82. La correspondance ---------------------------------------------------------------

const F82 = '82-correspondance.json';
/** 82 : de la grille à la sortie (deux marches, puis la mezzanine, vers la gauche). */
function stairs82(bot) {
  bot.holdUntil(R, () => bot.cx > colCenter(21) - 2, 400);
  bot.jump(1);
  bot.walkTo(colCenter(22) + 4);
  bot.jump(1);
  bot.jump(-1);
  return bot.exit(L, 300);
}

test('82 correspondance : on s’arrête sur le relais ; l’écho repasse sur la plaque à la même seconde', () => {
  const s = new Session(load(F82));
  const bot = new Bot(s);
  const start = s.world.player.x;
  bot.walkTo(colCenter(15));
  assert.equal(s.world.relays[0].active, true, 'debout sur le relais');
  assert.ok(s.world.tick < s.level.duration - 90);
  assert.equal(door(s, '1').open, 0, 'la minuterie est finie depuis longtemps');
  bot.untilAttemptEnds(0);
  assert.equal(s.attempt, 2);
  assert.equal(px(s.world.player.x), 15 * TILE + 3, 'on repart du relais');
  assert.equal(s.world.actors[0].x, start, 'l’écho, lui, repart du début');
  assert.equal(stairs82(bot), 'exit');
  assert.ok(button(s, 'a').timer > 0 || button(s, 'a').pressed || s.world.tick > 150);
  assert.ok(s.world.tick < s.level.duration - 90, `sortie au tick ${s.world.tick}`);
});

test('82 correspondance : depuis le départ, la grille est trop loin ; depuis le relais sans écho, rien ne l’ouvre', () => {
  // Depuis le départ : la minuterie s'éteint bien avant qu'on arrive.
  const s = new Session(load(F82));
  const bot = new Bot(s);
  bot.holdUntil(R, () => bot.p.vx === 0 && bot.cx > colCenter(10), 400);
  assert.ok(bot.cx < colCenter(19), 'arrêté par la grille');
  assert.equal(door(s, '1').open, 0);
  // Un écho posé sur la plaque tient la grille… mais du départ, la sortie est hors de portée.
  s.restart();
  bot.walkTo(colCenter(3));
  s.replay();
  const a0 = s.attempt;
  stairs82(bot);
  assert.equal(s.state, 'playing');
  assert.ok(s.attempt > a0, 'le chrono a tranché');
  const free = new Session(loadWith(F82, { duration: null, doors: { 1: { buttons: ['a'], invert: true } } }));
  const fb = new Bot(free);
  stairs82(fb);
  assert.equal(free.state, 'won');
  assert.ok(free.world.tick > load(F82).duration + 30, `du départ à la sortie : ${free.world.tick} ticks`);
  // « Effacer » ramène au départ.
  const t = new Session(load(F82));
  const b2 = new Bot(t);
  b2.walkTo(colCenter(15));
  t.replay();
  assert.ok(t.spawn);
  t.restart();
  assert.equal(t.spawn, null);
  assert.equal(t.world.player.x, t.level.spawn.x, 'revenu au départ');
  assert.equal(t.world.actors.length, 1);
  // Du relais, seul : la grille reste fermée ; retourner à la plaque et revenir, c'est trop long.
  const lv = loadWith(F82, { duration: null });
  const w = new World(lv, [], 1, { spawn: lv.relays[0].spawn });
  for (let i = 0; i < 120; i++) w.step(R);
  assert.ok(w.player.x + w.player.w <= 19 * TILE * SUB, 'devant la grille fermée');
  let i = 0;
  for (; i < 400 && !w.buttons[0].pressed; i++) w.step(L);
  assert.equal(w.buttons[0].pressed, true);
  for (i = 0; i < 400 && w.player.x + w.player.w < 19 * TILE * SUB; i++) w.step(R);
  assert.equal(w.doors[0].open, 0, 'refermée avant qu’on revienne');
  for (i = 0; i < 60; i++) w.step(R);
  assert.ok(w.player.x + w.player.w <= 19 * TILE * SUB);
});

// --- 83. Le marchepied -------------------------------------------------------------------

const F83 = '83-marchepied.json';
const FOOT83 = (16 * TILE - 14) * SUB; // la malle contre le premier mur
/** 83 : passer derrière la malle (par-dessus) et la pousser vers le mur jusqu'à la fin du chrono. */
function push83(bot) {
  bot.hop(block(bot.s), -1);
  bot.holdUntil(L, () => bot.p.x + bot.p.w <= block(bot.s).x, 60);
  bot.untilAttemptEnds(R);
}
/** 83 : sur la malle, sur le premier mur, puis jusqu'au pied du second. */
function toSecondWall83(bot) {
  bot.walkTo(px(block(bot.s).x) - 8);
  bot.jump(1);
  bot.jump(1);
  bot.holdUntil(R, () => bot.p.vx === 0 && bot.cx > colCenter(18), 200);
}

test('83 marchepied : la malle, poussée par des tentatives oubliées, reste une marche ; la tête de l’écho fait la seconde', () => {
  const s = new Session(load(F83));
  const bot = new Bot(s);
  push83(bot);
  assert.ok(block(s).x < FOOT83 - 40 * SUB, 'une vie ne suffit pas');
  push83(bot);
  assert.equal(block(s).x, FOOT83, 'au pied du mur');
  // Troisième tentative : l'écho (qui pousse encore, en vain) ne nous sert à rien ; on monte, on se poste.
  toSecondWall83(bot);
  assert.equal(bot.feet, rowTop(10), 'sur le premier plateau, grâce à la malle');
  assert.equal(block(s).x, FOOT83);
  s.replay();
  // Quatrième : un seul écho, celui qui s'est posté. Les pousseurs sont oubliés ; la malle est restée.
  assert.equal(s.world.actors.length, 2);
  toSecondWall83(bot);
  const echo = s.world.actors[0];
  assert.equal(echo.y + echo.h, rowTop(10), 'l’écho est monté par la malle, lui aussi');
  bot.walkTo(px(echo.x) + 5);
  bot.hopUp();
  assert.equal(bot.p.ground.kind, 'echo');
  bot.jump(1);
  assert.equal(bot.feet, rowTop(7), 'sur le second plateau');
  assert.equal(bot.exit(R, 300), 'exit');
  assert.ok(s.world.tick < s.level.duration - 90, `sortie au tick ${s.world.tick}`);
});

test('83 marchepied : une valise revient toujours ; sans marche, aucun des deux murs ne se franchit', () => {
  // Avec une valise : une vie ne suffit pas, et elle est revenue à la suivante.
  const s = new Session(loadSwap(F83, 'M', 'B'));
  const bot = new Bot(s);
  const x0 = block(s).x;
  push83(bot);
  assert.equal(block(s).x, x0, 'la valise est revenue');
  // Deux pousseurs (l'écho et nous) l'amènent au mur ; on monte… mais l'écho qu'on laisse
  // là-haut, seul à la tentative suivante, ne retrouvera pas la valise au pied du mur.
  push83(bot);
  assert.equal(block(s).x, x0);
  bot.hop(block(s), -1);
  bot.holdUntil(L, () => bot.p.x + bot.p.w <= block(s).x, 60);
  bot.holdUntil(R, () => block(s).x >= FOOT83, 400);
  if (block(s).x >= FOOT83) {
    toSecondWall83(bot);
    s.replay();
    bot.idle(330);
    const echo = s.world.actors[0];
    assert.equal(echo.y + echo.h, rowTop(13), 'l’écho est resté en bas');
    assert.ok(block(s).x < FOOT83);
  }
  // Sans la malle au pied du premier mur, sans tête au pied du second : trois cases, c'est trop haut.
  const lv = loadWith(F83, { duration: null });
  const up1 = (w) => w.player.onGround && w.player.y + w.player.h <= rowTop(10);
  const up2 = (w) => w.player.onGround && w.player.y + w.player.h <= rowTop(7);
  for (const x of [colCenter(15), colCenter(14), colCenter(13)]) {
    assert.equal(anyJump(lv, standAt(x, 12), up1), false, `premier mur, depuis x=${x}`);
  }
  for (const x of [colCenter(19), colCenter(18), colCenter(17)]) {
    assert.equal(anyJump(lv, standAt(x, 9), up2), false, `second mur, depuis x=${x}`);
  }
});

// --- 84. Le portillon --------------------------------------------------------------------

const F84 = '84-portillon.json';

test('84 portillon : l’aide d’abord, le relais ensuite ; à la troisième tentative, tout le monde est là', () => {
  const s = new Session(load(F84));
  const bot = new Bot(s);
  bot.walkTo(colCenter(3));
  assert.equal(button(s, 'a').pressed, true);
  s.replay();
  bot.walkTo(colCenter(11));
  assert.equal(s.world.relays[0].active, true);
  assert.ok(s.world.tick < s.level.duration - 90);
  s.replay();
  assert.equal(px(s.world.player.x), 11 * TILE + 3, 'on repart d’au-delà du portillon');
  assert.equal(s.world.actors.length, 3, 'les deux échos sont là');
  assert.equal(bot.exit(R, 400), 'exit');
  assert.equal(button(s, 'a').pressed, true);
  assert.ok(s.world.tick < s.level.duration - 60, `sortie au tick ${s.world.tick}`);
});

test('84 portillon : le relais d’abord, et l’on ne revient plus ; une tentative de trop, et l’aide est oubliée', () => {
  // Mauvais ordre : relais d'abord. Le tourniquet ne se franchit pas à rebours.
  const s = new Session(load(F84));
  const bot = new Bot(s);
  bot.walkTo(colCenter(11));
  s.replay();
  bot.holdUntil(L, () => false, 150);
  assert.ok(bot.p.x >= 9 * TILE * SUB, 'arrêté par le portillon');
  bot.jump(-1);
  assert.ok(bot.p.x >= 9 * TILE * SUB);
  assert.equal(button(s, 'a').pressed, false);
  bot.untilAttemptEnds(R);
  assert.equal(s.state, 'playing');
  assert.ok(bot.cx < colCenter(13) || s.world.tick === 0);
  // Bon ordre, mais la troisième tentative est gâchée : à la suivante, la bande de la plaque n'est plus rejouée.
  const t = new Session(load(F84));
  const b2 = new Bot(t);
  b2.walkTo(colCenter(3));
  t.replay();
  b2.walkTo(colCenter(11));
  t.replay();
  b2.untilAttemptEnds(0);
  assert.equal(t.world.actors.length, 3, 'deux échos, toujours…');
  b2.idle(120);
  assert.equal(button(t, 'a').pressed, false, '…mais plus celui de la plaque');
  b2.exit(R, 300);
  assert.equal(t.state, 'playing');
  // Du départ, même avec la porte tenue, la sortie est trop loin pour le chrono.
  const u = new Session(load(F84));
  const b3 = new Bot(u);
  b3.walkTo(colCenter(3));
  u.replay();
  b3.exit(R, 400);
  assert.equal(u.state, 'playing');
  const free = new Session(loadWith(F84, { duration: null, doors: { 1: { buttons: ['a'], invert: true } } }));
  const fb = new Bot(free);
  fb.exit(R, 600);
  assert.ok(free.world.tick > load(F84).duration + 30, `du départ à la sortie : ${free.world.tick} ticks`);
});

// --- 86. Les deux quais --------------------------------------------------------------------

const F86 = '86-deux-quais.json';

test('86 deux quais : le relais d’abord, les aides ensuite ; la bande du trajet est la première oubliée', () => {
  const s = new Session(load(F86));
  const bot = new Bot(s);
  bot.walkTo(colCenter(14));
  assert.equal(s.world.relays[0].active, true);
  assert.ok(s.world.tick < s.level.duration - 60);
  s.replay();
  bot.walkTo(colCenter(7)); // retour sur le quai A, par la passerelle
  assert.equal(button(s, 'a').pressed, true);
  s.replay();
  bot.walkTo(colCenter(16));
  assert.equal(button(s, 'b').pressed, true);
  s.replay();
  // Quatrième tentative : deux échos, les deux aides, tous deux partis du relais.
  assert.equal(s.world.actors.length, 3);
  for (const e of s.world.actors.slice(0, 2)) assert.equal(px(e.x), 14 * TILE + 3);
  assert.equal(bot.exit(R, 400), 'exit');
  assert.ok(button(s, 'a').pressed && button(s, 'b').pressed);
  assert.ok(s.world.tick < s.level.duration - 60, `sortie au tick ${s.world.tick}`);
});

test('86 deux quais : les aides d’abord, et celle du quai A est oubliée quand on part enfin du relais', () => {
  const s = new Session(load(F86));
  const bot = new Bot(s);
  bot.walkTo(colCenter(7));
  s.replay();
  bot.walkTo(colCenter(16));
  s.replay();
  // Avec les deux aides, la porte s'ouvre… mais du départ, la sortie est trop loin.
  const a0 = s.attempt;
  bot.exit(R, 400);
  assert.equal(s.state, 'playing');
  assert.equal(s.attempt, a0 + 1, 'le chrono a tranché');
  s.restart();
  bot.walkTo(colCenter(7));
  s.replay();
  bot.walkTo(colCenter(16));
  s.replay();
  bot.walkTo(colCenter(14));
  assert.equal(s.world.relays[0].active, true);
  s.replay();
  // On part du relais, mais les deux échos sont « b » et « le trajet » : plus personne sur a.
  assert.equal(px(s.world.player.x), 14 * TILE + 3);
  bot.idle(215);
  assert.equal(button(s, 'b').pressed, true);
  assert.equal(button(s, 'a').pressed, false);
  assert.equal(door(s, '1').open, 0);
  bot.exit(R, 300);
  assert.equal(s.state, 'playing');
  const free = new Session(loadWith(F86, { duration: null, doors: { 1: { buttons: ['a'], invert: true } } }));
  const fb = new Bot(free);
  fb.exit(R, 600);
  assert.ok(free.world.tick > load(F86).duration + 30, `du départ à la sortie : ${free.world.tick} ticks`);
});

// --- 85. La salle des pas perdus -----------------------------------------------------------

const F85 = '85-pas-perdus-matin.json';
const FLOOR85 = rowTop(13);
/** 85 : monter sur le balcon (par la marche fine), aller au bout, tomber derrière la malle. */
function toShaft85(bot) {
  bot.walkTo(colCenter(11) + 2);
  bot.jump(-1);
  bot.jump(-1);
  bot.holdUntil(L, () => bot.feet === FLOOR85 && bot.p.onGround, 300);
}
/** 85 : pousser la malle à travers le courant d'air, et lâcher dès que la plaque s'enfonce. */
function push85(bot) {
  toShaft85(bot);
  bot.holdUntil(R, () => button(bot.s, 'a').pressed, 600);
}
/** 85 : se mettre en travers : descendre dans le creux, juste après la plaque. */
function wedge85(bot) {
  bot.holdUntil(L, () => bot.feet > FLOOR85, 200);
  bot.holdUntil(L, () => bot.p.onGround && bot.p.vx === 0, 60);
}
/** 85 : passer la porte, aller au pied du mur de la sortie. */
function toWall85(bot) {
  bot.holdUntil(R, () => bot.p.vx === 0 && bot.cx > colCenter(19), 400);
}

test('85 pas perdus : il pousse encore ; une tentative pour le retenir, une pour la courte échelle', () => {
  const s = new Session(load(F85));
  const bot = new Bot(s);
  // 1. Pousser la malle sous le balcon, contre le courant d'air, jusqu'à la plaque.
  push85(bot);
  assert.equal(blockOn(s, 'a'), true);
  assert.ok(s.world.tick < s.level.duration - 90, `plaque au tick ${s.world.tick}`);
  const x0 = block(s).x;
  bot.idle(20);
  assert.equal(block(s).x, x0, 'sortie du courant d’air, elle ne bouge plus');
  assert.equal(door(s, '1').open, 12);
  // Sous le balcon (deux cases de haut), on ne saute pas par-dessus la malle : on reste derrière elle.
  bot.hold(J, 17);
  bot.holdUntil(0, () => bot.p.onGround, 60);
  assert.equal(bot.feet, FLOOR85);
  assert.ok(bot.p.x + bot.p.w <= block(s).x, 'coincé derrière la malle');
  const x1 = block(s).x;
  assert.equal(x1, x0);
  s.replay();
  // 2. La tentative calme : dans le creux, juste après la plaque. L'écho arrive et pousse.
  wedge85(bot);
  assert.ok(bot.feet > FLOOR85 && bot.cx > 8 * TILE && bot.cx < 9 * TILE, 'dans le creux');
  const arrived = s.world.tick;
  bot.holdUntil(0, () => block(s).x !== x1, 600);
  assert.ok(s.world.tick > arrived + 60, 'on est en place bien avant lui');
  bot.holdUntil(0, () => s.world.actors[0].finished, 900);
  assert.equal(s.world.actors[0].pushing || block(s).x + block(s).w === bot.p.x, true, 'la malle bute contre nous');
  assert.equal(blockOn(s, 'a'), true, 'retenue sur la plaque');
  assert.ok(s.world.tick < s.level.duration - 60);
  s.replay();
  // 3. Plus personne ne pousse (l'écho est la cale). On va se poster au pied du mur.
  const x2 = block(s).x;
  toWall85(bot);
  assert.equal(door(s, '1').open, 12);
  bot.idle(20);
  s.replay();
  // 4. L'écho fait la courte échelle ; la malle n'a pas bougé.
  toWall85(bot);
  bot.walkTo(px(s.world.actors[0].x) + 5);
  bot.hopUp();
  assert.equal(bot.p.ground.kind, 'echo');
  bot.jump(1);
  assert.equal(bot.exit(R, 200), 'exit');
  assert.equal(block(s).x, x2);
  assert.equal(blockOn(s, 'a'), true);
});

test('85 pas perdus : sans cale, la malle finit dans le creux ; en une vie, on reste derrière elle', () => {
  // Sans cale : à la tentative suivante, l'écho rattrape la malle et la pousse dans le creux.
  const s = new Session(load(F85));
  const bot = new Bot(s);
  push85(bot);
  s.replay();
  toWall85(bot); // on file se poster au pied du mur
  bot.holdUntil(0, () => s.world.actors[0].finished, 900);
  assert.ok(block(s).y + block(s).h > FLOOR85, 'tombée dans le creux');
  assert.equal(blockOn(s, 'a'), false);
  s.replay();
  bot.idle(60);
  assert.equal(door(s, '1').open, 0, 'la porte est fermée pour de bon');
  bot.exit(R, 300);
  assert.equal(s.state, 'playing');
  // En une vie : on pousse la malle sur la plaque, puis plus loin pour passer : elle tombe, la porte se ferme.
  const t = new Session(load(F85));
  const b2 = new Bot(t);
  push85(b2);
  b2.holdUntil(R, () => b2.cx > colCenter(16) - 4 || b2.p.vx === 0 && b2.cx > colCenter(12), 400);
  assert.ok(block(t).y + block(t).h > FLOOR85);
  assert.equal(door(t, '1').open, 0);
  assert.ok(b2.cx < colCenter(17));
  // Sous le balcon, aucun saut ne fait passer devant la malle tant qu'elle est sur la plaque.
  const u = new Session(load(F85));
  const b3 = new Bot(u);
  push85(b3);
  const past = (w) => w.player.x >= w.blocks[0].x + w.blocks[0].w && w.blocks[0].y + w.blocks[0].h === FLOOR85;
  const behind = { x: block(u).x - 10 * SUB, y: FLOOR85 - 22 * SUB };
  assert.equal(anyJump(loadWith(F85, { duration: null }), behind, past, { carry: u.world.carryState() }), false);
  // Et même porte ouverte, le mur de la sortie demande une tête (trois cases).
  const lv = loadWith(F85, { duration: null, winds: [] });
  const up = (w) => w.player.onGround && w.player.y + w.player.h <= rowTop(10);
  for (const x of [colCenter(20), colCenter(19), colCenter(18)]) {
    assert.equal(anyJump(lv, standAt(x, 12), up), false, `depuis x=${x}`);
  }
});

test('85 pas perdus : pas de dosage dans le courant d’air : lâcher plus tôt, c’est la voir revenir', () => {
  // On pousse jusqu'au tick t1, puis on regarde l'écho refaire la même chose à la tentative suivante.
  const lv = load(F85);
  let kept = 0;
  for (let t1 = 190; t1 <= 420; t1 += 3) {
    const s = new Session(lv);
    const bot = new Bot(s);
    toShaft85(bot);
    bot.holdUntil(R, () => s.world.tick >= t1, 600);
    bot.idle(3);
    s.replay();
    bot.holdUntil(0, () => s.world.actors[0].finished, 900);
    bot.idle(60);
    if (blockOn(s, 'a') && block(s).y + block(s).h === FLOOR85) kept++;
  }
  assert.equal(kept, 0, 'ou bien elle est revenue au bord du courant d’air, ou bien elle est dans le creux');
  // Sans le courant d'air, ce dosage existerait (c'est lui qui rend la cale nécessaire).
  const calm = loadWith(F85, { winds: [] });
  let calmKept = 0;
  for (let t1 = 190; t1 <= 420; t1 += 3) {
    const s = new Session(calm);
    const bot = new Bot(s);
    toShaft85(bot);
    bot.holdUntil(R, () => s.world.tick >= t1, 600);
    s.replay();
    bot.holdUntil(0, () => s.world.actors[0].finished, 900);
    if (blockOn(s, 'a') && block(s).y + block(s).h === FLOOR85) calmKept++;
  }
  assert.ok(calmKept > 0);
});

// --- 87. Seul ------------------------------------------------------------------------------

const F87 = '87-seul.json';
const A87 = rowTop(9);   // le quai du haut
const B87 = rowTop(13);  // le quai du bas
const FOOT87 = (13 * TILE - 14) * SUB;
/** 87 : descendre du quai du haut. */
function down87(bot) { bot.holdUntil(R, () => bot.feet === B87 && bot.p.onGround, 300); }
/** 87 : en bas, passer à gauche de la malle (par-dessus). */
function behind87(bot, m) {
  if (bot.p.x + bot.p.w > m.x) {
    bot.hop(m, -1);
    bot.holdUntil(L, () => bot.p.x + bot.p.w <= m.x, 60);
  }
}
/** 87, vie « malle de droite » : la faire tomber, la suivre, la pousser au pied du mur. */
function firstTrunk87(bot) {
  const s = bot.s;
  bot.hop(block(s, 0), 1);
  bot.holdUntil(R, () => block(s, 1).y + block(s, 1).h > A87, 400);
  down87(bot);
  behind87(bot, block(s, 1));
  bot.holdUntil(R, () => block(s, 1).x >= FOOT87, 400);
}
/** 87, vie « malle de gauche » : la faire tomber, la suivre, la pousser jusqu'à la plaque. */
function secondTrunk87(bot) {
  const s = bot.s;
  bot.holdUntil(R, () => block(s, 0).y + block(s, 0).h > A87, 400);
  down87(bot);
  behind87(bot, block(s, 0));
  bot.holdUntil(R, () => button(s, 'a').pressed, 300);
}
/** 87 : du quai du bas au quai de la sortie, par la malle au pied du mur. */
function climb87(bot) {
  const s = bot.s;
  if (bot.p.x < block(s, 0).x && block(s, 0).y + block(s, 0).h === B87) bot.hop(block(s, 0), 1);
  bot.holdUntil(R, () => bot.p.x + bot.p.w >= block(s, 1).x - 8 * SUB, 200);
  bot.jump(1);
  bot.jump(1);
}
/** 87 : du relais à la sortie (une marche, puis la passerelle, vers la gauche). */
function final87(bot) {
  bot.holdUntil(R, () => bot.cx >= colCenter(21) - 4, 200);
  bot.jump(1);
  bot.hopUp();
  bot.hold(J, 3);
  return bot.exit(L, 200);
}

test('87 seul : une malle au pied du mur, l’autre sur la plaque, un relais ; cinq vies de cinq secondes', () => {
  const s = new Session(load(F87));
  const bot = new Bot(s);
  // Vie 1 : la malle de droite, jusqu'au pied du mur.
  firstTrunk87(bot);
  assert.equal(s.attempt, 1);
  assert.equal(block(s, 1).x, FOOT87);
  s.replay();
  assert.equal(s.world.actors.length, 1, 'aucun écho');
  assert.equal(block(s, 1).x, FOOT87, 'elle est restée');
  // Vie 2 : la malle de gauche, jusqu'à la plaque.
  secondTrunk87(bot);
  assert.equal(s.attempt, 2);
  assert.equal(blockOn(s, 'a', 0), true);
  assert.ok(s.world.tick < s.level.duration - 60, `plaque au tick ${s.world.tick}`);
  s.replay();
  // Vie 3 : descendre, grimper par la malle, passer la porte, s'arrêter sur le relais.
  down87(bot);
  climb87(bot);
  assert.equal(bot.feet, rowTop(10), 'sur le quai de la sortie');
  bot.walkTo(colCenter(16));
  assert.equal(door(s, '1').open, 12);
  assert.equal(s.world.relays[0].active, true);
  assert.ok(s.world.tick < s.level.duration - 60, `relais au tick ${s.world.tick}`);
  bot.untilAttemptEnds(0);
  // Vie 4 : du relais à la sortie.
  assert.equal(px(s.world.player.x), 16 * TILE + 3);
  assert.equal(final87(bot), 'exit');
  assert.ok(s.world.tick < s.level.duration - 90, `sortie au tick ${s.world.tick}`);
});

test('87 seul : sans relais, cinq secondes ne suffisent pas ; une malle poussée trop loin se coince', () => {
  // Sans relais (les malles en place) : du départ, on n'atteint pas la sortie à temps.
  const s = new Session(loadSwap(F87, 'R', '.'));
  const bot = new Bot(s);
  firstTrunk87(bot);
  s.replay();
  secondTrunk87(bot);
  s.replay();
  for (let life = 0; life < 2; life++) {
    const a0 = s.attempt;
    down87(bot);
    climb87(bot);
    final87(bot);
    assert.equal(s.state, 'playing');
    assert.ok(s.attempt > a0, 'le chrono a tranché');
  }
  const free = new Session(loadSwap(F87, 'R', '.', { duration: null }));
  const fb = new Bot(free);
  firstTrunk87(fb);
  free.replay();
  secondTrunk87(fb);
  free.replay();
  down87(fb);
  climb87(fb);
  assert.equal(final87(fb), 'exit');
  assert.ok(free.world.tick > load(F87).duration + 30, `du départ à la sortie : ${free.world.tick} ticks`);
  // La seconde malle poussée au-delà de la plaque : elle bute contre la première, et n'en revient pas.
  const t = new Session(loadWith(F87, { duration: null }));
  const b2 = new Bot(t);
  firstTrunk87(b2);
  t.replay();
  secondTrunk87(b2);
  b2.hold(R, 200);
  assert.equal(block(t, 0).x + block(t, 0).w, block(t, 1).x, 'malle contre malle');
  assert.equal(blockOn(t, 'a', 0), false);
  const stuck = block(t, 0).x;
  b2.jump(1);                       // sur les malles : d'en haut, on ne pousse rien
  b2.hold(L, 40);
  b2.hold(R, 40);
  b2.jump(-1);
  b2.hold(R, 60);
  assert.ok(block(t, 0).x >= stuck, 'on ne peut pas la ramener');
  assert.equal(door(t, '1').open, 0);
  // Sans malle au pied du mur, trois cases : on ne monte pas.
  const lv = loadWith(F87, { duration: null });
  const up = (w) => w.player.onGround && w.player.y + w.player.h <= rowTop(10);
  for (const x of [colCenter(12), colCenter(11), colCenter(10)]) {
    assert.equal(anyJump(lv, standAt(x, 12), up), false, `depuis x=${x}`);
  }
  // Et du quai du bas, on ne remonte jamais chercher une malle restée en haut (quatre cases).
  const back = (w) => w.player.onGround && w.player.y + w.player.h <= A87;
  for (const x of [colCenter(6), colCenter(7), colCenter(8)]) {
    assert.equal(anyJump(lv, standAt(x, 12), back), false, `retour depuis x=${x}`);
  }
});

// --- 88. La consigne -----------------------------------------------------------------------

const F88 = '88-consigne-matin.json';
const FLOOR88 = rowTop(13);
/** 88 : de la galerie au fond du hall (on tombe au bout), puis vers la consigne. */
function toVault88(bot) {
  bot.holdUntil(R, () => bot.p.x >= 21 * TILE * SUB, 400);
  bot.holdUntil(L, () => bot.feet === FLOOR88 && bot.p.onGround, 100);
}
/** 88 : les trois bandes, dans l'ordre : la plaque de la galerie, le relais, la plaque du coffre. */
function threeTapes88(bot) {
  const s = bot.s;
  bot.walkTo(colCenter(4));
  s.replay();
  toVault88(bot);
  bot.walkTo(colCenter(19));
  s.replay();
  bot.walkTo(colCenter(6));
  s.replay();
}

test('88 consigne : une aide dehors, le relais dedans, une aide dedans ; trois échos, tous là une seule fois', () => {
  const s = new Session(load(F88));
  const bot = new Bot(s);
  // 1. Dehors, sur la galerie : la plaque qui tient la porte du coffre.
  bot.walkTo(colCenter(4));
  assert.equal(button(s, 'a').pressed, true);
  s.replay();
  // 2. Le trajet : descendre au fond du hall, entrer dans la consigne, s'arrêter sur le relais.
  toVault88(bot);
  bot.walkTo(colCenter(19));
  assert.equal(s.world.relays[0].active, true);
  assert.ok(s.world.tick < s.level.duration - 90, `relais au tick ${s.world.tick}`);
  s.replay();
  // 3. Depuis le relais : la plaque du fond, qui tient la sortie.
  bot.walkTo(colCenter(6));
  assert.equal(button(s, 'b').pressed, true);
  assert.ok(s.world.tick < s.level.duration - 90);
  assert.equal(door(s, '1').open, 12, 'l’écho de la galerie nous ouvrirait déjà le coffre…');
  s.replay();
  // 4. Les trois échos existent ensemble : dehors, sur le relais, au fond.
  assert.equal(s.world.actors.length, 4);
  assert.equal(bot.exit(L, 500), 'exit');
  assert.ok(button(s, 'a').pressed && button(s, 'b').pressed);
  assert.ok(s.world.tick < s.level.duration - 90, `sortie au tick ${s.world.tick}`);
});

test('88 consigne : avec deux échos, ou une tentative de trop, la bande de la galerie est oubliée', () => {
  const s = new Session(loadWith(F88, { maxEchoes: 2 }));
  const bot = new Bot(s);
  threeTapes88(bot);
  assert.equal(s.world.actors.length, 3);
  bot.exit(L, 400);
  assert.equal(s.state, 'playing');
  // Trois échos, mais la quatrième tentative est gâchée : à la cinquième, il manque la galerie.
  const t = new Session(load(F88));
  const b2 = new Bot(t);
  threeTapes88(b2);
  b2.untilAttemptEnds(0);
  assert.equal(t.world.actors.length, 4);
  b2.holdUntil(L, () => b2.p.vx === 0 && b2.cx < colCenter(10), 300);
  b2.idle(30);
  assert.equal(button(t, 'b').pressed, true);
  assert.equal(button(t, 'a').pressed, false);
  assert.ok(b2.p.x >= 6 * TILE * SUB, 'enfermé dans le coffre');
  assert.equal(t.state, 'playing');
});

test('88 consigne : un seul ordre : la plaque du fond est trop loin du départ, celle de la galerie hors d’atteinte du relais', () => {
  // Du départ jusqu'à la plaque du fond : plus long que le chrono.
  const s = new Session(load(F88));
  const bot = new Bot(s);
  toVault88(bot);
  bot.holdUntil(L, () => button(s, 'b').pressed, 500);
  assert.equal(s.attempt, 2, 'le chrono est tombé avant');
  const free = new Session(loadWith(F88, { duration: null }));
  const fb = new Bot(free);
  toVault88(fb);
  fb.holdUntil(L, () => button(free, 'b').pressed, 600);
  assert.ok(free.world.tick > load(F88).duration + 30, `du départ à la plaque du fond : ${free.world.tick} ticks`);
  // Le relais d'abord : de là, on ne remonte pas sur la galerie, et la porte du coffre reste fermée.
  const t = new Session(load(F88));
  const b2 = new Bot(t);
  toVault88(b2);
  b2.walkTo(colCenter(19));
  t.replay();
  b2.holdUntil(L, () => b2.p.vx === 0 && b2.cx < colCenter(10), 300);
  assert.ok(b2.p.x >= 6 * TILE * SUB, 'devant la porte du coffre, fermée');
  const lv = loadWith(F88, { duration: null });
  const gallery = (w) => w.player.onGround && w.player.y + w.player.h <= rowTop(7);
  for (const x of [colCenter(21), colCenter(23), colCenter(26), colCenter(19)]) {
    assert.equal(anyJump(lv, standAt(x, 12), gallery), false, `depuis x=${x}`);
  }
});

// --- 89. Le premier train ------------------------------------------------------------------

const F89 = '89-premier-train.json';
const FLOOR89 = rowTop(12);
/** 89 : du toit de l'abri, tomber derrière la malle et la pousser jusqu'à la plaque. */
function push89(bot) {
  bot.holdUntil(L, () => bot.feet === FLOOR89 && bot.p.onGround, 300);
  bot.holdUntil(R, () => button(bot.s, 'a').pressed, 600);
}
/** 89 : la cale : au bout du toit, se laisser tomber, puis descendre dans le creux. */
function wedge89(bot) {
  bot.holdUntil(R, () => bot.cx >= colCenter(8) - 4, 200);
  bot.holdUntil(0, () => bot.p.onGround && bot.feet >= FLOOR89, 80);
  bot.holdUntil(L, () => bot.feet > FLOOR89 && bot.p.onGround, 80);
  bot.holdUntil(L, () => bot.p.vx === 0, 30);
}
/** 89 : du toit au quai, par-dessus le creux. */
function toQuai89(bot) {
  bot.holdUntil(R, () => bot.p.onGround && bot.feet === FLOOR89 && bot.cx > colCenter(9), 300);
}
/** 89 : traverser la voie, monter sur la marche, puis sur la passerelle ; la sortie est à gauche. */
function final89(bot) {
  bot.holdUntil(R, () => bot.feet > FLOOR89 + 16 * SUB && bot.p.onGround, 300);
  bot.holdUntil(R, () => bot.cx >= colCenter(22) - 6, 200);
  bot.jump(1);
  bot.jump(1);
  bot.walkTo(colCenter(25));
  bot.hopUp();
  bot.hold(J, 3);
  return bot.exit(L, 200);
}

test('89 premier train : pousser, retenir, le relais, la seconde plaque ; un seul écho, le dernier enregistré', () => {
  const s = new Session(load(F89));
  const bot = new Bot(s);
  // 1. Pousser la malle sous l'abri, contre le vent, jusqu'à la plaque.
  push89(bot);
  assert.equal(blockOn(s, 'a'), true);
  assert.ok(s.world.tick < s.level.duration - 60, `plaque au tick ${s.world.tick}`);
  s.replay();
  // 2. La cale : l'écho pousse encore ; on est dans le creux, la malle reste sur la plaque.
  wedge89(bot);
  const x1 = block(s).x;
  bot.holdUntil(0, () => block(s).x !== x1, 400);
  assert.ok(block(s).x > x1, 'l’écho pousse');
  bot.holdUntil(0, () => s.world.actors[0].finished, 400);
  assert.equal(blockOn(s, 'a'), true);
  s.replay();
  const x2 = block(s).x;
  // 3. Le relais : l'écho est la cale, immobile ; personne ne touche plus à la malle.
  toQuai89(bot);
  bot.walkTo(colCenter(18));
  assert.equal(s.world.relays[0].active, true);
  assert.ok(s.world.tick < s.level.duration - 90, `relais au tick ${s.world.tick}`);
  s.replay();
  // 4. Depuis le relais : la seconde plaque.
  bot.walkTo(colCenter(16));
  assert.equal(button(s, 'b').pressed, true);
  s.replay();
  // 5. L'unique écho est celui de la seconde plaque ; la malle tient la première.
  assert.equal(s.world.actors.length, 2);
  assert.equal(block(s).x, x2, 'la malle n’a plus bougé');
  assert.equal(final89(bot), 'exit');
  assert.ok(button(s, 'a').pressed && button(s, 'b').pressed);
  assert.ok(s.world.tick < s.level.duration - 60, `sortie au tick ${s.world.tick}`);
});

test('89 premier train : sans cale, la malle tombe ; la seconde plaque avant le relais, elle est oubliée', () => {
  // Mauvais ordre 1 : pousser, puis filer au relais. L'écho rattrape la malle et la pousse dans le creux.
  const s = new Session(load(F89));
  const bot = new Bot(s);
  push89(bot);
  s.replay();
  toQuai89(bot);
  bot.walkTo(colCenter(18));
  bot.untilAttemptEnds(0);
  assert.ok(block(s).y + block(s).h > FLOOR89, 'la malle est dans le creux');
  assert.equal(blockOn(s, 'a'), false);
  // Mauvais ordre 2 : pousser, retenir, la seconde plaque (depuis le départ), puis le relais.
  const t = new Session(load(F89));
  const b2 = new Bot(t);
  push89(b2);
  t.replay();
  wedge89(b2);
  b2.holdUntil(0, () => t.world.actors[0].finished, 400);
  t.replay();
  toQuai89(b2);
  b2.walkTo(colCenter(16));
  assert.equal(button(t, 'b').pressed, true);
  t.replay();
  toQuai89(b2);
  b2.walkTo(colCenter(18));
  t.replay();
  assert.equal(px(t.world.player.x), 18 * TILE + 3, 'on part bien du relais…');
  b2.idle(200);
  assert.equal(blockOn(t, 'a'), true);
  assert.equal(button(t, 'b').pressed, false, '…mais l’unique écho est celui du trajet');
  assert.equal(door(t, '1').open, 0);
  // Mauvais ordre 3 : pousser, retenir, la seconde plaque, et partir du départ : le quai est trop long.
  const u = new Session(load(F89));
  const b3 = new Bot(u);
  push89(b3);
  u.replay();
  wedge89(b3);
  b3.holdUntil(0, () => u.world.actors[0].finished, 400);
  u.replay();
  toQuai89(b3);
  b3.walkTo(colCenter(16));
  u.replay();
  const a0 = u.attempt;
  toQuai89(b3);
  final89(b3);
  assert.equal(u.state, 'playing');
  assert.ok(u.attempt > a0, 'le chrono a tranché');
  const free = new Session(loadWith(F89, { duration: null, doors: { 1: { buttons: ['a'], invert: true } } }));
  const fb = new Bot(free);
  toQuai89(fb);
  assert.equal(final89(fb), 'exit');
  assert.ok(free.world.tick > load(F89).duration + 30, `du départ à la sortie : ${free.world.tick} ticks`);
});

test('89 premier train : le relais d’abord, et la malle est hors d’atteinte ; dans le vent, pas de dosage', () => {
  // Du quai, on ne remonte pas sur le toit de l'abri : on ne passe plus derrière la malle.
  const lv = loadWith(F89, { duration: null });
  const roof = (w) => w.player.onGround && w.player.y + w.player.h <= rowTop(9);
  for (const x of [colCenter(9), colCenter(10), colCenter(8) + 3]) {
    assert.equal(anyJump(lv, standAt(x, 11), roof), false, `depuis x=${x}`);
  }
  const s = new Session(load(F89));
  const bot = new Bot(s);
  toQuai89(bot);
  bot.walkTo(colCenter(18));
  s.replay();
  // Par la droite, on ne peut que la repousser vers le fond de l'abri.
  const start = block(s).x;
  bot.holdUntil(L, () => bot.cx < colCenter(9) + 4, 200);
  bot.jump(-1);
  bot.hold(L, 120);
  assert.ok(block(s).x < start, 'repoussée vers le fond');
  assert.equal(blockOn(s, 'a'), false);
  // Un seul pousseur : lâcher au tick t1, puis regarder l'écho. Jamais la malle ne reste sur la plaque.
  let kept = 0;
  for (let t1 = 80; t1 <= 268; t1 += 3) {
    const t = new Session(load(F89));
    const b2 = new Bot(t);
    b2.holdUntil(L, () => b2.feet === FLOOR89 && b2.p.onGround, 300);
    b2.holdUntil(R, () => t.world.tick >= t1, 600);
    b2.idle(1);
    t.replay();
    b2.untilAttemptEnds(0);
    if (blockOn(t, 'a') && block(t).y + block(t).h === FLOOR89) kept++;
  }
  assert.equal(kept, 0);
});

// --- 90. Le quai ---------------------------------------------------------------------------

const F90 = '90-quai-matin.json';
/** 90 : marcher jusqu'à la plaque, devant la porte du train, et s'y arrêter. */
function toPlate90(bot) {
  bot.walkTo(colCenter(13));
  bot.idle(5);
}

test('90 quai : sans chrono ; cinq sur le marchepied, la porte du train s’ouvre, on monte tous', () => {
  const s = new Session(load(F90));
  const bot = new Bot(s);
  assert.equal(s.ticksLeft, null, 'pas de chrono');
  assert.equal(s.level.exitStyle, 'train');
  for (let k = 0; k < 4; k++) {
    toPlate90(bot);
    assert.equal(button(s, 'a').pressed, false, `à ${k + 1}, rien ne bouge`);
    s.replay();
  }
  assert.equal(s.world.actors.length, 5, 'soi, et ses quatre échos');
  toPlate90(bot);
  assert.equal(button(s, 'a').count, 5);
  bot.holdUntil(0, () => door(s, '1').open === 12, 100);
  bot.holdUntil(R, () => bot.cx > colCenter(15) - 2, 200);
  assert.ok(button(s, 'a').timer > 30, 'la minuterie laisse le temps de monter');
  bot.jump(1);
  assert.equal(bot.exit(R), 'exit');
  assert.equal(s.outcome, 'exit');
  assert.equal(s.level.endings.exit.endsWith(' (provisoire)'), true);
});

test('90 quai : à quatre, la porte reste fermée ; sur le banc, on peut aussi rester', () => {
  const s = new Session(load(F90));
  const bot = new Bot(s);
  for (let k = 0; k < 3; k++) { toPlate90(bot); s.replay(); }
  toPlate90(bot);
  bot.idle(60);
  assert.equal(button(s, 'a').count, 4, 'trois échos et soi');
  assert.equal(button(s, 'a').pressed, false);
  bot.holdUntil(R, () => bot.p.vx === 0 && bot.cx > colCenter(13), 200);
  bot.jump(1);
  assert.ok(bot.cx < colCenter(15), 'la porte du train est fermée');
  assert.equal(s.state, 'playing');
  // Le banc : la touche Bas, et l'on reste.
  const t = new Session(load(F90));
  const b2 = new Bot(t);
  b2.walkTo(colCenter(3));
  b2.step(D);
  assert.equal(t.state, 'playing', 'pas ici');
  b2.step(0);
  b2.walkTo(colCenter(7));
  b2.step(D);
  assert.equal(t.state, 'won');
  assert.equal(t.outcome, 'stay');
  assert.equal(t.level.endings.stay.endsWith(' (provisoire)'), true);
});
