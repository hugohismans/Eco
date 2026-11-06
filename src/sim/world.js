// Le monde d'une tentative : la pièce, ses mécanismes et les corps.
//
// Un monde est recréé à neuf au début de chaque tentative, puis avancé tick
// par tick par `step(playerInput)`. Il ne dépend ni du temps réel, ni du
// rendu, ni du hasard : c'est une fonction pure des entrées.
//
// Ordre d'un tick :
//   1. les plateformes mobiles avancent (selon les boutons du tick précédent) ;
//   2. les valises tombent ou sont portées ;
//   3. les acteurs bougent, dans l'ordre (échos du plus ancien au plus récent,
//      puis le joueur) : celui qui porte bouge avant celui qui est porté ;
//   4. les faisceaux se propagent ; le joueur qui en touche un tombe ;
//   5. les boutons lisent qui est posé dessus ;
//   6. portes, faisceaux et plateformes lisent leurs boutons ;
//   7. on vérifie si le joueur a atteint la sortie (ou choisi de rester).

import {
  GRID_W, GRID_H, TILE_SUB, DOOR_TICKS, T_SOLID, T_ONEWAY, BEAM_HALF,
  T_ICE, T_CONV_L, T_CONV_R, T_GHOST, T_GLASS, CONVEYOR_SPEED, CRUMBLE_TICKS, SPRING_VEL,
} from './constants.js';
import { createActor, stepActor, actorInput, bounce } from './actor.js';
import { createBlock, stepBlock, createPlatform, stepPlatform } from './bodies.js';
import { overlaps, moveAxis } from './physics.js';

/** Obstacles renvoyés pour une case de la grille. */
const TILE_HIT = Object.freeze({ kind: 'tile' });
const ICE_HIT = Object.freeze({ kind: 'tile', ice: true });
/** Un tapis roulant emporte ce qui est posé dessus : il expose son dx. */
const CONV_L_HIT = Object.freeze({ kind: 'tile', dx: -CONVEYOR_SPEED, dy: 0, conveyor: -1 });
const CONV_R_HIT = Object.freeze({ kind: 'tile', dx: CONVEYOR_SPEED, dy: 0, conveyor: 1 });

/** Cases qui arrêtent les faisceaux (les tableaux et vitrines les laissent passer). */
const OPAQUE = new Set([T_SOLID, T_ICE, T_CONV_L, T_CONV_R]);

export class World {
  /**
   * @param {object} level niveau issu de parseLevel
   * @param {{tape: Uint8Array, attempt: number}[]} echoes bandes à rejouer,
   *   de la plus ancienne à la plus récente
   * @param {number} attempt numéro de la tentative en cours
   */
  constructor(level, echoes = [], attempt = 1) {
    this.level = level;
    /** Capacités du niveau : 'walljump', 'grab', 'dash'. */
    this.abilities = new Set(level.abilities);
    this.tick = 0;
    /** null, puis 'exit' (sortie atteinte) ou 'stay' (on reste sur le quai). */
    this.outcome = null;
    /** Événements du dernier tick (sons, effets) : [{type, source}] */
    this.events = [];

    this.buttons = level.buttons.map((b) => ({ ...b, pressed: false }));
    this.levers = level.levers.map((l) => ({ ...l, kind: 'lever', pressed: false }));
    // Tout ce qu'un lien peut citer : boutons, leviers, capteurs.
    this.switchById = new Map([...this.buttons, ...this.levers].map((b) => [b.id, b]));
    this.crumbles = level.crumbles.map((c) => ({ ...c, kind: 'crumble', dx: 0, dy: 0, state: 'intact', timer: 0 }));
    this.springs = level.springs.map((sp) => ({ ...sp, kind: 'spring', dx: 0, dy: 0, squash: 0 }));
    // `open` va de 0 (fermée) à DOOR_TICKS (ouverte).
    this.doors = level.doors.map((d) => ({ ...d, open: 0, target: false, kind: 'door' }));
    this.blocks = level.blocks.map((b, i) => createBlock(b, i));
    this.platforms = level.platforms.map((p) => createPlatform(p));
    this.lasers = level.lasers.map((l) => ({
      ...l, linkOn: !l.link, on: !l.link, ex: l.ox, ey: l.oy, hit: null, pressed: false, latched: false,
    }));
    for (const l of this.lasers) if (l.sensor) this.switchById.set(l.sensor, l);

    this.actors = echoes.map((e, i) => createActor(level.spawn, i, e.tape, e.attempt));
    this.player = createActor(level.spawn, echoes.length, null, attempt);
    this.actors.push(this.player);
    for (const l of this.lasers) if (l.link) l.linkOn = this.linkActive(l.link);
    for (const pf of this.platforms) pf.active = this.linkActive(pf);
    // Une porte commence dans l'état de ses boutons (une porte inversée, ouverte).
    for (const d of this.doors) {
      d.target = this.linkActive(d);
      d.open = d.target ? DOOR_TICKS : 0;
    }
    this.computeBeams();
  }

  get won() {
    return this.outcome !== null;
  }

  /** Signale un événement aux couches de présentation (son, effets). */
  emit(type, source = null) {
    this.events.push({ type, source });
  }

  /** Acteurs encore « présents » (le joueur tombé ne compte plus). */
  liveActors() {
    return this.actors.filter((a) => !a.dead);
  }

  /** Tout ce qui a un corps et peut gêner : acteurs présents et valises. */
  bodies() {
    return [...this.liveActors(), ...this.blocks];
  }

  /** Avance le monde d'un tick avec l'entrée du joueur. */
  step(playerInput) {
    this.events.length = 0;
    for (const a of this.actors) { a.prevX = a.x; a.prevY = a.y; }
    for (const b of this.blocks) { b.prevX = b.x; b.prevY = b.y; }

    // 1. Plateformes.
    for (const p of this.platforms) stepPlatform(this, p);
    // 2. Valises.
    for (const b of this.blocks) stepBlock(this, b);
    // 3. Acteurs.
    for (const a of this.actors) {
      const bits = actorInput(a, this.tick, playerInput);
      if (!a.dead) stepActor(this, a, bits);
    }
    // 3 bis. Échafaudages : ils cèdent peu après qu'on s'y est posé (ou agrippé).
    this.updateCrumbles();
    // Ressorts : quiconque pose le pied dessus (en marchant ou en tombant) repart en l'air.
    for (const sp of this.springs) {
      if (sp.squash > 0) sp.squash--;
      for (const o of this.bodies()) {
        if (o.vy >= 0 && overlaps(o, sp)) bounceBody(this, o, sp);
      }
    }
    // 4. Faisceaux.
    this.computeBeams();
    const p = this.player;
    if (!p.dead && this.lasers.some((l) => !l.sensor && l.hit === p)) {
      p.dead = true;
      p.vx = 0;
      p.vy = 0;
      this.emit('death', p);
    }
    // 5. Boutons, leviers, capteurs.
    const bodies = this.bodies();
    for (const b of this.buttons) {
      const pressed = bodies.some((o) => overlaps(o, b));
      if (pressed !== b.pressed) {
        b.pressed = pressed;
        this.emit(pressed ? 'button-down' : 'button-up', b);
      }
    }
    // Un levier bascule quand un acteur, debout devant lui, appuie sur Bas / interaction.
    for (const lv of this.levers) {
      for (const a of this.liveActors()) {
        if ((a.actPressed || a.downPressed) && a.onGround && !a.climbing && overlaps(a, lv)) {
          lv.pressed = !lv.pressed;
          this.emit('lever', lv);
        }
      }
    }
    for (const l of this.lasers) {
      if (!l.sensor) continue;
      const cut = l.on && l.hit !== null;
      if (cut && l.latch && !l.latched) { l.latched = true; this.emit('alarm', l); }
      const pressed = cut || l.latched;
      if (pressed !== l.pressed) { l.pressed = pressed; this.emit(pressed ? 'sensor-on' : 'sensor-off', l); }
    }
    // 6. Mécanismes reliés.
    for (const d of this.doors) this.updateDoor(d);
    for (const l of this.lasers) if (l.link) l.linkOn = this.linkActive(l.link);
    for (const pf of this.platforms) {
      const active = this.linkActive(pf);
      if (active !== pf.active) { pf.active = active; this.emit(active ? 'platform-on' : 'platform-off', pf); }
    }
    // 7. Fins.
    if (!p.dead && !this.outcome) {
      const ex = this.level.exit;
      const cx = p.x + (p.w >> 1);
      const feet = p.y + p.h;
      if (cx >= ex.x && cx < ex.x + ex.w && feet > ex.y && feet <= ex.y + ex.h) {
        this.outcome = 'exit';
        this.emit('exit', p);
      } else if (this.level.stay && (p.actPressed || p.downPressed) && p.onGround) {
        const z = this.level.stay;
        if (cx >= z.x && cx < z.x + z.w && feet > z.y && feet <= z.y + z.h) {
          this.outcome = 'stay';
          this.emit('stay', p);
        }
      }
    }

    this.tick++;
  }

  /** Condition {buttons, mode, invert} évaluée sur l'état des boutons, leviers, capteurs. */
  linkActive(link) {
    const states = link.buttons.map((id) => this.switchById.get(id).pressed);
    let v;
    if (link.mode === 'or') v = states.some(Boolean);
    else if (link.mode === 'xor') v = states.filter(Boolean).length % 2 === 1;
    else v = states.every(Boolean);
    return link.invert ? !v : v;
  }

  /** Échafaudages : intacts, puis tremblants, puis effondrés (jusqu'à la fin de la tentative). */
  updateCrumbles() {
    for (const c of this.crumbles) {
      if (c.state === 'intact') {
        const loaded = this.bodies().some((o) => o.ground === c)
          || this.liveActors().some((a) => a.climbing && this.blockerFor(a, 'x', a.facing * 2 * 16) === c);
        if (loaded) { c.state = 'shaking'; c.timer = CRUMBLE_TICKS; this.emit('crumble-shake', c); }
      } else if (c.state === 'shaking' && --c.timer <= 0) {
        c.state = 'gone';
        this.emit('crumble', c);
      }
    }
  }

  /** Allumé maintenant ? (boutons reliés, et cycle éventuel) */
  laserOn(l) {
    if (!l.linkOn) return false;
    if (!l.cycle) return true;
    const period = l.cycle[0] + l.cycle[1];
    return ((this.tick + l.phase) % period + period) % period < l.cycle[0];
  }

  updateDoor(d) {
    const active = this.linkActive(d);
    if (active !== d.target) {
      d.target = active;
      this.emit(active ? 'door-open' : 'door-close', d);
    }
    if (active) {
      if (d.open < DOOR_TICKS) d.open++;
    } else if (d.open > 0) {
      // Une porte ne se referme pas sur quelqu'un : elle attend qu'il soit passé.
      const next = doorSolidRect(d, d.open - 1);
      if (!this.bodies().some((o) => overlaps(o, next))) d.open--;
    }
  }

  /** Une valise poussée de `amount` ; renvoie le déplacement obtenu. */
  pushBlock(b, amount) {
    const x0 = b.x;
    moveAxis(this, b, 'x', amount);
    const moved = b.x - x0;
    b.dx += moved;
    if (moved !== 0) this.emit('push', b);
    return moved;
  }

  /** Type de la case (col, row) ; hors de la grille, tout est mur. */
  tileAt(col, row) {
    if (col < 0 || col >= GRID_W || row < 0 || row >= GRID_H) return T_SOLID;
    return this.level.tiles[row * GRID_W + col];
  }

  /**
   * Obstacle rencontré par `body` s'il était décalé de `delta` sur `axis`,
   * ou null. `ignore` : un corps à ne pas considérer.
   *
   * Règles : murs, portes fermées, plateformes et valises arrêtent tout le
   * monde. Les acteurs ne se bloquent jamais entre eux ; un acteur peut
   * seulement se poser sur la tête d'un acteur plus ancien (courte échelle).
   * Une valise, elle, bute sur les acteurs (elle ne les traverse pas).
   */
  blockerFor(body, axis, delta, ignore = null) {
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
        if (t === T_ICE) return ICE_HIT;
        if (t === T_CONV_L) return CONV_L_HIT;
        if (t === T_CONV_R) return CONV_R_HIT;
        if (t === T_GHOST && body.kind !== 'echo') return TILE_HIT;
        if (t === T_GLASS && body.kind === 'echo') return TILE_HIT;
        if (t === T_ONEWAY && falling) {
          const top = r * TILE_SUB;
          if (oldBottom <= top && newBottom > top) return TILE_HIT;
        }
      }
    }

    const rect = { x, y, w, h };
    // Portes (seule la partie encore fermée est solide).
    for (const d of this.doors) {
      if (d.open >= DOOR_TICKS) continue;
      if (overlaps(rect, doorSolidRect(d, d.open))) return d;
    }
    // Plateformes mobiles, échafaudages, ressorts et valises.
    for (const p of this.platforms) {
      if (p !== ignore && overlaps(rect, p)) return p;
    }
    for (const c of this.crumbles) {
      if (c.state !== 'gone' && overlaps(rect, c)) return c;
    }

    for (const b of this.blocks) {
      if (b !== body && b !== ignore && overlaps(rect, b)) return b;
    }

    if (body.kind === 'block') {
      // Une valise s'arrête contre un acteur (ou se pose sur sa tête).
      for (const o of this.actors) {
        if (!o.dead && o !== ignore && overlaps(rect, o)) return o;
      }
    } else if (falling && body.index !== undefined) {
      // Têtes des acteurs plus anciens : plateformes à sens unique.
      for (const o of this.actors) {
        if (o.index >= body.index) break;
        if (o.dead) continue;
        const top = o.y;
        if (oldBottom <= top && newBottom > top && x < o.x + o.w && x + w > o.x) return o;
      }
    }
    return null;
  }

  /**
   * Propage chaque faisceau depuis son émetteur jusqu'au premier obstacle :
   * mur, porte, plateforme, valise ou acteur. `hit` désigne le corps touché.
   */
  computeBeams() {
    for (const l of this.lasers) {
      l.hit = null;
      const on = this.laserOn(l);
      if (on !== l.on) { l.on = on; this.emit(on ? 'laser-on' : 'laser-off', l); }
      if (!l.on) { l.ex = l.ox; l.ey = l.oy; continue; }
      // Jusqu'au premier mur, case par case.
      let c = Math.floor((l.ox + l.dx) / TILE_SUB);
      let r = Math.floor((l.oy + l.dy) / TILE_SUB);
      while (!OPAQUE.has(this.tileAt(c, r))) { c += l.dx; r += l.dy; }
      let dist; // longueur jusqu'au mur, en sous-pixels
      if (l.dx > 0) dist = c * TILE_SUB - l.ox;
      else if (l.dx < 0) dist = l.ox - (c + 1) * TILE_SUB;
      else if (l.dy > 0) dist = r * TILE_SUB - l.oy;
      else dist = l.oy - (r + 1) * TILE_SUB;

      // Puis le corps le plus proche sur la trajectoire.
      const candidates = [
        ...this.doors.filter((d) => d.open < DOOR_TICKS).map((d) => doorSolidRect(d, d.open)),
        ...this.platforms,
        ...this.crumbles.filter((cr) => cr.state !== 'gone'),
        ...this.blocks,
        ...this.liveActors(),
      ];
      for (const o of candidates) {
        const beam = beamRect(l, dist);
        if (!overlaps(beam, o)) continue;
        let d;
        if (l.dx > 0) d = o.x - l.ox;
        else if (l.dx < 0) d = l.ox - (o.x + o.w);
        else if (l.dy > 0) d = o.y - l.oy;
        else d = l.oy - (o.y + o.h);
        d = Math.max(0, d);
        if (d < dist || (d === dist && !l.hit)) {
          dist = d;
          // Porte, échafaudage : simples obstacles ; corps (acteur, valise, plateforme) : touché.
          l.hit = o.kind === undefined || o.kind === 'crumble' ? null : o;
        }
      }
      l.ex = l.ox + l.dx * dist;
      l.ey = l.oy + l.dy * dist;
    }
  }
}

/** Rebond sur un ressort : acteur (dash rechargé) ou valise (un peu moins haut). */
function bounceBody(world, o, sp) {
  if (o.kind === 'block') {
    o.vy = -Math.trunc(SPRING_VEL * 0.8);
    o.onGround = false;
    o.ground = null;
    sp.squash = 8;
    world.emit('spring', o);
  } else {
    bounce(world, o, sp);
  }
}

/** Rectangle occupé par un faisceau de longueur `dist`. */
function beamRect(l, dist) {
  if (l.dx !== 0) {
    const x = l.dx > 0 ? l.ox : l.ox - dist;
    return { x, y: l.oy - BEAM_HALF, w: dist, h: BEAM_HALF * 2 };
  }
  const y = l.dy > 0 ? l.oy : l.oy - dist;
  return { x: l.ox - BEAM_HALF, y, w: BEAM_HALF * 2, h: dist };
}

/**
 * Partie solide d'une porte pour un degré d'ouverture donné : la porte coulisse
 * vers le haut, dans le mur, et libère le passage par le bas.
 */
export function doorSolidRect(d, open) {
  const hidden = Math.floor((d.h * open) / DOOR_TICKS);
  return { x: d.x, y: d.y, w: d.w, h: d.h - hidden };
}
