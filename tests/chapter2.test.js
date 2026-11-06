// Chapitre 2 — la gare d'altitude (niveaux 11 à 20).
//
// Chaque niveau est joué par un petit robot qui suit la solution prévue, à
// travers la vraie Session (enregistrement, échos, reprises). On vérifie aussi
// que l'idée du niveau est nécessaire : seul, ou avec un raccourci plausible
// (dash, saut au mur, escalade), on échoue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseLevel } from '../src/sim/level.js';
import { Session } from '../src/sim/session.js';
import {
  IN_LEFT, IN_RIGHT, IN_JUMP, IN_UP, IN_DOWN, IN_DASH, IN_GRAB, SUB, TILE, TILE_SUB,
} from '../src/sim/constants.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (file) => JSON.parse(readFileSync(join(here, '../src/levels', file), 'utf8'));
const load = (file) => parseLevel(raw(file));
/** Centre d'une colonne, en pixels. */
const colCenter = (c) => c * TILE + TILE / 2;
/** Haut d'une rangée, en sous-pixels. */
const rowTop = (r) => r * TILE_SUB;

/** Robot : quelques gestes simples, tick par tick, sur une session. */
class Bot {
  constructor(session) {
    this.s = session;
  }
  get w() { return this.s.world; }
  get p() { return this.s.world.player; }
  /** Centre du joueur, en pixels. */
  get cx() { return (this.p.x + (this.p.w >> 1)) / SUB; }
  get feet() { return this.p.y + this.p.h; }
  get done() { return this.s.state !== 'playing'; }
  step(bits) {
    if (this.s.state !== 'playing') return false;
    this.s.step(bits);
    return this.s.state === 'playing';
  }
  /** Tient une entrée pendant n ticks. */
  hold(bits, n) { for (let i = 0; i < n; i++) if (!this.step(bits)) return; }
  idle(n) { this.hold(0, n); }
  /** Attend que la tentative se termine (chrono). */
  untilAttemptEnds(bits = 0) {
    const a = this.s.attempt;
    while (this.s.attempt === a && this.s.state === 'playing') this.step(bits);
  }
  /** Attend un tick précis de la tentative. */
  untilTick(t, bits = 0) {
    while (this.w.tick < t && this.s.state === 'playing') this.step(bits);
  }
  /** Marche jusqu'à ce que le centre soit à ~3 px de `x`, puis s'arrête. */
  walkTo(x, max = 900) {
    for (let i = 0; i < max; i++) {
      const d = x - this.cx;
      if (Math.abs(d) <= 3 && this.p.onGround) break;
      if (!this.step(d > 0 ? IN_RIGHT : IN_LEFT)) return;
    }
    for (let i = 0; i < 40 && this.p.vx !== 0; i++) this.step(0);
  }
  /**
   * S'arrête au mieux sur `x`, même sur la glace : on lâche la touche à temps
   * pour glisser jusqu'au but, puis on corrige par petites touches.
   */
  settle(x, tol = 2, max = 900) {
    for (let i = 0; i < max && !this.done; i++) {
      const d = (x - this.cx) * SUB;
      const vx = this.p.vx;
      const ice = this.p.ground?.ice;
      if (Math.abs(d) <= tol * SUB && vx === 0) return true;
      // Distance de glissade si l'on lâche maintenant (décélération 1 sur la glace).
      const dec = ice ? 1 : 5;
      const coast = (vx * (Math.abs(vx) + dec)) / (2 * dec);
      if (Math.sign(d) === Math.sign(vx) && Math.abs(coast) >= Math.abs(d)) { this.step(0); continue; }
      if (vx !== 0 && Math.sign(d) !== Math.sign(vx)) { this.step(0); continue; }
      this.step(d > 0 ? IN_RIGHT : IN_LEFT);
    }
    return false;
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
  /** Bascule le levier sur lequel on se tient. */
  lever() { this.step(IN_DOWN); this.step(0); }
  /**
   * Course la plus rapide possible : des dashs au sol enchaînés (un tick de
   * relâche entre deux), dans la direction `dir`, jusqu'à `pred()`.
   */
  dashRun(dir, pred, max = 600) {
    const d = dir > 0 ? IN_RIGHT : IN_LEFT;
    const a = this.s.attempt;
    for (let i = 0; i < max && !this.done && !pred() && this.s.attempt === a; i++) {
      this.step(d | ((i % 11) < 10 ? IN_DASH : 0));
    }
  }
}

/** Le joueur est-il passé à droite de la colonne `c` ? */
const pastCol = (bot, c) => bot.cx > c * TILE;

// --- 11. L'arrivée ------------------------------------------------------------

test('11 arrivée : seul, le bouton lâché, la porte se referme avant qu’on l’atteigne', () => {
  const s = new Session(load('11-arrivee.json'));
  const bot = new Bot(s);
  bot.settle(colCenter(13));
  assert.equal(s.world.buttons[0].pressed, true, 'debout sur le bouton, sur la glace');
  bot.idle(20);
  assert.equal(s.world.doors[0].open, 12, 'la porte est ouverte');
  // Même en enchaînant les dashs, on n'atteint pas la porte à temps.
  bot.dashRun(1, () => pastCol(bot, 23), 150);
  assert.equal(s.attempt, 1);
  assert.equal(s.state, 'playing');
  assert.equal(s.world.doors[0].open, 0, 'porte refermée');
  assert.ok(!pastCol(bot, 22), 'arrêté devant la porte');
});

test('11 arrivée : sur la glace, on glisse au-delà du bouton si l’on lâche trop tard', () => {
  const s = new Session(load('11-arrivee.json'));
  const bot = new Bot(s);
  bot.holdUntil(IN_RIGHT, () => bot.cx >= colCenter(13));
  bot.holdUntil(0, () => bot.p.vx === 0, 60);
  assert.equal(s.world.buttons[0].pressed, false, 'on a glissé plus loin');
});

test('11 arrivée : « Rejouer » en pleine glissade, l’écho glisse hors du bouton', () => {
  const s = new Session(load('11-arrivee.json'));
  const bot = new Bot(s);
  bot.holdUntil(IN_RIGHT, () => s.world.buttons[0].pressed);
  bot.hold(IN_RIGHT, 10);
  assert.equal(s.world.buttons[0].pressed, true, 'sur le bouton, mais lancé');
  s.replay();
  const echo = s.world.actors[0];
  bot.holdUntil(0, () => echo.finished && echo.vx === 0, 300);
  assert.equal(s.world.buttons[0].pressed, false, 'sa bande finie, l’écho a continué de glisser');
});

test('11 arrivée : un écho tient le bouton, on passe la porte', () => {
  const s = new Session(load('11-arrivee.json'));
  const bot = new Bot(s);
  assert.equal(bot.settle(colCenter(13)), true);
  s.replay();
  const echo = s.world.actors[0];
  bot.holdUntil(IN_RIGHT, () => bot.done || bot.p.vx === 0 && pastCol(bot, 21), 600);
  bot.holdUntil(IN_RIGHT, () => bot.done, 400);
  assert.equal(s.outcome, 'exit');
  assert.equal(s.world.buttons[0].pressed, true, 'l’écho est resté sur le bouton');
  assert.ok(echo.finished, 'sa bande est finie : il reste immobile');
});

/**
 * Essaie une série de gestes d'évasion (sauts, dashs, escalade) depuis l'état
 * laissé par `setup` ; renvoie vrai si l'un d'eux satisfait `escaped`.
 */
function anyEscape(file, setup, escaped, ticks = 240) {
  const R = IN_RIGHT, L = IN_LEFT, J = IN_JUMP, U = IN_UP, D = IN_DASH, G = IN_GRAB;
  const patterns = [
    [[J, 18], [D | U, 12], [G | U, 120]],
    [[R | J, 18], [D | U | R, 12], [G | U | R, 120]],
    [[L | J, 18], [D | U | L, 12], [G | U | L, 120]],
    [[R, 20], [J | R, 10], [G | R | U, 60], [J | G, 20], [G | U | R, 60]],
    [[L, 20], [J | L, 10], [G | L | U, 60], [J | G, 20], [G | U | L, 60]],
    [[D | U, 12], [J, 20], [G | U, 100]],
    [[R | J, 8], [L | J, 8], [R | J, 8], [L | J, 8], [D | U, 12], [G | U, 80]],
  ];
  for (const pat of patterns) {
    for (const pre of [[0, 0], [R, 10], [R, 20], [L, 10], [L, 20], [R, 40], [L, 40]]) {
      const s = new Session(load(file));
      const bot = new Bot(s);
      setup(bot);
      const a = s.attempt;
      bot.hold(pre[0], pre[1]);
      bot.idle(4);
      let ok = false;
      for (const [bits, n] of pat) {
        for (let i = 0; i < n; i++) { bot.step(bits); ok ||= s.attempt === a && escaped(bot); }
      }
      for (let i = 0; i < ticks; i++) { bot.step(i < 30 ? pre[0] : 0); ok ||= s.attempt === a && escaped(bot); }
      if (ok) return true;
    }
  }
  return false;
}

// --- 12. La salle des pas perdus --------------------------------------------------

/** Descendre dans la cave par la trappe et basculer le levier. */
function pullCellarLever(bot) {
  bot.walkTo(colCenter(2) + 8);
  bot.holdUntil(0, () => bot.p.onGround && bot.feet === rowTop(13), 60);
  bot.walkTo(colCenter(1));
  bot.lever();
}

test('12 pas perdus : le levier referme la trappe sur celui qui le tire', () => {
  const s = new Session(load('12-pas-perdus.json'));
  const bot = new Bot(s);
  pullCellarLever(bot);
  assert.equal(s.world.levers[0].pressed, true);
  bot.idle(15);
  const [door, hatch] = s.world.doors;
  assert.equal(door.open, 12, 'la porte du fond s’ouvre');
  assert.equal(hatch.open, 0, 'la trappe s’est refermée');
  // Seul : impossible de ressortir de la cave (sauts, dash, escalade).
  const escaped = (b) => b.feet <= rowTop(10);
  assert.equal(anyEscape('12-pas-perdus.json', pullCellarLever, escaped), false);
  // Témoin : trappe ouverte (levier non tiré), ces mêmes gestes font ressortir.
  const intoCellar = (b) => { b.walkTo(colCenter(2) + 8); b.idle(30); b.walkTo(colCenter(1)); };
  assert.equal(anyEscape('12-pas-perdus.json', intoCellar, escaped), true);
});

/** Depuis le dessous d'une trappe, tenter de s'agripper à ses bords (pour la caler ouverte). */
function hangsInHatch(file, setup, hatchId) {
  for (const dir of [IN_LEFT, IN_RIGHT]) {
    for (const off of [-6, -3, 0, 3, 6]) {
      for (const dash of [0, IN_DASH]) {
        const s = new Session(load(file));
        const bot = new Bot(s);
        setup(bot);
        const hatch = s.world.doors.find((d) => d.id === hatchId);
        bot.walkTo((hatch.x + hatch.w / 2) / SUB + off);
        bot.hold(dir | IN_JUMP, 14);
        bot.hold(dir | IN_JUMP | dash | IN_UP, 10);
        for (let i = 0; i < 40; i++) {
          bot.step(dir | IN_GRAB);
          const p = bot.p;
          if (p.climbing && p.y < hatch.y + hatch.h && p.y + p.h > hatch.y) return true;
        }
      }
    }
  }
  return false;
}

test('12 pas perdus : la trappe a un rebord de glace, on ne peut pas s’y suspendre', () => {
  const intoCellar = (b) => { b.walkTo(colCenter(2) + 8); b.idle(30); };
  assert.equal(hangsInHatch('12-pas-perdus.json', intoCellar, '2'), false);
});

test('12 pas perdus : remonter le levier rouvre la trappe, mais referme la porte', () => {
  // On remonte le levier (la trappe se rouvre, la porte se ferme) : rien n'y fait.
  const s = new Session(load('12-pas-perdus.json'));
  const bot = new Bot(s);
  pullCellarLever(bot);
  bot.idle(5);
  bot.lever();
  assert.equal(s.world.levers[0].pressed, false);
  bot.idle(14);
  assert.equal(s.world.doors[0].target, false, 'la porte se referme');
});

test('12 pas perdus : un écho tire le levier, on court dès le début', () => {
  const s = new Session(load('12-pas-perdus.json'));
  const bot = new Bot(s);
  pullCellarLever(bot);
  const pulledAt = s.world.tick;
  assert.ok(pulledAt < s.level.duration - 60, `levier tiré à ${pulledAt}`);
  bot.untilAttemptEnds();
  bot.holdUntil(IN_RIGHT, () => bot.done, 400);
  assert.equal(s.outcome, 'exit');
  assert.ok(s.world.tick < s.level.duration, 'avant la fin du chrono');
});

// --- 13. Les signaux --------------------------------------------------------------

/** Aller au bord de la niche, attendre que le signal s'éteigne, s'y laisser tomber. */
function intoSignalNiche(bot) {
  const beam = () => bot.w.lasers[0];
  bot.walkTo(colCenter(5) + 4);
  bot.holdUntil(0, () => !beam().on, 200);
  bot.holdUntil(IN_LEFT, () => bot.feet === rowTop(12) && bot.p.onGround, 60);
  bot.settle(colCenter(4), 1);
}

test('13 signaux : on atteint la plaque, mais on ne peut pas y rester', () => {
  const s = new Session(load('13-signaux.json'));
  const bot = new Bot(s);
  intoSignalNiche(bot);
  assert.equal(s.world.buttons[0].pressed, true, 'sur la plaque');
  assert.equal(s.world.player.dead, false);
  bot.holdUntil(0, () => s.world.player.dead || s.attempt > 1, 300);
  assert.equal(s.world.player.dead, true, 'le signal se rallume sur nous');
  bot.idle(60);
  assert.equal(s.world.actors.length, 1, 'aucun écho');
  // La plaque lâchée, la porte se ferme bien avant qu'on l'atteigne.
  const s2 = new Session(load('13-signaux.json'));
  const b2 = new Bot(s2);
  intoSignalNiche(b2);
  b2.idle(15);
  b2.hold(IN_RIGHT | IN_JUMP, 14);
  b2.dashRun(1, () => pastCol(b2, 25), 200);
  assert.equal(s2.attempt, 1);
  assert.ok(!pastCol(b2, 24), 'la porte s’est refermée');
});

test('13 signaux : le chrono finit pendant que le signal est allumé', () => {
  const level = load('13-signaux.json');
  const w = new Session(level).world;
  const l = w.lasers[0];
  const onAt = (t) => { w.tick = t; return w.laserOn(l); };
  assert.equal(onAt(level.duration - 1), true, 'rester dans la niche jusqu’au bout tue');
});

test('13 signaux : « Rejouer » au bon moment, l’écho garde la plaque', () => {
  const s = new Session(load('13-signaux.json'));
  const bot = new Bot(s);
  intoSignalNiche(bot);
  s.replay();
  let stoppedOnEcho = false;
  bot.holdUntil(IN_RIGHT, () => {
    const l = s.world.lasers[0];
    if (l.on && l.hit?.kind === 'echo') stoppedOnEcho = true;
    return bot.done;
  }, 600);
  assert.equal(s.outcome, 'exit');
  assert.equal(stoppedOnEcho, true, 'le faisceau s’arrête sur la tête de l’écho');
});

// --- 14. Le téléphérique -------------------------------------------------------------

/**
 * Sur une cabine en marche : avant un faisceau vertical (colonne `col`), on
 * recule vers l'arrière de la cabine tant qu'il est allumé, puis on avance
 * quand il s'éteint. S'arrête quand `done()`.
 */
function rideUnder(bot, cabin, beam, col, done, max = 900) {
  const bx = (col * TILE + TILE / 2) * SUB;
  for (let i = 0; i < max && !bot.done && !bot.p.dead && !done(); i++) {
    const p = bot.p, c = cabin();
    const off = p.x - c.x;
    const ahead = bx - (p.x + p.w);
    const passed = p.x > bx + SUB;
    let bits = 0;
    if (!passed && beam().on && ahead < 10 * SUB) bits = off > 2 * SUB ? IN_LEFT : 0;
    else if (!passed && !beam().on) bits = off < c.w - p.w - 2 * SUB ? IN_RIGHT : 0;
    // Pas d'élan résiduel vers le bord : on lâche dès qu'on approche d'une extrémité.
    if (bits === IN_LEFT && off < 6 * SUB) bits = 0;
    if (bits === IN_RIGHT && off > c.w - p.w - 6 * SUB) bits = 0;
    bot.step(bits);
  }
}

test('14 téléphérique : seul, la cabine s’arrête dès qu’on lâche le bouton', () => {
  const file = '14-telepherique.json';
  let landed = 0;
  for (const k of [0, 30, 50, 70, 90]) {
    for (const finale of ['jumpdash', 'gdash']) {
      const s = new Session(load(file));
      const bot = new Bot(s);
      bot.walkTo(colCenter(1));
      bot.idle(k); // la cabine avance pendant qu'on tient le bouton
      const cabin = s.world.platforms[0];
      bot.holdUntil(IN_RIGHT, () => !s.world.buttons[0].pressed, 60);
      bot.step(IN_RIGHT);
      const parked = cabin.x;
      // Courir jusqu'au bord, sauter vers la cabine arrêtée.
      bot.holdUntil(IN_RIGHT, () => bot.cx > 5 * TILE + 2, 200);
      bot.hold(IN_RIGHT | IN_JUMP, 14);
      bot.hold(IN_RIGHT | IN_DASH, 10);
      bot.holdUntil(IN_RIGHT, () => bot.p.onGround || bot.p.dead, 120);
      assert.equal(cabin.x, parked, 'la cabine ne bouge plus');
      if (!bot.p.dead && bot.p.ground === cabin) {
        landed++;
        // De la cabine, tenter le grand saut vers l'autre quai.
        bot.walkTo(cabin.x / SUB + 40);
        if (finale === 'jumpdash') { bot.hold(IN_RIGHT | IN_JUMP, 14); bot.hold(IN_RIGHT | IN_DASH, 10); }
        else { bot.hold(IN_RIGHT | IN_DASH, 10); bot.step(IN_RIGHT | IN_JUMP); bot.hold(IN_RIGHT | IN_JUMP, 12); bot.hold(IN_RIGHT | IN_DASH, 10); }
        bot.holdUntil(IN_RIGHT, () => bot.done || bot.p.dead || bot.p.onGround, 200);
      }
      assert.notEqual(s.outcome, 'exit');
      assert.ok(bot.p.dead || !pastCol(bot, 22), `k=${k} ${finale}`);
    }
  }
  assert.ok(landed >= 2, `on a bien pu sauter dans la cabine arrêtée (${landed})`);
});

test('14 téléphérique : le vide est gardé, même en plein dash', () => {
  const s = new Session(load('14-telepherique.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(4));
  bot.hold(IN_RIGHT | IN_DASH, 10);
  bot.step(IN_RIGHT | IN_JUMP);
  bot.hold(IN_RIGHT | IN_JUMP, 12);
  bot.hold(IN_RIGHT | IN_DASH, 10);
  bot.holdUntil(IN_RIGHT, () => bot.p.dead || bot.p.onGround, 200);
  assert.equal(bot.p.dead, true);
});

/** Tentative 1 du téléphérique : tenir le bouton jusqu'au bout. */
function holdCabinButton(bot) {
  bot.walkTo(colCenter(1));
  bot.untilAttemptEnds();
}

test('14 téléphérique : immobile dans la cabine, le signal nous attrape', () => {
  const s = new Session(load('14-telepherique.json'));
  const bot = new Bot(s);
  holdCabinButton(bot);
  const cabin = () => s.world.platforms[0];
  bot.walkTo(colCenter(7));
  assert.equal(bot.p.ground, cabin());
  bot.holdUntil(0, () => bot.p.dead || cabin().t === cabin().len, 400);
  assert.equal(bot.p.dead, true);
});

test('14 téléphérique : un écho tient le bouton, on évite le signal dans la cabine', () => {
  const s = new Session(load('14-telepherique.json'));
  const bot = new Bot(s);
  holdCabinButton(bot);
  const cabin = () => s.world.platforms[0];
  const beam = () => s.world.lasers[0];
  bot.walkTo(colCenter(7));
  assert.equal(bot.p.ground, cabin(), 'dans la cabine');
  rideUnder(bot, cabin, beam, 13, () => cabin().t === cabin().len);
  assert.equal(bot.p.dead, false);
  bot.holdUntil(IN_RIGHT, () => bot.done, 300);
  assert.equal(s.outcome, 'exit');
});

// --- 15. La consigne -----------------------------------------------------------------

test('15 consigne : seul, on ne peut pas relever le levier depuis le couloir', () => {
  const s = new Session(load('15-consigne.json'));
  const bot = new Bot(s);
  const [hatch, door2] = s.world.doors;
  bot.walkTo(colCenter(5));
  bot.lever();
  bot.walkTo(colCenter(18) + 8);
  bot.holdUntil(0, () => bot.p.onGround && bot.feet === rowTop(11), 80);
  assert.equal(bot.feet, rowTop(11), 'tombé dans le couloir');
  bot.holdUntil(IN_LEFT, () => bot.p.vx === 0 && bot.p.onGround && bot.cx < 12 * TILE, 300);
  assert.equal(door2.open, 0, 'la porte du couloir reste fermée');
  assert.ok(bot.cx > 10 * TILE, 'bloqué devant elle');
  // Remonter, relever le levier : la trappe se referme, on reste en haut.
  const s2 = new Session(load('15-consigne.json'));
  const b2 = new Bot(s2);
  b2.walkTo(colCenter(5));
  b2.lever();
  b2.idle(20);
  b2.lever();
  b2.idle(14);
  assert.equal(s2.world.doors[1].open, 12, 'porte du couloir ouverte');
  b2.walkTo(colCenter(18) + 8);
  b2.idle(30);
  assert.equal(b2.feet, rowTop(7), 'la trappe est fermée, on reste en haut');
});

test('15 consigne : la trappe a un rebord de glace, on ne peut pas s’y suspendre', () => {
  const below = (b) => { b.walkTo(colCenter(5)); b.lever(); b.walkTo(colCenter(18) + 8); b.idle(40); };
  assert.equal(hangsInHatch('15-consigne.json', below, '1'), false);
});

/** Écho de la consigne : baisser le levier à t1, le relever à t2. */
function consigneSwitchman(bot, t1, t2) {
  bot.walkTo(colCenter(5));
  bot.untilTick(t1);
  bot.lever();
  if (t2 != null) { bot.untilTick(t2); bot.lever(); }
  bot.untilAttemptEnds();
}

/** Le joueur de la consigne : sur la trappe, puis au pied de la porte, puis dehors. */
function consigneRun(bot) {
  bot.walkTo(colCenter(18) + 8);
  bot.holdUntil(0, () => bot.feet === rowTop(11) && bot.p.onGround, 300);
  bot.walkTo(colCenter(10));
  bot.holdUntil(IN_LEFT, () => bot.done, 300);
}

test('15 consigne : un écho qui ne bascule qu’une fois nous laisse au pied de la porte', () => {
  const s = new Session(load('15-consigne.json'));
  const bot = new Bot(s);
  consigneSwitchman(bot, 110, null);
  consigneRun(bot);
  assert.notEqual(s.outcome, 'exit');
});

test('15 consigne : un écho baisse le levier, attend, et le relève', () => {
  const s = new Session(load('15-consigne.json'));
  const bot = new Bot(s);
  consigneSwitchman(bot, 110, 200);
  assert.equal(s.history.length, 1);
  consigneRun(bot);
  assert.equal(s.outcome, 'exit');
  assert.equal(s.world.actors.length, 2, 'un seul écho');
});

test('15 consigne : relevé trop tôt, la trappe se referme sous nos pieds', () => {
  const s = new Session(load('15-consigne.json'));
  const bot = new Bot(s);
  consigneSwitchman(bot, 110, 118);
  consigneRun(bot);
  assert.notEqual(s.outcome, 'exit');
  assert.equal(bot.feet, rowTop(7), 'resté en haut');
});

// --- 16. Le gouffre --------------------------------------------------------------------

/** Courir jusqu'à ce que le bord droit du joueur soit à `px` pixels. */
const runToRightEdge = (bot, px) => bot.holdUntil(IN_RIGHT, () => (bot.p.x + bot.p.w) / SUB >= px, 300);
const GOUFFRE_EDGE = 7 * TILE; // bord du quai de départ
const GOUFFRE_FAR = 17 * TILE; // paroi d'en face

test('16 gouffre : trop large, même avec tous les enchaînements de dash', () => {
  const R = IN_RIGHT, J = IN_JUMP, D = IN_DASH, U = IN_UP, G = IN_GRAB;
  const combos = {
    'saut + dash': (a) => [[R | J, a], [R | D, 10], [R | G, 90]],
    'saut + dash en diagonale': (a) => [[R | J, a], [R | D | U, 10], [R | G, 90]],
    'dash au sol + saut + dash': (a) => [[R | D, 10], [R | J, a], [R | D | U, 10], [R | G, 90]],
    'dash au sol + dash + saut': (a) => [[R | D, 10], [R, 1], [R | D, 10], [R | J, a], [R | G, 90]],
  };
  let best = 0;
  for (const [name, combo] of Object.entries(combos)) {
    for (let off = -24; off <= 8; off += 4) {
      for (let a = 2; a <= 18; a += 2) {
        const s = new Session(load('16-gouffre.json'));
        const bot = new Bot(s);
        runToRightEdge(bot, GOUFFRE_EDGE + off);
        for (const [bits, n] of combo(a)) {
          for (let i = 0; i < n && !bot.p.dead; i++) { bot.step(bits); best = Math.max(best, (bot.p.x + bot.p.w) / SUB); }
        }
        assert.ok(bot.p.dead, `${name} (${off}, ${a}) : on tombe dans le faisceau`);
      }
    }
  }
  assert.ok(best < GOUFFRE_FAR - 12, `au mieux ${best} px, la paroi est à ${GOUFFRE_FAR}`);
});

/** L'écho-marche : sauter dans le gouffre, « Rejouer » en plein vol. */
function dropStepEcho(bot) {
  runToRightEdge(bot, GOUFFRE_EDGE + 3);
  bot.hold(IN_RIGHT | IN_JUMP, 14);
  bot.hold(IN_RIGHT | IN_DASH, 10);
  bot.hold(IN_RIGHT, 8);
  assert.equal(bot.p.dead, false, 'encore en vol');
  bot.s.replay();
}

/** En l'air : se diriger pour retomber le centre près de `x` (pixels). */
function steerTo(bot, x, max = 100) {
  for (let i = 0; i < max && !bot.p.onGround && !bot.p.dead && !bot.done; i++) {
    bot.step(bot.cx < x - 6 ? IN_RIGHT : bot.cx > x ? IN_LEFT : IN_RIGHT);
  }
}

test('16 gouffre : sans « Rejouer » en plein vol, la chute ne laisse aucun écho', () => {
  const s = new Session(load('16-gouffre.json'));
  const bot = new Bot(s);
  runToRightEdge(bot, GOUFFRE_EDGE + 3);
  bot.hold(IN_RIGHT | IN_JUMP, 14);
  bot.hold(IN_RIGHT | IN_DASH, 10);
  bot.holdUntil(IN_RIGHT, () => bot.p.dead, 100);
  assert.equal(bot.p.dead, true);
  bot.idle(60);
  assert.equal(s.history.length, 0);
});

test('16 gouffre : l’écho tombé arrête les faisceaux et sert de marche', () => {
  const s = new Session(load('16-gouffre.json'));
  const bot = new Bot(s);
  dropStepEcho(bot);
  const echo = s.world.actors[0];
  bot.holdUntil(0, () => echo.finished && echo.onGround, 200);
  assert.equal(echo.y + echo.h, rowTop(10), 'l’écho est au fond, sain et sauf');
  assert.ok(s.world.lasers.every((l) => l.hit === echo), 'les deux faisceaux s’arrêtent sur lui');
  // Premier bond : sur la tête de l'écho.
  runToRightEdge(bot, GOUFFRE_EDGE);
  bot.hold(IN_RIGHT | IN_JUMP, 12);
  bot.hold(IN_RIGHT | IN_DASH, 10);
  steerTo(bot, (echo.x + echo.w) / SUB - 2);
  assert.equal(bot.p.ground?.kind, 'echo', 'sur la tête de l’écho');
  // Rebond aussitôt (le dash est rechargé), jusqu'au quai d'en face.
  bot.hold(IN_RIGHT | IN_JUMP, 16);
  assert.equal(bot.p.dashes, 1, 'dash rechargé sur sa tête');
  bot.hold(IN_RIGHT, 6);
  bot.hold(IN_RIGHT | IN_DASH, 10);
  bot.holdUntil(IN_RIGHT, () => bot.done || bot.p.dead, 200);
  assert.equal(s.outcome, 'exit');
});

// --- 17. L'aiguillage ------------------------------------------------------------------

/** Rester au milieu d'une cabine jusqu'à `done()`. */
function stayOn(bot, cabin, done, max = 600) {
  for (let i = 0; i < max && !done() && !bot.done && !bot.p.dead; i++) {
    const mid = (cabin.x + cabin.w / 2) / SUB;
    bot.step(bot.cx < mid - 3 ? IN_RIGHT : bot.cx > mid + 3 ? IN_LEFT : 0);
  }
}

/** Baisser le levier depuis la première cabine, y rester jusqu'au milieu, passer dans la seconde. */
function aiguillageFirstLeg(bot) {
  const [a, b] = bot.w.platforms;
  // Le levier est à la porte de la cabine : on le baisse depuis la cabine.
  bot.walkTo(colCenter(5) - 2);
  assert.equal(bot.p.ground, a, 'dans la première cabine');
  bot.lever();
  stayOn(bot, a, () => a.t === a.len && b.t === b.len);
  // Descendre sur le quai du milieu, monter la marche, entrer dans la seconde cabine.
  bot.walkTo(colCenter(13));
  bot.jump(1);
  bot.walkTo(colCenter(16) + 8);
  assert.equal(bot.p.ground, b, 'dans la seconde cabine');
}

test('17 aiguillage : seul, on reste coincé au milieu', () => {
  const s = new Session(load('17-aiguillage.json'));
  const bot = new Bot(s);
  aiguillageFirstLeg(bot);
  const b = s.world.platforms[1];
  bot.idle(120);
  assert.equal(b.t, b.len, 'la seconde cabine attend au milieu');
  // Sauter vers le quai d'arrivée : les faisceaux du vide.
  bot.walkTo(colCenter(17));
  bot.hold(IN_RIGHT | IN_JUMP, 14);
  bot.hold(IN_RIGHT | IN_DASH, 10);
  bot.holdUntil(IN_RIGHT, () => bot.p.dead || bot.p.onGround, 120);
  assert.equal(bot.p.dead, true);
});

/** Écho aiguilleur : rester au levier (sur le quai) et le basculer au tick `t`. */
function switchAt(bot, t) {
  bot.walkTo(colCenter(4) + 5);
  bot.untilTick(t);
  bot.lever();
  bot.untilAttemptEnds();
}

test('17 aiguillage : un écho rebascule le levier pendant qu’on est en route', () => {
  const s = new Session(load('17-aiguillage.json'));
  const bot = new Bot(s);
  switchAt(bot, 240);
  aiguillageFirstLeg(bot);
  assert.ok(s.world.tick < 240, `dans la seconde cabine à ${s.world.tick}`);
  const b = s.world.platforms[1];
  stayOn(bot, b, () => b.t === 0);
  assert.equal(bot.p.ground, b);
  bot.holdUntil(IN_RIGHT, () => bot.done, 200);
  assert.equal(s.outcome, 'exit');
});

test('17 aiguillage : rebasculé trop tôt, la première cabine nous ramène', () => {
  const s = new Session(load('17-aiguillage.json'));
  const bot = new Bot(s);
  switchAt(bot, 80);
  const [a] = s.world.platforms;
  bot.walkTo(colCenter(5) - 2);
  bot.lever();
  stayOn(bot, a, () => false, 200);
  assert.equal(a.t, 0, 'revenue au départ');
  assert.equal(bot.p.ground, a, 'et nous avec');
});

// --- 18. Le refuge ------------------------------------------------------------------------

/** Au pied de la paroi, saut + dash vers le haut, s'agripper à la bande de pierre. */
function refugeToStone(bot) {
  bot.holdUntil(IN_RIGHT, () => bot.p.vx === 0 && bot.p.onGround && bot.cx > 15 * TILE, 400);
  bot.hold(IN_RIGHT | IN_JUMP, 14);
  bot.hold(IN_RIGHT | IN_DASH | IN_UP, 10);
  bot.holdUntil(IN_RIGHT | IN_GRAB, () => bot.p.climbing, 60);
}

test('18 refuge : sans dash, la glace du bas ne se grimpe pas', () => {
  const s = new Session(load('18-refuge.json'));
  const bot = new Bot(s);
  bot.holdUntil(IN_RIGHT, () => bot.p.vx === 0 && bot.p.onGround && bot.cx > 15 * TILE, 400);
  // Saut, puis sauts au mur sur la glace (l'échelle de sauts au mur) : on retombe.
  let climbed = false;
  bot.hold(IN_RIGHT | IN_JUMP, 16);
  for (let k = 0; k < 6; k++) {
    bot.step(IN_RIGHT | IN_GRAB);
    bot.hold(IN_LEFT | IN_JUMP, 3);
    for (let i = 0; i < 40 && !bot.p.onGround && bot.p.wallDir === 0; i++) {
      bot.step(IN_RIGHT | IN_JUMP | IN_GRAB);
      climbed ||= bot.p.climbing;
    }
  }
  assert.equal(climbed, false, 'jamais agrippé : la bande de pierre reste hors d’atteinte');
});

test('18 refuge : seul, plus de dash pour la glace du haut', () => {
  const s = new Session(load('18-refuge.json'));
  const bot = new Bot(s);
  refugeToStone(bot);
  assert.equal(bot.p.climbing, true, 'agrippé à la bande de pierre');
  assert.equal(bot.p.dashes, 0, 'le dash est dépensé');
  // Saut le long du mur, puis saut au mur sur la glace, à tous les instants.
  const file = '18-refuge.json';
  let best = Infinity;
  for (let t1 = 0; t1 < 18; t1 += 1) {
    for (const back of [0, 4, 8]) {
      const s2 = new Session(load(file));
      const b2 = new Bot(s2);
      refugeToStone(b2);
      b2.step(IN_GRAB);
      b2.step(IN_GRAB | IN_JUMP);
      b2.hold(IN_GRAB | IN_JUMP, t1);
      b2.step(IN_RIGHT);
      b2.hold(IN_LEFT | IN_JUMP, 2);
      b2.hold(IN_JUMP, back);
      for (let i = 0; i < 60 && !b2.p.onGround; i++) {
        b2.step(IN_RIGHT | IN_GRAB | IN_UP);
        if (b2.p.climbing) best = Math.min(best, b2.p.y);
      }
      assert.ok(!(b2.p.onGround && b2.feet <= rowTop(2)), 'jamais en haut');
    }
  }
  assert.ok(best >= rowTop(7) - 2 * SUB, `on ne se raccroche qu’à la bande de pierre (${best / SUB})`);
});

test('18 refuge : sur la tête d’un écho agrippé, endurance et dash rechargés', () => {
  const s = new Session(load('18-refuge.json'));
  const bot = new Bot(s);
  refugeToStone(bot);
  bot.untilAttemptEnds(IN_RIGHT | IN_GRAB);
  const echo = s.world.actors[0];
  refugeToStone(bot);
  assert.equal(bot.p.dashes, 0);
  // Saut le long du mur au-dessus de l'écho, lâcher, se poser sur sa tête.
  bot.step(IN_RIGHT | IN_GRAB);
  bot.step(IN_GRAB | IN_JUMP);
  bot.hold(IN_GRAB | IN_JUMP, 14);
  bot.holdUntil(0, () => bot.p.onGround, 40);
  assert.equal(bot.p.ground, echo, 'sur la tête de l’écho');
  assert.equal(echo.climbing, true, 'qui est toujours agrippé');
  bot.step(0);
  assert.equal(bot.p.stamina, 300);
  assert.equal(bot.p.dashes, 1);
  // Saut, dash vers le haut à travers la glace, se raccrocher, se hisser.
  bot.hold(IN_RIGHT | IN_JUMP, 14);
  bot.hold(IN_DASH | IN_UP, 10);
  bot.holdUntil(IN_RIGHT | IN_GRAB, () => bot.p.climbing, 40);
  assert.ok(bot.p.y < rowTop(3), 'agrippé au-dessus de la glace');
  bot.holdUntil(IN_RIGHT | IN_GRAB | IN_UP, () => bot.p.onGround, 80);
  assert.equal(bot.feet, rowTop(2), 'en haut de la paroi');
  bot.holdUntil(IN_RIGHT, () => bot.done, 300);
  assert.equal(s.outcome, 'exit');
});

// --- 19. Le poste d'aiguillage --------------------------------------------------------------

const POSTE = '19-poste.json';
const POSTE_T1 = 100; // l'aiguilleur ouvre le sas
const POSTE_T2 = 230; // il le referme : la trappe s'ouvre

/** L'aiguilleur : au levier j, il bascule à t1, puis à t2 (une tentative, deux gestes). */
function posteSwitchman(bot) {
  bot.walkTo(colCenter(9));
  bot.untilTick(POSTE_T1);
  bot.lever();
  bot.untilTick(POSTE_T2);
  bot.lever();
  bot.untilAttemptEnds();
}

/** Attendre l'ouverture du sas, entrer, se coller au mur du fond, sur la trappe. */
function posteIntoAirlock(bot) {
  const door1 = bot.w.doors.find((d) => d.id === '1');
  bot.walkTo(colCenter(8) + 2);
  bot.holdUntil(0, () => door1.open === 12, 300);
  bot.holdUntil(IN_LEFT, () => bot.p.onGround && bot.p.vx === 0 && bot.cx < 2 * TILE, 200);
}

/** Tomber par la trappe jusqu'au sol du couloir. */
function posteDrop(bot) {
  bot.holdUntil(0, () => bot.feet > rowTop(7) + 4 * SUB, 300);
  bot.holdUntil(0, () => bot.p.onGround || bot.p.dead, 60);
}

test('19 poste : seul, le sas ne s’ouvre que d’un côté à la fois', () => {
  const s = new Session(load(POSTE));
  const bot = new Bot(s);
  const [d1, d2] = ['1', '2'].map((id) => s.world.doors.find((d) => d.id === id));
  assert.equal(d1.open, 0);
  bot.walkTo(colCenter(9));
  bot.lever();
  bot.idle(14);
  assert.equal(d1.open, 12, 'porte du sas ouverte');
  assert.equal(d2.open, 0, 'trappe fermée');
  posteIntoAirlock(bot);
  bot.idle(120);
  assert.equal(bot.feet, rowTop(7), 'coincé dans le sas');
  // Les deux leviers basculés : le sas se referme, la trappe reste fermée.
  const s2 = new Session(load(POSTE));
  const b2 = new Bot(s2);
  b2.walkTo(colCenter(9));
  b2.lever();
  b2.walkTo(colCenter(24));
  b2.lever();
  b2.idle(14);
  assert.equal(s2.world.doors.find((d) => d.id === '1').open, 0, 'deux leviers : le xor se referme');
});

test('19 poste : sans bouchon, le faisceau du couloir nous attrape', () => {
  // Quel que soit l'instant où l'on se laisse tomber, et même en enchaînant les
  // dashs, on n'atteint ni la trappe de sortie ni la plaque vivant.
  const level = load(POSTE);
  const s0 = new Session(level);
  const b0 = new Bot(s0);
  posteSwitchman(b0);
  const history = s0.history.slice();
  let farthest = 0;
  for (let delay = 0; delay < 120; delay += 6) {
    for (const style of ['walk', 'dash']) {
      const s = new Session(level);
      s.history = history.slice();
      s.beginAttempt();
      const bot = new Bot(s);
      bot.walkTo(colCenter(8) + 2);
      bot.holdUntil(0, () => s.world.doors.find((d) => d.id === '1').open === 12, 300);
      bot.holdUntil(IN_LEFT, () => bot.cx < 4 * TILE, 200);
      bot.untilTick(POSTE_T2 + 12 + delay);
      bot.holdUntil(IN_LEFT, () => !bot.p.onGround, 60);
      if (style === 'walk') bot.holdUntil(IN_RIGHT, () => bot.p.dead || bot.done, 300);
      else { bot.holdUntil(0, () => bot.p.onGround || bot.p.dead, 60); bot.dashRun(1, () => bot.p.dead || bot.done, 300); }
      assert.equal(bot.p.dead, true, `chute à +${delay} (${style})`);
      farthest = Math.max(farthest, bot.cx);
    }
  }
  assert.ok(farthest < 11 * TILE - 24, `au plus loin : ${farthest} px`);
});

/** Le bouchon : tomber par la trappe et « Rejouer » en pleine chute. */
function posteBouchon(bot) {
  posteIntoAirlock(bot);
  bot.holdUntil(0, () => bot.feet > rowTop(8), 300);
  assert.equal(bot.p.dead, false);
  bot.s.replay();
}

/** Le gardien de la plaque : tomber, traverser le couloir sur la glace, s'arrêter sur la plaque. */
function postePlate(bot) {
  posteIntoAirlock(bot);
  posteDrop(bot);
  assert.equal(bot.p.dead, false, 'protégé par le bouchon');
  assert.equal(bot.settle(colCenter(18), 2), true, 'arrêté sur la plaque malgré la glace');
  assert.equal(bot.w.buttons[0].pressed, true);
  bot.untilAttemptEnds();
}

test('19 poste : trois échos (aiguilleur, bouchon, plaque), puis on sort', () => {
  const s = new Session(load(POSTE));
  const bot = new Bot(s);
  posteSwitchman(bot);
  posteBouchon(bot);
  postePlate(bot);
  assert.equal(s.history.length, 3);
  posteIntoAirlock(bot);
  posteDrop(bot);
  assert.equal(bot.p.dead, false);
  bot.walkTo(colCenter(11) + 8);
  bot.holdUntil(0, () => bot.done || bot.p.dead, 400);
  assert.equal(s.outcome, 'exit');
});

test('19 poste : sans gardien sur la plaque, la trappe de sortie reste fermée', () => {
  const s = new Session(load(POSTE));
  const bot = new Bot(s);
  posteSwitchman(bot);
  posteBouchon(bot);
  posteIntoAirlock(bot);
  posteDrop(bot);
  // Tenir la plaque soi-même, puis filer vers la trappe : elle se referme.
  bot.settle(colCenter(18), 2);
  bot.idle(15);
  assert.equal(s.world.doors.find((d) => d.id === '3').open, 12);
  bot.dashRun(-1, () => bot.cx < colCenter(12), 100);
  bot.idle(40);
  assert.equal(bot.feet, rowTop(11), 'toujours dans le couloir');
  assert.notEqual(s.outcome, 'exit');
});

test('19 poste : le piège, deux échos qui basculent s’annulent', () => {
  const s = new Session(load(POSTE));
  const bot = new Bot(s);
  posteSwitchman(bot);
  // Deuxième tentative : on bascule « pour être sûr » le levier k, au même moment.
  bot.walkTo(colCenter(24));
  bot.untilTick(POSTE_T1);
  bot.lever();
  bot.untilAttemptEnds();
  bot.idle(POSTE_T1 + 20 - s.world.tick);
  assert.equal(s.world.doors.find((d) => d.id === '1').open, 0, 'le sas reste fermé');
});

// --- 20. Le train de la vallée ------------------------------------------------------------------

const VALLEE = '20-train-vallee.json';
const VALLEE_EDGE = 4 * TILE; // bord du quai de départ
const VALLEE_T_A = 330; // le gardien monte sur le bouton de la cabine
const valleeSignals = (w) => [w.lasers[0], w.lasers[1]]; // colonnes 21 (levier baissé) et 23 (levier levé)

/** Écho-marche dans le gouffre (comme au niveau 16), puis « Rejouer » (pas de chrono). */
function valleeStep(bot) {
  runToRightEdge(bot, VALLEE_EDGE + 3);
  bot.hold(IN_RIGHT | IN_JUMP, 14);
  bot.hold(IN_RIGHT | IN_DASH, 10);
  bot.hold(IN_RIGHT, 8);
  assert.equal(bot.p.dead, false);
  bot.s.replay();
}

/** Franchir le gouffre par la tête de l'écho-marche (le plus ancien écho). */
function valleeCross(bot) {
  const step = bot.w.actors[0];
  bot.holdUntil(0, () => step.finished && step.onGround, 300);
  runToRightEdge(bot, VALLEE_EDGE);
  bot.hold(IN_RIGHT | IN_JUMP, 12);
  bot.hold(IN_RIGHT | IN_DASH, 10);
  steerTo(bot, (step.x + step.w) / SUB - 2);
  assert.equal(bot.p.ground, step, 'sur la tête de l’écho-marche');
  bot.hold(IN_RIGHT | IN_JUMP, 16);
  bot.hold(IN_RIGHT, 6);
  bot.hold(IN_RIGHT | IN_DASH, 10);
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround || bot.p.dead, 100);
  assert.equal(bot.p.dead, false);
  assert.equal(bot.feet, rowTop(9), 'sur le quai du milieu');
}

/** Le gardien : traverser, attendre à côté du bouton, y monter à VALLEE_T_A. */
function valleeHolder(bot) {
  valleeCross(bot);
  bot.settle(colCenter(17) - 4, 3);
  bot.untilTick(VALLEE_T_A);
  assert.equal(bot.settle(colCenter(15), 2), true, 'arrêté sur le bouton, sur la glace');
  bot.idle(300);
  bot.s.replay();
}

/**
 * L'aiguilleur : au levier, il regarde la cabine (vide pendant son
 * enregistrement) et bascule `delay` ticks après son arrivée au bout ; ou,
 * avec `early`, dès qu'elle démarre (trop tôt).
 */
function valleeSwitchman(bot, { delay = 30, early = false } = {}) {
  const cabin = bot.w.platforms[0];
  bot.walkTo(colCenter(3) - 2);
  if (early) bot.holdUntil(0, () => cabin.t > 0, 900);
  else { bot.holdUntil(0, () => cabin.t === cabin.len, 900); bot.idle(delay); }
  bot.lever();
  bot.idle(200);
  bot.s.replay();
}

/**
 * Le voyageur : traverser, attendre dans la cabine, la suivre jusqu'au bout,
 * s'avancer entre les deux signaux, attendre que le second s'éteigne, monter.
 */
function valleeRide(bot, maxWait = 300) {
  valleeCross(bot);
  const cabin = bot.w.platforms[0];
  const [, second] = valleeSignals(bot.w);
  bot.walkTo(colCenter(18) + 8);
  assert.equal(bot.p.ground, cabin, 'dans la cabine');
  stayOn(bot, cabin, () => cabin.t === cabin.len, 600);
  bot.walkTo(colCenter(22) + 6);
  bot.holdUntil(0, () => !second.on || bot.p.dead, maxWait);
  bot.holdUntil(IN_RIGHT, () => bot.done || bot.p.dead, 300);
}

test('20 vallée : pas de chrono, et le vide de la cabine est gardé', () => {
  const s = new Session(load(VALLEE));
  assert.equal(s.ticksLeft, null);
  assert.equal(s.level.exitStyle, 'train');
  assert.equal(s.level.chapterEnd, true);
  // Seul, depuis le quai du milieu (on y est posé d'office), le saut vers le
  // train traverse toujours un faisceau : levier levé ou baissé, cabine au
  // départ ou au bout.
  for (const lever of [false, true]) {
    for (const cabinAtEnd of [false, true]) {
      const s2 = new Session(load(VALLEE));
      const bot = new Bot(s2);
      s2.world.levers[0].pressed = lever;
      if (cabinAtEnd) {
        const c = s2.world.platforms[0];
        c.t = c.len; c.x = c.x1; c.prevX = c.x1;
      }
      s2.world.player.x = (16 * TILE) * SUB;
      s2.world.player.y = rowTop(9) - s2.world.player.h;
      bot.idle(5);
      bot.walkTo(colCenter(17));
      bot.hold(IN_RIGHT | IN_JUMP, 14);
      bot.hold(IN_RIGHT | IN_DASH, 10);
      bot.holdUntil(IN_RIGHT | IN_GRAB, () => bot.p.dead || bot.done, 200);
      assert.equal(bot.p.dead, true, `levier ${lever}, cabine au bout ${cabinAtEnd}`);
    }
  }
});

test('20 vallée : sans aiguilleur, le second signal barre la descente de la cabine', () => {
  const s = new Session(load(VALLEE));
  const bot = new Bot(s);
  valleeStep(bot);
  valleeHolder(bot);
  valleeRide(bot, 200);
  assert.notEqual(s.outcome, 'exit');
  assert.equal(bot.p.dead, true, 'on finit par passer sous le signal allumé');
});

test('20 vallée : sans gardien, la cabine revient dès qu’on lâche le bouton', () => {
  const s = new Session(load(VALLEE));
  const bot = new Bot(s);
  valleeStep(bot);
  valleeCross(bot);
  const cabin = s.world.platforms[0];
  bot.settle(colCenter(15), 2);
  bot.idle(60);
  assert.ok(cabin.t > 0, 'la cabine part');
  bot.walkTo(colCenter(17));
  bot.idle(120);
  assert.equal(cabin.t, 0, 'elle est revenue');
});

test('20 vallée : trois échos (marche, gardien, aiguilleur), puis le train', () => {
  const s = new Session(load(VALLEE));
  const bot = new Bot(s);
  valleeStep(bot);
  valleeHolder(bot);
  valleeSwitchman(bot);
  assert.equal(s.history.length, 3);
  valleeRide(bot);
  assert.equal(bot.p.dead, false);
  assert.equal(s.outcome, 'exit');
});

test('20 vallée : basculé trop tôt, le premier signal se rallume sur nous', () => {
  const s = new Session(load(VALLEE));
  const bot = new Bot(s);
  valleeStep(bot);
  valleeHolder(bot);
  valleeSwitchman(bot, { early: true });
  valleeRide(bot);
  assert.equal(bot.p.dead, true);
});
