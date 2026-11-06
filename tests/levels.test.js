// Chaque niveau est joué par un petit robot qui suit la solution prévue :
// on vérifie qu'elle marche, et qu'elle ne marche PAS sans les échos (ou sans
// la capacité du niveau). Les entrées du robot sont enregistrées et rejouées
// comme celles d'un joueur : c'est donc aussi un test grandeur nature des échos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseLevel } from '../src/sim/level.js';
import { Session } from '../src/sim/session.js';
import {
  IN_LEFT, IN_RIGHT, IN_JUMP, IN_UP, IN_DOWN, IN_DASH, IN_GRAB, SUB, TILE,
} from '../src/sim/constants.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (file) => parseLevel(JSON.parse(readFileSync(join(here, '../src/levels', file), 'utf8')));
const colCenter = (c) => c * TILE + TILE / 2;
const rowTop = (r) => r * TILE * SUB;

/** Robot : quelques gestes simples, tick par tick, sur une session. */
class Bot {
  constructor(session) {
    this.s = session;
  }
  get p() { return this.s.world.player; }
  /** Centre du joueur, en pixels. */
  get cx() { return (this.p.x + (this.p.w >> 1)) / SUB; }
  get feet() { return this.p.y + this.p.h; }
  step(bits) {
    if (this.s.state !== 'playing') return false;
    this.s.step(bits);
    return this.s.state === 'playing';
  }
  idle(n) { for (let i = 0; i < n; i++) if (!this.step(0)) return; }
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
  /** Tient une entrée jusqu'à ce que `pred()` soit vrai. */
  holdUntil(bits, pred, max = 900) {
    for (let i = 0; i < max && !pred(); i++) if (!this.step(bits)) return;
  }
}

test('niveau 3 : la porte AND exige deux échos', () => {
  const s = new Session(load('03-guichets.json'));
  const bot = new Bot(s);
  // Seul, même sur un bouton, la porte reste fermée.
  bot.walkTo(colCenter(14));
  assert.equal(s.world.doors[0].open, 0);
  s.restart();
  // Écho 1 : grimper sur la corniche (marche, puis rebord), tenir le bouton b.
  bot.walkTo(colCenter(6) - 2);
  bot.jump(-1);
  bot.jump(-1);
  bot.walkTo(colCenter(2));
  assert.equal(s.world.buttons.find((b) => b.id === 'b').pressed, true, 'b tenu');
  bot.untilAttemptEnds();
  // Écho 2 : tenir le bouton a.
  bot.walkTo(colCenter(14));
  bot.untilAttemptEnds();
  // Tentative 3 : passer.
  bot.holdUntil(IN_RIGHT, () => s.state !== 'playing');
  assert.equal(s.outcome, 'exit');
});

test('niveau 4 : la valise poussée sur le bouton tient la porte', () => {
  const s = new Session(load('04-attente.json'));
  const bot = new Bot(s);
  const valise = () => s.world.blocks[0];
  bot.walkTo(colCenter(4) - 4);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(10), 'sur le porte-bagages');
  // Pousser la valise jusqu'à ce qu'elle tombe, puis jusqu'au bouton.
  bot.holdUntil(IN_RIGHT, () => valise().y > rowTop(9) + 4 * SUB);
  bot.holdUntil(IN_RIGHT, () => s.world.buttons[0].pressed);
  bot.idle(20);
  assert.equal(s.world.doors[0].open > 0, true, 'la porte s’ouvre');
  // Sauter par-dessus la valise et sortir.
  bot.walkTo(valise().x / SUB - 12);
  bot.jump(1);
  bot.holdUntil(IN_RIGHT, () => s.state !== 'playing');
  assert.equal(s.outcome, 'exit');
});

test('niveau 5 : courte échelle sur un écho', () => {
  const s = new Session(load('05-souterrain.json'));
  const bot = new Bot(s);
  const atWall = () => bot.p.vx === 0 && bot.p.onGround && bot.cx > 19 * TILE;
  // Seul : le rebord est trop haut.
  bot.holdUntil(IN_RIGHT, atWall, 400);
  bot.jump(1);
  bot.jump(1);
  assert.equal(bot.feet, rowTop(12), 'toujours en bas');
  s.restart();
  // Écho : se coller au rebord et attendre.
  bot.holdUntil(IN_RIGHT, atWall, 400);
  bot.untilAttemptEnds();
  bot.walkTo(colCenter(17));
  bot.jump(1); // sur la tête de l'écho
  assert.equal(bot.p.ground?.kind, 'echo');
  bot.jump(1); // sur le rebord
  bot.holdUntil(IN_RIGHT, () => s.state !== 'playing', 300);
  assert.equal(s.outcome, 'exit');
});

test('niveau 6 : un écho arrête le faisceau pendant que l’on passe', () => {
  const s = new Session(load('06-voie.json'));
  const bot = new Bot(s);
  // Seul : marcher sur les plaques ouvre la barrière et le faisceau tue.
  bot.holdUntil(IN_RIGHT, () => s.world.player.dead || s.state !== 'playing', 400);
  assert.equal(s.world.player.dead, true, 'le faisceau atteint le joueur');
  const attempts = s.attemptCount;
  bot.idle(60);
  assert.equal(s.attemptCount, attempts + 1, 'reprise automatique');
  assert.equal(s.world.actors.length, 1, 'une chute ne crée pas d’écho');
  // Écho : aller se placer entre la barrière et le départ.
  bot.walkTo(colCenter(7));
  bot.untilAttemptEnds();
  // Passer pendant que l'écho arrête le faisceau.
  let blockedByEcho = false;
  bot.holdUntil(IN_RIGHT, () => {
    if (s.world.lasers[0].hit?.kind === 'echo') blockedByEcho = true;
    return s.state !== 'playing' || s.world.player.dead;
  }, 500);
  assert.equal(s.world.player.dead, false);
  assert.equal(s.outcome, 'exit');
  assert.equal(blockedByEcho, true, 'le faisceau s’est arrêté sur l’écho');
});

// --- Capacités ------------------------------------------------------------------

/** Remonte une cheminée étroite en sautant d'un mur à l'autre. */
function wallClimb(bot, done, max = 600) {
  const s = bot.s;
  let toward = IN_RIGHT;
  for (let i = 0; i < max && s.state === 'playing'; i++) {
    const p = bot.p;
    if (done()) return true;
    if (p.onGround) {
      // Au sol (contre un mur) : on repart en sautant vers lui.
      bot.step(toward);
      bot.step(toward | IN_JUMP);
      continue;
    }
    if (p.wallDir !== 0 && p.vy > -30) {
      // Contre un mur : on relâche, puis saut vers l'autre.
      bot.step(p.wallDir > 0 ? IN_RIGHT : IN_LEFT);
      toward = p.wallDir > 0 ? IN_LEFT : IN_RIGHT;
      for (let k = 0; k < 7; k++) bot.step(toward | IN_JUMP);
    } else {
      bot.step(toward | (p.vy < 0 ? IN_JUMP : 0));
    }
  }
  return done();
}

test('niveau 7 : sans saut au mur, la cheminée est infranchissable ; avec, on monte', () => {
  const level = load('07-escalier.json');
  assert.deepEqual([...level.abilities], ['walljump']);
  const s = new Session(level);
  const bot = new Bot(s);
  const landed = () => bot.p.onGround && bot.feet === rowTop(5);
  // Écho : tenir le bouton.
  bot.walkTo(colCenter(4));
  bot.untilAttemptEnds();
  // Monter par sauts au mur, puis sortir.
  bot.walkTo(colCenter(10) + 2);
  assert.equal(wallClimb(bot, landed), true, 'sur le palier du haut');
  bot.holdUntil(IN_RIGHT, () => s.state !== 'playing', 400);
  assert.equal(s.outcome, 'exit');

  // Même niveau sans la capacité : on reste en bas.
  const s2 = new Session({ ...level, abilities: [] });
  const b2 = new Bot(s2);
  b2.walkTo(colCenter(10) + 2);
  assert.equal(wallClimb(b2, () => b2.p.y < rowTop(8), 400), false);
});

/** Gestes d'escalade (mur à droite). */
const climber = (bot) => ({
  toWall() { bot.holdUntil(IN_RIGHT, () => bot.p.vx === 0 && bot.p.onGround, 400); },
  regrab() { bot.holdUntil(IN_RIGHT | IN_GRAB, () => bot.p.climbing, 40); },
  jumpGrab() {
    bot.step(IN_RIGHT | IN_JUMP);
    bot.holdUntil(IN_RIGHT | IN_JUMP, () => bot.p.vy >= 0, 20);
    this.regrab();
  },
  climbJump() {
    bot.step(IN_GRAB);
    bot.step(IN_GRAB | IN_JUMP);
    bot.holdUntil(IN_GRAB | IN_JUMP, () => bot.p.vy >= 0, 20);
    this.regrab();
  },
});

test('niveau 8 : seul, l’endurance ne suffit pas ; en se reposant sur un écho, oui', () => {
  const s = new Session(load('08-chateau.json'));
  const bot = new Bot(s);
  const c = climber(bot);
  const top = rowTop(2);
  // Seul : sauts verticaux puis escalade, jusqu'à épuisement.
  c.toWall(); c.jumpGrab(); c.climbJump(); c.climbJump(); c.climbJump();
  bot.holdUntil(IN_GRAB | IN_UP | IN_RIGHT, () => bot.p.onGround, 500);
  assert.equal(bot.feet > top, true, 'pas en haut');
  s.restart();
  // Écho : grimper un peu et rester agrippé.
  c.toWall(); c.jumpGrab(); c.climbJump();
  bot.untilAttemptEnds(IN_RIGHT | IN_GRAB);
  // Joueur : grimper au-dessus de l'écho, lâcher sur sa tête, repartir.
  c.toWall(); c.jumpGrab(); c.climbJump(); c.climbJump();
  bot.holdUntil(0, () => bot.p.onGround, 120);
  assert.equal(bot.p.ground?.kind, 'echo', 'posé sur la tête de l’écho agrippé');
  bot.step(0);
  assert.equal(bot.p.stamina, 300, 'endurance rechargée');
  c.jumpGrab(); c.climbJump(); c.climbJump();
  bot.holdUntil(IN_RIGHT | IN_GRAB | IN_UP, () => bot.feet <= top && bot.p.onGround, 300);
  bot.holdUntil(IN_RIGHT, () => s.state !== 'playing', 300);
  assert.equal(s.outcome, 'exit');
});

test('niveau 9 : le fossé ne se franchit qu’avec un dash', () => {
  const level = load('09-depot.json');
  const cross = (abilities) => {
    const s = new Session({ ...level, abilities });
    const bot = new Bot(s);
    bot.walkTo(colCenter(4));
    bot.untilAttemptEnds(); // écho sur le bouton
    bot.walkTo(12 * TILE + 4);
    bot.holdUntil(IN_RIGHT, () => bot.cx >= 13 * TILE - 2, 60);
    for (let k = 0; k < 13; k++) bot.step(IN_RIGHT | IN_JUMP);
    bot.step(IN_RIGHT | IN_DASH);
    bot.holdUntil(IN_RIGHT, () => s.state !== 'playing' || s.world.player.dead, 400);
    return s;
  };
  const withDash = cross(['walljump', 'grab', 'dash']);
  assert.equal(withDash.world.player.dead, false);
  assert.equal(withDash.outcome, 'exit');
  const noDash = cross(['walljump', 'grab']);
  assert.equal(noDash.world.player.dead, true, 'sans dash, on tombe dans le faisceau');
});

test('les échos rejouent aussi dash, saut au mur et escalade', () => {
  const s = new Session(load('09-depot.json'));
  const bot = new Bot(s);
  const trace = [];
  const bits = [IN_RIGHT, IN_RIGHT, IN_RIGHT | IN_JUMP, IN_RIGHT | IN_JUMP, IN_DASH | IN_UP, 0, IN_GRAB, IN_LEFT | IN_DASH];
  for (let i = 0; i < 120; i++) { bot.step(bits[i % bits.length]); trace.push([bot.p.x, bot.p.y]); }
  s.replay();
  const echo = s.world.actors[0];
  const replay = [];
  for (let i = 0; i < 120; i++) { bot.step(0); replay.push([echo.x, echo.y]); }
  assert.deepEqual(replay, trace);
});

// --- Le dernier train ------------------------------------------------------------

/** Deux premières tentatives : valise + bouton b, puis bouton a. */
function prepareTrain(s, bot) {
  const valise = () => s.world.blocks[0];
  const landed = () => valise().onGround && valise().y > rowTop(10);
  // Écho 1 : pousser la valise du haut de la passerelle, revenir sur b.
  bot.holdUntil(IN_RIGHT, () => valise().y > rowTop(5) + 4 * SUB);
  bot.walkTo(colCenter(2));
  bot.idle(10);
  s.replay();
  // Écho 2 : attendre la chute de la valise, descendre, tenir a.
  bot.holdUntil(0, landed);
  bot.walkTo(colCenter(14));
  assert.equal(s.world.player.dead, false);
  bot.idle(10);
  s.replay();
  bot.holdUntil(0, landed);
}

test('niveau 10 : sans valise, le faisceau garde le quai', () => {
  const s = new Session(load('10-train.json'));
  const bot = new Bot(s);
  assert.equal(s.ticksLeft, null, 'pas de chrono');
  bot.walkTo(colCenter(2));
  bot.idle(5);
  bot.jump(1); // par-dessus la valise
  bot.holdUntil(IN_RIGHT, () => s.world.player.dead, 300);
  assert.equal(s.world.player.dead, true);
});

test('niveau 10 : monter dans le train', () => {
  const s = new Session(load('10-train.json'));
  const bot = new Bot(s);
  prepareTrain(s, bot);
  const lift = () => s.world.platforms[0];
  bot.walkTo(colCenter(15) - 2);
  assert.equal(s.world.doors[0].open > 0, true, 'la barrière est ouverte');
  // Attendre le monte-charge en bas, monter dessus, attendre le haut.
  bot.holdUntil(0, () => lift().t === 0 && !lift().moving, 900);
  bot.walkTo(colCenter(16));
  assert.equal(bot.p.ground, lift());
  bot.holdUntil(0, () => lift().t === lift().len, 900);
  bot.holdUntil(IN_RIGHT, () => s.state !== 'playing', 300);
  assert.equal(s.world.player.dead, false);
  assert.equal(s.outcome, 'exit');
});

test('niveau 10 : impossible de sauter de la passerelle par-dessus la barrière', () => {
  const s = new Session(load('10-train.json'));
  const bot = new Bot(s);
  bot.holdUntil(IN_RIGHT, () => s.world.blocks[0].y > rowTop(5) + 4 * SUB);
  bot.walkTo(7 * TILE - 6);
  bot.jump(1);
  const onCap = bot.p.onGround && bot.feet === rowTop(5) && bot.cx > 15 * TILE;
  assert.equal(onCap, false);
});
