// La silhouette du personnage, en pixel art dessiné « à la main » dans le code.
//
// Une silhouette unie, sans visage : casquette à visière, long manteau. Elle
// regarde vers la droite ; la version de gauche est un miroir. Chaque image
// fait 12 × 22 pixels (la boîte de collision fait 10 × 22 : on dessine à x - 1).

import { makeCanvas } from './pixel.js';

export const SPRITE_W = 12;
export const SPRITE_H = 22;
export const SPRITE_DX = -1;

const E = '............';

const HEAD = [
  '...#####....',
  '..#######...',
  '..#########.', // visière, vers l'avant
  '...######...',
  '...######...',
  '....####....',
];
const NECK = ['....###.....'];

const TORSO_IDLE = [
  '...######...',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..#########.',
  '..#########.',
  '...#######..',
];
const TORSO_WALK = [
  '...######...',
  '..########..',
  '..########..',
  '.#########..',
  '.##########.',
  '..#########.',
  '..########..',
  '.#########..',
  '.#########..',
  '..#######...',
];
const TORSO_AIR = [
  '...######...',
  '.##########.',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..#########.',
  '.##########.',
  '.##########.',
  '..########..',
];

const LEGS_STAND = ['...##..##...', '...##..##...', '...##..##...', '...##..##...', '...###.###..'];
const LEGS_STRIDE = ['...##..##...', '..##....##..', '..##....##..', '.##......##.', '.##......###'];
const LEGS_STRIDE2 = ['...##..##...', '...##...##..', '..##....##..', '..##.....##.', '..###....###'];
const LEGS_PASS = ['....####....', '....##.##...', '...##..##...', '...#...##...', '...#...###..'];
const LEGS_JUMP = ['...######...', '...##..##...', '..##....##..', '..#......#..', E];
const LEGS_FALL = ['...##..##...', '..##....##..', '..##....##..', '..##....##..', '..#......#..'];
const LEGS_SQUAT = ['..###..###..', '..##....##..', '..##....##..', '..###..###..'];

/** Images, par nom. */
export const FRAMES = {
  idleA: [...HEAD, ...NECK, ...TORSO_IDLE, ...LEGS_STAND],
  idleB: [E, ...HEAD, ...TORSO_IDLE, ...LEGS_STAND],
  walk0: [...HEAD, ...NECK, ...TORSO_WALK, ...LEGS_STRIDE],
  walk1: [E, ...HEAD, ...TORSO_IDLE, ...LEGS_PASS],
  walk2: [...HEAD, ...NECK, ...TORSO_WALK, ...LEGS_STRIDE2],
  walk3: [E, ...HEAD, ...TORSO_IDLE, ...LEGS_PASS],
  jump: [...HEAD, ...NECK, ...TORSO_AIR, ...LEGS_JUMP],
  fall: [...HEAD, ...NECK, ...TORSO_AIR, ...LEGS_FALL],
  land: [E, E, ...HEAD, ...TORSO_IDLE, ...LEGS_SQUAT],
};

export const WALK_CYCLE = ['walk0', 'walk1', 'walk2', 'walk3'];

for (const [name, rows] of Object.entries(FRAMES)) {
  if (rows.length !== SPRITE_H || rows.some((r) => r.length !== SPRITE_W)) {
    throw new Error(`Image « ${name} » : ${SPRITE_W}×${SPRITE_H} attendu.`);
  }
}

/** Masque binaire d'une image, éventuellement retourné horizontalement. */
function mask(name, facing) {
  const rows = FRAMES[name];
  const m = new Uint8Array(SPRITE_W * SPRITE_H);
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const sx = facing > 0 ? x : SPRITE_W - 1 - x;
      m[y * SPRITE_W + x] = rows[y][sx] === '#' ? 1 : 0;
    }
  }
  return m;
}

function paintMask(m, color) {
  const c = makeCanvas(SPRITE_W, SPRITE_H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  for (let i = 0; i < m.length; i++) if (m[i]) ctx.fillRect(i % SPRITE_W, (i / SPRITE_W) | 0, 1, 1);
  return c;
}

const cache = new Map();

/** Image pleine, dans une couleur. */
export function sprite(name, facing, color) {
  const key = `${name}|${facing}|${color}`;
  let c = cache.get(key);
  if (!c) cache.set(key, (c = paintMask(mask(name, facing), color)));
  return c;
}

/**
 * Liseré de lumière : les pixels du bord tournés vers une source située à
 * gauche (side = -1) ou à droite (side = 1), plus le dessus de la silhouette.
 */
export function rimSprite(name, facing, side, color) {
  const key = `rim|${name}|${facing}|${side}|${color}`;
  let c = cache.get(key);
  if (c) return c;
  const m = mask(name, facing);
  const rim = new Uint8Array(m.length);
  const at = (x, y) => (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H ? 0 : m[y * SPRITE_W + x]);
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      if (!at(x, y)) continue;
      const sideEdge = !at(x + side, y);
      const topEdge = !at(x, y - 1) && y < 12;
      if (sideEdge || topEdge) rim[y * SPRITE_W + x] = 1;
    }
  }
  cache.set(key, (c = paintMask(rim, color)));
  return c;
}

/** Contour extérieur (1 px) d'une image : halo net des échos. */
export function outlineSprite(name, facing, color) {
  const key = `out|${name}|${facing}|${color}`;
  let c = cache.get(key);
  if (c) return c;
  const m = mask(name, facing);
  const W = SPRITE_W + 2, H = SPRITE_H + 2;
  c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  const at = (x, y) => (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H ? 0 : m[y * SPRITE_W + x]);
  for (let y = -1; y <= SPRITE_H; y++) {
    for (let x = -1; x <= SPRITE_W; x++) {
      if (at(x, y)) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  cache.set(key, c);
  return c;
}
