// Déplacement avec collisions, axe par axe, en sous-pixels entiers.
//
// Un corps avance par pas d'au plus un pixel ; si un pas touche un obstacle,
// on s'en approche sous-pixel par sous-pixel. Les vitesses restent petites
// (moins de 8 px par tick), donc le coût est négligeable et aucun corps ne
// peut traverser un mur, quel que soit le framerate.

import { SUB } from './constants.js';

/**
 * Déplace `body` de `amount` sous-pixels sur l'axe `axis` ('x' ou 'y').
 * `world.blockerFor(body, axis, delta)` renvoie l'obstacle rencontré si le
 * corps était décalé de `delta`, ou null.
 * Renvoie l'obstacle qui a arrêté le mouvement, ou null.
 */
export function moveAxis(world, body, axis, amount) {
  if (amount === 0) return null;
  const sign = amount > 0 ? 1 : -1;
  let remaining = amount * sign;
  while (remaining > 0) {
    const step = remaining < SUB ? remaining : SUB;
    const hit = world.blockerFor(body, axis, sign * step);
    if (!hit) {
      body[axis] += sign * step;
      remaining -= step;
      continue;
    }
    // Approche fine jusqu'au contact.
    let ok = 0;
    for (let k = 1; k < step; k++) {
      if (world.blockerFor(body, axis, sign * k)) break;
      ok = k;
    }
    body[axis] += sign * ok;
    return hit;
  }
  return null;
}

/** Recouvrement strict de deux rectangles {x, y, w, h}. */
export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Rapproche `value` de `target` d'au plus `step`. */
export function approach(value, target, step) {
  if (value < target) return Math.min(value + step, target);
  if (value > target) return Math.max(value - step, target);
  return value;
}
