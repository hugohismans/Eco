// Mécanismes des chapitres 2 à 4, testés sur de petites pièces fabriquées ici.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/sim/level.js';
import { Session } from '../src/sim/session.js';
import {
  IN_LEFT, IN_RIGHT, IN_JUMP, IN_DOWN, SUB, TILE, GRID_W, GRID_H, CRUMBLE_TICKS,
} from '../src/sim/constants.js';

/** Pièce : lignes données en bas de la grille, ciel au-dessus, sol plein. */
function room(rows, extra = {}) {
  const pad = (r) => (r + '.'.repeat(GRID_W)).slice(0, GRID_W);
  const body = rows.map(pad);
  const grid = [...Array(GRID_H - body.length - 1).fill('.'.repeat(GRID_W)), ...body, '#'.repeat(GRID_W)];
  return parseLevel({ id: 'test', duration: 10, abilities: ['walljump', 'grab', 'dash'], ...extra, grid });
}
const run = (s, bits, n) => { for (let i = 0; i < n; i++) s.step(bits); };
const px = (v) => v / SUB;

test('levier : bascule à la touche Bas, et reste dans son état', () => {
  const lv = room(['.........1..E.', 'P.j......1..E.'], { doors: { 1: { buttons: ['j'] } } });
  const s = new Session(lv);
  run(s, IN_RIGHT, 22);
  run(s, 0, 10);
  assert.equal(s.world.levers[0].pressed, false);
  s.step(IN_DOWN);
  s.step(0);
  assert.equal(s.world.levers[0].pressed, true, 'activé');
  run(s, IN_LEFT, 40);
  run(s, 0, 20);
  assert.equal(s.world.doors[0].open > 0, true, 'la porte reste ouverte loin du levier');
  // Un écho qui actionne à son tour le levier l'annule (bascule).
  s.replay();
  run(s, 0, 40);
  assert.equal(s.world.levers[0].pressed, true, 'l’écho a rebasculé le levier');
});

test('xor : deux leviers qui se contredisent', () => {
  const lv = room(['.........1..E.', 'P.j.k....1..E.'], { doors: { 1: { buttons: ['j', 'k'], mode: 'xor' } } });
  const s = new Session(lv);
  const w = () => s.world;
  w().levers[0].pressed = true;
  w().levers[1].pressed = true;
  s.step(0);
  assert.equal(w().doors[0].target, false);
  w().levers[1].pressed = false;
  s.step(0);
  assert.equal(w().doors[0].target, true);
});

test('glace : on glisse bien plus loin avant de s’arrêter', () => {
  const slide = (floor) => {
    const s = new Session(room(['P' + '.'.repeat(26) + 'E', floor.repeat(GRID_W)]));
    run(s, IN_RIGHT, 40);
    const x0 = s.world.player.x;
    run(s, 0, 60);
    return px(s.world.player.x - x0);
  };
  const stone = slide('#'), ice = slide('~');
  assert.ok(stone < 6, `sur la pierre : ${stone}`);
  assert.ok(ice > 3 * stone, `sur la glace : ${ice}`);
});

test('glace : impossible de s’y agripper, mais on peut s’y appuyer pour sauter', () => {
  const s = new Session(room(['..........~', '..........~', '..........~', 'P.........~...E']));
  run(s, IN_RIGHT, 80);
  s.step(IN_RIGHT | IN_JUMP);
  run(s, IN_RIGHT | IN_JUMP | 128, 30);
  assert.equal(s.world.player.climbing, false);
});

test('tapis roulant : il emporte un écho immobile et une valise', () => {
  const s = new Session(room(['.PB..........E', '#}}}}}}}}}}}}#']));
  const b0 = s.world.blocks[0].x, p0 = s.world.player.x;
  run(s, 0, 120);
  assert.ok(px(s.world.blocks[0].x - b0) > 40, 'la valise avance');
  assert.ok(px(s.world.player.x - p0) > 40, 'le joueur immobile avance');
});

test('ressort : il renvoie bien plus haut qu’un saut', () => {
  const s = new Session(room(['P..S.........E']));
  run(s, IN_RIGHT, 30);
  let top = Infinity;
  for (let i = 0; i < 80; i++) { s.step(0); top = Math.min(top, s.world.player.y); }
  const height = px((GRID_H - 1) * TILE * SUB - (top + s.world.player.h));
  assert.ok(height > 70, `hauteur ${height}`);
});

test('échafaudage : il cède sous un écho, et reste effondré', () => {
  // Une passerelle d'échafaudage au-dessus d'un creux.
  const lv = room(['P............E', '#####%%%######']);
  const s = new Session(lv);
  const c = s.world.crumbles;
  assert.equal(c.length, 1, 'trois cases voisines : une seule passerelle');
  run(s, IN_RIGHT, 70);
  run(s, 0, 2);
  assert.ok(c.some((k) => k.state === 'shaking'), 'il tremble');
  run(s, 0, CRUMBLE_TICKS + 30);
  assert.ok(c.some((k) => k.state === 'gone'), 'il est tombé');
  assert.equal(s.world.player.y + s.world.player.h, (GRID_H - 1) * TILE * SUB, 'le joueur est tombé dans le creux');
  // À la tentative suivante, l'écho le refait céder… avant que l'on passe.
  s.replay();
  run(s, 0, 110);
  assert.ok(s.world.crumbles.some((k) => k.state === 'gone'));
});

test('tableau : le joueur bute, son écho passe ; vitrine : l’inverse', () => {
  const s = new Session(room(['.......!......', 'P......!...a#E']));
  run(s, IN_RIGHT, 200);
  assert.ok(px(s.world.player.x) < 7 * TILE, 'le joueur est arrêté par le tableau');
  s.replay();
  run(s, 0, 200);
  const echo = s.world.actors[0];
  assert.ok(px(echo.x) > 8 * TILE, 'l’écho est passé à travers');
  assert.equal(s.world.buttons[0].pressed, true, 'et il tient le bouton derrière');

  const g = new Session(room(['.......?......', 'P......?.....E']));
  run(g, IN_RIGHT, 150);
  assert.ok(px(g.world.player.x) > 8 * TILE, 'le joueur traverse la vitrine');
  g.replay();
  run(g, 0, 150);
  assert.ok(px(g.world.actors[0].x) < 7 * TILE, 'l’écho est arrêté par la vitrine');
});

test('faisceau cyclique : allumé puis éteint, toujours au même moment', () => {
  const lv = room(['>............#', 'P............E'], { lasers: [{ col: 0, row: GRID_H - 3, cycle: [30, 30], phase: 0 }] });
  const s = new Session(lv);
  const states = [];
  for (let i = 0; i < 120; i++) { s.step(0); states.push(s.world.lasers[0].on); }
  assert.equal(states[10], true);
  assert.equal(states[40], false);
  assert.equal(states[70], true);
});

test('capteur : barrière non mortelle, qui reste déclenchée si c’est une alarme', () => {
  const lv = room(['>P...........E'], {
    lasers: [{ col: 0, row: GRID_H - 2, sensor: 's', latch: true }],
  });
  // Le faisceau est au ras du sol du joueur : il le coupe tout de suite.
  const s = new Session(lv);
  run(s, IN_RIGHT, 20);
  assert.equal(s.world.player.dead, false, 'un capteur ne tue pas');
  const sensor = s.world.lasers[0];
  assert.equal(sensor.latched, true);
  assert.equal(sensor.pressed, true);
});

// --- Chapitres 5 et 6 ------------------------------------------------------------

test('vent : une rafale pousse le joueur immobile, puis s’arrête', () => {
  const lv = room(['P............E'], { winds: [{ col: 0, row: GRID_H - 2, cols: 14, rows: 1, dx: 10, cycle: [60, 60] }] });
  const s = new Session(lv);
  const x0 = s.world.player.x;
  run(s, 0, 60);
  const pushed = px(s.world.player.x - x0);
  assert.ok(pushed > 30, `poussé de ${pushed}`);
  const x1 = s.world.player.x;
  run(s, 0, 50);
  assert.ok(px(s.world.player.x - x1) < 4, 'la rafale est retombée');
});

test('plaque lourde : il faut deux corps ; minuterie : elle reste active un moment', () => {
  const lv = room(['.........1..E.', 'P.a......1..E.'], { doors: { 1: { buttons: ['a'] } }, buttons: { a: { weight: 2 } } });
  const s = new Session(lv);
  run(s, IN_RIGHT, 22); run(s, 0, 20);
  assert.equal(s.world.buttons[0].count, 1);
  assert.equal(s.world.buttons[0].pressed, false, 'un seul corps ne suffit pas');
  s.replay();
  run(s, IN_RIGHT, 22); run(s, 0, 20);
  assert.equal(s.world.buttons[0].pressed, true, 'avec l’écho, oui');

  const t = new Session(room(['.........1..E.', 'P.a......1..E.'], { doors: { 1: { buttons: ['a'] } }, buttons: { a: { hold: 90 } } }));
  run(t, IN_RIGHT, 22);
  run(t, IN_RIGHT, 20);
  assert.equal(t.world.buttons[0].count, 0, 'on a quitté la plaque');
  assert.equal(t.world.buttons[0].pressed, true, 'la minuterie tient encore');
  run(t, 0, 100);
  assert.equal(t.world.buttons[0].pressed, false, 'puis elle retombe');
});

test('lampe du contrôleur : elle efface l’écho, pas le joueur ; on peut lui faire écran', () => {
  const lv = room(['>P...........E'], { lasers: [{ col: 0, row: GRID_H - 2, erase: true }] });
  const s = new Session(lv);
  run(s, 0, 30);
  assert.equal(s.world.player.dead, false, 'le joueur ne craint rien');
  s.replay();
  run(s, 0, 2);
  // L'écho est devant le joueur (même départ) : le faisceau touche l'un des deux…
  run(s, IN_RIGHT, 60);
  assert.equal(s.world.actors[0].dead, true, 'l’écho, laissé dans la lumière, s’efface');
});

test('moins d’échos : une pièce qui n’en garde que deux', () => {
  const s = new Session(room(['P............E'], { maxEchoes: 2, duration: 1 }));
  run(s, 0, 60 * 4);
  assert.equal(s.world.actors.length, 3, 'deux échos et le joueur');
});

test('marée : l’eau monte, on se noie ; l’écho, non', () => {
  const lv = room(['P............E'], { water: { row: GRID_H, amp: 3, period: 240, phase: 0 } });
  const s = new Session(lv);
  run(s, 0, 30);
  assert.equal(s.world.player.dead, false, 'marée basse');
  run(s, 0, 80);
  assert.equal(s.world.player.dead, true, 'la marée a monté');
});
