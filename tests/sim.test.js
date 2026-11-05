// Tests de la simulation : déterminisme, fidélité des échos, niveaux solubles.
// Lancement : npm test (node --test, sans dépendance).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseLevel } from '../src/sim/level.js';
import { Session } from '../src/sim/session.js';
import { World } from '../src/sim/world.js';
import { IN_LEFT, IN_RIGHT, IN_JUMP, SUB, MAX_ECHOES } from '../src/sim/constants.js';

const here = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(here, '../src/levels');
const load = (file) => parseLevel(JSON.parse(readFileSync(join(levelsDir, file), 'utf8')));

/** Construit une bande d'entrées à partir de segments [entrée, durée]. */
function tape(...segments) {
  const out = [];
  for (const [bits, ticks] of segments) for (let i = 0; i < ticks; i++) out.push(bits);
  return Uint8Array.from(out);
}

/** Instantané comparable de l'état d'un monde. */
function snapshot(world) {
  return JSON.stringify({
    actors: world.actors.map((a) => [a.x, a.y, a.vx, a.vy, a.onGround]),
    doors: world.doors.map((d) => d.open),
    buttons: world.buttons.map((b) => b.pressed),
    won: world.won,
  });
}

test('tous les niveaux se lisent sans erreur', () => {
  for (const f of readdirSync(levelsDir).filter((f) => f.endsWith('.json'))) load(f);
});

test('la simulation est déterministe', () => {
  const level = load('01-quai.json');
  const t = tape([IN_RIGHT, 30], [IN_RIGHT | IN_JUMP, 10], [IN_RIGHT, 20], [0, 15], [IN_LEFT | IN_JUMP, 25]);
  const run = () => {
    const w = new World(level);
    const states = [];
    for (const bits of t) { w.step(bits); states.push(snapshot(w)); }
    return states;
  };
  assert.deepEqual(run(), run());
});

test("un écho refait exactement le trajet de la tentative qu'il rejoue", () => {
  const level = load('01-quai.json');
  const s = new Session(level);
  const t = tape([IN_RIGHT, 20], [IN_RIGHT | IN_JUMP, 12], [IN_RIGHT, 8], [0, 10], [IN_JUMP, 6], [0, 20]);
  const original = [];
  for (const bits of t) { s.step(bits); original.push([s.world.player.x, s.world.player.y]); }
  s.replay();
  assert.equal(s.world.actors.length, 2);
  const echo = s.world.actors[0];
  const replayed = [];
  for (let i = 0; i < t.length; i++) { s.step(0); replayed.push([echo.x, echo.y]); }
  assert.deepEqual(replayed, original);
});

test('le chrono écoulé crée un écho ; au plus 4 échos ; Recommencer les efface', () => {
  const level = load('02-hall.json');
  const s = new Session(level);
  for (let k = 0; k < MAX_ECHOES + 2; k++) {
    for (let i = 0; i < level.duration; i++) s.step(0);
  }
  assert.equal(s.attempt, MAX_ECHOES + 3);
  assert.equal(s.world.actors.length, MAX_ECHOES + 1);
  s.restart();
  assert.equal(s.world.actors.length, 1);
});

test('niveau 1 : on atteint la sortie en marchant et en sautant la marche', () => {
  const s = new Session(load('01-quai.json'));
  for (let i = 0; i < 600 && s.state === 'playing'; i++) {
    const p = s.world.player;
    // Saute quand on est collé à la marche.
    const bits = IN_RIGHT | (p.vx === 0 && p.onGround && i > 5 ? IN_JUMP : 0);
    s.step(bits);
  }
  assert.equal(s.state, 'won');
});

test("niveau 2 : seul, la porte se referme ; avec un écho sur le bouton, on passe", () => {
  const level = load('02-hall.json');
  const button = level.buttons[0];
  const s = new Session(level);

  // Tentative 1 : courir jusqu'au bouton, puis tenter la porte : elle se referme.
  for (let i = 0; i < level.duration; i++) s.step(IN_RIGHT);
  assert.equal(s.state, 'playing', 'la porte doit être infranchissable sans aide');
  assert.equal(s.attempt, 2);

  // On efface : tentative 1' : s'arrêter sur le bouton et y rester.
  s.restart();
  let stopped = false;
  for (let i = 0; i < level.duration - 1; i++) {
    const p = s.world.player;
    const cx = p.x + (p.w >> 1);
    if (cx >= button.x + 2 * SUB) stopped = true;
    s.step(stopped ? 0 : IN_RIGHT);
  }
  assert.equal(s.world.buttons[0].pressed, true, 'le joueur est resté sur le bouton');
  assert.equal(s.world.doors[0].open > 0, true, 'la porte est ouverte');
  s.step(0); // fin du chrono
  assert.equal(s.world.actors.length, 2, "l'écho est créé");

  // Tentative 2 : courir vers la sortie pendant que l'écho tient le bouton.
  for (let i = 0; i < level.duration && s.state === 'playing'; i++) s.step(IN_RIGHT);
  assert.equal(s.state, 'won');
});

test("courte échelle : le joueur peut se tenir sur la tête d'un écho", () => {
  const level = load('02-hall.json');
  const s = new Session(level);
  for (let i = 0; i < 30; i++) s.step(0); // l'écho reste au départ
  s.replay();
  for (let i = 0; i < 20; i++) s.step(0);
  s.step(IN_JUMP);
  for (let i = 0; i < 60; i++) s.step(IN_JUMP);
  const [echo, player] = s.world.actors;
  assert.equal(player.onGround, true);
  assert.equal(player.ground, echo);
  assert.equal(player.y + player.h, echo.y);
});
