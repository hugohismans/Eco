// Corps du monde autres que le personnage : valises (blocs poussables) et
// plateformes mobiles (monte-charge). Mêmes règles d'entiers que le reste de
// la simulation.

import { GRAVITY, MAX_FALL, PLATFORM_WAIT } from './constants.js';
import { moveAxis, overlaps } from './physics.js';
import { groundOf } from './actor.js';

// --- Valises -----------------------------------------------------------------

export function createBlock(def, index) {
  return {
    kind: 'block',
    id: `B${index}`,
    type: def.type,
    x: def.x,
    y: def.y,
    w: def.w,
    h: def.h,
    vy: 0,
    dx: 0,
    dy: 0,
    prevX: def.x,
    prevY: def.y,
    onGround: false,
    ground: null,
  };
}

/**
 * Une valise ne bouge que si on la pousse, qu'elle tombe, ou qu'elle est
 * portée (par une plateforme, un écho…).
 */
export function stepBlock(world, b) {
  const startX = b.x, startY = b.y;
  const g = b.ground;
  if (g && (g.dx !== 0 || g.dy !== 0)) {
    moveAxis(world, b, 'y', g.dy);
    moveAxis(world, b, 'x', g.dx);
  }
  b.vy = Math.min(b.vy + GRAVITY, MAX_FALL);
  const wasGround = b.onGround;
  const hit = moveAxis(world, b, 'y', b.vy);
  if (hit && b.vy > 0) {
    b.onGround = true;
    b.ground = groundOf(hit);
    if (!wasGround) world.emit('block-land', b);
  } else {
    b.onGround = false;
    b.ground = null;
  }
  if (hit) b.vy = 0;
  b.dx = b.x - startX;
  b.dy = b.y - startY;
}

// --- Plateformes mobiles -----------------------------------------------------------

export function createPlatform(def) {
  const len = Math.abs(def.x1 - def.x0) + Math.abs(def.y1 - def.y0);
  return {
    kind: 'platform',
    ...def,
    x: def.x0,
    y: def.y0,
    prevX: def.x0,
    prevY: def.y0,
    dx: 0,
    dy: 0,
    /** Avancement le long du trajet, de 0 à len (sous-pixels). */
    t: 0,
    len,
    /** Sens courant en mode « boucle » (1 vers `to`, -1 vers le départ). */
    heading: 1,
    wait: 0,
    active: false,
    moving: false,
  };
}

/**
 * Avance une plateforme d'un tick.
 * - « hold » : va vers sa destination tant qu'elle est active, revient sinon ;
 * - « loop » : fait l'aller-retour tant qu'elle est active, s'arrête sinon.
 * Elle ne force jamais : si quelqu'un (qui n'est pas dessus) la gêne, ou si
 * quelqu'un dessus touche le plafond, elle attend.
 */
export function stepPlatform(world, p) {
  p.prevX = p.x;
  p.prevY = p.y;
  p.dx = 0;
  p.dy = 0;
  p.moving = false;

  let goal;
  if (p.behavior === 'hold') {
    goal = p.active ? p.len : 0;
  } else {
    if (!p.active) return;
    if (p.wait > 0) { p.wait--; return; }
    goal = p.heading > 0 ? p.len : 0;
    if (p.t === goal) {
      p.heading = -p.heading;
      p.wait = PLATFORM_WAIT;
      return;
    }
  }
  if (p.t === goal) return;

  const step = Math.sign(goal - p.t) * Math.min(p.speed, Math.abs(goal - p.t));
  const nt = p.t + step;
  const nx = p.x0 + Math.sign(p.x1 - p.x0) * Math.min(nt, Math.abs(p.x1 - p.x0));
  const ny = p.y0 + Math.sign(p.y1 - p.y0) * Math.min(nt, Math.abs(p.y1 - p.y0));
  const dx = nx - p.x, dy = ny - p.y;

  const riders = world.bodies().filter((o) => o.ground === p);
  const next = { x: nx, y: ny, w: p.w, h: p.h };
  // Personne d'autre ne doit se trouver sur le chemin.
  for (const o of world.bodies()) {
    if (o.ground === p) continue;
    if (overlaps(next, o)) return;
  }
  // Ceux qui sont dessus doivent pouvoir suivre (pas de plafond).
  if (dy < 0) {
    for (const r of riders) if (world.blockerFor(r, 'y', dy, p)) return;
  }
  p.x = nx;
  p.y = ny;
  p.t = nt;
  p.dx = dx;
  p.dy = dy;
  p.moving = true;
}
