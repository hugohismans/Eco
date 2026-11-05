// Le monde d'une tentative : la pièce, ses mécanismes et les acteurs.
//
// Un monde est recréé à neuf au début de chaque tentative, puis avancé tick
// par tick par `step(playerInput)`. Il ne dépend ni du temps réel, ni du
// rendu, ni du hasard : c'est une fonction pure des entrées.
//
// Ordre d'un tick :
//   1. les acteurs bougent, dans l'ordre (échos du plus ancien au plus récent,
//      puis le joueur) : ainsi celui qui porte bouge avant celui qui est porté ;
//   2. les boutons lisent qui est posé dessus ;
//   3. les portes s'ouvrent ou se ferment d'un cran ;
//   4. on vérifie si le joueur a atteint la sortie.

import {
  GRID_W, GRID_H, TILE_SUB, DOOR_TICKS, T_SOLID, T_ONEWAY,
} from './constants.js';
import { createActor, stepActor, actorInput } from './actor.js';
import { overlaps } from './physics.js';

/** Obstacle renvoyé pour une case de la grille. */
const TILE_HIT = Object.freeze({ kind: 'tile' });

export class World {
  /**
   * @param {object} level niveau issu de parseLevel
   * @param {{tape: Uint8Array, attempt: number}[]} echoes bandes à rejouer,
   *   de la plus ancienne à la plus récente
   * @param {number} attempt numéro de la tentative en cours
   */
  constructor(level, echoes = [], attempt = 1) {
    this.level = level;
    this.tick = 0;
    this.won = false;
    /** Événements du dernier tick (sons, effets) : [{type, ...}] */
    this.events = [];

    this.buttons = level.buttons.map((b) => ({ ...b, pressed: false }));
    this.buttonById = new Map(this.buttons.map((b) => [b.id, b]));
    // `open` va de 0 (fermée) à DOOR_TICKS (ouverte).
    this.doors = level.doors.map((d) => ({ ...d, open: 0, target: false, kind: 'door' }));

    this.actors = echoes.map((e, i) => createActor(level.spawn, i, e.tape, e.attempt));
    this.player = createActor(level.spawn, echoes.length, null, attempt);
    this.actors.push(this.player);
  }

  /** Signale un événement aux couches de présentation (son, effets). */
  emit(type, source = null) {
    this.events.push({ type, source });
  }

  /** Avance le monde d'un tick avec l'entrée du joueur. */
  step(playerInput) {
    this.events.length = 0;
    for (const a of this.actors) {
      a.prevX = a.x;
      a.prevY = a.y;
    }

    // 1. Acteurs.
    for (const a of this.actors) {
      stepActor(this, a, actorInput(a, this.tick, playerInput));
    }

    // 2. Boutons.
    for (const b of this.buttons) {
      const pressed = this.actors.some((a) => overlaps(a, b));
      if (pressed !== b.pressed) {
        b.pressed = pressed;
        this.emit(pressed ? 'button-down' : 'button-up', b);
      }
    }

    // 3. Portes.
    for (const d of this.doors) this.updateDoor(d);

    // 4. Sortie (seul le joueur compte).
    const p = this.player;
    const ex = this.level.exit;
    const cx = p.x + (p.w >> 1);
    const feet = p.y + p.h;
    if (cx >= ex.x && cx < ex.x + ex.w && feet > ex.y && feet <= ex.y + ex.h) {
      if (!this.won) this.emit('exit', p);
      this.won = true;
    }

    this.tick++;
  }

  updateDoor(d) {
    const states = d.buttons.map((id) => this.buttonById.get(id).pressed);
    let active = d.mode === 'or' ? states.some(Boolean) : states.every(Boolean);
    if (d.invert) active = !active;
    if (active !== d.target) {
      d.target = active;
      this.emit(active ? 'door-open' : 'door-close', d);
    }
    if (active) {
      if (d.open < DOOR_TICKS) d.open++;
    } else if (d.open > 0) {
      // Une porte ne se referme pas sur quelqu'un : elle attend qu'il soit passé.
      const next = doorSolidRect(d, d.open - 1);
      if (!this.actors.some((a) => overlaps(a, next))) d.open--;
    }
  }

  /** Type de la case (col, row) ; hors de la grille, tout est mur. */
  tileAt(col, row) {
    if (col < 0 || col >= GRID_W || row < 0 || row >= GRID_H) return T_SOLID;
    return this.level.tiles[row * GRID_W + col];
  }

  /**
   * Obstacle rencontré par `body` s'il était décalé de `delta` sur `axis`,
   * ou null. Les acteurs ne se bloquent jamais entre eux ; un acteur peut
   * seulement se poser sur la tête d'un acteur plus ancien (courte échelle).
   */
  blockerFor(body, axis, delta) {
    const x = axis === 'x' ? body.x + delta : body.x;
    const y = axis === 'y' ? body.y + delta : body.y;
    const { w, h } = body;
    const falling = axis === 'y' && delta > 0;
    const oldBottom = body.y + h;
    const newBottom = y + h;

    // Cases de la grille.
    const c0 = Math.floor(x / TILE_SUB);
    const c1 = Math.floor((x + w - 1) / TILE_SUB);
    const r0 = Math.floor(y / TILE_SUB);
    const r1 = Math.floor((y + h - 1) / TILE_SUB);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.tileAt(c, r);
        if (t === T_SOLID) return TILE_HIT;
        if (t === T_ONEWAY && falling) {
          const top = r * TILE_SUB;
          if (oldBottom <= top && newBottom > top) return TILE_HIT;
        }
      }
    }

    // Portes (seule la partie encore fermée est solide).
    const rect = { x, y, w, h };
    for (const d of this.doors) {
      if (d.open >= DOOR_TICKS) continue;
      if (overlaps(rect, doorSolidRect(d, d.open))) return d;
    }

    // Têtes des acteurs plus anciens : plateformes à sens unique.
    if (falling && body.index !== undefined) {
      for (const o of this.actors) {
        if (o.index >= body.index) break;
        const top = o.y;
        if (oldBottom <= top && newBottom > top && x < o.x + o.w && x + w > o.x) return o;
      }
    }
    return null;
  }
}

/**
 * Partie solide d'une porte pour un degré d'ouverture donné : la porte coulisse
 * vers le haut, dans le mur, et libère le passage par le bas.
 */
export function doorSolidRect(d, open) {
  const hidden = Math.floor((d.h * open) / DOOR_TICKS);
  return { x: d.x, y: d.y, w: d.w, h: d.h - hidden };
}
