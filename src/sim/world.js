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
  T_GATE_R, T_GATE_L, T_MIRROR_A, T_MIRROR_B, T_RECEIVER,
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

/** Tourniquet franchi à contresens ; pont de lumière sous les pieds. */
const GATE_HIT = Object.freeze({ kind: 'gate' });
const BRIDGE_HIT = Object.freeze({ kind: 'bridge' });

/** Cases qui arrêtent les faisceaux (les tableaux et vitrines les laissent passer). */
const OPAQUE = new Set([T_SOLID, T_ICE, T_CONV_L, T_CONV_R, T_RECEIVER]);
/** Nombre maximal de renvois d'un faisceau par des miroirs. */
const MAX_BOUNCES = 24;

export class World {
  /**
   * @param {object} level niveau issu de parseLevel
   * @param {{tape: Uint8Array, attempt: number}[]} echoes bandes à rejouer,
   *   de la plus ancienne à la plus récente
   * @param {number} attempt numéro de la tentative en cours
   * @param {{spawn?: {x:number,y:number}|null, carry?: object|null}} from ce qui
   *   vient de la tentative précédente : départ du joueur (relais), malles restées en place
   */
  constructor(level, echoes = [], attempt = 1, from = {}) {
    this.level = level;
    /** Capacités du niveau : 'walljump', 'grab', 'dash'. */
    this.abilities = new Set(level.abilities);
    this.tick = 0;
    /** null, puis 'exit' (sortie atteinte) ou 'stay' (on reste sur le quai). */
    this.outcome = null;
    /** Événements du dernier tick (sons, effets) : [{type, source}] */
    this.events = [];

    this.buttons = level.buttons.map((b) => ({ ...b, pressed: false, timer: 0, count: 0 }));
    this.winds = level.winds.map((w) => ({ ...w, on: true }));
    this.levers = level.levers.map((l) => ({ ...l, kind: 'lever', pressed: false }));
    // Tout ce qu'un lien peut citer : boutons, leviers, capteurs.
    this.switchById = new Map([...this.buttons, ...this.levers].map((b) => [b.id, b]));
    this.crumbles = level.crumbles.map((c) => ({ ...c, kind: 'crumble', dx: 0, dy: 0, state: 'intact', timer: 0 }));
    this.springs = level.springs.map((sp) => ({ ...sp, kind: 'spring', dx: 0, dy: 0, squash: 0 }));
    // `open` va de 0 (fermée) à DOOR_TICKS (ouverte).
    this.doors = level.doors.map((d) => ({ ...d, open: 0, target: false, kind: 'door' }));
    this.blocks = level.blocks.map((b, i) => createBlock(b, i));
    // Les malles restent où la tentative précédente les a laissées.
    if (from.carry) {
      this.blocks.forEach((b, i) => {
        const c = from.carry.blocks[i];
        if (b.persist && c) { b.x = b.prevX = c.x; b.y = b.prevY = c.y; }
      });
    }
    this.receivers = level.receivers.map((r) => ({ ...r, kind: 'receiver', lit: false, pressed: false, timer: 0 }));
    for (const r of this.receivers) this.switchById.set(r.id, r);
    this.mirrors = level.mirrors.map((m) => ({ ...m, flipped: false }));
    this.mirrorAt = new Map(this.mirrors.map((m) => [m.row * GRID_W + m.col, m]));
    this.relays = level.relays.map((r) => ({ ...r, active: false }));
    this.platforms = level.platforms.map((p) => createPlatform(p));
    this.lasers = level.lasers.map((l) => ({
      ...l, linkOn: !l.link, on: !l.link, ex: l.ox, ey: l.oy, hit: null, pressed: false, latched: false, segs: [],
    }));
    for (const l of this.lasers) if (l.sensor) this.switchById.set(l.sensor, l);

    // Un écho part du départ des échos (« Q ») s'il y en a un ; sinon, de là où
    // son enregistrement a commencé (relais) ; sinon, du nôtre.
    this.actors = echoes.map((e, i) => createActor(
      level.echoSpawn ?? e.spawn ?? level.spawn, i, e.tape, e.attempt, level.echoMirror,
    ));
    this.player = createActor(from.spawn ?? level.spawn, echoes.length, null, attempt);
    this.actors.push(this.player);
    // État initial des mécanismes reliés. Les récepteurs éclairés dès le départ
    // comptent : on laisse la lumière se stabiliser (miroirs, faisceaux reliés).
    for (let pass = 0; pass < 3; pass++) {
      this.computeBeams();
      for (const r of this.receivers) r.pressed = r.lit;
      for (const m of this.mirrors) m.flipped = this.linkActive(m);
      for (const l of this.lasers) if (l.link) l.linkOn = this.linkActive(l.link);
      for (const pf of this.platforms) pf.active = this.linkActive(pf);
    }
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
    // 3 bis. Courants d'air : ils poussent tout ce qui s'y trouve.
    for (const wd of this.winds) {
      wd.on = cycleOn(wd.cycle, wd.phase, this.tick);
      if (!wd.on) continue;
      for (const o of this.bodies()) if (overlaps(o, wd)) moveAxis(this, o, 'x', wd.dx);
    }
    // 3 ter. Échafaudages : ils cèdent peu après qu'on s'y est posé (ou agrippé).
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
    if (!p.dead && this.lasers.some((l) => !l.sensor && !l.erase && !l.bridge && l.hit === p)) {
      p.dead = true;
      p.vx = 0;
      p.vy = 0;
      this.emit('death', p);
    }
    // La lampe du contrôleur efface les échos qu'elle touche.
    for (const l of this.lasers) {
      if (l.erase && l.hit && l.hit.kind === 'echo' && !l.hit.dead) {
        l.hit.dead = true;
        l.hit.erased = true;
        this.emit('erase', l.hit);
        this.computeBeams();
      }
    }
    // La marée : on se noie quand l'eau passe au-dessus de la tête (pas les échos).
    if (!p.dead && this.level.water && p.y + (p.h >> 2) > this.waterY()) {
      p.dead = true;
      p.vx = 0;
      p.vy = 0;
      this.emit('drown', p);
    }
    // 5. Boutons, leviers, capteurs.
    const bodies = this.bodies();
    for (const b of this.buttons) {
      // Plaque lourde : il faut assez de corps dessus. Minuterie : elle reste active un moment.
      b.count = bodies.filter((o) => overlaps(o, b)).length;
      const active = b.count >= b.weight;
      if (active) b.timer = b.hold;
      else if (b.timer > 0) b.timer--;
      const pressed = active || b.timer > 0;
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
    for (const r of this.receivers) {
      if (r.lit) r.timer = r.hold;
      else if (r.timer > 0) r.timer--;
      const pressed = r.lit || r.timer > 0;
      if (pressed !== r.pressed) { r.pressed = pressed; this.emit(pressed ? 'receiver-on' : 'receiver-off', r); }
    }
    for (const rl of this.relays) rl.active = this.relayUnderPlayer() === rl;
    for (const l of this.lasers) {
      if (!l.sensor) continue;
      const cut = l.on && l.hit !== null;
      if (cut && l.latch && !l.latched) { l.latched = true; this.emit('alarm', l); }
      const pressed = cut || l.latched;
      if (pressed !== l.pressed) { l.pressed = pressed; this.emit(pressed ? 'sensor-on' : 'sensor-off', l); }
    }
    // 6. Mécanismes reliés.
    for (const d of this.doors) this.updateDoor(d);
    for (const m of this.mirrors) {
      const flipped = this.linkActive(m);
      if (flipped !== m.flipped) { m.flipped = flipped; this.emit('mirror', m); }
    }
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
    return cycleOn(l.cycle, l.phase, this.tick);
  }

  /** Hauteur de la surface de l'eau (sous-pixels, repère de la grille), ou Infinity. */
  waterY() {
    const wt = this.level.water;
    if (!wt) return Infinity;
    const pos = (((this.tick + wt.phase) % wt.period) + wt.period) % wt.period;
    const half = wt.period >> 1;
    const frac = pos < half ? pos : wt.period - pos;
    return wt.y0 - Math.floor((wt.amp * frac) / half);
  }

  /** Le relais sur lequel le joueur se tient (debout, vivant), ou null. */
  relayUnderPlayer() {
    const p = this.player;
    if (p.dead || !p.onGround) return null;
    return this.relays.find((r) => overlaps(p, r)) ?? null;
  }

  /** Ce qui restera pour la tentative suivante : la place des malles. */
  carryState() {
    return { blocks: this.blocks.map((b) => (b.persist ? { x: b.x, y: b.y } : null)) };
  }

  /** Diagonale d'un miroir à cet instant (les miroirs pivotants basculent). */
  mirrorType(col, row) {
    const t = this.tileAt(col, row);
    const m = this.mirrorAt.get(row * GRID_W + col);
    if (!m || !m.flipped) return t;
    return t === T_MIRROR_A ? T_MIRROR_B : T_MIRROR_A;
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
        if (t === T_SOLID || t === T_MIRROR_A || t === T_MIRROR_B || t === T_RECEIVER) return TILE_HIT;
        if (t === T_ICE) return ICE_HIT;
        // Tourniquets : on n'y entre que par le bon côté.
        if (t === T_GATE_R && axis === 'x' && delta < 0 && body.x >= (c + 1) * TILE_SUB) return GATE_HIT;
        if (t === T_GATE_L && axis === 'x' && delta > 0 && body.x + w <= c * TILE_SUB) return GATE_HIT;
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

    // Ponts de lumière : les portions horizontales portent, comme une plateforme fine.
    if (falling) {
      for (const l of this.lasers) {
        if (!l.bridge || !l.on) continue;
        for (const sg of l.segs) {
          if (sg.dy !== 0) continue;
          const top = Math.floor(sg.y0 / TILE_SUB) * TILE_SUB;
          if (oldBottom <= top && newBottom > top && x < Math.max(sg.x0, sg.x1) && x + w > Math.min(sg.x0, sg.x1)) {
            return BRIDGE_HIT;
          }
        }
      }
    }

    for (const b of this.blocks) {
      if (b === body || b === ignore || !overlaps(rect, b)) continue;
      // Un acteur déjà pris dans une valise (une malle restée sur son départ) peut s'en dégager.
      if (body.index !== undefined && overlaps(body, b)) continue;
      return b;
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
    // Les corps qui arrêtent un faisceau.
    const candidates = [
      ...this.doors.filter((d) => d.open < DOOR_TICKS).map((d) => doorSolidRect(d, d.open)),
      ...this.platforms,
      ...this.crumbles.filter((cr) => cr.state !== 'gone'),
      ...this.blocks,
      ...this.liveActors(),
    ];
    for (const r of this.receivers) r.lit = false;
    for (const l of this.lasers) {
      l.hit = null;
      l.segs = [];
      const on = this.laserOn(l);
      if (on !== l.on) { l.on = on; this.emit(on ? 'laser-on' : 'laser-off', l); }
      l.ex = l.ox;
      l.ey = l.oy;
      if (!l.on) continue;
      // De miroir en miroir : chaque portion va jusqu'au premier mur, miroir ou corps.
      let x = l.ox, y = l.oy, dx = l.dx, dy = l.dy;
      let c = Math.floor((x + dx) / TILE_SUB);
      let r = Math.floor((y + dy) / TILE_SUB);
      for (let n = 0; n <= MAX_BOUNCES; n++) {
        let t = this.tileAt(c, r);
        while (!OPAQUE.has(t) && t !== T_MIRROR_A && t !== T_MIRROR_B) { c += dx; r += dy; t = this.tileAt(c, r); }
        const mirror = t === T_MIRROR_A || t === T_MIRROR_B;
        // Longueur jusqu'à la face du mur, ou jusqu'au centre du miroir.
        const half = mirror ? TILE_SUB >> 1 : 0;
        let dist;
        if (dx > 0) dist = c * TILE_SUB + half - x;
        else if (dx < 0) dist = x - (c + 1) * TILE_SUB + half;
        else if (dy > 0) dist = r * TILE_SUB + half - y;
        else dist = y - (r + 1) * TILE_SUB + half;

        // Puis le corps le plus proche sur la trajectoire.
        let stopped = false;
        const beam = beamRect(x, y, dx, dy, dist);
        for (const o of candidates) {
          if (!overlaps(beam, o)) continue;
          let d;
          if (dx > 0) d = o.x - x;
          else if (dx < 0) d = x - (o.x + o.w);
          else if (dy > 0) d = o.y - y;
          else d = y - (o.y + o.h);
          d = Math.max(0, d);
          if (d < dist || (d === dist && !l.hit)) {
            dist = d;
            stopped = true;
            // Porte, échafaudage : simples obstacles ; corps (acteur, valise, plateforme) : touché.
            l.hit = o.kind === undefined || o.kind === 'crumble' ? null : o;
          }
        }
        const x1 = x + dx * dist, y1 = y + dy * dist;
        l.segs.push({ x0: x, y0: y, x1, y1, dx, dy });
        l.ex = x1;
        l.ey = y1;
        if (stopped) break;
        if (!mirror) {
          if (t === T_RECEIVER) {
            const rc = this.receivers.find((q) => q.col === c && q.row === r);
            if (rc) rc.lit = true;
          }
          break;
        }
        // Renvoi à angle droit : « / » (droite → haut), « \\ » (droite → bas).
        const a = this.mirrorType(c, r) === T_MIRROR_A;
        [dx, dy] = a ? [-dy, -dx] : [dy, dx];
        x = x1;
        y = y1;
        c += dx;
        r += dy;
      }
    }
  }
}

/** Cycle [allumé, éteint] décalé de `phase` : actif à ce tick ? (sans cycle : toujours) */
function cycleOn(cycle, phase, tick) {
  if (!cycle) return true;
  const period = cycle[0] + cycle[1];
  return (((tick + phase) % period) + period) % period < cycle[0];
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

/** Rectangle occupé par une portion de faisceau partant de (ox, oy), de longueur `dist`. */
function beamRect(ox, oy, dx, dy, dist) {
  if (dx !== 0) {
    const x = dx > 0 ? ox : ox - dist;
    return { x, y: oy - BEAM_HALF, w: dist, h: BEAM_HALF * 2 };
  }
  const y = dy > 0 ? oy : oy - dist;
  return { x: ox - BEAM_HALF, y, w: BEAM_HALF * 2, h: dist };
}

/**
 * Partie solide d'une porte pour un degré d'ouverture donné : la porte coulisse
 * vers le haut, dans le mur, et libère le passage par le bas.
 */
export function doorSolidRect(d, open) {
  const hidden = Math.floor((d.h * open) / DOOR_TICKS);
  return { x: d.x, y: d.y, w: d.w, h: d.h - hidden };
}
