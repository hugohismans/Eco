// Le personnage : joueur ou écho, c'est exactement le même code.
//
// Un acteur ne connaît que ses entrées du tick (un octet). Le joueur les reçoit
// du clavier ou de l'écran tactile ; un écho les relit dans la bande
// enregistrée d'une tentative précédente. Les positions ne sont jamais
// enregistrées : un écho recalcule son trajet, et peut donc s'en écarter si le
// monde a changé (une porte restée fermée, une valise déplacée…).
//
// Mouvements : marcher, sauter (saut court, tolérance au bord, appui mémorisé,
// coins de plafond rattrapés) ; et, selon les capacités du niveau :
//   - walljump : glisser le long d'un mur, sauter depuis un mur ;
//   - grab     : s'agripper, grimper (avec une endurance), sauter du mur ;
//   - dash     : une ruée dans l'une des huit directions, rechargée au sol.

import {
  SUB, ACTOR_W, ACTOR_H, RUN_SPEED, GROUND_ACCEL, GROUND_DECEL, AIR_ACCEL, AIR_DECEL,
  GRAVITY, MAX_FALL, JUMP_VEL, JUMP_MIN_TICKS, COYOTE_TICKS, JUMP_BUFFER_TICKS,
  IN_LEFT, IN_RIGHT, IN_JUMP, IN_ACT, IN_UP, IN_DOWN, IN_DASH, IN_GRAB, PUSH_SPEED,
  WALL_SLIDE_MAX, WALL_PROBE, WALLJUMP_VX, WALLJUMP_LOCK,
  CLIMB_UP, CLIMB_DOWN, STAMINA_MAX, STAMINA_STILL, STAMINA_UP, STAMINA_CLIMBJUMP,
  GRAB_LOCK, LEDGE_HOP_VY, LEDGE_HOP_VX,
  DASH_SPEED, DASH_DIAG, DASH_TICKS, DASH_END_VY_UP, DASH_END_MAX_VX, CORNER_NUDGE,
} from './constants.js';
import { moveAxis, approach } from './physics.js';

/** Obstacle immobile (case de mur, plateforme fine) : sert de « sol » sans déplacement. */
export const STATIC_GROUND = Object.freeze({ kind: 'static', dx: 0, dy: 0 });

/** Ce à quoi l'on peut s'agripper ou d'où l'on peut sauter. */
const WALL_KINDS = new Set(['tile', 'door', 'platform']);

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
    /** Le joueur a touché un faisceau (les échos, eux, ne craignent rien). */
    dead: false,
    prevAct: false,
    prevDown: false,
    prevDash: false,
    /** Vrai pendant le tick où l'on vient d'appuyer sur « interaction » / « bas ». */
    actPressed: false,
    downPressed: false,
    /** Vrai si l'acteur pousse une valise ce tick-ci. */
    pushing: false,
    // Murs.
    /** Côté où un mur touche l'acteur (-1, 0, 1). */
    wallDir: 0,
    sliding: false,
    climbing: false,
    stamina: STAMINA_MAX,
    grabLock: 0,
    wallLock: 0,
    lockDir: 0,
    // Dash.
    dashes: 0,
    dashing: 0,
    dashVX: 0,
    dashVY: 0,
  };
}

/** Entrée de l'acteur pour le tick `tick`. */
export function actorInput(actor, tick, playerInput) {
  if (!actor.tape) return playerInput;
  if (tick < actor.tape.length) return actor.tape[tick];
  actor.finished = true;
  return 0;
}

/** Y a-t-il un mur où s'accrocher du côté `side` (-1 ou 1) ? */
function wallAt(world, a, side) {
  const hit = world.blockerFor(a, 'x', side * WALL_PROBE);
  return !!hit && WALL_KINDS.has(hit.kind);
}

/**
 * Fait avancer un acteur d'un tick.
 * @param {import('./world.js').World} world
 * @param {object} a acteur
 * @param {number} bits entrées du tick
 */
export function stepActor(world, a, bits) {
  const can = world.abilities;
  a.input = bits;
  const startX = a.x;
  const startY = a.y;

  // Entrées et fronts (appuis de ce tick).
  const dir = ((bits & IN_RIGHT) ? 1 : 0) - ((bits & IN_LEFT) ? 1 : 0);
  const vdir = ((bits & IN_DOWN) ? 1 : 0) - ((bits & IN_UP) ? 1 : 0);
  const jump = (bits & IN_JUMP) !== 0;
  const grab = (bits & IN_GRAB) !== 0;
  const act = (bits & IN_ACT) !== 0;
  const down = (bits & IN_DOWN) !== 0;
  const dash = (bits & IN_DASH) !== 0;
  a.actPressed = act && !a.prevAct;
  a.downPressed = down && !a.prevDown;
  const dashPressed = dash && !a.prevDash;
  a.prevAct = act;
  a.prevDown = down;
  a.prevDash = dash;
  const jumpPressed = jump && !a.prevJump;
  a.prevJump = jump;
  if (jumpPressed) a.jumpBuffer = JUMP_BUFFER_TICKS;
  else if (a.jumpBuffer > 0) a.jumpBuffer--;
  a.pushing = false;
  a.sliding = false;
  if (a.grabLock > 0) a.grabLock--;
  if (a.wallLock > 0) a.wallLock--;

  // 1. Porté par ce sur quoi on se tient (écho, plateforme mobile, valise).
  const g = a.ground;
  if (g && (g.dx !== 0 || g.dy !== 0)) {
    moveAxis(world, a, 'y', g.dy);
    moveAxis(world, a, 'x', g.dx);
  }
  if (a.onGround) {
    a.stamina = STAMINA_MAX;
    if (can.has('dash') && a.dashing === 0) a.dashes = 1;
  }

  // 2. Dash : on part, puis on file tout droit pendant quelques ticks.
  if (can.has('dash') && dashPressed && a.dashes > 0 && a.dashing === 0) {
    let dx = dir, dy = vdir;
    if (dx === 0 && dy === 0) dx = a.facing;
    const s = dx !== 0 && dy !== 0 ? DASH_DIAG : DASH_SPEED;
    a.dashVX = dx * s;
    a.dashVY = dy * s;
    a.dashing = DASH_TICKS;
    a.dashes--;
    a.climbing = false;
    a.jumpHeld = false;
    if (dx !== 0) a.facing = dx;
    world.emit('dash', a);
  }
  if (a.dashing > 0) {
    stepDash(world, a);
    finish(world, a, startX, startY);
    return;
  }

  // 3. Murs : où sont-ils, s'accroche-t-on ?
  a.wallDir = wallAt(world, a, a.facing) ? a.facing : wallAt(world, a, -a.facing) ? -a.facing : 0;
  const grabSide = wallAt(world, a, a.facing) ? a.facing : 0;
  if (can.has('grab') && grab && grabSide !== 0 && a.stamina > 0 && a.grabLock === 0) {
    if (!a.climbing) world.emit('grab', a);
    a.climbing = true;
  } else {
    a.climbing = false;
  }
  if (a.climbing) {
    stepClimb(world, a, grabSide, dir, vdir, can);
    finish(world, a, startX, startY);
    return;
  }

  // 4. Marche. Après un saut au mur, on ne peut pas revenir vers lui tout de suite.
  let moveDir = dir;
  if (a.wallLock > 0 && moveDir === a.lockDir) moveDir = 0;
  let accel = a.onGround
    ? (moveDir !== 0 ? GROUND_ACCEL : GROUND_DECEL)
    : (moveDir !== 0 ? AIR_ACCEL : AIR_DECEL);
  // L'élan d'un dash ou d'un saut au mur s'éteint doucement.
  if (Math.abs(a.vx) > RUN_SPEED && Math.sign(a.vx) === moveDir) accel = 1;
  a.vx = approach(a.vx, moveDir * RUN_SPEED, accel);
  if (moveDir !== 0) a.facing = moveDir;

  // 5. Saut : appui mémorisé + tolérance au bord ; sinon, saut au mur.
  if (a.onGround) a.coyote = COYOTE_TICKS;
  else if (a.coyote > 0) a.coyote--;
  if (a.jumpBuffer > 0 && a.coyote > 0) {
    startJump(world, a, 'jump');
  } else if (a.jumpBuffer > 0 && !a.onGround && can.has('walljump') && a.wallDir !== 0) {
    wallJump(world, a, -a.wallDir);
  }
  // Saut court : relâcher la touche pendant la montée coupe l'élan
  // (passé une durée minimale).
  a.jumpTicks++;
  if (a.jumpHeld && !jump && a.vy < 0 && a.jumpTicks >= JUMP_MIN_TICKS) {
    a.vy = Math.trunc(a.vy / 2);
    a.jumpHeld = false;
  }
  if (a.vy >= 0) a.jumpHeld = false;

  // 6. Gravité ; glissade si l'on pousse contre un mur en tombant.
  a.vy = Math.min(a.vy + GRAVITY, MAX_FALL);
  if (can.has('walljump') && !a.onGround && a.vy > WALL_SLIDE_MAX && a.wallDir !== 0 && dir === a.wallDir) {
    a.vy = WALL_SLIDE_MAX;
    a.sliding = true;
  }

  // 7. Déplacements, axe par axe.
  moveHorizontal(world, a);
  moveVertical(world, a);
  finish(world, a, startX, startY);
}

function startJump(world, a, kind) {
  a.vy = -JUMP_VEL;
  a.jumpBuffer = 0;
  a.coyote = 0;
  a.onGround = false;
  a.ground = null;
  a.jumpHeld = true;
  a.jumpTicks = 0;
  world.emit(kind, a);
}

/** Saut depuis un mur, vers `away` (-1 ou 1). */
function wallJump(world, a, away) {
  startJump(world, a, 'walljump');
  a.vx = away * WALLJUMP_VX;
  a.wallLock = WALLJUMP_LOCK;
  a.lockDir = -away;
  a.facing = away;
  a.climbing = false;
  a.grabLock = GRAB_LOCK;
}

/** Agrippé au mur : grimper, descendre, tenir ; l'endurance s'épuise. */
function stepClimb(world, a, side, dir, vdir, can) {
  a.facing = side;
  a.vx = 0;
  if (a.jumpBuffer > 0) {
    if (dir === -side && can.has('walljump')) {
      wallJump(world, a, -side);
    } else if (a.stamina >= STAMINA_CLIMBJUMP) {
      // Saut vertical le long du mur : coûteux en endurance.
      startJump(world, a, 'jump');
      a.stamina -= STAMINA_CLIMBJUMP;
      a.climbing = false;
      a.grabLock = GRAB_LOCK;
    } else {
      // Trop fatigué pour sauter le long du mur : on reste accroché.
      a.jumpBuffer = 0;
      a.vy = 0;
      world.emit('tired', a);
      return;
    }
    a.vy = Math.min(a.vy + GRAVITY, MAX_FALL);
    moveHorizontal(world, a);
    moveVertical(world, a);
    return;
  }
  if (vdir < 0) { a.vy = -CLIMB_UP; a.stamina -= STAMINA_UP; }
  else if (vdir > 0) { a.vy = CLIMB_DOWN; }
  else { a.vy = 0; a.stamina -= STAMINA_STILL; }
  // Rester collé au mur.
  moveAxis(world, a, 'x', side * WALL_PROBE);
  moveVertical(world, a);
  // En haut du mur : un petit bond pour se hisser sur le rebord.
  if (vdir < 0 && !wallAtHead(world, a, side)) {
    a.vy = -LEDGE_HOP_VY;
    a.vx = side * LEDGE_HOP_VX;
    a.climbing = false;
    a.grabLock = GRAB_LOCK;
  }
  if (a.stamina <= 0) {
    a.stamina = 0;
    a.climbing = false;
    world.emit('tired', a);
  }
}

/** Le haut du corps touche-t-il encore le mur ? */
function wallAtHead(world, a, side) {
  const probe = { kind: a.kind, index: a.index, x: a.x, y: a.y, w: a.w, h: 6 * SUB };
  const hit = world.blockerFor(probe, 'x', side * WALL_PROBE, a);
  return !!hit && WALL_KINDS.has(hit.kind);
}

/** Pendant un dash : vitesse fixe, pas de gravité. */
function stepDash(world, a) {
  a.vx = a.dashVX;
  a.vy = a.dashVY;
  a.dashing--;
  if (a.vx !== 0) {
    const hit = moveAxis(world, a, 'x', a.vx);
    if (hit) {
      // Rebord presque atteint : on se laisse glisser au-dessus du coin.
      if (a.dashVY === 0 && nudge(world, a, 'y', -1, a.vx)) moveAxis(world, a, 'x', a.vx);
      else a.dashVX = 0;
    }
  }
  if (a.vy !== 0) {
    const hit = moveAxis(world, a, 'y', a.vy);
    if (hit) {
      if (a.vy > 0) land(world, a, hit);
      a.dashVY = 0;
    } else if (a.vy < 0 || a.vy > 0) {
      a.onGround = false;
      a.ground = null;
    }
  }
  if (a.dashing === 0) {
    // Fin du dash : on garde un peu d'élan.
    a.vx = Math.max(-DASH_END_MAX_VX, Math.min(DASH_END_MAX_VX, a.dashVX));
    a.vy = a.dashVY < 0 ? -DASH_END_VY_UP : a.dashVY > 0 ? a.dashVY >> 1 : 0;
  }
}

/**
 * Essaie de décaler l'acteur d'au plus CORNER_NUDGE px sur `axis` (dans le
 * sens `sign`, ou les deux si 0) pour que le mouvement `amount` sur l'autre
 * axe passe. Renvoie vrai si un décalage a été trouvé (et appliqué).
 */
function nudge(world, a, axis, sign, amount) {
  const other = axis === 'x' ? 'y' : 'x';
  const signs = sign === 0 ? [1, -1] : [sign];
  for (let k = 1; k <= CORNER_NUDGE; k++) {
    for (const s of signs) {
      const d = s * k * SUB;
      if (world.blockerFor(a, axis, d)) continue;
      a[axis] += d;
      const blocked = world.blockerFor(a, other, amount);
      if (!blocked) return true;
      a[axis] -= d;
    }
  }
  return false;
}

function moveHorizontal(world, a) {
  const hitX = moveAxis(world, a, 'x', a.vx);
  if (!hitX) return;
  if (hitX.kind === 'block' && a.onGround && a.vx !== 0) {
    // Pousser une valise : elle avance lentement, on la suit.
    const sign = a.vx > 0 ? 1 : -1;
    const moved = world.pushBlock(hitX, sign * PUSH_SPEED);
    if (moved !== 0) moveAxis(world, a, 'x', moved);
    a.vx = sign * Math.min(Math.abs(a.vx), PUSH_SPEED);
    a.pushing = moved !== 0;
  } else {
    a.vx = 0;
  }
}

function moveVertical(world, a) {
  if (a.vy === 0) {
    // Immobile (agrippé) : on regarde seulement s'il y a un sol sous les pieds.
    const under = world.blockerFor(a, 'y', 1);
    if (under) {
      a.onGround = true;
      a.ground = typeof under.dx === 'number' ? under : STATIC_GROUND;
    } else {
      a.onGround = false;
      a.ground = null;
    }
    return;
  }
  // Coin de plafond : en montant, on se décale de quelques pixels plutôt que de buter.
  if (a.vy < 0 && world.blockerFor(a, 'y', Math.max(a.vy, -SUB))) {
    nudge(world, a, 'x', 0, Math.max(a.vy, -SUB));
  }
  const hitY = moveAxis(world, a, 'y', a.vy);
  if (hitY && a.vy > 0) {
    land(world, a, hitY);
  } else {
    a.onGround = false;
    a.ground = null;
  }
  if (hitY) a.vy = 0;
}

function land(world, a, hit) {
  const wasGround = a.onGround;
  a.onGround = true;
  // Tout ce qui se déplace (écho, plateforme, valise) expose dx/dy.
  a.ground = typeof hit.dx === 'number' ? hit : STATIC_GROUND;
  a.climbing = false;
  if (!wasGround) world.emit('land', a);
}

function finish(world, a, startX, startY) {
  a.dx = a.x - startX;
  a.dy = a.y - startY;
}
