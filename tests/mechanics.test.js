// Mécanismes des chapitres 2 à 4, testés sur de petites pièces fabriquées ici.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../src/sim/level.js';
import { Session } from '../src/sim/session.js';
import {
  IN_LEFT, IN_RIGHT, IN_JUMP, IN_DOWN, IN_DASH, SUB, TILE, GRID_W, GRID_H, CRUMBLE_TICKS,
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

// --- Chapitres 7 à 9 --------------------------------------------------------------

test('reflet : l’écho part de « Q » et rejoue nos gestes à l’envers', () => {
  const s = new Session(room(['.............E', 'P............Q'], { echo: { mirror: true } }));
  const x0 = s.world.player.x;
  run(s, IN_RIGHT, 40);
  const moved = s.world.player.x - x0;
  s.replay();
  const e = s.world.actors[0];
  assert.equal(px(e.x), 13 * TILE + 3, 'il part de Q');
  const e0 = e.x;
  run(s, 0, 40);
  assert.equal(e.x - e0, -moved, 'même distance, vers la gauche');
  assert.equal(s.world.player.x, x0, 'nous, on repart de P');

  // Sans « mirror » : les mêmes gestes, d'ailleurs.
  const t = new Session(room(['.............E', 'P............Q']));
  run(t, IN_RIGHT, 40);
  t.replay();
  const f0 = t.world.actors[0].x;
  run(t, 0, 40);
  assert.equal(t.world.actors[0].x - f0, moved);
});

test('tourniquet : on passe dans un sens, pas dans l’autre', () => {
  const s = new Session(room(['##############', '....).........', 'P...)........E']));
  run(s, IN_RIGHT, 120);
  assert.ok(px(s.world.player.x) > 6 * TILE, 'passé vers la droite');
  run(s, IN_LEFT, 200);
  assert.equal(px(s.world.player.x), 5 * TILE, 'arrêté au retour, contre le tourniquet');
  s.step(IN_LEFT | IN_DASH);
  run(s, IN_LEFT, 20);
  assert.equal(px(s.world.player.x), 5 * TILE, 'même en dash');

  const g = new Session(room(['##############', '....(.........', 'P...(........E']));
  run(g, IN_RIGHT, 120);
  assert.ok(px(g.world.player.x) < 4 * TILE, 'celui-ci ne s’ouvre que vers la gauche');
});

test('miroir : le faisceau tourne à angle droit et atteint un récepteur', () => {
  // L'émetteur tire vers la droite ; le miroir « / » le renvoie vers le haut, dans le récepteur.
  const lv = room(['......s.......', '..............', '#>..../.......', 'P.........1..E', '..........1..E'].slice(0, 4), {
    doors: { 1: { buttons: ['s'] } },
    lasers: [{ col: 1, row: GRID_H - 3, sensor: 'c' }],
  });
  const s = new Session(lv);
  const l = s.world.lasers[0];
  assert.equal(l.segs.length, 2, 'deux portions');
  assert.equal(l.segs[1].dy, -1, 'la seconde monte');
  assert.equal(s.world.receivers[0].pressed, true, 'récepteur éclairé dès le départ');
  assert.equal(s.world.doors[0].open > 0, true, 'la porte commence ouverte');
});

test('miroir pivotant : un levier change la route de la lumière', () => {
  const lv = room(['......s.......', '..............', '#>....\\.......', '..............', '......t.......', 'P.j...#......E'], {
    mirrors: [{ col: 6, row: GRID_H - 5, buttons: ['j'] }],
    lasers: [{ col: 1, row: GRID_H - 5, sensor: 'c' }],
  });
  const s = new Session(lv);
  const [top, bottom] = s.world.receivers;
  assert.equal(bottom.pressed, true, '« \\ » : vers le bas');
  assert.equal(top.pressed, false);
  run(s, IN_RIGHT, 22); run(s, 0, 10);
  s.step(IN_DOWN); run(s, 0, 3);
  assert.equal(top.pressed, true, 'basculé : vers le haut');
  assert.equal(bottom.pressed, false);
});

test('récepteur : un corps dans le faisceau lui fait de l’ombre', () => {
  const lv = room(['.............E', '>P..........s#'], { lasers: [{ col: 0, row: GRID_H - 2, sensor: 'c' }] });
  const s = new Session(lv);
  run(s, 0, 3);
  assert.equal(s.world.receivers[0].pressed, false, 'le joueur est dans le faisceau');
});

test('pont de lumière : il porte, et un corps dans le faisceau le coupe', () => {
  // Le faisceau part de (4, bas-2) vers la droite, au-dessus d'un fossé.
  const lv = room(['P...>.....#..E', '#####.....####'], { lasers: [{ col: 4, row: GRID_H - 3, bridge: true }] });
  const s = new Session(lv);
  // On saute sur l'émetteur, puis on marche sur le pont.
  run(s, IN_RIGHT, 30);
  run(s, IN_RIGHT | IN_JUMP, 30);
  run(s, IN_RIGHT, 40);
  const p = s.world.player;
  assert.equal(p.onGround, true);
  assert.equal(p.y + p.h, (GRID_H - 3) * TILE * SUB, 'debout au ras du haut de la rangée du faisceau');
  assert.equal(p.dead, false, 'sans danger');
  assert.ok(px(p.x) > 6 * TILE, 'au-dessus du fossé');

  // Faisceau éteint : pas de pont.
  const off = new Session(room(['P...>.....#..E', '#####.....####'], {
    lasers: [{ col: 4, row: GRID_H - 3, bridge: true, cycle: [1, 100000], phase: 5 }],
  }));
  run(off, IN_RIGHT, 30);
  run(off, IN_RIGHT | IN_JUMP, 30);
  run(off, IN_RIGHT, 60);
  assert.equal(off.world.player.y + off.world.player.h, (GRID_H - 1) * TILE * SUB, 'tombé au fond du fossé');
});

test('malle : elle reste où on l’a laissée ; « Effacer » la remet à sa place', () => {
  const s = new Session(room(['P.M..........E']));
  const m0 = s.world.blocks[0].x;
  assert.equal(s.world.blocks[0].persist, true);
  run(s, IN_RIGHT, 80);
  const m1 = s.world.blocks[0].x;
  assert.ok(m1 > m0 + 16 * SUB, 'poussée');
  s.replay();
  assert.equal(s.world.blocks[0].x, m1, 'elle n’est pas revenue');
  // L'écho refait ses gestes : il la rattrape et la pousse encore un peu.
  run(s, 0, 80);
  const m2 = s.world.blocks[0].x;
  assert.ok(m2 > m1, 'l’écho l’a poussée plus loin');
  s.restart();
  assert.equal(s.world.blocks[0].x, m0, 'retour à la case départ');

  // Une valise ordinaire, elle, revient toujours.
  const v = new Session(room(['P.B..........E']));
  const b0 = v.world.blocks[0].x;
  run(v, IN_RIGHT, 80);
  v.replay();
  assert.equal(v.world.blocks[0].x, b0);
});

test('relais : « Rejouer » dessus, et la tentative suivante part de là', () => {
  const s = new Session(room(['P....R.......E']));
  const p0 = s.world.player.x;
  run(s, IN_RIGHT, 62); run(s, 0, 10);
  assert.equal(s.world.relays[0].active, true, 'debout sur le relais');
  s.replay();
  assert.equal(px(s.world.player.x), 5 * TILE + 3, 'on repart du relais');
  assert.equal(s.world.actors[0].x, p0, 'l’écho, lui, part d’où il était parti');
  run(s, 0, 80);
  assert.equal(px(s.world.actors[0].x) > 4 * TILE, true, 'et refait son bout de chemin');
  // Sans relais sous les pieds, on garde le même départ.
  run(s, IN_RIGHT, 40);
  s.replay();
  assert.equal(px(s.world.player.x), 5 * TILE + 3);
  assert.equal(px(s.world.actors[1].x), 5 * TILE + 3, 'le deuxième écho part du relais');
  s.restart();
  assert.equal(s.world.player.x, p0, '« Effacer » ramène au départ');
});
