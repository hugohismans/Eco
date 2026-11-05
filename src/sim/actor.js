// Le personnage : joueur ou écho, c'est exactement le même code.
//
// Un acteur ne connaît que ses entrées du tick (un octet). Le joueur les reçoit
// du clavier ou de l'écran tactile ; un écho les relit dans la bande
// enregistrée d'une tentative précédente. Les positions ne sont jamais
// enregistrées : un écho recalcule son trajet, et peut donc s'en écarter si le
// monde a changé (une porte restée fermée, une valise déplacée…).

import {
  ACTOR_W, ACTOR_H, RUN_SPEED, GROUND_ACCEL, GROUND_DECEL, AIR_ACCEL, AIR_DECEL,
  GRAVITY, MAX_FALL, JUMP_VEL, JUMP_MIN_TICKS, COYOTE_TICKS, JUMP_BUFFER_TICKS,
  IN_LEFT, IN_RIGHT, IN_JUMP,
} from './constants.js';
import { moveAxis, approach } from './physics.js';

/** Obstacle immobile (case de mur, plateforme fine) : sert de « sol » sans déplacement. */
export const STATIC_GROUND = Object.freeze({ kind: 'static', dx: 0, dy: 0 });

/**
 * Crée un acteur.
 * @param {{x:number,y:number}} spawn position de départ (sous-pixels)
 * @param {number} index ordre de mise à jour ; un acteur ne peut se tenir que
 *   sur un acteur d'indice inférieur (une tentative plus ancienne).
 * @param {Uint8Array|null} tape entrées enregistrées (écho) ou null (joueur)
 * @param {number} attempt numéro de la tentative (sert à la teinte de l'écho)
 */
export function createActor(spawn, index, tape, attempt) {
  return {
    kind: tape ? 'echo' : 'player',
    index,
    tape,
    attempt,
    x: spawn.x,
    y: spawn.y,
    w: ACTOR_W,
    h: ACTOR_H,
    vx: 0,
    vy: 0,
    /** Déplacement effectif du dernier tick (pour porter ceux qui sont dessus). */
    dx: 0,
    dy: 0,
    /** Position au début du tick (interpolation du rendu uniquement). */
    prevX: spawn.x,
    prevY: spawn.y,
    onGround: false,
    ground: null,
    facing: 1,
    coyote: 0,
    jumpBuffer: 0,
    prevJump: false,
    jumpHeld: false,
    /** Ticks écoulés depuis le dernier saut. */
    jumpTicks: 0,
    /** Dernière entrée appliquée (lue par le rendu pour l'animation). */
    input: 0,
    /** Vrai quand la bande d'un écho est terminée : il reste immobile. */
    finished: false,
  };
}

/** Entrée de l'acteur pour le tick `tick`. */
export function actorInput(actor, tick, playerInput) {
  if (!actor.tape) return playerInput;
  if (tick < actor.tape.length) return actor.tape[tick];
  actor.finished = true;
  return 0;
}

/**
 * Fait avancer un acteur d'un tick.
 * @param {import('./world.js').World} world
 * @param {object} a acteur
 * @param {number} bits entrées du tick
 */
export function stepActor(world, a, bits) {
  a.input = bits;
  const startX = a.x;
  const startY = a.y;

  // 1. Porté par ce sur quoi on se tient (écho, plateforme mobile).
  const g = a.ground;
  if (g && (g.dx !== 0 || g.dy !== 0)) {
    moveAxis(world, a, 'y', g.dy);
    moveAxis(world, a, 'x', g.dx);
  }

  // 2. Marche.
  const dir = ((bits & IN_RIGHT) ? 1 : 0) - ((bits & IN_LEFT) ? 1 : 0);
  const accel = a.onGround
    ? (dir !== 0 ? GROUND_ACCEL : GROUND_DECEL)
    : (dir !== 0 ? AIR_ACCEL : AIR_DECEL);
  a.vx = approach(a.vx, dir * RUN_SPEED, accel);
  if (dir !== 0) a.facing = dir;

  // 3. Saut : appui mémorisé (buffer) + tolérance au bord (coyote).
  const jump = (bits & IN_JUMP) !== 0;
  const pressed = jump && !a.prevJump;
  a.prevJump = jump;
  if (pressed) a.jumpBuffer = JUMP_BUFFER_TICKS;
  else if (a.jumpBuffer > 0) a.jumpBuffer--;
  if (a.onGround) a.coyote = COYOTE_TICKS;
  else if (a.coyote > 0) a.coyote--;

  if (a.jumpBuffer > 0 && a.coyote > 0) {
    a.vy = -JUMP_VEL;
    a.jumpBuffer = 0;
    a.coyote = 0;
    a.onGround = false;
    a.ground = null;
    a.jumpHeld = true;
    a.jumpTicks = 0;
    world.emit('jump', a);
  }
  // Saut court : relâcher la touche pendant la montée coupe l'élan
  // (passé une durée minimale).
  a.jumpTicks++;
  if (a.jumpHeld && !jump && a.vy < 0 && a.jumpTicks >= JUMP_MIN_TICKS) {
    a.vy = Math.trunc(a.vy / 2);
    a.jumpHeld = false;
  }
  if (a.vy >= 0) a.jumpHeld = false;

  // 4. Gravité puis déplacements, axe par axe.
  a.vy = Math.min(a.vy + GRAVITY, MAX_FALL);

  if (moveAxis(world, a, 'x', a.vx)) a.vx = 0;

  const wasGround = a.onGround;
  const hitY = moveAxis(world, a, 'y', a.vy);
  if (hitY && a.vy > 0) {
    a.onGround = true;
    // Tout ce qui se déplace (écho, plus tard plateformes et valises) expose dx/dy.
    a.ground = typeof hitY.dx === 'number' ? hitY : STATIC_GROUND;
    if (!wasGround) world.emit('land', a);
  } else {
    a.onGround = false;
    a.ground = null;
  }
  if (hitY) a.vy = 0;

  a.dx = a.x - startX;
  a.dy = a.y - startY;
}
