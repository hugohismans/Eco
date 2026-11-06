// Chapitre 5 : le train de nuit (niveaux 41 à 50).
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
import { World } from '../src/sim/world.js';
import {
  IN_LEFT, IN_RIGHT, IN_JUMP, IN_UP, IN_DOWN, IN_DASH, IN_GRAB, SUB, TILE,
} from '../src/sim/constants.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (file) => JSON.parse(readFileSync(join(here, '../src/levels', file), 'utf8'));
const load = (file, extra = {}) => parseLevel({ ...raw(file), ...extra });
/** Le même niveau sans chrono (pour les vérifications « seul »). */
const loadNoTimer = (file, extra = {}) => parseLevel({ ...raw(file), duration: null, ...extra });
const colCenter = (c) => c * TILE + TILE / 2;
const rowTop = (r) => r * TILE * SUB;
const px = (v) => v / SUB;

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
    const a = this.s.attempt;
    for (let i = 0; i < max && this.s.attempt === a; i++) {
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
  /** Court vers la droite en dash (un par appui au sol), jusqu'à x. */
  dashTo(x, max = 900) {
    const a = this.s.attempt;
    for (let i = 0; i < max && this.cx < x && this.s.attempt === a; i++) {
      const p = this.p;
      if (!this.step(IN_RIGHT | (p.onGround && p.dashes > 0 && !p.prevDash ? IN_DASH : 0))) return;
    }
    this.holdUntil(0, () => this.p.onGround && this.p.dashing === 0, 30);
  }
  /** Joue une bande écrite « entrée*durée entrée*durée … ». */
  play(rle) {
    for (const part of rle.trim().split(/\s+/)) {
      const [bits, n] = part.split('*').map(Number);
      this.hold(bits, n);
    }
  }
}

const ALL = ['walljump', 'grab', 'dash'];

// --- Le chapitre dans son ensemble ------------------------------------------------------

const CHAPTER5 = [
  ['41-couloir.json', 'couloir'], ['42-compartiment.json', 'compartiment'],
  ['43-controleur.json', 'controleur'], ['44-toit.json', 'toit'], ['45-soufflet.json', 'soufflet'],
  ['46-restaurant.json', 'restaurant'], ['47-couchettes.json', 'couchettes'],
  ['48-tunnel.json', 'tunnel'], ['49-locomotive.json', 'locomotive'], ['50-aube.json', 'aube'],
];
const DECOR_TYPES = new Set([
  'bench', 'lamp', 'pendant', 'window', 'clock', 'poster', 'canopy', 'sign', 'counter',
  'board', 'radiator', 'plant', 'walllamp', 'gantry', 'train', 'skis', 'painting', 'statue',
  'rope', 'seat', 'luggage', 'catenary',
]);

test('chapitre 5 : dix pièces bien formées', () => {
  for (const [file, id] of CHAPTER5) {
    const def = raw(file);
    const level = parseLevel(def);
    assert.equal(level.id, id, file);
    assert.equal(def.chapter, 5, file);
    assert.ok(['wagon', 'toit'].includes(def.theme), file);
    assert.ok(typeof def.name === 'string' && def.name.length > 0, file);
    assert.ok(def.narration.endsWith(' (provisoire)'), file);
    assert.ok(def.decor.length >= 4 && def.decor.length <= 8, `${file} : décor`);
    for (const d of def.decor) assert.ok(DECOR_TYPES.has(d.type), `${file} : décor ${d.type}`);
    for (const d of def.decor.filter((x) => x.type === 'sign')) assert.ok(d.text.length <= 10, `${file} : enseigne`);
    if (id === 'aube') {
      assert.equal(def.duration, null);
      assert.ok(level.chapterEnd, 'l’aube mène au chapitre 6');
    } else {
      assert.ok(def.duration > 0, file);
      assert.ok(!level.chapterEnd, file);
    }
    const expected = id === 'couchettes' ? ['walljump', 'grab'] : ALL;
    assert.deepEqual([...level.abilities], expected, file);
  }
});

// --- 41. Le couloir des voitures --------------------------------------------------------

/** 41 : pousser la valise jusqu'à ce que la plaque s'allume (soi + la valise). */
function couloirPush(bot) {
  bot.holdUntil(IN_RIGHT, () => bot.w.buttons[0].pressed, 400);
}

test('41 couloir : un écho et la valise pèsent assez lourd sur la plaque', () => {
  const s = new Session(load('41-couloir.json'));
  const bot = new Bot(s);
  assert.equal(s.level.maxEchoes, 1);
  // Écho : pousser la valise à moitié sur la plaque, et rester à côté, les pieds dessus.
  couloirPush(bot);
  assert.equal(s.world.buttons[0].count, 2, 'le joueur et la valise');
  bot.untilAttemptEnds();
  // On attend que l'écho refasse la même chose, puis on file en sautant par-dessus.
  bot.holdUntil(0, () => s.world.doors[0].open === 12, 400);
  assert.equal(s.world.buttons[0].count, 2, 'l’écho et la valise');
  bot.walkTo(colCenter(9));
  bot.jump(1);
  assert.equal(bot.exit(IN_RIGHT), 'exit');
});

test('41 couloir : l’écho comme butée, on cale la valise contre lui', () => {
  const s = new Session(load('41-couloir.json'));
  const bot = new Bot(s);
  // Écho : sauter par-dessus la valise et attendre sur la plaque.
  bot.walkTo(colCenter(6));
  bot.jump(1);
  bot.walkTo(colCenter(12));
  bot.untilAttemptEnds();
  // On pousse la valise : elle s'arrête contre l'écho, un pixel sur la plaque.
  bot.holdUntil(IN_RIGHT, () => s.world.buttons[0].pressed, 400);
  assert.equal(s.world.buttons[0].count, 2);
  bot.idle(5);
  bot.jump(1);
  assert.equal(bot.exit(IN_RIGHT), 'exit');
});

test('41 couloir : l’écho et soi sur la plaque, mais il faut partir : la porte se referme', () => {
  const s = new Session(load('41-couloir.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(6));
  bot.jump(1);
  bot.walkTo(colCenter(12));
  bot.untilAttemptEnds();
  bot.walkTo(colCenter(6));
  bot.jump(1);
  bot.walkTo(colCenter(12));
  bot.idle(20);
  assert.equal(s.world.doors[0].open, 12, 'à deux, la porte s’ouvre');
  // On court (et on dash) vers la porte : elle se referme avant qu'on y soit.
  bot.step(IN_RIGHT | IN_DASH);
  assert.equal(bot.exit(IN_RIGHT, 250), null);
  assert.equal(s.world.doors[0].open, 0);
  assert.ok(bot.cx < 23 * TILE);
});

test('41 couloir : un seul écho gardé ; deux échos sur la plaque, c’est impossible ici', () => {
  const s = new Session(load('41-couloir.json'));
  const bot = new Bot(s);
  for (let k = 0; k < 2; k++) {
    bot.walkTo(colCenter(6));
    bot.jump(1);
    bot.walkTo(colCenter(12));
    bot.untilAttemptEnds();
  }
  assert.equal(s.world.actors.length, 2, 'un écho et le joueur');
  bot.idle(250);
  assert.equal(s.world.buttons[0].count, 1);
  assert.equal(s.world.doors[0].open, 0);
});

// --- 42. Le compartiment -----------------------------------------------------------------

/**
 * 42 : monter sur la banquette puis le filet, pousser la valise dans le vide,
 * redescendre derrière elle et la pousser sur la plaque (side -1 : à gauche).
 */
function compartimentBag(bot, side) {
  const s = bot.s;
  const i = side < 0 ? 0 : 1;
  const toward = side < 0 ? IN_RIGHT : IN_LEFT;
  const back = side < 0 ? IN_LEFT : IN_RIGHT;
  bot.walkTo(side < 0 ? colCenter(3) + 2 : colCenter(20) - 2);
  bot.jump(side);
  assert.equal(bot.feet, rowTop(12), 'sur la banquette');
  bot.jump(0);
  assert.equal(bot.feet, rowTop(10), 'sur le filet');
  bot.holdUntil(toward, () => s.world.blocks[i].y > rowTop(9) + 12 * SUB, 300);
  bot.holdUntil(toward, () => bot.p.onGround && bot.feet === rowTop(13), 100);
  bot.hold(back, 3);
  bot.jump(side);
  bot.hold(back, 10);
  bot.idle(10);
  bot.holdUntil(toward, () => s.world.buttons[i].pressed, 400);
}

test('42 compartiment : deux échos descendent chacun une valise du filet sur une plaque', () => {
  const s = new Session(load('42-compartiment.json'));
  const bot = new Bot(s);
  compartimentBag(bot, -1);
  assert.equal(s.world.buttons[0].count, 2, 'la valise et le joueur sur a');
  bot.untilAttemptEnds();
  compartimentBag(bot, 1);
  assert.equal(s.world.buttons[1].count, 2, 'la valise et le joueur sur b');
  bot.untilAttemptEnds();
  bot.holdUntil(0, () => s.world.doors[0].open === 12, 600);
  assert.equal(s.world.buttons.every((b) => b.pressed), true);
  // Par-dessus la valise de b, puis par-dessus la banquette.
  bot.walkTo(colCenter(13));
  bot.jump(1);
  bot.walkTo(colCenter(20));
  bot.jump(1);
  assert.equal(bot.exit(IN_RIGHT), 'exit');
});

test('42 compartiment : un seul écho et ses deux valises : on tient la seconde plaque, mais il faut partir', () => {
  const s = new Session(load('42-compartiment.json'));
  const bot = new Bot(s);
  compartimentBag(bot, -1);
  bot.untilAttemptEnds();
  compartimentBag(bot, 1);
  bot.holdUntil(0, () => s.world.doors[0].open === 12, 100);
  assert.equal(s.world.doors[0].open, 12, 'ouverte tant qu’on reste');
  bot.walkTo(colCenter(19));
  bot.jump(1);
  assert.equal(bot.exit(IN_RIGHT, 200), null);
  assert.equal(s.world.doors[0].open, 0, 'refermée');
});

test('42 compartiment : sans les valises, un écho par plaque ne pèse pas assez', () => {
  const s = new Session(load('42-compartiment.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(8));
  bot.untilAttemptEnds();
  bot.walkTo(colCenter(15));
  bot.untilAttemptEnds();
  bot.walkTo(colCenter(8));
  bot.untilAttemptEnds();
  assert.equal(s.world.actors.length, 3, 'deux échos au plus');
  bot.idle(200);
  assert.deepEqual(s.world.buttons.map((b) => b.pressed), [false, false]);
  assert.equal(s.world.doors[0].open, 0);
});

// --- 43. Le contrôleur ---------------------------------------------------------------------

/** 43 : du filet de départ jusqu'au palier au-dessus de la niche. */
function controleurClimb(bot) {
  bot.walkTo(colCenter(3));
  bot.jump(1);
  assert.equal(bot.feet, rowTop(9), 'sur le second filet');
  bot.walkTo(colCenter(8));
  bot.jump(1);
  assert.equal(bot.feet, rowTop(8), 'sur le palier');
}

test('43 contrôleur : la valise tombée du filet fait écran à la lampe', () => {
  const s = new Session(load('43-controleur.json'));
  const bot = new Bot(s);
  const lamp = () => s.world.lasers[0];
  // Écho : vers la droite ; le joueur bute contre le tableau, l'écho entre dans la niche.
  bot.untilAttemptEnds(IN_RIGHT);
  // On fait tomber la valise du filet, dans le faisceau, avant qu'il ne s'allume.
  bot.holdUntil(IN_LEFT, () => s.world.blocks[0].y > rowTop(11), 100);
  bot.idle(8);
  assert.equal(s.world.blocks[0].y, rowTop(13) - 12 * SUB, 'la valise est au sol');
  bot.holdUntil(0, () => lamp().on, 100);
  bot.idle(2);
  assert.equal(lamp().hit, s.world.blocks[0], 'la lampe s’arrête sur la valise');
  const echo = s.world.actors[0];
  controleurClimb(bot);
  bot.holdUntil(0, () => s.world.buttons[0].pressed, 200);
  assert.equal(echo.x, 11 * TILE * SUB - echo.w, 'l’écho est dans la niche, contre la glace');
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround && bot.feet === rowTop(13), 300);
  assert.equal(bot.exit(IN_RIGHT), 'exit');
  assert.equal(echo.dead, false, 'jamais effacé');
});

test('43 contrôleur : sans écran, la lampe efface l’écho qui tient le bouton', () => {
  const s = new Session(load('43-controleur.json'));
  const bot = new Bot(s);
  bot.untilAttemptEnds(IN_RIGHT);
  const echo = s.world.actors[0];
  controleurClimb(bot);
  bot.holdUntil(IN_RIGHT, () => echo.dead, 200);
  assert.equal(echo.dead, true, 'effacé au premier passage de la lampe');
  bot.holdUntil(IN_RIGHT, () => bot.done, 300);
  assert.equal(s.state, 'playing');
  assert.equal(s.world.doors.every((d) => d.open === 0), true);
});

test('43 contrôleur : profiter d’un seul passage éteint ne laisse pas le temps de passer les deux portes', () => {
  const s = new Session(load('43-controleur.json'));
  const bot = new Bot(s);
  const lamp = () => s.world.lasers[0];
  // Écho : il attend au bout du filet (hors du faisceau) que la lampe passe, puis file en dash.
  bot.walkTo(colCenter(3) + 2);
  bot.holdUntil(0, () => s.world.tick > 70 && !lamp().on, 200);
  bot.step(IN_RIGHT | IN_DASH);
  bot.dashTo(colCenter(8));
  bot.untilAttemptEnds(IN_RIGHT);
  assert.equal(s.world.actors.length, 2);
  // Le joueur attend devant la première porte, et court dès qu'elle s'ouvre (en dash).
  const echo = s.world.actors[0];
  controleurClimb(bot);
  bot.walkTo(colCenter(11));
  bot.holdUntil(0, () => s.world.doors[0].open > 8, 300);
  assert.equal(echo.dead, false, 'l’écho est arrivé au bouton pendant que la lampe était éteinte');
  bot.dashTo(colCenter(23));
  assert.equal(echo.dead, true, 'mais la lampe est revenue l’effacer');
  assert.equal(bot.exit(IN_RIGHT, 200), null);
  assert.ok(bot.cx < 24 * TILE, 'arrêté par la seconde porte');
});

test('43 contrôleur : ni le joueur ni la valise n’entrent dans la niche', () => {
  const s = new Session(loadNoTimer('43-controleur.json'));
  const bot = new Bot(s);
  bot.holdUntil(IN_LEFT, () => s.world.blocks[0].y > rowTop(11), 100);
  bot.idle(10);
  bot.walkTo(colCenter(2));
  bot.hold(IN_LEFT, 20);
  // On pousse la valise jusqu'au tableau : elle bute.
  for (let i = 0; i < 400; i++) bot.step(IN_LEFT);
  bot.hold(IN_RIGHT, 300);
  assert.ok(s.world.blocks[0].x + 14 * SUB <= 9 * TILE * SUB, 'la valise reste devant le tableau');
  assert.ok(bot.p.x + bot.p.w <= 9 * TILE * SUB, 'le joueur aussi');
  assert.equal(s.world.buttons[0].pressed, false);
});

// --- 44. Sur le toit -------------------------------------------------------------------------

/** 44 : sauter dans l'entre-deux voitures et « Rejouer » en pleine chute. */
function toitDrop(bot) {
  bot.walkTo(colCenter(8));
  bot.holdUntil(IN_RIGHT, () => !bot.p.onGround, 100);
  bot.holdUntil(IN_RIGHT, () => bot.feet > rowTop(10), 100);
  assert.equal(bot.p.dead, false);
  bot.s.replay();
}
/** 44 : saut + dash entre deux rafales, depuis le bord d'un toit. */
function toitLeap(bot, edgeCol) {
  bot.holdUntil(IN_RIGHT, () => bot.cx >= edgeCol * TILE + 6, 200);
  bot.hold(IN_RIGHT | IN_JUMP, 8);
  bot.step(IN_RIGHT | IN_DASH);
}

test('44 toit : l’écho tombé entre les voitures dérive avec le vent jusqu’au bouton', () => {
  const s = new Session(load('44-toit.json'));
  const bot = new Bot(s);
  const calm = () => !s.world.winds[0].on;
  toitDrop(bot);
  const echo = s.world.actors[0];
  // On se tient près du bord, contre les rafales, en attendant l'écho.
  while (s.world.tick < 450) bot.step(bot.cx < colCenter(7) ? IN_RIGHT : 0);
  assert.equal(s.world.buttons[0].pressed, true, 'l’écho a dérivé sous la voiture');
  assert.equal(echo.x, 5 * TILE * SUB, 'contre le fond, sur le bouton');
  bot.holdUntil(0, calm, 10);
  toitLeap(bot, 9);
  bot.holdUntil(IN_RIGHT | IN_JUMP, () => bot.p.onGround || bot.p.dead, 100);
  assert.equal(bot.feet, rowTop(8), 'sur la deuxième voiture');
  bot.holdUntil(IN_RIGHT, () => bot.cx >= 21 * TILE + 6 && calm(), 400);
  toitLeap(bot, 21);
  assert.equal(bot.exit(IN_RIGHT, 200), 'exit');
  assert.equal(bot.deaths, 0);
});

test('44 toit : sans vent, l’écho reste au fond, loin du bouton', () => {
  const s = new Session(load('44-toit.json', { winds: [] }));
  const bot = new Bot(s);
  toitDrop(bot);
  bot.idle(600);
  assert.equal(s.world.buttons[0].pressed, false);
  assert.ok(s.world.actors[0].x >= 10 * TILE * SUB, 'toujours dans l’entre-deux');
});

test('44 toit : le joueur ne peut pas tenir le bouton (les rails) ; seul, la porte reste close', () => {
  const s = new Session(loadNoTimer('44-toit.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(8));
  bot.holdUntil(IN_RIGHT, () => bot.p.dead, 200);
  assert.equal(bot.p.dead, true, 'tombé entre les voitures');
  bot.idle(60);
  assert.equal(s.world.actors.length, 1, 'la chute n’est pas enregistrée');
  // Par-dessus les deux fossés, contre la porte fermée : on retombe sur les rails.
  bot.holdUntil(0, () => !s.world.winds[0].on, 300);
  toitLeap(bot, 9);
  bot.holdUntil(IN_RIGHT | IN_JUMP, () => bot.p.onGround || bot.p.dead, 100);
  bot.holdUntil(IN_RIGHT, () => bot.cx >= 21 * TILE + 6 && !s.world.winds[0].on, 400);
  toitLeap(bot, 21);
  bot.holdUntil(IN_RIGHT, () => bot.p.dead || bot.done, 200);
  assert.equal(s.state, 'playing');
  assert.equal(bot.p.dead, true);
});

// --- 45. Le soufflet ---------------------------------------------------------------------

/** 45 : rattraper la valise qui dérive, la laisser filer jusqu'à la plaque, la retenir. */
function souffletCatch(bot) {
  const s = bot.s;
  bot.holdUntil(IN_RIGHT, () => bot.p.pushing, 400);
  bot.holdUntil(0, () => s.world.buttons[0].count === 2, 200);
  assert.equal(s.world.buttons[0].count, 2);
}

test('45 soufflet : l’écho retient la valise contre le vent, sur la plaque', () => {
  const s = new Session(load('45-soufflet.json'));
  const bot = new Bot(s);
  const v = () => s.world.blocks[0];
  souffletCatch(bot);
  const x0 = v().x;
  bot.hold(IN_RIGHT, 60);
  assert.equal(v().x, x0, 'pousser contre le vent : la valise ne bouge plus');
  bot.untilAttemptEnds(IN_RIGHT);
  // On passe par-dessus la valise et l'écho, et l'on remonte le vent jusqu'à la porte.
  bot.walkTo(colCenter(5));
  bot.holdUntil(0, () => s.world.doors[0].open === 12, 300);
  bot.walkTo(colCenter(5));
  bot.jump(1);
  bot.jump(1);
  bot.dashTo(colCenter(19));
  assert.equal(bot.exit(IN_RIGHT, 400), 'exit');
  assert.equal(s.world.buttons[0].count, 2);
});

test('45 soufflet : un écho immobile sur la plaque, le vent l’emporte', () => {
  const s = new Session(load('45-soufflet.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(7));
  bot.untilAttemptEnds();
  const echo = s.world.actors[0];
  bot.idle(60);
  assert.ok(echo.x < 6 * TILE * SUB, 'l’écho a été repoussé dans la voiture');
  assert.equal(s.world.buttons[0].pressed, false);
});

test('45 soufflet : seul avec la valise, la porte ne reste ouverte que tant qu’on pousse', () => {
  const s = new Session(load('45-soufflet.json'));
  const bot = new Bot(s);
  souffletCatch(bot);
  bot.hold(IN_RIGHT, 30);
  assert.equal(s.world.doors[0].open, 12);
  bot.jump(1);
  bot.dashTo(colCenter(19));
  assert.equal(bot.exit(IN_RIGHT, 200), null);
  assert.equal(s.world.doors[0].open, 0);
  // Et un seul écho est gardé : il ne peut pas tenir deux places.
  bot.untilAttemptEnds();
  bot.untilAttemptEnds();
  assert.equal(s.world.actors.length, 2);
});

// --- 46. Le wagon-restaurant --------------------------------------------------------------

/** 46 : l'écho bascule le levier à `t`, puis va sur la plaque. */
function restaurantLever(bot, t) {
  bot.walkTo(colCenter(2));
  bot.holdUntil(0, () => bot.s.world.tick >= t, 400);
  bot.step(IN_DOWN);
  bot.step(0);
  assert.equal(bot.s.world.levers[0].pressed, true);
  bot.walkTo(colCenter(6));
}
const door = (s, id) => s.world.doors.find((d) => d.id === id);

test('46 restaurant : un écho bascule le levier puis rejoint la plaque, l’autre l’y attend', () => {
  const s = new Session(load('46-restaurant.json'));
  const bot = new Bot(s);
  assert.equal(s.level.maxEchoes, 2);
  restaurantLever(bot, 200);
  bot.untilAttemptEnds();
  bot.walkTo(colCenter(6));
  bot.untilAttemptEnds();
  // On passe la première porte (levier levé), et l'on attend entre les deux.
  bot.walkTo(colCenter(18));
  bot.holdUntil(0, () => door(s, '1').open === 12, 400);
  assert.equal(door(s, '2').open, 0, 'la porte s’est refermée derrière nous');
  assert.equal(s.world.buttons[0].count, 2);
  bot.jump(1);
  assert.equal(bot.exit(IN_RIGHT), 'exit');
});

test('46 restaurant : basculer soi-même le levier, puis courir : la porte se ferme avant', () => {
  const s = new Session(load('46-restaurant.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(6));
  bot.untilAttemptEnds();
  bot.walkTo(colCenter(6));
  bot.untilAttemptEnds();
  restaurantLever(bot, 60);
  bot.step(IN_RIGHT | IN_DASH);
  bot.holdUntil(IN_RIGHT, () => bot.done, 200);
  assert.equal(s.state, 'playing');
  assert.ok(bot.cx < 16 * TILE, 'bloqué par la porte de la cuisine');
});

test('46 restaurant : un écho pour le levier, un pour la plaque : la plaque ne pèse pas assez', () => {
  const s = new Session(load('46-restaurant.json'));
  const bot = new Bot(s);
  bot.walkTo(colCenter(2));
  bot.holdUntil(0, () => s.world.tick >= 200, 400);
  bot.step(IN_DOWN);
  bot.untilAttemptEnds();
  bot.walkTo(colCenter(6));
  bot.untilAttemptEnds();
  bot.walkTo(colCenter(18));
  bot.idle(250);
  assert.equal(s.world.levers[0].pressed, true);
  assert.equal(s.world.buttons[0].count, 1);
  assert.equal(door(s, '1').open, 0);
  // Un troisième écho n'est pas gardé : la plaque n'aura jamais que ces deux-là.
  bot.untilAttemptEnds();
  assert.equal(s.world.actors.length, 3);
});

// --- 47. Les couchettes ------------------------------------------------------------------------

const BUNK = colCenter(13);
/** 47 : monter sur l'écho du bas, attendre, puis sur la couchette (et sur l'écho 2). */
function couchetteClimb(bot, waitUntil, levels) {
  bot.walkTo(BUNK);
  bot.holdUntil(0, () => bot.s.world.tick > waitUntil, 400);
  for (let k = 0; k < levels; k++) bot.jump(0);
}
const sweep = (s) => s.world.lasers.some((l) => l.on);

test('47 couchettes : la tour d’échos se bâtit sur la couchette quand la lampe est passée', () => {
  const s = new Session(load('47-couchettes.json'));
  const bot = new Bot(s);
  // Écho 1, au sol, sous la couchette.
  bot.walkTo(BUNK);
  bot.untilAttemptEnds();
  // Écho 2 : sur l'écho 1, on laisse passer la lampe, puis sur la couchette.
  couchetteClimb(bot, 200, 2);
  assert.equal(bot.feet, rowTop(10), 'sur la couchette');
  bot.untilAttemptEnds();
  // Écho 3 : même chemin, un peu plus tard, jusque sur la tête de l'écho 2.
  couchetteClimb(bot, 213, 3);
  assert.equal(bot.p.ground, s.world.actors[1]);
  bot.untilAttemptEnds();
  // Le joueur : écho 1, couchette, écho 2, écho 3, et la couchette du haut.
  couchetteClimb(bot, 230, 5);
  assert.equal(s.outcome, 'exit');
  assert.equal(s.world.actors.every((a) => !a.dead), true);
});

test('47 couchettes : monter trop tôt, la lampe balaie la couchette et efface les échos', () => {
  const s = new Session(load('47-couchettes.json'));
  const bot = new Bot(s);
  bot.walkTo(BUNK);
  bot.untilAttemptEnds();
  couchetteClimb(bot, 0, 2);
  assert.equal(bot.feet, rowTop(10));
  bot.untilAttemptEnds();
  const e2 = s.world.actors[1];
  bot.holdUntil(0, () => sweep(s), 300);
  bot.idle(70);
  assert.equal(e2.dead, true, 'effacé sur la couchette');
  assert.equal(e2.erased, true);
});

test('47 couchettes : deux échos ne suffisent pas, et trois au sol non plus', () => {
  const s = new Session(load('47-couchettes.json'));
  const bot = new Bot(s);
  bot.walkTo(BUNK);
  bot.untilAttemptEnds();
  couchetteClimb(bot, 200, 2);
  bot.untilAttemptEnds();
  couchetteClimb(bot, 230, 4);
  assert.equal(bot.p.ground, s.world.actors[0].index === 0 ? s.world.actors[1] : null, 'sur l’écho 2');
  bot.jump(0);
  assert.equal(s.state, 'playing', 'la couchette du haut est trop loin');
  // Trois échos empilés au sol : on atteint la couchette du bas, pas celle du haut.
  s.restart();
  for (let k = 0; k < 3; k++) {
    bot.walkTo(BUNK);
    bot.idle(30 * k);
    for (let j = 0; j < k; j++) bot.jump(0);
    bot.untilAttemptEnds();
  }
  bot.walkTo(BUNK);
  bot.idle(100);
  for (let j = 0; j < 3; j++) bot.jump(0);
  assert.equal(bot.p.ground, s.world.actors[2], 'au sommet de la pile');
  bot.jump(0);
  assert.equal(s.state, 'playing');
});

test('47 couchettes : seul, ni le saut ni le mur ne mènent à une couchette', () => {
  const s = new Session(loadNoTimer('47-couchettes.json'));
  const bot = new Bot(s);
  bot.walkTo(BUNK);
  bot.jump(0);
  assert.equal(bot.feet, rowTop(13), 'la couchette du bas est trop haute');
  // On grimpe le mur de gauche aussi haut que possible, puis on saute vers les couchettes.
  bot.walkTo(colCenter(1));
  bot.hold(IN_LEFT | IN_JUMP, 10);
  bot.holdUntil(IN_LEFT | IN_GRAB | IN_UP, () => !bot.p.climbing && bot.p.stamina < 20, 200);
  bot.hold(IN_RIGHT | IN_JUMP, 20);
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround, 200);
  assert.equal(bot.feet, rowTop(13), 'retombé au sol');
});

test('47 couchettes : avec le dash, on monterait sans échos (c’est pourquoi il est retiré)', () => {
  const s = new Session(parseLevel({ ...raw('47-couchettes.json'), abilities: ALL, duration: null }));
  const bot = new Bot(s);
  bot.walkTo(BUNK);
  bot.hold(IN_JUMP, 14);
  bot.step(IN_UP | IN_DASH);
  bot.holdUntil(0, () => bot.p.onGround, 120);
  assert.equal(bot.feet, rowTop(10), 'sur la couchette du bas, seul');
});

// --- 48. Le tunnel -------------------------------------------------------------------------------

// Bandes d'entrées (entrée*durée) : 2 = droite, 6 = droite + saut, 66 = dash à droite,
// 82 = dash en diagonale vers le haut à droite, 0 = rien.
const TUNNEL = {
  // Courir en dash, sauter, et se jeter dans le premier fossé au-delà de la vitre.
  e1: '2*2 66*1 2*15 66*1 2*36 6*28 66*1 2*19',
  // Même départ, sur la tête de l'écho 1, puis le deuxième fossé.
  e2: '2*2 66*1 2*15 66*1 2*41 6*28 82*1 2*35 6*8 66*1 2*25 66*1 2*8 0*1 2*60 6*28 66*1 2*19',
  // Écho 1, toit, écho 2, toit, sortie.
  last: '2*2 66*1 2*15 66*1 2*41 6*28 82*1 2*35 6*8 66*1 2*25 66*1 2*8 0*13 2*8 0*3 2*5 0*2 2*2 '
    + '0*2 2*3 0*2 2*2 0*2 2*3 0*2 2*2 0*2 2*3 0*2 2*2 0*2 2*3 0*2 2*2 0*2 2*3 0*2 2*2 0*2 2*3 '
    + '0*2 2*2 0*2 2*3 0*2 2*2 0*2 2*3 0*2 2*2 0*2 2*3 0*2 2*53 6*28 66*1 2*39 6*10 66*1 2*16 '
    + '66*103',
};

test('48 tunnel : deux échos se posent contre les vitres, deux marches au-dessus des rails', () => {
  const s = new Session(load('48-tunnel.json'));
  const bot = new Bot(s);
  bot.play(TUNNEL.e1);
  s.replay();
  bot.play(TUNNEL.e2);
  s.replay();
  const [e1, e2] = s.world.actors;
  bot.play(TUNNEL.last);
  assert.equal(s.outcome, 'exit');
  assert.equal(bot.deaths, 0);
  // Le vent les a calés contre les vitres, au fond des fossés.
  assert.equal(e1.x, 10 * TILE * SUB);
  assert.equal(e2.x, 19 * TILE * SUB);
  assert.equal(e1.y + e1.h, rowTop(13));
});

test('48 tunnel : seul, aucun saut ni dash ne franchit le premier fossé', () => {
  const lv = loadNoTimer('48-tunnel.json');
  const base = new World(lv);
  for (let i = 0; i < 600 && (base.player.x + 80) / 16 < 90; i++) {
    const p = base.player;
    base.step(IN_RIGHT | (p.onGround && p.dashes > 0 && !p.prevDash ? IN_DASH : 0));
  }
  let best = 0;
  for (let pre = 30; pre < 110; pre += 2) {
    for (const jt of [0, 1, 3, 6, 10, 14]) {
      for (const dd of [IN_RIGHT, IN_RIGHT | IN_UP]) {
        for (const dt of [0, 4, 8, 12]) {
          const w = new World(lv);
          // Rejouer les mêmes entrées depuis le début : le monde est déterministe.
          for (let i = 0; i < 600 && (w.player.x + 80) / 16 < 90; i++) {
            const p = w.player;
            w.step(IN_RIGHT | (p.onGround && p.dashes > 0 && !p.prevDash ? IN_DASH : 0));
          }
          for (let i = 0; i < pre; i++) w.step(IN_RIGHT);
          for (let i = 0; i < jt + dt; i++) w.step(IN_RIGHT | (i < jt ? IN_JUMP : 0));
          w.step(dd | IN_DASH);
          for (let i = 0; i < 80 && !w.player.dead; i++) {
            w.step(IN_RIGHT | IN_JUMP);
            best = Math.max(best, w.player.x);
            assert.ok(!(w.player.onGround && w.player.x > 12 * TILE * SUB), 'jamais sur le toit d’en face');
          }
        }
      }
    }
  }
  assert.ok(px(best) < 13 * TILE - 20, `au mieux ${px(best)} px`);
});

test('48 tunnel : « Rejouer » trop tôt, l’écho retombe sur le toit et le vent le ramène à la lampe', () => {
  const s = new Session(load('48-tunnel.json'));
  const bot = new Bot(s);
  bot.play('2*2 66*1 2*15 66*1 2*36 6*10');
  s.replay();
  const echo = s.world.actors[0];
  bot.holdUntil(0, () => echo.dead, 400);
  assert.equal(echo.erased, true, 'effacé par la lampe du signal');
});

// --- 49. La locomotive ---------------------------------------------------------------------

/** 49 : courir jusqu'au bord du tender et sauter le fossé (saut + dash). */
function locoCross(bot) {
  bot.dashTo(colCenter(10));
  bot.holdUntil(IN_RIGHT, () => bot.cx >= 188, 60);
  bot.hold(IN_RIGHT | IN_JUMP, 10);
  bot.step(IN_RIGHT | IN_DASH);
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround || bot.p.dead, 80);
  assert.equal(bot.feet, rowTop(9), 'sur la locomotive');
}
/** 49 : se jeter dans le fossé et « Rejouer » en pleine chute. */
function locoDrop(bot) {
  bot.dashTo(colCenter(10));
  bot.holdUntil(IN_RIGHT, () => !bot.p.onGround, 60);
  bot.holdUntil(IN_RIGHT, () => bot.feet > rowTop(10), 60);
  assert.equal(bot.p.dead, false);
  bot.s.replay();
}
/** 49 : écho de la valise : la rattraper, la laisser filer jusqu'à la plaque, la retenir. */
function locoBag(bot) {
  locoCross(bot);
  bot.dashTo(colCenter(16));
  bot.holdUntil(IN_RIGHT, () => bot.p.pushing, 200);
  bot.holdUntil(0, () => bot.s.world.buttons[0].count === 2, 200);
  assert.equal(bot.s.world.buttons[0].count, 2, 'la valise et l’écho sur a');
  bot.untilAttemptEnds(IN_RIGHT);
}

test('49 locomotive : valise contre le vent, deux échos sous le tender, et la lampe à éviter', () => {
  const s = new Session(load('49-locomotive.json'));
  const bot = new Bot(s);
  assert.equal(s.level.maxEchoes, 3);
  locoBag(bot);
  locoDrop(bot);
  locoDrop(bot);
  // Dernière tentative : passer le fossé, sauter la valise, attendre la porte.
  locoCross(bot);
  bot.dashTo(colCenter(15));
  bot.jump(1);
  bot.jump(1);
  bot.dashTo(colCenter(23));
  bot.holdUntil(IN_RIGHT, () => s.world.doors[0].open === 12, 400);
  assert.deepEqual(s.world.buttons.map((b) => b.count), [2, 2]);
  assert.ok(s.world.tick < 480, 'avant que la lampe ne revienne');
  assert.equal(bot.exit(IN_RIGHT, 100), 'exit');
});

test('49 locomotive : si l’on traîne, la lampe efface les échos du bouton et la porte se referme', () => {
  const s = new Session(load('49-locomotive.json'));
  const bot = new Bot(s);
  locoBag(bot);
  locoDrop(bot);
  locoDrop(bot);
  locoCross(bot);
  bot.dashTo(colCenter(15));
  bot.jump(1);
  bot.jump(1);
  bot.holdUntil(0, () => s.world.tick >= 500, 600);
  assert.equal(s.world.actors.filter((a) => a.erased).length, 2);
  bot.dashTo(colCenter(23));
  assert.equal(bot.exit(IN_RIGHT, 200), null);
  assert.equal(s.world.doors[0].open, 0);
});

test('49 locomotive : trois échos au plus : sans la valise, il en faudrait quatre', () => {
  const s = new Session(load('49-locomotive.json'));
  const bot = new Bot(s);
  // Un seul écho sous le tender : le bouton lourd ne s'enfonce pas.
  locoBag(bot);
  locoDrop(bot);
  bot.idle(420);
  assert.equal(s.world.buttons[1].count, 1);
  assert.equal(s.world.doors[0].open, 0);
  // Une quatrième tentative chasse la plus ancienne : la valise n'est plus retenue.
  s.replay();
  bot.untilAttemptEnds();
  assert.equal(s.world.actors.length, 4);
  bot.idle(300);
  assert.equal(s.world.buttons[0].count < 2, true);
});

// --- 50. L'aube ----------------------------------------------------------------------------------

/** 50 : sauter l'entre-deux voitures, avant la première rafale. */
function aubeCross(bot) {
  bot.walkTo(colCenter(7));
  bot.holdUntil(IN_RIGHT, () => bot.cx >= 9 * TILE - 2, 100);
  bot.hold(IN_RIGHT | IN_JUMP, 8);
  bot.step(IN_RIGHT | IN_DASH);
  bot.holdUntil(IN_RIGHT, () => bot.p.onGround || bot.p.dead, 80);
  assert.equal(bot.p.dead, false);
}

test('50 aube : deux échos restent sur la plaque, on entre dans la cabine', () => {
  const s = new Session(load('50-aube.json'));
  const bot = new Bot(s);
  assert.equal(s.level.duration, null);
  for (let k = 0; k < 2; k++) {
    aubeCross(bot);
    bot.walkTo(colCenter(18));
    bot.idle(20);
    s.replay();
  }
  aubeCross(bot);
  bot.walkTo(colCenter(20));
  bot.holdUntil(0, () => s.world.doors[0].open === 12, 300);
  assert.equal(bot.exit(IN_RIGHT), 'exit');
  assert.equal(s.level.chapterEnd, true, 'la cabine mène au chapitre suivant');
});

test('50 aube : un seul écho sur la plaque ne suffit pas', () => {
  const s = new Session(load('50-aube.json'));
  const bot = new Bot(s);
  aubeCross(bot);
  bot.walkTo(colCenter(18));
  bot.idle(20);
  s.replay();
  aubeCross(bot);
  bot.walkTo(colCenter(23));
  bot.idle(200);
  assert.equal(s.world.doors[0].open, 0);
  assert.equal(bot.exit(IN_RIGHT, 200), null);
});
