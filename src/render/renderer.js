// Rendu : pixel art net + éclairage lisse.
//
// Le rendu ne fait que LIRE la session et le monde ; il ne modifie jamais la
// simulation. Il interpole les positions entre deux ticks (`alpha`) pour rester
// fluide sur les écrans à plus de 60 Hz.
//
// Chaîne d'une image (voir aussi lighting.js) :
//   pix   (albedo, net)     ──┐
//   lumière (lisse)  × multiply
//   volumes (lisse)  + lighter
//   émissif (net)    + lighter
//   halo (lisse)     + lighter
//   vignette, puis interface (nette)
// L'écran final est à la résolution de l'appareil : chaque pixel du jeu y est
// un carré de N × N pixels, et la lumière, elle, y est parfaitement douce.

import { TILE, SUB, DOOR_TICKS } from '../sim/constants.js';
import { C, ECHO_TINTS } from './palette.js';
import { makeCanvas, rect, px, textSprite } from './pixel.js';
import { VIEW_W, VIEW_H, LEVEL_Y, view as screenView, sceneBounds } from './screen.js';
import { themeOf, paintTiles, floorRowBelow } from './themes.js';
import { paintDecor } from './decor.js';
import { Lighting } from './lighting.js';
import { drawHud } from './hud.js';
import { drawElements, drawWeather } from './elements.js';
import { sprite, rimSprite, outlineSprite, WALK_CYCLE, SPRITE_DX } from './sprites.js';

const TRAIL_LEN = 14;
/** Couleur des barrières lumineuses (capteurs non mortels). */
const SENSOR = '#6ad2ff';
const TRAIL_EVERY = 2; // ticks entre deux échantillons de traînée

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;
    this.lighting = new Lighting();
    this.scene = null;
    this.anim = new WeakMap();
    this.trails = new Map();
    this.trailWorld = null;
    this.lastTick = -1;
    this.time = 0;
    this.lastNow = performance.now();
    this.resize(1);
  }

  /**
   * Taille de l'écran final. En qualité haute, on compose à la résolution de
   * l'appareil (VIEW × scale) : lumière parfaitement douce. En qualité basse,
   * on compose à la résolution interne et le navigateur agrandit sans lissage :
   * la lumière devient elle aussi « pixel », mais tout reste fluide.
   */
  resize(scale, quality = this.quality ?? 'high', v = screenView) {
    this.scale = scale;
    this.quality = quality;
    const k = quality === 'high' ? scale : 1;
    const key = `${v.w}x${v.h}+${v.ox}+${v.oy}@${k}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    this.view = { w: v.w, h: v.h, ox: v.ox, oy: v.oy };
    this.canvas.width = v.w * k;
    this.canvas.height = v.h * k;
    this.pix = makeCanvas(v.w, v.h);
    this.emis = makeCanvas(v.w, v.h);
    this.hud = makeCanvas(v.w, v.h);
    this.lighting.resize(v.w, v.h);
    this.vignette = buildVignette(v.w * k, v.h * k);
    this.scene = null;
  }

  /**
   * @param {import('../sim/session.js').Session} session
   * @param {number} alpha fraction de tick écoulée depuis le dernier pas
   * @param {{ overlay?: object|null, overlayTicks?: number, fade?: number }} ui
   */
  draw(session, alpha, ui = {}) {
    const now = performance.now();
    this.time += Math.min(0.1, (now - this.lastNow) / 1000);
    this.lastNow = now;
    const t = this.time;
    const world = session.world;
    const v = this.view;
    if (!this.scene || this.scene.level !== session.level) this.scene = buildScene(session.level, v);
    const scene = this.scene;
    const newTick = world.tick !== this.lastTick || this.trailWorld !== world;
    this.lastTick = world.tick;
    if (newTick) this.sampleAnimation(world);

    // --- Calques nets ------------------------------------------------------
    const P = this.pix.getContext('2d');
    const E = this.emis.getContext('2d');
    // Les fonds sont à la taille de l'image ; tout le reste se dessine dans
    // le repère de la scène, décalé de (ox, oy).
    P.setTransform(1, 0, 0, 1, 0, 0);
    P.drawImage(scene.albedo, 0, 0);
    P.setTransform(1, 0, 0, 1, v.ox, v.oy);
    E.setTransform(1, 0, 0, 1, 0, 0);
    E.clearRect(0, 0, v.w, v.h);
    E.drawImage(scene.emissive, 0, 0);
    E.setTransform(1, 0, 0, 1, v.ox, v.oy);
    this.drawStars(E, scene, t);

    const lights = [...scene.lights];
    const volumes = [...scene.volumes];
    this.drawExit(P, E, scene, world, t, lights);
    for (const b of world.buttons) this.drawButton(P, E, b, lights);
    for (const d of world.doors) this.drawDoor(P, E, d, lights);
    for (const pf of world.platforms) this.drawPlatform(P, E, pf, alpha, lights, t);
    drawElements(P, E, world, lights, t);

    const occluders = [];
    for (const b of world.blocks) this.drawBlock(P, b, alpha, occluders);
    this.drawLasers(P, E, world, lights, volumes, t);
    this.drawActors(P, E, world, alpha, lights, occluders, t);
    this.drawStayHint(E, world, t);
    this.drawDust(E, volumes, t);
    drawWeather(E, scene.theme.weather, this.view, t);
    this.drawReplayRipple(E, session, world);

    // --- Lumière -------------------------------------------------------------
    const L = this.lighting.buildLightMap(scene.theme.ambient, lights, occluders, t, v.ox, v.oy);
    const V = this.lighting.buildVolumes(volumes, lights, scene.fog, t, v.ox, v.oy);
    const [b1, b2, b3] = this.lighting.bloom(this.emis);

    // --- Composition à la résolution de l'écran ------------------------------
    const D = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    D.globalCompositeOperation = 'source-over';
    D.globalAlpha = 1;
    D.imageSmoothingEnabled = false;
    D.drawImage(this.pix, 0, 0, W, H);
    D.imageSmoothingEnabled = true;
    D.imageSmoothingQuality = 'high';
    D.globalCompositeOperation = 'multiply';
    D.drawImage(L, 0, 0, W, H);
    D.globalCompositeOperation = 'lighter';
    D.drawImage(V, 0, 0, W, H);
    D.imageSmoothingEnabled = false;
    D.drawImage(this.emis, 0, 0, W, H);
    D.imageSmoothingEnabled = true;
    D.globalAlpha = 0.5;
    D.drawImage(b1, 0, 0, W, H);
    D.globalAlpha = 0.55;
    D.drawImage(b2, 0, 0, W, H);
    D.globalAlpha = 0.6;
    D.drawImage(b3, 0, 0, W, H);
    D.globalAlpha = 1;
    D.globalCompositeOperation = 'source-over';
    D.drawImage(this.vignette, 0, 0);

    // Le joueur vient de toucher un faisceau : bref voile rouge.
    const death = this.deathProgress(world);
    if (death > 0 && death < 1) {
      D.fillStyle = `rgba(255,70,60,${0.22 * (1 - death) ** 2})`;
      D.fillRect(0, 0, W, H);
    }

    // Fondus d'entrée de niveau et de sortie.
    const fadeIn = ui.hideHud ? 0 : Math.max(0, 1 - session.levelTick / 40);
    const fade = Math.max(fadeIn, ui.fade ?? 0);
    if (fade > 0) {
      D.fillStyle = `rgba(5,6,15,${fade})`;
      D.fillRect(0, 0, W, H);
    }

    // Interface, nette, par-dessus tout.
    if (!ui.hideHud) {
      const hc = this.hud.getContext('2d');
      hc.setTransform(1, 0, 0, 1, 0, 0);
      hc.clearRect(0, 0, v.w, v.h);
      hc.setTransform(1, 0, 0, 1, v.ox, v.oy);
      drawHud(hc, session, { ...ui, bounds: sceneBounds(v) });
      D.imageSmoothingEnabled = false;
      D.drawImage(this.hud, 0, 0, W, H);
    }
  }

  // --- Animation (échantillonnée une fois par tick) -------------------------

  sampleAnimation(world) {
    if (this.trailWorld !== world) {
      this.trails.clear();
      this.trailWorld = world;
    }
    for (const a of world.actors) {
      let s = this.anim.get(a);
      if (!s) this.anim.set(a, (s = { walk: 0, land: 0, wasGround: true, scarf: 0 }));
      if (a.onGround && !s.wasGround && a.vy === 0) s.land = 6;
      else if (s.land > 0) s.land--;
      s.wasGround = a.onGround;
      if (a.onGround) s.walk += Math.abs(a.dx);
      s.scarf += (Math.abs(a.vx) - s.scarf) * 0.15;
      // Images rémanentes du dash.
      s.ghosts = (s.ghosts ?? []).filter((g) => world.tick - g.tick < 14);
      if (a.dashing > 0 && !a.dead) {
        s.ghosts.push({ x: a.x, y: a.y, frame: this.frameOf(a, world.tick), facing: a.facing, tick: world.tick });
      }
      if (a.kind === 'echo' && world.tick % TRAIL_EVERY === 0) {
        let tr = this.trails.get(a);
        if (!tr) this.trails.set(a, (tr = []));
        tr.push({ x: a.x, y: a.y, frame: this.frameOf(a, world.tick), facing: a.facing });
        if (tr.length > TRAIL_LEN) tr.shift();
      }
    }
  }

  frameOf(a, tick) {
    const s = this.anim.get(a);
    if (a.climbing) return Math.floor(a.y / (5 * SUB)) % 2 ? 'climbB' : 'climbA';
    if (a.sliding) return 'slide';
    if (!a.onGround) return a.vy < 0 || a.dashing > 0 ? 'jump' : 'fall';
    if (s && s.land > 0) return 'land';
    if (Math.abs(a.vx) > 3) return WALK_CYCLE[Math.floor((s?.walk ?? 0) / (7 * SUB)) % WALK_CYCLE.length];
    return (tick % 100) < 55 ? 'idleA' : 'idleB';
  }

  // --- Acteurs -----------------------------------------------------------------

  drawActors(P, E, world, alpha, lights, occluders, t) {
    // Images rémanentes des dashs : chaudes pour le joueur, teintées pour les échos.
    for (const a of world.actors) {
      const s = this.anim.get(a);
      if (!s?.ghosts?.length) continue;
      const col = a.kind === 'echo' ? ECHO_TINTS[(a.attempt - 1) % ECHO_TINTS.length] : C.lamp2;
      for (const g of s.ghosts) {
        const age = world.tick - g.tick;
        E.globalAlpha = Math.max(0, 0.5 - age * 0.04) * (a.kind === 'echo' ? 0.6 : 1);
        E.drawImage(sprite(g.frame, g.facing, col), Math.round(g.x / SUB) + SPRITE_DX, Math.round(g.y / SUB) + LEVEL_Y);
      }
      E.globalAlpha = 1;
    }
    // Échos d'abord (traînées, puis silhouettes lumineuses), le joueur ensuite.
    for (const a of world.actors) {
      if (a.kind !== 'echo') continue;
      const tint = ECHO_TINTS[(a.attempt - 1) % ECHO_TINTS.length];
      const trail = this.trails.get(a) ?? [];
      trail.forEach((p, i) => {
        E.globalAlpha = 0.035 + (0.16 * i) / TRAIL_LEN;
        E.drawImage(sprite(p.frame, p.facing, tint), Math.round(p.x / SUB) + SPRITE_DX, Math.round(p.y / SUB) + LEVEL_Y);
      });
      const { x, y } = lerpPos(a, alpha);
      const frame = this.frameOf(a, world.tick);
      const pulse = a.finished ? 0.2 + 0.06 * Math.sin(t * 3) : 0.36;
      E.globalAlpha = pulse;
      E.drawImage(sprite(frame, a.facing, tint), x + SPRITE_DX, y + LEVEL_Y);
      E.globalAlpha = pulse * 0.45;
      E.drawImage(outlineSprite(frame, a.facing, tint), x + SPRITE_DX - 1, y + LEVEL_Y - 1);
      E.globalAlpha = 1;
      this.drawScarf(E, a, x, y, tint, pulse * 0.9, t);
      // Un écho éclaire faiblement autour de lui.
      lights.push({ x: x + 5, y: y + LEVEL_Y + 9, r: 30, color: tint, intensity: a.finished ? 0.25 : 0.45, flicker: 0, shadows: false, halo: 0.5 });
    }

    const p = world.player;
    const { x, y } = lerpPos(p, alpha);
    const sx = x + SPRITE_DX, sy = y + LEVEL_Y;
    const frame = this.frameOf(p, world.tick);
    if (p.dead) {
      this.drawDissolve(P, E, p, frame, sx, sy, lights);
      return;
    }
    // Ombre de contact au sol.
    if (p.onGround) {
      rect(P, x - 1, sy + 21, 12, 1, 'rgba(5,6,15,0.55)');
      rect(P, x + 1, sy + 22, 8, 1, 'rgba(5,6,15,0.35)');
    }
    P.drawImage(sprite(frame, p.facing, C.silhouette), sx, sy);
    this.drawScarf(P, p, x, y, C.silhouette, 1, t);
    // L'écharpe s'allume quand un dash est disponible.
    if (world.abilities.has('dash')) {
      this.drawScarf(E, p, x, y, p.dashes > 0 ? C.lamp2 : C.night4, p.dashes > 0 ? 0.9 : 0.35, t);
      if (p.dashes > 0) lights.push({ x: x + 5 - p.facing * 4, y: sy + 8, r: 16, color: C.lamp1, intensity: 0.35, flicker: 0, shadows: false, halo: 0.3 });
    }
    // Endurance presque épuisée : la silhouette clignote en rouge.
    if (p.climbing && p.stamina < 90 && (world.tick >> 2) & 1) {
      E.globalAlpha = 0.9;
      E.drawImage(rimSprite(frame, p.facing, -p.facing, C.signalRed), sx, sy);
      E.globalAlpha = 1;
    }
    occluders.push({ x: x + 1, y: sy + 1, w: p.w / SUB - 2, h: p.h / SUB - 1 });

    // Liseré de lumière du côté de la source la plus forte.
    let best = null, bestI = 0;
    const cx = x + 5, cy = sy + 8;
    for (const L of lights) {
      if (L.color === undefined || L.r < 40) continue;
      const d = Math.hypot(L.x - cx, L.y - cy);
      if (d >= L.r) continue;
      const I = L.intensity * (1 - d / L.r) ** 1.4;
      if (I > bestI) { bestI = I; best = L; }
    }
    const warmSide = best ? (best.x < cx ? -1 : 1) : 1;
    // Liseré froid permanent (la nuit, la lune) : la silhouette reste lisible partout.
    E.globalAlpha = 0.24;
    E.drawImage(rimSprite(frame, p.facing, -warmSide, C.moon0), sx, sy);
    if (best && bestI > 0.04) {
      E.globalAlpha = Math.min(0.9, bestI * 1.6);
      E.drawImage(rimSprite(frame, p.facing, warmSide, C.rim), sx, sy);
    }
    E.globalAlpha = 1;
  }

  /** Écharpe : trois pixels qui flottent derrière, au gré de l'allure et du vent. */
  drawScarf(ctx, a, x, y, color, alpha, t) {
    const s = this.anim.get(a);
    const speed = s ? Math.min(1, s.scarf / 20) : 0;
    const back = -a.facing;
    const ax = x + 5 + back * 2;
    const ay = y + LEVEL_Y + 7;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 1; i <= 4; i++) {
      const wave = Math.sin(t * 6 + i * 1.3 + a.index) * (0.4 + speed);
      const sag = (1 - speed) * i * 0.9;
      const lx = Math.round(ax + back * i * (0.6 + speed * 0.9));
      const ly = Math.round(ay + sag + wave * 0.8 - speed * 0.5);
      ctx.fillRect(lx, ly, 1, i < 3 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }

  // --- Mécanismes -------------------------------------------------------------

  /** 0 → 1 pendant la disparition du joueur ; 0 s'il est en vie. */
  deathProgress(world) {
    const p = world.player;
    const s = this.anim.get(p);
    if (!p.dead || !s) return 0;
    if (s.deadAt === undefined) s.deadAt = world.tick;
    return Math.min(1, (world.tick - s.deadAt) / 45);
  }

  /** Le joueur touché par un faisceau se défait en braises qui montent. */
  drawDissolve(P, E, p, frame, sx, sy, lights) {
    const k = this.deathProgress(this.trailWorld);
    P.globalAlpha = Math.max(0, 1 - k * 1.6);
    P.drawImage(sprite(frame, p.facing, C.silhouette), sx, sy);
    P.globalAlpha = 1;
    E.globalAlpha = Math.max(0, 0.9 - k);
    E.drawImage(rimSprite(frame, p.facing, 1, C.signalRed), sx, sy);
    for (let i = 0; i < 26; i++) {
      const seed = (i * 73) % 97 / 97;
      const px0 = sx + 1 + ((i * 7) % 10);
      const py0 = sy + 2 + ((i * 13) % 19);
      const rise = k * (14 + seed * 26);
      const drift = Math.sin(seed * 20 + k * 6) * 3 * k;
      const a = (1 - k) * (0.5 + 0.5 * seed);
      if (a <= 0.02) continue;
      E.globalAlpha = a;
      px(E, Math.round(px0 + drift), Math.round(py0 - rise), i % 3 ? C.lamp2 : C.signalRed);
    }
    E.globalAlpha = 1;
    if (k < 1) lights.push({ x: sx + 6, y: sy + 11, r: 40, color: C.signalRed, intensity: 0.7 * (1 - k), flicker: 0, shadows: false, halo: 0.6 });
  }

  /** Valise de cuir (sangles, coins de laiton) ou caisse de bois. */
  drawBlock(P, b, alpha, occluders) {
    const x = Math.round((b.prevX + (b.x - b.prevX) * alpha) / SUB);
    const y = Math.round((b.prevY + (b.y - b.prevY) * alpha) / SUB) + LEVEL_Y;
    const w = b.w / SUB, h = b.h / SUB;
    if (b.onGround) rect(P, x - 1, y + h, w + 2, 1, 'rgba(5,6,15,0.5)');
    if (b.type === 'caisse') {
      rect(P, x, y, w, h, C.wood2);
      rect(P, x, y, w, 2, C.wood3);
      rect(P, x, y + h - 2, w, 2, C.wood1);
      for (let k = 1; k < h - 2; k++) {
        px(P, x + Math.round((k * (w - 1)) / (h - 1)), y + k, C.wood1);
        px(P, x + w - 1 - Math.round((k * (w - 1)) / (h - 1)), y + k, C.wood1);
      }
      rect(P, x, y, 1, h, C.wood0);
      rect(P, x + w - 1, y, 1, h, C.wood0);
    } else {
      // Poignée.
      rect(P, x + 4, y - 2, 6, 1, C.wood0);
      px(P, x + 4, y - 1, C.wood0);
      px(P, x + 9, y - 1, C.wood0);
      rect(P, x, y, w, h, '#7a4529');
      rect(P, x, y, w, 1, '#9a5d38');
      rect(P, x, y + h - 1, w, 1, '#4e2a17');
      // Sangles et coins.
      rect(P, x + 3, y, 2, h, '#4e2a17');
      rect(P, x + w - 5, y, 2, h, '#4e2a17');
      px(P, x + 3, y + 5, C.brass);
      px(P, x + w - 5, y + 5, C.brass);
      for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) px(P, x + cx, y + cy, C.brass);
      // Étiquette de voyage, jaunie.
      rect(P, x + 7, y + 3, 3, 4, C.paper2);
      px(P, x + 8, y + 4, C.brick3);
    }
    occluders.push({ x, y, w, h });
  }

  /** Monte-charge : plancher strié, glissières, câble, voyant qui clignote. */
  drawPlatform(P, E, pf, alpha, lights, t) {
    const x = Math.round((pf.prevX + (pf.x - pf.prevX) * alpha) / SUB);
    const y = Math.round((pf.prevY + (pf.y - pf.prevY) * alpha) / SUB) + LEVEL_Y;
    const w = pf.w / SUB, h = pf.h / SUB;
    const top = Math.min(pf.y0, pf.y1) / SUB + LEVEL_Y - 18;
    // Glissières sur toute la course, poulie en haut, câble jusqu'au plancher.
    if (pf.x0 === pf.x1) {
      rect(P, x - 1, top, 1, Math.max(pf.y0, pf.y1) / SUB + LEVEL_Y - top + h, C.iron1);
      rect(P, x + w, top, 1, Math.max(pf.y0, pf.y1) / SUB + LEVEL_Y - top + h, C.iron1);
      rect(P, x - 2, top - 2, w + 4, 2, C.iron2);
      rect(P, x + (w >> 1) - 2, top, 4, 4, C.iron2);
      rect(P, x + (w >> 1), top + 4, 1, y - top - 4, C.iron0);
    }
    rect(P, x, y, w, h, C.iron2);
    for (let k = 0; k < w; k += 4) {
      rect(P, x + k, y, 2, 2, C.lamp1);
      rect(P, x + k + 2, y, 2, 2, C.ink);
    }
    rect(P, x, y + h - 1, w, 1, C.iron0);
    const blink = pf.moving && ((t * 3) | 0) % 2 === 0;
    const col = pf.active ? (blink ? C.lamp3 : C.lamp1) : C.lamp0;
    rect(E, x + (w >> 1) - 1, y + 3, 2, 1, col);
    if (pf.active) lights.push({ x: x + w / 2, y: y + 4, r: 26, color: C.lamp1, intensity: blink ? 0.55 : 0.3, flicker: 0, shadows: false, halo: 0.5 });
  }

  /** Faisceaux de signal : émetteur, rayon net, lueur, étincelles au contact. */
  drawLasers(P, E, world, lights, volumes, t) {
    for (const l of world.lasers) {
      const cx = l.col * TILE + 8, cy = l.row * TILE + 8 + LEVEL_Y;
      // Boîtier sur la case émettrice, lentille tournée vers le tir.
      rect(P, cx - 6, cy - 6, 12, 12, C.iron1);
      rect(P, cx - 6, cy - 6, 12, 1, C.iron2);
      rect(P, cx - 5, cy + 5, 10, 1, C.iron0);
      const lx = cx + l.dx * 5, ly = cy + l.dy * 5;
      rect(P, lx - 2, ly - 2, 4, 4, C.iron0);
      // Barrière lumineuse (capteur) : bleue ; alarme déclenchée : rouge qui clignote.
      const col = l.sensor ? (l.latched ? C.signalRed : SENSOR) : C.signalRed;
      const dim = l.sensor ? '#103040' : '#401010';
      // Faisceau cyclique : la lentille clignote juste avant de s'allumer.
      let warn = false;
      if (l.cycle && !l.on && l.linkOn) {
        const period = l.cycle[0] + l.cycle[1];
        const pos = (((world.tick + l.phase) % period) + period) % period;
        warn = period - pos <= 30 && ((world.tick >> 2) & 1) === 0;
      }
      rect(E, lx - 1, ly - 1, 2, 2, l.on || warn ? col : dim);
      if (warn) lights.push({ x: lx, y: ly, r: 18, color: col, intensity: 0.6, flicker: 0, shadows: false, halo: 0.8 });
      if (l.sensor && l.latched && ((world.tick >> 4) & 1)) {
        lights.push({ x: cx, y: cy - 10, r: 90, color: C.signalRed, intensity: 0.5, flicker: 0, shadows: false, halo: 0.5 });
      }
      if (!l.on) continue;
      const ox = l.ox / SUB, oy = l.oy / SUB + LEVEL_Y;
      const ex = l.ex / SUB, ey = l.ey / SUB + LEVEL_Y;
      const shimmer = 0.75 + 0.25 * Math.sin(t * 40);
      if (l.dx !== 0) {
        const x0 = Math.min(ox, ex), len = Math.abs(ex - ox);
        E.globalAlpha = shimmer * (l.sensor ? 0.7 : 1);
        rect(E, x0, oy - 1, len, l.sensor ? 1 : 2, col);
        if (!l.sensor) rect(E, x0, oy, len, 1, '#ffd0c8');
      } else {
        const y0 = Math.min(oy, ey), len = Math.abs(ey - oy);
        E.globalAlpha = shimmer * (l.sensor ? 0.7 : 1);
        rect(E, ox - 1, y0, l.sensor ? 1 : 2, len, col);
        if (!l.sensor) rect(E, ox, y0, 1, len, '#ffd0c8');
      }
      E.globalAlpha = 1;
      // Étincelles au point d'impact.
      for (let i = 0; i < 5; i++) {
        const a = t * 9 + i * 1.7;
        const r = (Math.sin(a * 1.3) + 1) * 2;
        if (l.sensor && !l.hit) break;
        px(E, Math.round(ex - l.dx * 1 + Math.cos(a) * r * (l.dx ? 0.5 : 1)), Math.round(ey - l.dy + Math.sin(a) * r), i % 2 ? C.lamp4 : col);
      }
      volumes.push({ type: 'beam', x0: ox, y0: oy, x1: ex, y1: ey, color: col, alpha: l.sensor ? 0.2 : 0.35 });
      const len = Math.hypot(ex - ox, ey - oy);
      for (let d = 12; d < len; d += 28) {
        lights.push({ x: ox + (l.dx * d), y: oy + (l.dy * d), r: 24, color: col, intensity: l.sensor ? 0.2 : 0.35, flicker: 0, shadows: false, halo: 0 });
      }
      lights.push({ x: ex, y: ey, r: 30, color: col, intensity: l.sensor ? 0.35 : 0.7, flicker: 0, shadows: false, halo: 0.6 });
    }
  }

  /** Dernier niveau : devant le banc, une invite discrète à rester. */
  drawStayHint(E, world, t) {
    const z = world.level.stay;
    const p = world.player;
    if (!z || p.dead || !p.onGround) return;
    const cx = p.x + (p.w >> 1), feet = p.y + p.h;
    if (cx < z.x || cx >= z.x + z.w || feet <= z.y || feet > z.y + z.h) return;
    const s = textSprite('RESTER ?', C.paper3, null);
    const x = Math.round((z.x + z.w / 2) / SUB - s.width / 2);
    const y = Math.round(z.y / SUB) + LEVEL_Y - 22;
    E.globalAlpha = 0.55 + 0.35 * Math.sin(t * 2.5);
    E.drawImage(s, x, y);
    // Petite flèche vers le bas.
    const ax = Math.round((z.x + z.w / 2) / SUB);
    for (let k = 0; k < 3; k++) rect(E, ax - 2 + k, y + 11 + k, 5 - k * 2, 1, C.paper3);
    E.globalAlpha = 1;
  }

  drawExit(P, E, scene, world, t, lights) {
    const ex = world.level.exit;
    const x = ex.x / SUB, y = ex.y / SUB + LEVEL_Y, w = ex.w / SUB, h = ex.h / SUB;
    const pulse = 0.85 + 0.15 * Math.sin(t * 1.4);
    // Intérieur lumineux (émissif) : une pièce chaude derrière la porte.
    rect(E, x + 1, y, w - 2, h, C.lamp0);
    rect(E, x + 2, y + 2, w - 4, h - 2, C.lamp1);
    E.globalAlpha = 0.45 + 0.35 * pulse;
    rect(E, x + 4, y + 5, w - 8, h - 7, C.lamp2);
    E.globalAlpha = 1;
    // Silhouette d'un chambranle intérieur, pour la profondeur.
    rect(E, x + w - 4, y + 2, 1, h - 2, C.lamp0);
    lights.push({ x: x + w / 2, y: y + h * 0.55, r: 64, color: C.lamp2, intensity: 0.65 * pulse, flicker: 0, shadows: true, halo: 0.45 });
  }

  drawButton(P, E, b, lights) {
    const x = b.x / SUB, w = b.w / SUB;
    const bottom = (b.y + b.h) / SUB + LEVEL_Y;
    // Socle de laiton encastré, plateau qui s'enfonce.
    rect(P, x - 1, bottom - 2, w + 2, 2, C.iron1);
    const plateH = b.pressed ? 1 : 3;
    rect(P, x + 1, bottom - 2 - plateH, w - 2, plateH, C.brass);
    rect(P, x + 1, bottom - 2 - plateH, w - 2, 1, C.paper3);
    // Voyant : rouge au repos, vert quand on appuie.
    const col = b.pressed ? C.signalGreen : C.signalRed;
    rect(E, x + (w >> 1) - 1, bottom - 2, 2, 1, col);
    lights.push({ x: x + w / 2, y: bottom - 3, r: b.pressed ? 26 : 14, color: col, intensity: b.pressed ? 0.6 : 0.3, flicker: 0, shadows: false, halo: 0.6 });
  }

  drawDoor(P, E, d, lights) {
    const x = d.x / SUB, y = d.y / SUB + LEVEL_Y, w = d.w / SUB, h = d.h / SUB;
    const hidden = Math.floor((h * d.open) / DOOR_TICKS);
    // Rideau de fer à lames, qui remonte dans le mur.
    if (hidden < h) {
      P.save();
      P.beginPath();
      P.rect(x, y, w, h);
      P.clip();
      const py = y - hidden;
      rect(P, x + 1, py, w - 2, h, C.iron2);
      for (let k = 0; k < h; k += 3) {
        rect(P, x + 1, py + k, w - 2, 1, C.stone3);
        rect(P, x + 1, py + k + 2, w - 2, 1, C.iron1);
      }
      rect(P, x + 1, py + h - 2, w - 2, 2, C.brass);
      rect(P, x, py, 1, h, C.iron0);
      rect(P, x + w - 1, py, 1, h, C.iron0);
      P.restore();
    }
    // Rails latéraux.
    rect(P, x, y, 1, h, C.iron1);
    rect(P, x + w - 1, y, 1, h, C.iron1);
    // Feu de signal au-dessus de la porte.
    const open = d.target;
    const col = open ? C.signalGreen : C.signalRed;
    const sx = x + (w >> 1) - 2, sy = y - 6;
    rect(P, sx - 1, sy - 1, 6, 5, C.iron0);
    rect(E, sx, sy, 4, 3, col);
    px(E, sx + 1, sy, '#ffffff');
    lights.push({ x: sx + 2, y: sy + 1, r: 34, color: col, intensity: 0.55, flicker: 0, shadows: false, halo: 0.9 });
  }

  // --- Petits effets -------------------------------------------------------------

  drawStars(E, scene, t) {
    for (const s of scene.twinkles) {
      const a = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
      E.globalAlpha = a;
      px(E, s.x, s.y, C.moon2);
    }
    E.globalAlpha = 1;
  }

  /** Poussières en suspension dans les faisceaux : des pixels nets, qui dérivent. */
  drawDust(E, volumes, t) {
    for (let vi = 0; vi < volumes.length; vi++) {
      const v = volumes[vi];
      if (!v.dust) continue;
      for (let i = 0; i < v.dust; i++) {
        const seed = (vi * 97 + i * 31) % 1000 / 1000;
        const u = (seed * 7.31 + t * (0.025 + seed * 0.02)) % 1;
        const y0 = v.type === 'cone' ? v.y0 : v.y0;
        const y1 = v.y1;
        const y = y0 + (y1 - y0) * u;
        let xc, half;
        if (v.type === 'cone') {
          xc = v.x;
          half = (v.w0 + (v.w1 - v.w0) * u) * 0.35;
        } else {
          xc = (v.x0 + v.x1) / 2 + (y - v.y0) * v.slant;
          half = (v.x1 - v.x0) * 0.45;
        }
        const x = xc + Math.sin(seed * 40 + t * 0.6) * half;
        const a = Math.sin(u * Math.PI) * (0.35 + 0.35 * Math.sin(t * 2 + seed * 20));
        if (a <= 0.05) continue;
        E.globalAlpha = a;
        px(E, Math.round(x), Math.round(y), v.type === 'shaft' ? C.moon2 : C.lamp4);
      }
    }
    E.globalAlpha = 1;
  }

  /** Au début d'une nouvelle tentative : une onde part du point de départ. */
  drawReplayRipple(E, session, world) {
    if (session.attemptCount < 2 || world.tick > 30) return;
    const sp = world.level.spawn;
    const cx = sp.x / SUB + 5, cy = sp.y / SUB + LEVEL_Y + 11;
    const r = 4 + world.tick * 2.2;
    const a = 1 - world.tick / 30;
    E.globalAlpha = a * 0.8;
    E.fillStyle = C.moon1;
    // Cercle en pixels (algorithme du point milieu), net.
    let x = Math.round(r), y = 0, err = 1 - x;
    while (x >= y) {
      for (const [dx, dy] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) {
        E.fillRect(Math.round(cx + dx), Math.round(cy + dy), 1, 1);
      }
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
    E.globalAlpha = 1;
  }
}

/** Position interpolée, en pixels (coin haut-gauche de la boîte). */
function lerpPos(a, alpha) {
  return {
    x: Math.round((a.prevX + (a.x - a.prevX) * alpha) / SUB),
    y: Math.round((a.prevY + (a.y - a.prevY) * alpha) / SUB),
  };
}

/** Tout ce qui ne bouge pas dans une pièce, peint une seule fois. */
export function buildScene(level, v = { w: VIEW_W, h: VIEW_H, ox: 0, oy: 0 }) {
  const theme = themeOf(level);
  const B = sceneBounds(v);
  const albedo = makeCanvas(v.w, v.h);
  const emissive = makeCanvas(v.w, v.h);
  const A = albedo.getContext('2d');
  const Em = emissive.getContext('2d');
  A.translate(v.ox, v.oy);
  Em.translate(v.ox, v.oy);
  const out = { lights: [], volumes: [] };

  // Le fond lointain (ciel, étoiles, ville) a son propre calque émissif :
  // on n'en garde que ce qui reste visible une fois le décor et les murs posés.
  const far = makeCanvas(v.w, v.h);
  const farCtx = far.getContext('2d');
  farCtx.translate(v.ox, v.oy);
  theme.backdrop(level, A, farCtx, out.lights, theme, B);
  const before = A.getImageData(0, 0, v.w, v.h).data;
  paintDecor(level, A, Em, out);
  paintTiles(level, theme, A, B);
  paintDecor(level, A, Em, out, 'front');
  const after = A.getImageData(0, 0, v.w, v.h).data;
  const visible = new Uint8Array(v.w * v.h);
  const farImg = farCtx.getImageData(0, 0, v.w, v.h);
  for (let i = 0; i < visible.length; i++) {
    const k = i * 4;
    visible[i] = before[k] === after[k] && before[k + 1] === after[k + 1] && before[k + 2] === after[k + 2] ? 1 : 0;
    if (!visible[i]) farImg.data[k + 3] = 0;
  }
  farCtx.putImageData(farImg, 0, 0);
  Em.globalCompositeOperation = 'destination-over';
  Em.setTransform(1, 0, 0, 1, 0, 0);
  Em.drawImage(far, 0, 0);
  Em.setTransform(1, 0, 0, 1, v.ox, v.oy);
  Em.globalCompositeOperation = 'source-over';

  // Encadrement de la sortie (bois) et rayons qui s'en échappent.
  const ex = level.exit;
  const x = ex.x / SUB, y = ex.y / SUB + LEVEL_Y, w = ex.w / SUB, h = ex.h / SUB;
  if (level.exitStyle !== 'train') {
    rect(A, x - 2, y - 3, w + 4, h + 3, C.wood1);
    rect(A, x - 1, y - 2, w + 2, h + 2, C.wood3);
    rect(A, x - 2, y - 3, w + 4, 1, C.wood4);
  }
  rect(A, x, y, w, h, C.ink);
  out.volumes.push({ type: 'rays', x: x + w / 2, y: y + h - 2, len: 46, color: C.lamp3, alpha: 0.12, pulse: true });
  out.volumes.push({ type: 'reflect', x: x + w / 2, y: y + h, w: w + 6, h: 10, color: C.lamp3, alpha: 0.35 });

  // Étoiles qui scintillent (prises parmi les pixels clairs du ciel).
  const twinkles = [];
  if (level.theme === 'quai') {
    for (let i = 0; i < 18; i++) {
      const s = { x: (i * 53 + 17) % VIEW_W, y: 6 + ((i * 37) % 150), speed: 1 + (i % 4) * 0.7, phase: i * 1.9 };
      if (visible[(s.y + v.oy) * v.w + s.x + v.ox]) twinkles.push(s);
    }
  }

  // Ligne de sol moyenne pour la brume.
  let floorSum = 0;
  for (let c = 0; c < level.width; c++) floorSum += floorRowBelow(level, c, 0);
  const fog = theme.fog ? { ...theme.fog, floorY: LEVEL_Y + (floorSum / level.width) * TILE } : null;

  return { level, theme, albedo, emissive, lights: out.lights, volumes: out.volumes, twinkles, fog };
}

function buildVignette(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.45, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(5,6,15,0)');
  g.addColorStop(1, 'rgba(5,6,15,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

