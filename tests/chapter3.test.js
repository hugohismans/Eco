// Chapitre 3 — la ville (niveaux 21 à 30).
//
// Chaque niveau est joué par un petit robot qui suit la solution prévue, à
// travers la vraie Session (tentatives, « Rejouer », échos). On vérifie aussi
// que l'idée du niveau est nécessaire : seul, sans l'écho, ou par le raccourci
// le plus tentant (dash, saut au mur, escalade, ressort), on échoue.

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
const readDef = (file) => JSON.parse(readFileSync(join(here, '../src/levels', file), 'utf8'));
const load = (file) => parseLevel(readDef(file));
/** Variante d'un niveau : cases remplacées [[rangée, colonne, caractère], …]. */
function variant(file, repl = [], patch = {}) {
  const def = readDef(file);
  const grid = def.grid.map((r) => r.split(''));
  for (const [r, c, ch] of repl) grid[r][c] = ch;
  return parseLevel({ ...def, ...patch, grid: grid.map((r) => r.join('')) });
}
const colCenter = (c) => c * TILE + TILE / 2;
const rowTop = (r) => r * TILE * SUB;
const L = IN_LEFT, R = IN_RIGHT, J = IN_JUMP, U = IN_UP, D = IN_DOWN, X = IN_DASH, G = IN_GRAB;

/** Robot : quelques gestes simples, tick par tick, sur une session. */
class Bot {
  constructor(session) {
    this.s = session;
  }
  get p() { return this.s.world.player; }
  get w() { return this.s.world; }
  /** Centre du joueur, en pixels. */
  get cx() { return (this.p.x + (this.p.w >> 1)) / SUB; }
  get feet() { return this.p.y + this.p.h; }
  step(bits) {
    if (this.s.state !== 'playing') return false;
    this.s.step(bits);
    if (this.s.world.player.dead) this.died = true;
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
  /**
   * Bond : tient `dir`, saute de jt à jt+hold, dash `dd` au tick `da`, puis
   * tient `after` à partir de `afterAt` ; jusqu'à `until()` (par défaut : posé).
   */
  leap({ dir = R, jt = 0, hold = 18, dd = 0, da = -1, after = null, afterAt = 1e9, until = null, max = 200 }) {
    for (let k = 0; k < max; k++) {
      let bits = k >= afterAt && after !== null ? after : dir;
      if (k >= jt && k < jt + hold) bits |= J;
      if (k === da) bits |= X | dd;
      if (!this.step(bits)) return;
      if (this.p.dead) return;
      if (until ? until() : this.p.onGround && k > jt + 2) return;
    }
  }
  /** Lâche tout pendant un tick, puis une entrée (pour un appui franc). */
  tap(bits) { this.step(0); this.step(bits); }
}

/** Gestes d'escalade (mur du côté `side`). */
const climber = (bot, side = R) => ({
  toWall() { bot.holdUntil(side, () => bot.p.vx === 0 && bot.p.onGround, 400); },
  regrab() { bot.holdUntil(side | G, () => bot.p.climbing, 40); },
  jumpGrab() {
    bot.step(side | J);
    bot.holdUntil(side | J, () => bot.p.vy >= 0, 20);
    this.regrab();
  },
  climbJump() {
    bot.step(G);
    bot.step(G | J);
    bot.holdUntil(G | J, () => bot.p.vy >= 0, 20);
    this.regrab();
  },
});

// --- Petits outils pour chercher des raccourcis ---------------------------------

/** Copie complète d'un monde (pour essayer plusieurs gestes depuis un même état). */
function cloneWorld(w) {
  const lv = w.level;
  w.level = null;
  const c = structuredClone(w);
  w.level = lv;
  c.level = lv;
  Object.setPrototypeOf(c, World.prototype);
  return c;
}

/**
 * Essaie, depuis le monde `w0`, une large famille de bonds : direction tenue,
 * saut (moment, durée), dash (direction, moment), changement de direction.
 * Renvoie le nombre de bonds qui atteignent `goal(world)`.
 */
function countLeaps(w0, goal, { dirs = [R, L, 0], maxK = 160, stopOnLand = true } = {}) {
  let n = 0;
  for (const dir of dirs) {
    for (const after of [dir, R, L, 0]) {
      for (const afterAt of [0, 8, 16]) {
        for (const jt of [0, 4]) {
          for (const dd of [R, L, U, U | R, U | L, 0]) {
            for (let da = 2; da < 40; da += 3) {
              const w = cloneWorld(w0);
              for (let k = 0; k < maxK; k++) {
                let bits = k >= afterAt ? after : dir;
                if (k >= jt && k < jt + 18) bits |= J;
                if (k === da && dd !== 0) bits |= X | dd;
                w.step(bits);
                if (w.player.dead) break;
                if (goal(w)) { n++; break; }
                if (stopOnLand && w.player.onGround && k > jt + 3) break;
              }
            }
          }
        }
      }
    }
  }
  return n;
}

// --- 21. Le parvis -----------------------------------------------------------------

test('21 parvis : le ressort mène au balcon, l’écho y tient le bouton', () => {
  const s = new Session(load('21-parvis.json'));
  const bot = new Bot(s);
  // Écho : sauter sur l'auvent, rebondir jusqu'au balcon, tenir le bouton.
  bot.walkTo(colCenter(9));
  bot.jump(1);
  bot.holdUntil(0, () => bot.p.onGround, 200);
  assert.equal(bot.feet, rowTop(5), 'sur le balcon');
  bot.walkTo(colCenter(11));
  assert.equal(s.world.buttons[0].pressed, true);
  bot.untilAttemptEnds();
  // Tentative 2 : la porte du bas est ouverte.
  bot.holdUntil(R, () => s.state !== 'playing' || bot.cx > colCenter(9), 300);
  bot.jump(1); // par-dessus le pilier
  bot.holdUntil(R, () => s.state !== 'playing', 600);
  assert.equal(s.outcome, 'exit');
});

test('21 parvis : seul, on ne tient pas le bouton en passant la porte', () => {
  const s = new Session(load('21-parvis.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(9));
  bot.jump(1);
  bot.holdUntil(0, () => bot.p.onGround, 200);
  bot.walkTo(colCenter(11));
  assert.equal(s.world.doors[0].target, true, 'la porte s’ouvre…');
  // Course (au dash) vers la porte : elle se referme bien avant.
  for (let i = 0; i < 200 && s.attempt === 1; i++) bot.step(i % 11 === 0 ? R | X : R);
  assert.equal(s.world.doors[0].open, 0, '…et se referme');
  assert.equal(s.outcome, null);
});

test('21 parvis : sans le ressort, le balcon est hors d’atteinte (escalade, saut au mur, dash)', () => {
  // Le ressort retiré, on essaie : sauter + dash d'en bas, et grimper la porte
  // puis sauter du mur de glace + dash vers le balcon.
  const lv = variant('21-parvis.json', [[9, 11, '.']]);
  const onBalcony = (w) => w.player.onGround && w.player.y + w.player.h <= rowTop(5) && w.player.x < 20 * TILE * SUB;
  for (const x of [colCenter(8), colCenter(11), colCenter(14), colCenter(18)]) {
    const w = new World(lv, [], 1);
    w.player.x = (x - 5) * SUB;
    w.step(0);
    assert.equal(countLeaps(w, onBalcony), 0, `depuis x=${x}`);
  }
  // Agrippé à la porte (sous la façade de glace), à plusieurs hauteurs.
  const s = new Session(lv);
  const bot = new Bot(s);
  s.world.player.x = 18 * TILE * SUB;
  const c = climber(bot);
  c.toWall();
  c.jumpGrab();
  assert.equal(bot.p.climbing, true, 'agrippé à la porte');
  for (let h = 0; h < 6; h++) {
    const w = cloneWorld(s.world);
    let n = 0;
    for (let da = 0; da < 40; da += 2) {
      for (const dd of [L, L | U, U]) {
        const ww = cloneWorld(w);
        ww.step(R | G);
        ww.step(L | J);
        for (let k = 0; k < 150; k++) {
          ww.step(L | (k < 17 ? J : 0) | (k === da ? X | dd : 0));
          if (onBalcony(ww)) { n++; break; }
          if (ww.player.onGround) break;
        }
      }
    }
    assert.equal(n, 0, `depuis la porte, hauteur ${h}`);
    for (let i = 0; i < 6; i++) s.step(R | G | U);
  }
});

// --- 22. Les échafaudages ------------------------------------------------------------

/** Écho de 22 : sauter sur la passerelle, avancer au-dessus du bouton, tomber dessus. */
function echoFallsOnButton(s, bot) {
  bot.walkTo(colCenter(4));
  bot.holdUntil(R, () => bot.cx > colCenter(4) + 4);
  bot.jump(1);
  bot.walkTo(colCenter(9));
  bot.holdUntil(0, () => bot.p.onGround && bot.feet === rowTop(11), 120);
}

test('22 échafaudages : l’écho casse la passerelle, tombe sur le bouton ; sa tête sert de marche', () => {
  const s = new Session(load('22-echafaudages.json'));
  const bot = new Bot(s);
  echoFallsOnButton(s, bot);
  assert.equal(s.world.crumbles[0].state, 'gone', 'la passerelle a cédé');
  assert.equal(s.world.buttons[0].pressed, true, 'tombé sur le bouton');
  assert.equal(bot.p.dead, false, 'le faisceau s’arrête sur le pilier');
  bot.untilAttemptEnds();
  // Tentative 2 : attendre que l'écho casse la passerelle, sauter sur sa tête…
  bot.holdUntil(0, () => s.world.crumbles[0].state === 'gone');
  bot.walkTo(colCenter(4));
  bot.leap({ dir: R, dd: R, da: 8, until: () => bot.p.onGround });
  assert.equal(bot.p.ground?.kind, 'echo', 'sur la tête de l’écho');
  bot.idle(3);
  // … puis bond + dash vers le haut jusqu'à la corniche.
  bot.leap({ dir: R, dd: U, da: 12 });
  assert.equal(bot.feet, rowTop(6), 'sur la corniche');
  bot.holdUntil(R, () => s.state !== 'playing', 400);
  assert.equal(s.outcome, 'exit');
});

test('22 échafaudages : sans l’écho, le fossé et la corniche sont hors d’atteinte', () => {
  const lv = load('22-echafaudages.json');
  const onLedge = (w) => w.player.onGround && w.player.x + w.player.w > 12 * TILE * SUB && w.player.y + w.player.h <= rowTop(6);
  // Passerelle effondrée : ni depuis le bord, ni depuis le pilier nu.
  for (const x of [colCenter(2), colCenter(4) + 3, colCenter(8), colCenter(9)]) {
    const w = new World(lv, [], 1);
    w.crumbles[0].state = 'gone';
    w.player.x = (x - 5) * SUB;
    if (x > colCenter(5)) w.player.y = rowTop(11) - w.player.h;
    w.step(0);
    w.step(0);
    assert.equal(countLeaps(w, onLedge), 0, `depuis x=${x}`);
  }
  // Seul, tomber sur le bouton ouvre la porte, mais elle se referme dès qu'on le quitte.
  const s = new Session(lv);
  const bot = new Bot(s);
  echoFallsOnButton(s, bot);
  assert.equal(s.world.doors[0].target, true);
  bot.idle(2);
  bot.leap({ dir: R, dd: U, da: 12 });
  bot.idle(30);
  assert.equal(s.world.doors[0].open, 0, 'porte refermée');
});

test('22 échafaudages : le fond du fossé est gardé par les faisceaux', () => {
  const s = new Session(load('22-echafaudages.json'));
  const bot = new Bot(s);
  // Passerelle cassée sous ses pieds, on se laisse glisser contre le bord : on tombe dans le faisceau.
  bot.walkTo(colCenter(5) + 2);
  bot.holdUntil(0, () => s.world.crumbles[0].state === 'gone', 120);
  bot.holdUntil(L, () => bot.p.dead || bot.p.onGround, 120);
  bot.holdUntil(0, () => bot.p.dead, 60);
  assert.equal(bot.p.dead, true);
});

// --- 23. Le passage couvert ------------------------------------------------------------

test('23 passage : l’écho retient la valise dans la niche, contre le tapis', () => {
  const s = new Session(load('23-passage.json'));
  const bot = new Bot(s);
  // Écho : pousser la valise dans la niche et ne plus lâcher.
  bot.holdUntil(L, () => s.world.buttons[0].pressed, 300);
  assert.equal(s.world.buttons[0].pressed, true, 'la valise est sur le bouton');
  bot.untilAttemptEnds(L);
  assert.equal(s.attempt, 2);
  // Tentative 2 : filer vers la porte (le tapis à contresens ralentit).
  bot.holdUntil(R, () => s.state !== 'playing', 900);
  assert.equal(s.outcome, 'exit');
});

test('23 passage : lâchée, la valise ressort de la niche et la porte se referme', () => {
  const s = new Session(load('23-passage.json'));
  const bot = new Bot(s);
  bot.holdUntil(L, () => s.world.blocks[0].x <= 17 * SUB, 400);
  assert.equal(s.world.buttons[0].pressed, true, 'enfoncée jusqu’au fond');
  bot.idle(30);
  assert.equal(s.world.buttons[0].pressed, false, 'le tapis l’a fait ressortir');
  // Même en enchaînant les dashes vers la porte, elle est refermée avant qu'on y soit.
  const s2 = new Session(load('23-passage.json'));
  const b2 = new Bot(s2);
  b2.holdUntil(L, () => s2.world.blocks[0].x <= 17 * SUB, 400);
  for (let i = 0; i < 300 && s2.state === 'playing' && s2.attempt === 1; i++) b2.step(i % 11 === 0 ? R | X : R);
  assert.equal(s2.outcome, null);
  assert.equal(s2.world.doors[0].open, 0);
});

test('23 passage : on ne tient pas dans la niche (seule la valise y entre)', () => {
  const s = new Session(load('23-passage.json'));
  const bot = new Bot(s);
  // Sauter par-dessus la valise et foncer dans la niche : on bute contre le mur.
  bot.walkTo(colCenter(6) + 4);
  bot.jump(-1);
  bot.holdUntil(L, () => bot.p.vx === 0 && bot.p.onGround, 200);
  assert.equal(s.world.buttons[0].pressed, false);
  assert.ok(bot.p.x >= 2 * TILE * SUB, 'arrêté devant la niche');
});

// --- 24. Le parking ---------------------------------------------------------------------

const shutterClosed = (s) => {
  const d = s.world.doors.find((door) => door.id === '3');
  return s.world.tick > 12 && !d.target && d.open === 0;
};
const alarm = (s) => s.world.lasers.find((l) => l.sensor === 'x');

/** Écho « volet » : grimper sur la mezzanine et tenir le bouton b. */
function holdShutter(bot) {
  const c = climber(bot, L);
  c.toWall();
  c.jumpGrab();
  c.climbJump();
  bot.holdUntil(L | G | U, () => bot.p.onGround && bot.feet === rowTop(6), 200);
  bot.walkTo(colCenter(1));
}

test('24 parking : un écho ferme le volet de la caméra, un autre coupe la barrière', () => {
  const s = new Session(load('24-parking.json'));
  const bot = new Bot(s);
  // Écho 1 : le volet.
  holdShutter(bot);
  assert.equal(s.world.buttons.find((b) => b.id === 'b').pressed, true);
  bot.idle(15);
  assert.equal(shutterClosed(s), true, 'le volet couvre la caméra');
  bot.untilAttemptEnds();
  // Écho 2 : attendre le volet, passer sous la caméra, se tenir dans la barrière.
  bot.holdUntil(0, () => shutterClosed(s), 300);
  bot.walkTo(colCenter(15));
  assert.equal(s.world.lasers.find((l) => l.sensor === 's').pressed, true, 'barrière coupée');
  assert.equal(alarm(s).latched, false, 'pas d’alarme');
  bot.untilAttemptEnds();
  // Tentative 3 : attendre le volet, filer.
  bot.holdUntil(0, () => shutterClosed(s), 300);
  bot.holdUntil(R, () => s.state !== 'playing', 600);
  assert.equal(alarm(s).latched, false);
  assert.equal(s.outcome, 'exit');
});

test('24 parking : passer sous la caméra déclenche l’alarme, la sortie reste fermée', () => {
  const s = new Session(load('24-parking.json'));
  const bot = new Bot(s);
  bot.holdUntil(R, () => alarm(s).latched, 300);
  assert.equal(alarm(s).latched, true);
  bot.holdUntil(R, () => s.attempt > 1, 900);
  assert.equal(s.outcome, null);
});

test('24 parking : un vieil écho qui a déclenché l’alarme la redéclenche ; il faut l’effacer', () => {
  const s = new Session(load('24-parking.json'));
  const bot = new Bot(s);
  // Tentative ratée : on file tout de suite dans la barrière (alarme !).
  bot.walkTo(colCenter(15));
  assert.equal(alarm(s).latched, true);
  bot.untilAttemptEnds();
  // On ajoute le volet : trop tard, l'écho maladroit est déjà passé.
  holdShutter(bot);
  assert.equal(alarm(s).latched, true, 'l’écho a recoupé la caméra avant le volet');
  bot.untilAttemptEnds();
  bot.holdUntil(0, () => shutterClosed(s), 300);
  bot.holdUntil(R, () => s.attempt > 3 || s.state !== 'playing', 900);
  assert.equal(s.outcome, null, 'la sortie est verrouillée');
  // « Recommencer » efface les échos ; dans le bon ordre, ça passe.
  s.restart();
  assert.equal(s.world.actors.length, 1);
  holdShutter(bot);
  bot.untilAttemptEnds();
  bot.holdUntil(0, () => shutterClosed(s), 300);
  bot.walkTo(colCenter(15));
  bot.untilAttemptEnds();
  bot.holdUntil(0, () => shutterClosed(s), 300);
  bot.holdUntil(R, () => s.state !== 'playing', 600);
  assert.equal(s.outcome, 'exit');
});

test('24 parking : un seul écho ne suffit pas', () => {
  // Écho dans la barrière (après le volet ? il n'y en a pas) : on déclenche l'alarme en passant.
  const s = new Session(load('24-parking.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(15));
  bot.untilAttemptEnds();
  bot.holdUntil(R, () => s.attempt > 2 || s.state !== 'playing', 900);
  assert.equal(s.outcome, null);
  // Écho sur le volet : seul dans la barrière, la porte se referme avant qu'on l'atteigne.
  const s2 = new Session(load('24-parking.json'));
  const b2 = new Bot(s2);
  holdShutter(b2);
  b2.untilAttemptEnds();
  b2.holdUntil(0, () => shutterClosed(s2), 300);
  b2.walkTo(colCenter(15));
  b2.idle(20);
  for (let i = 0; i < 200 && s2.attempt === 2; i++) b2.step(i % 11 === 0 ? R | X : R);
  assert.equal(s2.outcome, null);
  assert.equal(alarm(s2).latched, false);
});

// --- 25. Les toits ----------------------------------------------------------------------

/** Saute de cheminée en cheminée (une case chacune), vers la droite. */
function hops(bot, cols) {
  for (const c of cols) {
    bot.holdUntil(R, () => bot.cx >= c * TILE + 13 || !bot.p.onGround, 40);
    bot.leap({ dir: R, until: () => (bot.p.onGround && bot.cx > c * TILE + 18) || bot.p.dead });
  }
}
/** Rangée basse jusqu'au toit de droite, puis escalade de la tour du bouton. */
function lowRouteToButton(bot) {
  bot.walkTo(colCenter(4));
  bot.holdUntil(R, () => bot.cx > 4 * TILE + 12);
  bot.leap({ dir: R, until: () => bot.p.onGround || bot.p.dead });
  hops(bot, [7, 10, 13, 16]);
  const c = climber(bot);
  c.toWall();
  c.jumpGrab();
  c.climbJump();
  bot.holdUntil(R | G | U, () => bot.p.onGround, 200);
  bot.walkTo(colCenter(20));
}
/** Ressort, dash vers le haut, puis la rangée haute. */
function highRoute(bot) {
  bot.holdUntil(L, () => bot.w.events.some((e) => e.type === 'spring'), 100);
  bot.leap({ dir: R, hold: 0, dd: U, da: 18, until: () => bot.p.onGround });
  assert.equal(bot.p.ground?.kind, 'crumble', 'sur la première cheminée haute');
  hops(bot, [5, 7, 9, 11, 13, 15, 17]);
}

test('25 toits : l’écho prend les cheminées basses, nous les hautes', () => {
  const s = new Session(load('25-toits.json'));
  const bot = new Bot(s);
  lowRouteToButton(bot);
  assert.equal(s.world.buttons[0].pressed, true, 'l’écho tient le bouton');
  bot.untilAttemptEnds();
  highRoute(bot);
  assert.ok(bot.feet <= rowTop(4), 'en haut, près de la tour');
  bot.holdUntil(R, () => s.state !== 'playing' || bot.p.dead, 400);
  assert.equal(s.outcome, 'exit');
});

test('25 toits : suivre l’écho sur ses cheminées, c’est trouver le vide', () => {
  const s = new Session(load('25-toits.json'));
  const bot = new Bot(s);
  lowRouteToButton(bot);
  bot.untilAttemptEnds();
  // Tentative 2 : la même rangée, une seconde derrière lui.
  bot.idle(60);
  bot.walkTo(colCenter(4));
  bot.holdUntil(R, () => bot.cx > 4 * TILE + 12);
  bot.leap({ dir: R, until: () => bot.p.onGround || bot.p.dead });
  bot.holdUntil(0, () => bot.p.dead, 100);
  assert.equal(bot.p.dead, true, 'les cheminées de l’écho sont tombées');
});

test('25 toits : passer devant l’écho fait tomber ses cheminées… et l’écho', () => {
  const s = new Session(load('25-toits.json'));
  const bot = new Bot(s);
  bot.idle(40); // l'écho part un peu en retard
  lowRouteToButton(bot);
  assert.equal(s.world.buttons[0].pressed, true);
  bot.untilAttemptEnds();
  // Nous partons tout de suite par la même rangée, puis filons à la porte.
  bot.walkTo(colCenter(4));
  bot.holdUntil(R, () => bot.cx > 4 * TILE + 12);
  bot.leap({ dir: R, until: () => bot.p.onGround || bot.p.dead });
  hops(bot, [7, 10, 13, 16]);
  assert.equal(bot.feet, rowTop(9), 'nous sommes passés, nous');
  let opened = false;
  bot.holdUntil(R, () => {
    if (s.world.doors[0].open > 0) opened = true;
    return s.attempt !== 2 || s.state !== 'playing';
  }, 900);
  assert.ok(!bot.died);
  assert.equal(opened, false, 'privé de ses cheminées, l’écho n’atteint jamais le bouton');
  assert.equal(s.outcome, null);
});

test('25 toits : seul, la porte se referme bien avant qu’on y arrive', () => {
  const s = new Session(load('25-toits.json'));
  const bot = new Bot(s);
  lowRouteToButton(bot);
  assert.equal(s.world.buttons[0].pressed, true);
  for (let i = 0; i < 150 && s.attempt === 1; i++) bot.step(i % 11 === 0 ? R | X : R);
  assert.equal(s.outcome, null);
  assert.equal(s.world.doors[0].open, 0);
});

// --- 26. Le marché couvert --------------------------------------------------------------

const button = (s, id) => s.world.buttons.find((b) => b.id === id);

/** Monter sur la marche, puis sauter sur l'étal fragile. */
function jumpOnStall(bot) {
  bot.walkTo(colCenter(5));
  bot.jump(1);
  bot.walkTo(colCenter(7));
  bot.jump(1);
}

/** Grimper sur le tapis du haut (marche de gauche, puis le bord du tapis). */
function climbToBelt(bot) {
  const c = climber(bot, L);
  c.toWall();
  c.jumpGrab();
  bot.holdUntil(L | G | U, () => bot.p.onGround, 200);
  bot.walkTo(26);
  const c2 = climber(bot, R);
  c2.jumpGrab();
  bot.holdUntil(R | G | U, () => bot.p.onGround, 200);
  assert.equal(bot.feet, rowTop(5), 'sur le tapis');
}

test('26 marché : un écho immobile sur le tapis traverse le faisceau ; un autre presse l’étal au bon moment', () => {
  const s = new Session(load('26-marche.json'));
  const bot = new Bot(s);
  // Écho 1 : monter sur le tapis, s'arrêter avant le faisceau… et « Rejouer ».
  climbToBelt(bot);
  bot.walkTo(colCenter(5));
  s.replay();
  // Écho 2 : attendre que l'écho 1 arrive au bouton b, puis sauter sur l'étal fragile.
  bot.holdUntil(0, () => button(s, 'b').pressed, 600);
  assert.equal(button(s, 'b').pressed, true, 'le tapis a porté l’écho jusqu’au bouton');
  const tb = s.world.tick;
  jumpOnStall(bot);
  assert.equal(button(s, 'a').pressed, true, 'sur l’étal');
  assert.equal(s.world.doors[0].target, true, 'a ET b : la porte s’ouvre');
  bot.untilAttemptEnds();
  // Tentative 3 : attendre devant la porte, passer pendant que l'étal tient.
  bot.walkTo(colCenter(5));
  bot.jump(1);
  bot.walkTo(colCenter(21));
  bot.holdUntil(0, () => s.world.doors[0].open >= 8, 600);
  assert.ok(s.world.tick > tb, 'la porte ne s’ouvre qu’après l’arrivée de l’écho au bouton');
  bot.holdUntil(R, () => s.state !== 'playing', 200);
  assert.equal(s.outcome, 'exit');
});

test('26 marché : on ne passe pas le faisceau du tapis soi-même', () => {
  const s = new Session(load('26-marche.json'));
  const bot = new Bot(s);
  climbToBelt(bot);
  bot.holdUntil(R, () => bot.p.dead, 200);
  assert.equal(bot.p.dead, true);
});

test('26 marché : l’étal ne tient qu’un instant (trop tôt, trop loin)', () => {
  // Étal pressé avant l'arrivée de l'écho au bouton b : la porte ne s'ouvre jamais.
  const s = new Session(load('26-marche.json'));
  const bot = new Bot(s);
  climbToBelt(bot);
  bot.walkTo(colCenter(5));
  s.replay();
  jumpOnStall(bot);
  assert.equal(button(s, 'a').pressed, true);
  bot.idle(50);
  assert.equal(button(s, 'a').pressed, false, 'l’étal a cédé');
  bot.untilAttemptEnds();
  let opened = false;
  bot.walkTo(colCenter(5));
  bot.jump(1);
  bot.walkTo(colCenter(21));
  bot.holdUntil(0, () => { opened ||= s.world.doors[0].open > 0; return s.attempt !== 3; }, 700);
  assert.equal(opened, false);
  // Seul sur l'étal (écho au bouton b) : la porte se referme bien avant qu'on l'atteigne.
  const s2 = new Session(load('26-marche.json'));
  const b2 = new Bot(s2);
  climbToBelt(b2);
  b2.walkTo(colCenter(5));
  s2.replay();
  b2.holdUntil(0, () => button(s2, 'b').pressed, 600);
  jumpOnStall(b2);
  assert.equal(s2.world.doors[0].target, true);
  for (let i = 0; i < 120 && s2.attempt === 2; i++) b2.step(i % 11 === 0 ? R | X : R);
  assert.equal(s2.outcome, null);
  assert.equal(s2.world.doors[0].open, 0);
});

// --- 27. Le tramway ---------------------------------------------------------------------

const tram = (s) => s.world.platforms[0];
const barrier = (s) => s.world.lasers.find((l) => l.sensor === 's');

/** Écho « bouclier » : sauter vers la rame, dash, et « Rejouer » en plein vol (avant le faisceau). */
function throwShieldOnTram(s, bot) {
  bot.walkTo(40);
  for (let k = 0; k < 80; k++) {
    bot.step(R | (k < 18 ? J : 0) | (k === 18 ? X | R : 0));
    if (k > 5 && bot.feet >= 108 * SUB) break;
  }
  assert.equal(bot.p.dead, false);
  s.replay();
}
/** Écho « barrière » : se laisser tomber du quai, « Rejouer » avant le faisceau. */
function dropIntoBarrier(s, bot) {
  bot.idle(2);
  bot.holdUntil(R, () => !bot.p.onGround, 100);
  bot.holdUntil(0, () => bot.feet >= 110 * SUB, 30);
  assert.equal(bot.p.dead, false);
  s.replay();
}
/** Le joueur : monter dans la rame derrière l'écho bouclier. */
function boardBehindShield(s, bot) {
  bot.walkTo(40);
  bot.holdUntil(0, () => s.world.actors[0].ground === tram(s), 200);
  bot.idle(20);
  bot.leap({ dir: R, dd: R, da: 18 });
}

test('27 tramway : un écho lancé sur la rame nous abrite ; un autre tient la barrière', () => {
  const s = new Session(load('27-tramway.json'));
  const bot = new Bot(s);
  throwShieldOnTram(s, bot);
  dropIntoBarrier(s, bot);
  const [shield, holder] = s.world.actors;
  boardBehindShield(s, bot);
  assert.equal(bot.p.ground, tram(s), 'dans la rame');
  assert.equal(shield.ground, tram(s), 'l’écho bouclier est dans la rame');
  assert.ok(bot.p.x < shield.x, 'derrière lui');
  assert.equal(holder.y + holder.h, rowTop(13), 'l’autre écho est au fond, sans dommage');
  assert.equal(barrier(s).pressed, true, 'et il coupe la barrière');
  let hitShield = false;
  bot.holdUntil(0, () => {
    hitShield ||= s.world.lasers.find((l) => !l.sensor && l.row === 7).hit === shield;
    return tram(s).x >= 280 * SUB || bot.p.dead;
  }, 500);
  assert.equal(bot.p.dead, false);
  assert.equal(hitShield, true, 'le faisceau s’arrête sur l’écho');
  // Arrivée : sauter (d'abord vers le haut, hors du faisceau), dash vers le quai.
  bot.leap({ dir: 0, after: R, afterAt: 4, dd: R, da: 11 });
  assert.equal(bot.feet, rowTop(6), 'sur le quai d’en face');
  bot.holdUntil(R, () => s.state !== 'playing' || bot.p.dead, 300);
  assert.equal(s.outcome, 'exit');
});

test('27 tramway : seul dans la rame, le faisceau nous fauche', () => {
  const s = new Session(load('27-tramway.json'));
  const bot = new Bot(s);
  bot.walkTo(40);
  bot.idle(30);
  bot.leap({ dir: R, dd: R, da: 18, until: () => bot.p.dead || bot.p.onGround });
  bot.idle(5);
  assert.equal(bot.p.dead, true);
});

test('27 tramway : la rame ne coupe la barrière qu’au départ ; sans l’écho, la porte est close', () => {
  const s = new Session(load('27-tramway.json'));
  const bot = new Bot(s);
  bot.idle(3);
  assert.equal(barrier(s).pressed, true, 'la rame à quai coupe la barrière');
  bot.idle(30);
  assert.equal(barrier(s).pressed, false, 'elle est partie');
  // Avec seulement l'écho bouclier : on arrive en face, porte fermée.
  const s2 = new Session(load('27-tramway.json'));
  const b2 = new Bot(s2);
  b2.idle(1);
  throwShieldOnTram(s2, b2);
  boardBehindShield(s2, b2);
  let opened = false;
  b2.holdUntil(0, () => {
    if (b2.cx > 18 * TILE) opened ||= s2.world.doors[0].open > 0;
    return s2.attempt !== 2 || b2.p.dead;
  }, 600);
  assert.equal(opened, false, 'la porte ne s’ouvre pas quand on est en face');
  assert.equal(s2.outcome, null);
});

// --- 28. Le chantier ----------------------------------------------------------------------

/** Remonte une cheminée étroite en sautant d'un mur à l'autre (sans s'agripper). */
function wallClimb(bot, done, max = 600) {
  const s = bot.s;
  let toward = L;
  for (let i = 0; i < max && s.state === 'playing'; i++) {
    const p = bot.p;
    if (done()) return true;
    if (p.onGround) {
      bot.step(toward);
      bot.step(toward | J);
      continue;
    }
    if (p.wallDir !== 0 && p.vy > -30) {
      bot.step(p.wallDir > 0 ? R : L);
      toward = p.wallDir > 0 ? L : R;
      for (let k = 0; k < 7; k++) bot.step(toward | J);
    } else {
      bot.step(toward | (p.vy < 0 ? J : 0));
    }
  }
  return done();
}
const wallCells = (s) => s.world.crumbles.filter((c) => c.col === 8);
const scaffold = (s, col) => s.world.crumbles.filter((c) => c.col === col);
/** Par la cheminée (sauts de mur à mur, sans toucher l'échafaudage), jusqu'au chapeau du bouton c. */
function chimneyToCap(bot) {
  bot.walkTo(colCenter(10));
  assert.equal(wallClimb(bot, () => bot.p.onGround && bot.feet === rowTop(4)), true, 'sur le chapeau');
}
/** Écho « mur » : du chapeau, dash vers le mur fragile, s'y agripper jusqu'à ce qu'il cède, entrer, tenir b. */
function breakWallAndHoldB(bot) {
  chimneyToCap(bot);
  bot.walkTo(colCenter(11) - 2);
  bot.step(L | X);
  bot.holdUntil(L | G, () => bot.p.climbing, 30);
  assert.equal(bot.p.climbing, true, 'agrippé au mur fragile');
  bot.holdUntil(L | G, () => wallCells(bot.s).filter((c) => c.row >= 2).every((c) => c.state === 'gone'), 120);
  bot.holdUntil(L, () => bot.p.onGround, 60);
  bot.walkTo(colCenter(2));
}
/** Le joueur : escalader l'échafaudage de droite, jusqu'à son chapeau. */
function climbRightScaffold(bot) {
  bot.walkTo(colCenter(18));
  const c = climber(bot);
  c.toWall();
  c.jumpGrab();
  c.climbJump();
  bot.holdUntil(R | G | U, () => bot.p.onGround || bot.p.dead, 300);
}

test('28 chantier : un écho tient c, un autre fait tomber le mur fragile et tient b ; on grimpe', () => {
  const s = new Session(load('28-chantier.json'));
  const bot = new Bot(s);
  // Écho 1 : la cheminée, sans s'agripper à l'échafaudage, puis le bouton c sur le chapeau.
  chimneyToCap(bot);
  assert.equal(button(s, 'c').pressed, true);
  assert.ok(scaffold(s, 11).every((c) => c.state === 'intact'), 'échafaudage intact');
  bot.untilAttemptEnds();
  // Écho 2 : même cheminée, puis le mur fragile, puis b.
  breakWallAndHoldB(bot);
  assert.equal(button(s, 'b').pressed, true, 'b, derrière le mur tombé');
  bot.untilAttemptEnds();
  // Tentative 3 : grimper l'échafaudage de droite (il cède derrière nous), passer la porte.
  climbRightScaffold(bot);
  assert.equal(bot.feet, rowTop(4), 'sur le chapeau de droite');
  assert.ok(scaffold(s, 20).some((c) => c.state !== 'intact'), 'l’échafaudage cède sous nos mains');
  bot.holdUntil(0, () => s.world.doors[0].open >= 12, 400);
  bot.holdUntil(R, () => s.state !== 'playing', 300);
  assert.equal(s.outcome, 'exit');
});

test('28 chantier : un écho qui escalade l’échafaudage détruit nos prises', () => {
  // Un écho grimpe l'échafaudage de droite, prise après prise : derrière lui, plus rien à saisir.
  const s = new Session(load('28-chantier.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(18));
  const c = climber(bot);
  c.toWall();
  c.jumpGrab();
  bot.holdUntil(R | G | U, () => bot.p.onGround || bot.p.dead, 300);
  assert.equal(bot.feet, rowTop(4), 'l’écho est monté');
  bot.untilAttemptEnds();
  bot.idle(200);
  assert.ok(scaffold(s, 20).filter((cell) => cell.state === 'gone').length >= 4, 'l’écho l’a fait tomber');
  climbRightScaffold(bot);
  assert.notEqual(bot.feet, rowTop(4), 'plus moyen d’atteindre le chapeau');
});

test('28 chantier : un seul écho ne suffit pas (b et c)', () => {
  const s = new Session(load('28-chantier.json'));
  const bot = new Bot(s);
  breakWallAndHoldB(bot);
  bot.untilAttemptEnds();
  climbRightScaffold(bot);
  bot.holdUntil(R, () => s.attempt !== 2 || s.state !== 'playing', 600);
  assert.equal(s.outcome, null, 'c n’est pas tenu');
});

// --- 29. L'enseigne -----------------------------------------------------------------------

const towerSpot = colCenter(8);
/** Monte sur `n` échos empilés au pied de la tour (sauts droits : on retombe sur la tête). */
function climbTower(bot, n) {
  bot.walkTo(towerSpot);
  for (let i = 0; i < n; i++) bot.jump(0);
}
/** Le joueur : passer la barrière (l'alarme allume les faisceaux), grimper le mur jusqu'à l'enseigne. */
function climbToSign(bot) {
  bot.walkTo(colCenter(22));
  const c = climber(bot);
  c.toWall();
  c.jumpGrab();
  c.climbJump();
  bot.holdUntil(R | G | U, () => bot.p.onGround || bot.p.dead, 300);
}

test('29 enseigne : une tour de trois échos arrête les deux faisceaux, on grimpe à l’abri', () => {
  const s = new Session(load('29-enseigne.json'));
  const bot = new Bot(s);
  for (let n = 0; n < 3; n++) {
    climbTower(bot, n);
    assert.equal(bot.feet, rowTop(12) - n * 22 * SUB, `étage ${n}`);
    bot.idle(5);
    assert.equal(s.world.lasers[0].latched, false, 'surtout ne pas couper l’alarme');
    s.replay();
  }
  bot.idle(130);
  const [e1, e2, e3] = s.world.actors;
  assert.equal(e2.ground, e1);
  assert.equal(e3.ground, e2, 'la tour tient');
  climbToSign(bot);
  assert.equal(s.world.lasers[0].latched, true, 'l’alarme a allumé les faisceaux');
  assert.equal(s.world.lasers[1].hit, e3, 'le faisceau du haut s’arrête sur le troisième écho');
  assert.equal(s.world.lasers[2].hit, e2, 'celui du bas sur le deuxième');
  assert.equal(bot.p.dead, false);
  assert.equal(bot.feet, rowTop(4));
  bot.holdUntil(R, () => s.state !== 'playing', 200);
  assert.equal(s.outcome, 'exit');
});

test('29 enseigne : seul, ou avec une tour de deux, les faisceaux nous fauchent', () => {
  const s = new Session(load('29-enseigne.json'));
  const bot = new Bot(s);
  climbToSign(bot);
  assert.equal(bot.died, true, 'seul');
  // Tour de deux échos : le faisceau du haut passe au-dessus d'elle.
  const s2 = new Session(load('29-enseigne.json'));
  const b2 = new Bot(s2);
  for (let n = 0; n < 2; n++) {
    climbTower(b2, n);
    b2.idle(5);
    s2.replay();
  }
  b2.idle(60);
  climbToSign(b2);
  assert.equal(b2.died, true, 'deux échos ne suffisent pas');
});

test('29 enseigne : un écho qui a coupé l’alarme fait échouer la construction', () => {
  const s = new Session(load('29-enseigne.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(22)); // on va voir le mur… et l'alarme sonne
  assert.equal(s.world.lasers[0].latched, true);
  bot.untilAttemptEnds();
  climbTower(bot, 0);
  bot.idle(5);
  s.replay();
  // Le deuxième étage se fait faucher : les faisceaux sont allumés par le vieil écho.
  bot.walkTo(towerSpot);
  bot.holdUntil(0, () => s.world.lasers[0].latched, 400);
  assert.equal(s.world.lasers[0].latched, true, 'le vieil écho a redéclenché l’alarme');
  bot.jump(0);
  bot.idle(20);
  assert.equal(bot.died, true);
});

// --- 30. Le dernier métro -----------------------------------------------------------------

const shutter30 = (s) => s.world.doors.find((d) => d.id === '3');
/** Écho C : marcher sur la passerelle, tomber sur le pilier, tenir c. */
function fallOnPillar(s, bot) {
  bot.holdUntil(R, () => s.world.crumbles[0].state === 'gone', 300);
  bot.holdUntil(0, () => bot.p.onGround && bot.feet === rowTop(12), 60);
  bot.walkTo(colCenter(9));
  assert.equal(button(s, 'c').pressed, true, 'c');
}
/** Écho B : l'escalier, le tapis, s'arrêter avant le faisceau… « Rejouer » (fait par l'appelant). */
function rideToB(bot) {
  bot.walkTo(colCenter(3));
  bot.jump(-1);
  bot.walkTo(colCenter(2));
  bot.jump(1);
  bot.walkTo(colCenter(5));
  bot.leap({ dir: 0, after: R, afterAt: 10 });
  assert.equal(bot.feet, rowTop(3), 'sur le tapis');
  bot.walkTo(colCenter(7));
}
/** Traverser le fossé par la tête de l'écho tombé sur le pilier. */
function crossOnHead(s, bot) {
  bot.holdUntil(0, () => s.world.crumbles[0].state === 'gone', 300);
  bot.walkTo(colCenter(4));
  bot.leap({ dir: R, dd: R, da: 8, until: () => bot.p.onGround || bot.p.dead });
  assert.equal(bot.p.ground?.kind, 'echo', 'sur la tête de l’écho du pilier');
  bot.idle(3);
  bot.leap({ dir: R, dd: U, da: 12, until: () => bot.p.onGround || bot.p.dead });
  assert.equal(bot.feet, rowTop(7), 'de l’autre côté');
}

test('30 métro : trois échos (pilier, tapis, volet) et l’on monte dans le dernier métro', () => {
  const s = new Session(load('30-metro.json'));
  const bot = new Bot(s);
  assert.equal(s.ticksLeft, null, 'pas de chrono');
  assert.equal(s.level.exitStyle, 'train');
  assert.equal(s.level.chapterEnd, true);
  // Écho 1 : la passerelle cède, il tombe sur le pilier (bouton c).
  fallOnPillar(s, bot);
  s.replay();
  // Écho 2 : monter sur le tapis, « Rejouer » avant le faisceau : le tapis l'emmène sur b.
  rideToB(bot);
  s.replay();
  // Écho 3 : passer le fossé sur la tête de l'écho 1, tenir le volet (bouton a).
  crossOnHead(s, bot);
  bot.walkTo(colCenter(15));
  assert.equal(button(s, 'a').pressed, true, 'a');
  s.replay();
  // Le joueur : le fossé, puis attendre volet fermé et b tenu, et monter dans la rame.
  crossOnHead(s, bot);
  bot.holdUntil(0, () => s.world.tick > 20 && !shutter30(s).target && shutter30(s).open === 0 && button(s, 'b').pressed, 900);
  assert.equal(button(s, 'b').pressed, true, 'l’écho du tapis est arrivé');
  bot.holdUntil(R, () => s.state !== 'playing' || bot.p.dead, 300);
  assert.equal(alarm(s).latched, false, 'pas d’alarme');
  assert.equal(s.outcome, 'exit');
});

test('30 métro : sans l’écho du volet, l’alarme verrouille le portillon', () => {
  const s = new Session(load('30-metro.json'));
  const bot = new Bot(s);
  fallOnPillar(s, bot);
  s.replay();
  rideToB(bot);
  s.replay();
  crossOnHead(s, bot);
  bot.holdUntil(0, () => button(s, 'b').pressed, 900);
  bot.holdUntil(R, () => alarm(s).latched, 300);
  assert.equal(alarm(s).latched, true);
  bot.holdUntil(R, () => s.state !== 'playing', 300);
  assert.equal(s.outcome, null, 'portillon fermé');
});

test('30 métro : sans l’écho du tapis, la rame reste fermée ; à pied, le faisceau du tapis tue', () => {
  const s = new Session(load('30-metro.json'));
  const bot = new Bot(s);
  fallOnPillar(s, bot);
  s.replay();
  crossOnHead(s, bot);
  bot.walkTo(colCenter(15));
  s.replay();
  crossOnHead(s, bot);
  bot.holdUntil(0, () => s.world.tick > 20 && shutter30(s).open === 0 && !shutter30(s).target, 300);
  bot.holdUntil(R, () => s.state !== 'playing' || bot.cx > colCenter(22), 300);
  bot.idle(60);
  assert.equal(s.outcome, null, 'la porte de la rame est restée close (b)');
  // Marcher soi-même sur le tapis : le faisceau.
  const s2 = new Session(load('30-metro.json'));
  const b2 = new Bot(s2);
  rideToB(b2);
  b2.holdUntil(R, () => b2.p.dead, 200);
  assert.equal(b2.p.dead, true);
});

test('30 métro : passerelle tombée, le fossé ne se franchit que par la tête de l’écho', () => {
  const lv = load('30-metro.json');
  const across = (w) => w.player.onGround && !w.player.dead && w.player.y + w.player.h <= rowTop(7) && w.player.x + w.player.w > 12 * TILE * SUB;
  // Depuis le bord, et depuis le pilier nu : rien n'y fait (saut, dash, saut au mur).
  for (const [x, feet] of [[colCenter(3), rowTop(9)], [colCenter(4) + 3, rowTop(9)], [colCenter(8), rowTop(12)], [colCenter(9), rowTop(12)]]) {
    const w = new World(lv, [], 1);
    w.crumbles[0].state = 'gone';
    w.player.x = (x - 5) * SUB;
    w.player.y = feet - w.player.h;
    w.step(0);
    w.step(0);
    assert.equal(countLeaps(w, across), 0, `depuis x=${x}`);
  }
  // Et l'on ne descend pas sur le pilier sans casser la passerelle : le fond du fossé tue.
  const s = new Session(lv);
  const bot = new Bot(s);
  bot.walkTo(colCenter(5) + 2);
  bot.holdUntil(0, () => s.world.crumbles[0].state === 'gone', 120);
  bot.holdUntil(L, () => bot.p.dead || bot.p.onGround, 120);
  bot.idle(20);
  assert.equal(bot.died, true);
});
