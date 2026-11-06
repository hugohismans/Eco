// Chapitre 4 : le musée (niveaux 31 à 40).
//
// Chaque niveau est joué par un petit robot qui suit la solution prévue, à
// travers la vraie Session (step, replay, restart) ; puis on vérifie que l'idée
// du niveau est nécessaire : seul, ou sans l'astuce, ou par un raccourci
// plausible, on n'y arrive pas.

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
const raw = (file) => JSON.parse(readFileSync(join(here, '../src/levels', file), 'utf8'));
const load = (file) => parseLevel(raw(file));
/** Le même niveau sans chrono (pour les vérifications « seul »). */
const loadNoTimer = (file, extra = {}) => parseLevel({ ...raw(file), duration: null, ...extra });
const colCenter = (c) => c * TILE + TILE / 2;
const rowTop = (r) => r * TILE * SUB;

/** Robot : quelques gestes simples, tick par tick, sur une session. */
class Bot {
  constructor(session) {
    this.s = session;
    /** Nombre de fois où le joueur a été touché par un faisceau. */
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
}

/** Remonte un mur unique (à droite si side > 0) par sauts au mur répétés. */
function wallJumpClimb(bot, side, done, max = 900) {
  const toward = side > 0 ? IN_RIGHT : IN_LEFT;
  for (let i = 0; i < max && !bot.done; i++) {
    if (done()) return true;
    const p = bot.p;
    let b = toward;
    if (p.onGround || (p.wallDir === side && p.wallLock === 0)) b |= IN_JUMP;
    else if (p.vy < 0) b |= IN_JUMP;
    // Relâcher pour pouvoir réappuyer (front montant) au contact du mur.
    if (p.wallDir === side && !p.onGround && bot.p.prevJump) b &= ~IN_JUMP;
    bot.step(b);
  }
  return done();
}

const ALL = ['walljump', 'grab', 'dash'];

// --- Le chapitre dans son ensemble ------------------------------------------------------

const CHAPTER4 = [
  ['31-entree.json', 'entree'], ['32-portraits.json', 'portraits'], ['33-vitrines.json', 'vitrines'],
  ['34-statues.json', 'statues'], ['35-alarme.json', 'alarme'], ['36-reserve.json', 'reserve'],
  ['37-atelier.json', 'atelier'], ['38-verriere.json', 'verriere'],
  ['39-grand-escalier.json', 'grand-escalier'], ['40-locomotives.json', 'locomotives'],
];
const DECOR_TYPES = new Set([
  'bench', 'lamp', 'pendant', 'window', 'clock', 'poster', 'canopy', 'facade', 'sign', 'counter',
  'board', 'radiator', 'plant', 'walllamp', 'gantry', 'train', 'painting', 'statue', 'skylight',
  'rope', 'locomotive',
]);

test('chapitre 4 : dix pièces bien formées', () => {
  for (const [file, id] of CHAPTER4) {
    const def = raw(file);
    const level = parseLevel(def);
    assert.equal(level.id, id, file);
    assert.equal(def.chapter, 4, file);
    assert.ok(['musee', 'reserve', 'halle'].includes(def.theme), file);
    assert.ok(typeof def.name === 'string' && def.name.length > 0, file);
    assert.ok(def.narration.endsWith(' (provisoire)'), file);
    assert.ok(def.decor.length >= 4 && def.decor.length <= 8, `${file} : décor`);
    for (const d of def.decor) assert.ok(DECOR_TYPES.has(d.type), `${file} : décor ${d.type}`);
    for (const d of def.decor.filter((x) => x.type === 'sign')) assert.ok(d.text.length <= 10, `${file} : enseigne`);
    if (id === 'locomotives') {
      assert.equal(def.duration, null);
      assert.equal(def.exitStyle, 'train');
      assert.ok(def.decor.some((d) => d.type === 'train' && d.variant === 'ancien' && d.layer === 'front'));
      assert.ok(def.decor.some((d) => d.type === 'bench'));
      assert.ok(level.chapterEnd, 'le vieux train mène au chapitre 5');
    } else {
      assert.ok(def.duration > 0, file);
    }
    const expected = id === 'statues' ? ['walljump', 'grab'] : ALL;
    assert.deepEqual([...level.abilities], expected, file);
  }
});

// --- 31. L'entrée ------------------------------------------------------------------

test('31 entrée : l’écho traverse le tableau et tient le bouton contre le mur du fond', () => {
  const s = new Session(load('31-entree.json'));
  const bot = new Bot(s);
  assert.equal(s.level.chapter, 4);
  // On marche contre le tableau : bloqué. On pousse jusqu'à la fin du chrono.
  bot.untilAttemptEnds(IN_LEFT);
  assert.equal(s.attemptCount, 2);
  // L'écho, lui, passe au travers et finit sur le bouton.
  bot.idle(200);
  assert.equal(s.world.buttons[0].pressed, true, 'l’écho tient le bouton');
  assert.equal(bot.exit(IN_RIGHT), 'exit');
});

test('31 entrée : seul, le tableau arrête le joueur et la porte reste fermée', () => {
  const s = new Session(loadNoTimer('31-entree.json'));
  const bot = new Bot(s);
  bot.hold(IN_LEFT, 300);
  assert.ok(bot.p.x >= 7 * TILE * SUB, 'arrêté par le tableau');
  // Grimper sur le tableau ne mène qu'au toit de la salle.
  wallJumpClimb(bot, -1, () => bot.feet <= rowTop(9), 200);
  bot.hold(IN_LEFT, 60);
  assert.equal(s.world.buttons[0].pressed, false);
  bot.walkTo(colCenter(21));
  bot.hold(IN_RIGHT, 60);
  assert.equal(s.world.doors[0].open, 0, 'la porte reste fermée');
  assert.equal(s.state, 'playing');
});

test('31 entrée : « Rejouer » dès qu’on touche le tableau : l’écho s’arrête trop tôt', () => {
  const s = new Session(load('31-entree.json'));
  const bot = new Bot(s);
  bot.holdUntil(IN_LEFT, () => bot.p.vx === 0 && bot.cx < 9 * TILE);
  s.replay();
  bot.idle(300);
  assert.equal(s.world.buttons[0].pressed, false);
});

// --- 32. La galerie des portraits ---------------------------------------------------

/** Marche à l'aveugle : pousser contre le tableau, puis encore `n` ticks. */
function walkBlind(bot, dirBits, n) {
  bot.holdUntil(dirBits, () => bot.p.onGround && bot.p.vx === 0 && bot.s.world.tick > 2, 600);
  bot.hold(dirBits, n);
  bot.idle(10);
}

/** 32 : monter l'escalier de plateformes jusqu'au palier du tableau du haut. */
function climbPortraitStairs(bot) {
  bot.walkTo(colCenter(16));
  bot.jump(0);
  assert.equal(bot.feet, rowTop(11), 'sur la première marche');
  bot.jump(-1);
  assert.equal(bot.feet, rowTop(10), 'sur la deuxième marche');
  bot.walkTo(colCenter(12) + 2);
  bot.jump(-1);
  assert.equal(bot.feet, rowTop(8), 'sur le palier');
}

test('32 portraits : deux marches à l’aveugle, chacune de la bonne longueur', () => {
  const s = new Session(load('32-portraits.json'));
  const bot = new Bot(s);
  // Écho 1 : salle du bas, plaques à 4–6 cases du tableau.
  walkBlind(bot, IN_LEFT, 50);
  s.replay();
  // Écho 2 : par l'escalier, salle du haut, plaques plus loin.
  climbPortraitStairs(bot);
  walkBlind(bot, IN_LEFT, 75);
  s.replay();
  bot.idle(330);
  const pressed = (ids) => s.world.buttons.filter((b) => ids.includes(b.id) && b.pressed).length;
  assert.equal(pressed(['b', 'c', 'd']) > 0, true, 'un écho sur les plaques du bas');
  assert.equal(pressed(['e', 'f', 'g']) > 0, true, 'un écho sur les plaques du haut');
  assert.equal(bot.exit(IN_RIGHT), 'exit');
});

test('32 portraits : pousser trop longtemps, l’écho dépasse les plaques et va au mur', () => {
  const s = new Session(load('32-portraits.json'));
  const bot = new Bot(s);
  bot.untilAttemptEnds(IN_LEFT);
  bot.idle(300);
  assert.equal(s.world.buttons.some((b) => b.pressed), false);
  assert.equal(s.world.actors[0].x, 1 * TILE * SUB, 'l’écho est contre le mur du fond');
  // Trop peu : il s'arrête avant.
  s.restart();
  walkBlind(bot, IN_LEFT, 12);
  s.replay();
  bot.idle(300);
  assert.equal(s.world.buttons.some((b) => b.pressed), false);
});

test('32 portraits : une seule salle tenue ne suffit pas, la deuxième porte reste fermée', () => {
  const s = new Session(load('32-portraits.json'));
  const bot = new Bot(s);
  walkBlind(bot, IN_LEFT, 50);
  s.replay();
  bot.walkTo(colCenter(22));
  bot.idle(30);
  assert.equal(s.world.doors.find((d) => d.id === '1').open > 0, true);
  bot.hold(IN_RIGHT, 200);
  assert.equal(s.world.doors.find((d) => d.id === '2').open, 0);
  assert.equal(s.state, 'playing');
});

// --- 33. Les vitrines ---------------------------------------------------------------

/** 33 : marcher vers la droite, tomber à travers la vitrine, continuer un peu. */
function throughVitrine(bot) {
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround && bot.feet === rowTop(13), 300);
  bot.hold(IN_RIGHT, 50);
}

test('33 vitrines : la vitrine attrape un écho sur la plaque ; l’autre écho fait le tour', () => {
  const s = new Session(load('33-vitrines.json'));
  const bot = new Bot(s);
  // Écho 1 : on marche vers la droite, on tombe à travers la vitrine…
  throughVitrine(bot);
  assert.ok(bot.cx > 7 * TILE, 'le joueur a traversé le fond de la vitrine');
  s.replay();
  // … l'écho, lui, s'y pose et bute contre la vitre, sur la plaque a.
  bot.idle(150);
  const echo = s.world.actors[0];
  assert.equal(echo.y + echo.h, rowTop(9));
  assert.equal(s.world.buttons.find((b) => b.id === 'a').pressed, true);
  s.restart();
  // Recommençons proprement : écho 1 par la vitrine, écho 2 par la gauche jusqu'à b.
  throughVitrine(bot);
  s.replay();
  bot.holdUntil(IN_LEFT, () => bot.p.onGround && bot.feet === rowTop(13), 300);
  bot.walkTo(colCenter(17));
  bot.idle(20);
  s.replay();
  // Dernière tentative : le chemin le plus court, par la vitrine.
  throughVitrine(bot);
  bot.walkTo(colCenter(20));
  bot.holdUntil(0, () => s.world.doors[0].open > 0, 400);
  assert.equal(bot.exit(IN_RIGHT), 'exit');
});

test('33 vitrines : par le même chemin, le deuxième écho reste lui aussi dans la vitrine', () => {
  const s = new Session(load('33-vitrines.json'));
  const bot = new Bot(s);
  throughVitrine(bot);
  s.replay();
  // Écho 2 : même départ par la droite, puis on va tenir b.
  throughVitrine(bot);
  bot.walkTo(colCenter(17));
  bot.idle(20);
  s.replay();
  bot.idle(400);
  assert.equal(s.world.buttons.find((b) => b.id === 'b').pressed, false, 'personne sur b');
  assert.ok(s.world.actors[1].y + s.world.actors[1].h <= rowTop(9), 'l’écho 2 est resté dans la vitrine');
  assert.equal(s.world.doors[0].open, 0);
});

test('33 vitrines : seul, impossible de tenir la plaque de la vitrine', () => {
  const s = new Session(loadNoTimer('33-vitrines.json'));
  const bot = new Bot(s);
  // Sauter dessus, ou s'y jeter en dash : on la traverse.
  bot.walkTo(colCenter(6));
  bot.jump(1);
  assert.equal(bot.feet, rowTop(13));
  bot.walkTo(colCenter(17));
  bot.idle(10);
  assert.equal(s.world.doors[0].open, 0, 'b seul ne suffit pas');
});

// --- 34. La salle des statues ----------------------------------------------------------

/** 34 : sortir du couloir et sauter tout de suite (tolérance au bord), sans dériver. */
function statueEdge(bot) {
  bot.holdUntil(0, () => bot.p.onGround, 10);
  bot.holdUntil(IN_RIGHT, () => !bot.p.onGround, 400);
}
function statueHop(bot, hops) {
  statueEdge(bot);
  for (let h = 0; h < hops; h++) {
    bot.hold(IN_JUMP, 18);
    bot.holdUntil(0, () => bot.p.onGround, 120);
    bot.idle(2);
  }
}

test('34 statues : trois échos empilés dans la vitrine, la courte échelle jusqu’à la sortie', () => {
  const level = load('34-statues.json');
  assert.deepEqual([...level.abilities], ['walljump', 'grab'], 'pas de dash ici');
  const s = new Session(level);
  const bot = new Bot(s);
  // Écho 1 : marcher, simplement ; on tombe à travers le socle de verre, lui s'y pose.
  bot.hold(IN_RIGHT, 160);
  s.replay();
  // Écho 2 : un saut au bord du couloir (le joueur peut même rater : la vitre aligne l'écho).
  bot.idle(30);
  statueEdge(bot);
  bot.hold(IN_RIGHT | IN_JUMP, 18);
  bot.hold(IN_RIGHT, 60);
  s.replay();
  // Écho 3 : deux sauts.
  bot.idle(60);
  statueHop(bot, 2);
  assert.equal(bot.p.ground?.kind, 'echo', 'le joueur est sur la pile');
  s.replay();
  const tower = () => s.world.actors.slice(0, 3).map((a) => (rowTop(13) - a.y - a.h) / SUB);
  // Dernière tentative : attendre la pile, puis grimper dessus.
  bot.idle(220);
  assert.deepEqual(tower(), [48, 70, 92]);
  statueHop(bot, 3);
  assert.equal(bot.p.ground, s.world.actors[2], 'debout sur l’écho 3');
  bot.hold(IN_JUMP, 30);
  bot.holdUntil(0, () => bot.done || bot.p.onGround, 120);
  assert.equal(s.outcome, 'exit');
});

test('34 statues : deux échos ne suffisent pas', () => {
  const s = new Session(load('34-statues.json'));
  const bot = new Bot(s);
  bot.hold(IN_RIGHT, 160);
  s.replay();
  bot.idle(30);
  statueEdge(bot);
  bot.hold(IN_RIGHT | IN_JUMP, 18);
  bot.hold(IN_RIGHT, 60);
  s.replay();
  bot.idle(120);
  statueHop(bot, 2);
  assert.equal(bot.p.ground, s.world.actors[1]);
  bot.hold(IN_JUMP, 30);
  bot.holdUntil(0, () => bot.done || bot.p.onGround, 120);
  assert.equal(s.state, 'playing');
  assert.equal(bot.p.ground, s.world.actors[1], 'retombé sur l’écho 2');
});

test('34 statues : les échos ne peuvent pas descendre au sol : la vitrine est leur seul socle', () => {
  const s = new Session(load('34-statues.json'));
  const bot = new Bot(s);
  // Le joueur descend au sol et va loin à droite (où l'on pourrait bâtir une pile)…
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround && bot.feet === rowTop(13), 300);
  bot.walkTo(colCenter(16));
  bot.jump(1);
  s.replay();
  bot.idle(300);
  // … son écho, lui, est resté dans la colonne de la vitrine.
  const e = s.world.actors[0];
  assert.equal(e.y + e.h, rowTop(10));
  assert.ok(e.x < 11 * TILE * SUB);
});

test('34 statues : ni le toit du couloir ni le mur de gauche ne mènent à la sortie', () => {
  const s = new Session(loadNoTimer('34-statues.json'));
  const bot = new Bot(s);
  // Du bord du couloir, on s'agrippe au tableau qui sert de toit et l'on se hisse dessus.
  statueEdge(bot);
  bot.hold(IN_JUMP, 8);
  bot.holdUntil(IN_LEFT | IN_GRAB | IN_JUMP, () => bot.p.climbing, 30);
  bot.holdUntil(IN_LEFT | IN_GRAB | IN_UP, () => bot.p.onGround, 120);
  assert.equal(bot.feet, rowTop(7), 'sur le toit du couloir');
  bot.walkTo(colCenter(9));
  bot.hold(IN_JUMP, 30);
  bot.holdUntil(0, () => bot.done || bot.p.onGround, 120);
  assert.equal(s.state, 'playing', 'trop bas depuis le toit');
  // Le mur de gauche : on y monte, mais la sortie est bien trop loin.
  bot.walkTo(colCenter(1));
  assert.equal(wallJumpClimb(bot, -1, () => bot.p.y <= rowTop(2), 600), true, 'en haut du mur');
  bot.hold(IN_RIGHT | IN_JUMP, 20);
  bot.holdUntil(IN_RIGHT, () => bot.done || bot.p.onGround, 200);
  assert.equal(s.state, 'playing');
});

test('34 statues : avec le dash, deux échos suffiraient (c’est pourquoi il est retiré ici)', () => {
  const s = new Session(parseLevel({ ...raw('34-statues.json'), abilities: ALL }));
  const bot = new Bot(s);
  bot.hold(IN_RIGHT, 160);
  s.replay();
  bot.idle(30);
  statueEdge(bot);
  bot.hold(IN_RIGHT | IN_JUMP, 18);
  bot.hold(IN_RIGHT, 60);
  s.replay();
  bot.idle(120);
  statueHop(bot, 2);
  bot.hold(IN_JUMP, 26);
  bot.step(IN_UP | IN_DASH);
  bot.holdUntil(IN_UP, () => bot.done || bot.p.onGround, 120);
  assert.equal(s.outcome, 'exit');
});

/**
 * Raccourci « sauter le couloir de secours » : la session est préparée (sans écho de
 * tête), le joueur collé contre l'issue fermée ; on essaie, à partir du moment où
 * l'alarme sonne, toutes sortes de sauts et de dashs. Vrai si l'un atteint la sortie.
 */
function corridorShortcut(prepare) {
  const base = prepare();
  const prefix = [...base.recording];
  const tapes = base.history.map((h) => ({ ...h }));
  const level = base.level;
  for (let delay = 0; delay <= 14; delay += 2) {
    for (let t = 0; t <= 20; t += 4) {
      for (const dash of [0, IN_DASH | IN_RIGHT, IN_DASH | IN_RIGHT | IN_UP]) {
        const s = new Session(level);
        s.history = tapes.map((h) => ({ ...h }));
        s.beginAttempt();
        for (const b of prefix) s.step(b);
        const bot = new Bot(s);
        const alarm = s.world.lasers.find((l) => l.sensor);
        bot.holdUntil(IN_RIGHT, () => alarm.latched, 900);
        bot.hold(IN_RIGHT, delay);
        bot.step(IN_RIGHT | IN_JUMP);
        bot.hold(IN_RIGHT | IN_JUMP, t);
        if (dash) bot.step(dash);
        bot.holdUntil(IN_RIGHT | IN_JUMP, () => bot.p.dead || bot.done, 200);
        if (s.outcome === 'exit') return true;
      }
    }
  }
  return false;
}

// --- 35. Le système d'alarme -------------------------------------------------------------

/** 35, écho A : aller pousser contre l'issue de secours, jusqu'au bout du chrono. */
function alarmeEchoA(bot) {
  bot.untilAttemptEnds(IN_RIGHT);
}
/** 35, écho B : attendre, puis entrer dans le tableau (l'écho coupera l'alarme). */
function alarmeEchoB(bot, wait) {
  bot.idle(wait);
  bot.untilAttemptEnds(IN_LEFT);
}

test('35 alarme : un écho ouvre la voie, l’autre déclenche l’alarme au bon moment', () => {
  const s = new Session(load('35-alarme.json'));
  const bot = new Bot(s);
  alarmeEchoA(bot);
  alarmeEchoB(bot, 90);
  // On passe les volets avant l'alarme, et l'on attend devant l'issue de secours.
  bot.walkTo(colCenter(18));
  const shutters = s.world.doors.find((d) => d.id === '1');
  const emergency = s.world.doors.find((d) => d.id === '2');
  bot.holdUntil(0, () => emergency.open === 12, 300);
  assert.equal(s.world.lasers[0].latched, true, 'l’alarme a sonné');
  bot.idle(20);
  assert.equal(shutters.open, 0, 'les volets sont fermés derrière nous');
  // L'écho A, qui poussait contre la porte, repart et prend le faisceau pour nous.
  assert.equal(bot.exit(IN_RIGHT), 'exit');
  assert.equal(bot.deaths, 0);
});

test('35 alarme : déclenchée trop tôt, les volets se ferment devant nous', () => {
  const s = new Session(load('35-alarme.json'));
  const bot = new Bot(s);
  alarmeEchoA(bot);
  alarmeEchoB(bot, 0);
  bot.hold(IN_RIGHT, 300);
  assert.ok(bot.p.x < 14 * TILE * SUB, 'resté dans le hall');
  assert.equal(s.state, 'playing');
});

test('35 alarme : sans l’écho A, le faisceau du couloir nous attend derrière la porte', () => {
  const s = new Session(load('35-alarme.json'));
  const bot = new Bot(s);
  alarmeEchoB(bot, 90);
  bot.walkTo(colCenter(18));
  bot.holdUntil(IN_RIGHT, () => bot.p.dead || bot.done, 300);
  assert.equal(bot.p.dead, true);
});

test('35 alarme : impossible de sauter le couloir par-dessus le faisceau, même en dash', () => {
  const exits = corridorShortcut(() => {
    const s = new Session(load('35-alarme.json'));
    const bot = new Bot(s);
    alarmeEchoB(bot, 90);
    bot.holdUntil(IN_RIGHT, () => bot.p.vx === 0 && bot.cx > 17 * TILE, 300);
    return s;
  });
  assert.equal(exits, false);
});

test('35 alarme : enregistrer l’alarme d’abord, puis l’écho A : il meurt ou reste à la porte', () => {
  const s = new Session(load('35-alarme.json'));
  const bot = new Bot(s);
  alarmeEchoB(bot, 90);
  // Pendant cette tentative, l'alarme sonne : l'issue s'ouvre sur le faisceau.
  bot.holdUntil(IN_RIGHT, () => bot.p.dead || bot.done, 400);
  assert.equal(bot.p.dead, true, 'on ne peut pas enregistrer l’écho A après l’alarme');
});

// --- 36. La réserve --------------------------------------------------------------------

test('36 réserve : l’écho entre, ouvre la porte du fond et pousse la valise jusqu’à la plaque', () => {
  const s = new Session(load('36-reserve.json'));
  const bot = new Bot(s);
  // On pousse contre le tableau, à l'aveugle ; au bout de deux secondes, « Bas »,
  // et l'on continue de pousser.
  bot.hold(IN_LEFT, 130);
  bot.step(IN_LEFT | IN_DOWN);
  bot.untilAttemptEnds(IN_LEFT);
  // L'écho : la valise, la porte du fond, la vitrine.
  bot.holdUntil(0, () => s.world.buttons[0].pressed, 400);
  const v = s.world.blocks[0];
  assert.equal(v.x < 3 * TILE * SUB, true, 'la valise est sous la vitrine');
  assert.equal(s.world.levers[0].pressed, true);
  assert.equal(bot.exit(IN_RIGHT), 'exit');
});

test('36 réserve : sans « Bas », la valise reste coincée contre la porte du fond', () => {
  const s = new Session(load('36-reserve.json'));
  const bot = new Bot(s);
  bot.untilAttemptEnds(IN_LEFT);
  bot.idle(400);
  assert.equal(s.world.buttons[0].pressed, false);
  assert.equal(s.world.blocks[0].x, 6 * TILE * SUB, 'valise contre la porte fermée');
});

test('36 réserve : la plaque sous la vitrine n’est pas pour les échos ; le joueur ne la tient pas', () => {
  // Même pièce sans valise : l'écho ouvre, continue… et bute contre la vitrine.
  const noBag = raw('36-reserve.json');
  noBag.grid = noBag.grid.map((r) => r.replace('B', '.'));
  const s1 = new Session(parseLevel(noBag));
  const b1 = new Bot(s1);
  b1.hold(IN_LEFT, 100);
  b1.step(IN_LEFT | IN_DOWN);
  b1.untilAttemptEnds(IN_LEFT);
  b1.idle(500);
  assert.equal(s1.world.levers[0].pressed, true);
  assert.equal(s1.world.actors[0].x, 3 * TILE * SUB, 'arrêté par la vitrine');
  assert.equal(s1.world.buttons[0].pressed, false);
  // Le joueur, lui, ne peut même pas rejoindre la vitrine : le mur monte jusqu'au plafond.
  const s2 = new Session(loadNoTimer('36-reserve.json'));
  const b2 = new Bot(s2);
  b2.walkTo(colCenter(12));
  // (Depuis la correction du saut au mur répété, on n'atteint même plus le toit ; on essaie quand même.)
  wallJumpClimb(b2, -1, () => b2.p.onGround && b2.feet === rowTop(9), 400);
  b2.walkTo(colCenter(6));
  wallJumpClimb(b2, -1, () => b2.p.x < 5 * TILE * SUB, 600);
  b2.hold(IN_LEFT, 200);
  assert.ok(b2.p.x >= 6 * TILE * SUB, 'toujours à droite du mur');
});

// --- 37. L'atelier de restauration --------------------------------------------------------

/** 37 : sauter du palier vers le tapis, et « Rejouer » en plein vol, avant le faisceau. */
function atelierDrop(bot) {
  bot.walkTo(colCenter(15));
  bot.step(IN_LEFT);
  bot.hold(IN_LEFT | IN_JUMP, 16);
  bot.holdUntil(IN_LEFT, () => !bot.p.onGround && bot.p.vy > 0 && bot.feet >= rowTop(6), 60);
  assert.equal(bot.p.dead, false);
  bot.s.replay();
}
/** 37 : descendre sans traverser le faisceau (par le bout droit du palier). */
function atelierToExit(bot) {
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround && bot.feet === rowTop(13), 300);
  return bot.exit(IN_LEFT, 900);
}

test('37 atelier : l’écho, immobile, est emporté par le tapis à travers le tableau', () => {
  const s = new Session(load('37-atelier.json'));
  const bot = new Bot(s);
  atelierDrop(bot);
  const echo = s.world.actors[0];
  bot.holdUntil(0, () => echo.finished && echo.onGround, 200);
  bot.idle(2);
  assert.equal(echo.ground?.conveyor, -1, 'l’écho est posé sur le tapis');
  assert.equal(s.world.lasers[0].hit, echo, 'il arrête le faisceau, sans dommage');
  assert.equal(atelierToExit(bot), 'exit');
  assert.equal(bot.deaths, 0);
  assert.equal(echo.x, 4 * TILE * SUB, 'l’écho est au fond de l’atelier');
});

test('37 atelier : on ne peut pas se poser sur le tapis : le faisceau tue', () => {
  const s = new Session(load('37-atelier.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(15));
  bot.holdUntil(IN_LEFT, () => bot.p.dead, 120);
  assert.equal(bot.p.dead, true);
  bot.idle(60);
  assert.equal(s.world.actors.length, 1, 'aucun écho : la chute n’est pas enregistrée');
});

test('37 atelier : « Rejouer » trop tôt (encore sur le palier) : l’écho n’atteint pas le tapis', () => {
  const s = new Session(load('37-atelier.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(15));
  s.replay();
  bot.idle(30);
  assert.equal(atelierToExit(bot), null);
  assert.equal(s.world.buttons[0].pressed, false);
});

test('37 atelier : seul, la porte reste fermée', () => {
  const s = new Session(loadNoTimer('37-atelier.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(13));
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround && bot.feet === rowTop(13) || bot.p.dead, 400);
  bot.holdUntil(IN_LEFT, () => bot.p.dead || bot.done || bot.cx < 4 * TILE + 8, 600);
  assert.equal(s.state, 'playing');
});

// --- 38. La verrière ----------------------------------------------------------------------

/** 38, écho 1 : courir, sauter ; la première vitrine l'attrape. */
function verriereRec1(bot) {
  bot.holdUntil(IN_RIGHT, () => bot.cx >= 60, 300);
  bot.hold(IN_RIGHT | IN_JUMP, 18);
  bot.hold(IN_RIGHT, 60);
  bot.s.replay();
}
/** 38 : du départ, sauter et filer en dash vers la tête de l'écho 1 (sans toucher le verre). */
function verriereToEcho1(bot) {
  bot.idle(20);
  bot.holdUntil(IN_RIGHT, () => bot.cx >= 20, 300);
  bot.hold(IN_RIGHT | IN_JUMP, 12);
  bot.step(IN_UP | IN_RIGHT | IN_DASH);
  bot.holdUntil(0, () => bot.p.onGround || bot.p.dead, 80);
}
/** 38 : de la tête de l'écho 1, saut + dash en diagonale. */
function verriereFromEcho1(bot, jumpTicks, after = IN_RIGHT) {
  bot.hold(IN_RIGHT, 4);
  bot.hold(IN_RIGHT | IN_JUMP, jumpTicks);
  bot.step(IN_UP | IN_RIGHT | IN_DASH);
  bot.holdUntil(after, () => bot.p.onGround || bot.p.dead || bot.done, 80);
}
const H = (a) => (rowTop(13) - a.y - a.h) / SUB;

test('38 verrière : deux échos posés dans les vitrines, deux marches vers le ciel', () => {
  const s = new Session(load('38-verriere.json'));
  const bot = new Bot(s);
  verriereRec1(bot);
  // Écho 2 : sur la tête de l'écho 1 (faisceau éteint), puis vers la seconde vitrine.
  verriereToEcho1(bot);
  assert.equal(bot.p.ground, s.world.actors[0], 'sur la tête de l’écho 1');
  verriereFromEcho1(bot, 10);
  bot.hold(IN_RIGHT, 90);
  s.replay();
  // Dernière tentative.
  const [e1, e2] = s.world.actors;
  verriereToEcho1(bot);
  assert.equal(bot.p.ground, e1);
  // Un saut plus haut que celui de l'écho : on retombe sur sa tête.
  verriereFromEcho1(bot, 18, 0);
  assert.equal(bot.p.ground, e2, 'sur la tête de l’écho 2');
  bot.idle(60); // l'écho nous porte jusqu'à la vitre
  assert.equal(H(e1), 32);
  assert.equal(H(e2), 80);
  bot.hold(IN_RIGHT | IN_JUMP, 10);
  bot.step(IN_UP | IN_RIGHT | IN_DASH);
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround || bot.p.dead || bot.done, 80);
  assert.equal(s.outcome, 'exit');
  assert.equal(bot.deaths, 0);
});

/** 38 : tous les sauts « saut + dash » plausibles depuis la position courante ; vrai si l'un mène à la sortie. */
function anyDashJumpExits(makeSession) {
  for (const pre of [0, 4, 8]) {
    for (let k = 2; k <= 22; k += 2) {
      for (const dd of [IN_UP, IN_UP | IN_RIGHT, IN_RIGHT]) {
        for (const post of [IN_RIGHT, 0]) {
          const s = makeSession();
          const b = new Bot(s);
          b.hold(IN_RIGHT, pre);
          b.hold(IN_RIGHT | IN_JUMP, k);
          b.step(dd | IN_DASH);
          b.holdUntil(post, () => b.done || b.p.dead || b.p.onGround, 90);
          if (s.outcome === 'exit') return true;
        }
      }
    }
  }
  return false;
}

test('38 verrière : avec un seul écho, aucun saut ne mène à la sortie', () => {
  const lv = loadNoTimer('38-verriere.json');
  const make = () => {
    const s = new Session(lv);
    const bot = new Bot(s);
    verriereRec1(bot);
    verriereToEcho1(bot);
    assert.equal(bot.p.ground, s.world.actors[0]);
    return s;
  };
  assert.equal(anyDashJumpExits(make), false);
});

test('38 verrière : le joueur ne tient pas sur le verre ; le faisceau garde la tête de l’écho 1', () => {
  const s = new Session(loadNoTimer('38-verriere.json'));
  const bot = new Bot(s);
  bot.holdUntil(IN_RIGHT, () => bot.cx >= 60, 300);
  bot.hold(IN_RIGHT | IN_JUMP, 18);
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround, 60);
  assert.equal(bot.feet, rowTop(13), 'à travers la première vitrine');
  // Trop lent : sur la tête de l'écho 1 quand le faisceau se rallume.
  const s2 = new Session(load('38-verriere.json'));
  const b2 = new Bot(s2);
  verriereRec1(b2);
  verriereToEcho1(b2);
  b2.holdUntil(0, () => b2.p.dead, 200);
  assert.equal(b2.p.dead, true);
});

test('38 verrière : une tour d’échos au sol ne mène nulle part', () => {
  // (Sans le faisceau cyclique, pour laisser au joueur tout le temps de bâtir.)
  const def = raw('38-verriere.json');
  const calm = parseLevel({ ...def, lasers: [], grid: def.grid.map((r) => r.replace('>', '#')) });
  const s = new Session(calm);
  const bot = new Bot(s);
  // Chaque tentative : se coller à la première vitrine, au sol, et sauter n fois.
  const build = (n) => {
    bot.walkTo(colCenter(3) + 2);
    bot.idle(30 * n);
    for (let k = 0; k < n; k++) { bot.jump(0); bot.idle(2); }
  };
  for (let n = 0; n < 4; n++) { build(n); s.replay(); }
  build(4);
  assert.equal(bot.p.ground, s.world.actors[3], 'au sommet de la pile');
  const top = s.world.actors[3];
  assert.equal(H(top), 66);
  // Depuis le sommet : rien. (Bot sur une copie : on rejoue la même tentative.)
  const tapes = s.history.slice(-4);
  const prefix = [...s.recording];
  const make = () => {
    const t = new Session(calm);
    t.history = tapes.map((h) => ({ ...h }));
    t.beginAttempt();
    for (const b of prefix) t.step(b);
    return t;
  };
  assert.equal(anyDashJumpExits(make), false);
  // Les échos ne passent même pas sous la première vitrine : la pile reste à gauche.
  const s3 = new Session(calm);
  const b3 = new Bot(s3);
  b3.walkTo(colCenter(13));
  s3.replay();
  b3.idle(300);
  assert.equal(s3.world.actors[0].x, 4 * TILE * SUB - 10 * SUB, 'arrêté par la vitrine');
});

// --- 39. Le grand escalier ------------------------------------------------------------------

const door = (s, id) => s.world.doors.find((d) => d.id === id);

/** 39 : du rez-de-chaussée au premier palier (porte 1, deux marches). */
function escalierUp1(bot) {
  bot.walkTo(colCenter(23));
  bot.holdUntil(0, () => door(bot.s, '1').open === 12, 600);
  bot.walkTo(colCenter(25) + 8);
  bot.jump(0);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(9), 'premier palier');
}
/** 39 : sur le premier palier, vers la gauche ; on saute (ou non) au-dessus de la vitrine. */
function escalierPalier(bot, hop) {
  bot.holdUntil(IN_LEFT, () => bot.cx <= colCenter(19), 300);
  if (hop) {
    bot.hold(IN_LEFT | IN_JUMP, 14);
  }
}
/** 39 : passer la porte 2 et monter au dernier étage. */
function escalierUp2(bot) {
  bot.walkTo(colCenter(13));
  bot.holdUntil(0, () => door(bot.s, '2').open === 12, 600);
  bot.walkTo(colCenter(10));
  bot.jump(0);
  bot.jump(0);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(4), 'dernier étage');
}

function escalierE1(bot) {
  walkBlind(bot, IN_LEFT, 120);
  bot.s.replay();
}
function escalierE2(bot) {
  escalierUp1(bot);
  escalierPalier(bot, false);
  bot.hold(IN_LEFT, 60);
  bot.s.replay();
}
function escalierA(bot) {
  escalierUp1(bot);
  escalierPalier(bot, true);
  escalierUp2(bot);
  bot.untilAttemptEnds(IN_RIGHT);
}
function escalierB(bot, wait) {
  escalierUp1(bot);
  escalierPalier(bot, true);
  bot.walkTo(colCenter(13));
  bot.holdUntil(0, () => door(bot.s, '2').open === 12, 600);
  bot.walkTo(colCenter(8));
  bot.idle(wait);
  bot.untilAttemptEnds(IN_LEFT);
}

test('39 grand escalier : quatre échos, dans le bon ordre, au bon moment', () => {
  const s = new Session(load('39-grand-escalier.json'));
  const bot = new Bot(s);
  escalierE1(bot);
  escalierE2(bot);
  escalierA(bot);
  escalierB(bot, 60);
  assert.equal(s.world.actors.length, 5);
  assert.equal(escalierFinal(bot), 'exit');
  assert.equal(bot.deaths, 0);
  const alarm = s.world.lasers.find((l) => l.sensor);
  assert.equal(alarm.latched, true, 'l’alarme a sonné');
  assert.equal(door(s, '3').open, 0, 'les volets se sont fermés derrière nous');
});

/** 39 : la dernière tentative, jusqu'à la porte de secours ; renvoie la session. */
function escalierFinal(bot) {
  const deaths = bot.deaths;
  escalierUp1(bot);
  escalierPalier(bot, true);
  escalierUp2(bot);
  bot.walkTo(colCenter(19));
  bot.holdUntil(0, () => door(bot.s, '4').open === 12 || bot.done, 600);
  bot.holdUntil(0, () => bot.p.dead, 20);
  if (bot.deaths > deaths) return 'dead';
  const out = bot.exit(IN_RIGHT);
  return bot.deaths > deaths ? 'dead' : out;
}

test('39 grand escalier : l’alarme déclenchée tout de suite ferme les volets devant nous', () => {
  const s = new Session(load('39-grand-escalier.json'));
  const bot = new Bot(s);
  escalierE1(bot);
  escalierE2(bot);
  escalierA(bot);
  escalierB(bot, 0);
  escalierUp1(bot);
  escalierPalier(bot, true);
  escalierUp2(bot);
  bot.hold(IN_RIGHT, 200);
  assert.ok(bot.p.x < 13 * TILE * SUB, 'arrêté par les volets');
  assert.equal(s.state, 'playing');
});

test('39 grand escalier : l’ordre compte — l’alarme avant l’écho de tête, et celui-ci meurt', () => {
  const s = new Session(load('39-grand-escalier.json'));
  const bot = new Bot(s);
  escalierE1(bot);
  escalierE2(bot);
  escalierB(bot, 60);
  escalierUp1(bot);
  escalierPalier(bot, true);
  escalierUp2(bot);
  bot.holdUntil(IN_RIGHT, () => bot.p.dead || bot.done, 600);
  assert.equal(bot.p.dead, true, 'l’issue s’ouvre sur le faisceau');
});

test('39 grand escalier : un écho de tête qui n’a pas sauté la vitrine y reste, et l’on meurt', () => {
  const s = new Session(load('39-grand-escalier.json'));
  const bot = new Bot(s);
  escalierE1(bot);
  escalierE2(bot);
  // Écho « de tête » enregistré sans sauter au-dessus de la vitrine.
  escalierUp1(bot);
  escalierPalier(bot, false);
  escalierUp2(bot);
  bot.untilAttemptEnds(IN_RIGHT);
  escalierB(bot, 60);
  const lead = s.world.actors[2];
  assert.equal(escalierFinal(bot), 'dead', 'le faisceau du couloir nous atteint');
  assert.ok(lead.x > 16 * TILE * SUB && lead.y + lead.h === rowTop(9), 'resté sur le palier, contre la vitrine');
});

test('39 grand escalier : chaque écho est nécessaire', () => {
  // Sans l'écho de la vitrine (b) : la porte 2 reste fermée.
  {
    const s = new Session(load('39-grand-escalier.json'));
    const bot = new Bot(s);
    escalierE1(bot);
    escalierUp1(bot);
    escalierPalier(bot, true);
    bot.walkTo(colCenter(13));
    bot.idle(300);
    assert.equal(door(s, '2').open, 0);
  }
  // Sans l'écho du tableau (a) : la porte 1 reste fermée.
  {
    const s = new Session(loadNoTimer('39-grand-escalier.json'));
    const bot = new Bot(s);
    bot.walkTo(colCenter(23));
    bot.idle(300);
    assert.equal(door(s, '1').open, 0);
  }
  // Sans l'alarme : l'issue de secours reste fermée.
  {
    const s = new Session(load('39-grand-escalier.json'));
    const bot = new Bot(s);
    escalierE1(bot);
    escalierE2(bot);
    escalierA(bot);
    escalierUp1(bot);
    escalierPalier(bot, true);
    escalierUp2(bot);
    bot.walkTo(colCenter(19));
    bot.untilAttemptEnds(0);
    assert.equal(s.attemptCount, 5, 'chrono écoulé, porte fermée');
  }
});

test('39 grand escalier : impossible de sauter le couloir de secours, même en dash', () => {
  const exits = corridorShortcut(() => {
    const s = new Session(load('39-grand-escalier.json'));
    const bot = new Bot(s);
    escalierE1(bot);
    escalierE2(bot);
    escalierB(bot, 60);
    escalierUp1(bot);
    escalierPalier(bot, true);
    escalierUp2(bot);
    bot.holdUntil(IN_RIGHT, () => bot.p.vx === 0 && bot.cx > 18 * TILE, 300);
    assert.equal(s.world.lasers.find((l) => l.sensor).latched, false, 'avant l’alarme');
    return s;
  });
  assert.equal(exits, false);
});

// --- 40. La halle des locomotives -------------------------------------------------------------

/** 40 : deux échos, un dans le tableau, un contre la vitrine, puis la grille s'ouvre. */
function halleEchoes(bot) {
  walkBlind(bot, IN_LEFT, 150);
  bot.s.replay();
  bot.walkTo(colCenter(14));
  bot.idle(30);
  bot.s.replay();
  bot.walkTo(colCenter(14));
  bot.holdUntil(0, () => door(bot.s, '1').open === 12, 400);
}

test('40 locomotives : sans chrono ; deux échos ouvrent la grille, et l’on monte dans le train', () => {
  const s = new Session(load('40-locomotives.json'));
  const bot = new Bot(s);
  assert.equal(s.ticksLeft, null, 'pas de chrono');
  assert.equal(s.level.exitStyle, 'train');
  halleEchoes(bot);
  assert.equal(s.world.buttons.every((b) => b.pressed), true, 'a et b sont tenus');
  bot.walkTo(colCenter(17));
  bot.jump(1);
  assert.equal(bot.exit(IN_RIGHT), 'exit');
});

test('40 locomotives : seul, ou avec un seul écho, la grille reste fermée ; on ne s’assoit qu’au-delà', () => {
  const s = new Session(load('40-locomotives.json'));
  const bot = new Bot(s);
  // Seul : tenir b ne suffit pas, et la grille ne reste pas ouverte derrière soi.
  bot.walkTo(colCenter(12));
  bot.idle(30);
  assert.equal(door(s, '1').open, 0);
  bot.step(IN_DOWN);
  assert.equal(s.outcome, null);
  // Un écho dans le tableau (a), le joueur sur b : il faut encore passer.
  walkBlind(bot, IN_LEFT, 150);
  s.replay();
  bot.walkTo(colCenter(12));
  bot.idle(200);
  assert.equal(door(s, '1').open, 12, 'ouverte tant qu’on est sur b');
  bot.hold(IN_RIGHT, 120);
  assert.ok(bot.p.x < 15 * TILE * SUB, 'la grille s’est refermée devant nous');
});
