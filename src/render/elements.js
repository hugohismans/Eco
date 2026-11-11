// Éléments animés des chapitres 2 à 6 : leviers, échafaudages, ressorts,
// tapis roulants, tableaux, vitrines, courants d'air, marée ; la météo (neige,
// pluie, vent) et le paysage qui défile derrière les fenêtres du train.
// Tout est dessiné dans le repère de la scène (P : albedo, E : émissif).

import {
  TILE, SUB, GRID_W, GRID_H, T_CONV_L, T_CONV_R, T_GHOST, T_GLASS, CRUMBLE_TICKS,
  T_GATE_R, T_GATE_L, T_MIRROR_A, T_MIRROR_B, ACTOR_W, ACTOR_H,
} from '../sim/constants.js';
import { C } from './palette.js';
import { rect, px, makeCanvas, textSprite } from './pixel.js';
import { LEVEL_Y } from './screen.js';

/** Cases spéciales d'un niveau, repérées une fois. */
const cellsCache = new WeakMap();
function specialCells(level) {
  let c = cellsCache.get(level);
  if (c) return c;
  c = { conv: [], ghost: [], glass: [], gates: [], mirrors: [] };
  for (let r = 0; r < GRID_H; r++) {
    for (let col = 0; col < GRID_W; col++) {
      const t = level.tiles[r * GRID_W + col];
      if (t === T_CONV_L || t === T_CONV_R) c.conv.push({ col, row: r, dir: t === T_CONV_L ? -1 : 1 });
      else if (t === T_GHOST) c.ghost.push({ col, row: r });
      else if (t === T_GLASS) c.glass.push({ col, row: r });
      else if (t === T_GATE_R || t === T_GATE_L) c.gates.push({ col, row: r, dir: t === T_GATE_R ? 1 : -1 });
      else if (t === T_MIRROR_A || t === T_MIRROR_B) c.mirrors.push({ col, row: r });
    }
  }
  cellsCache.set(level, c);
  return c;
}

const hash = (i) => (((i * 2654435761) >>> 0) % 10007) / 10007;

export function drawElements(P, E, world, lights, t, spawn = null) {
  const cells = specialCells(world.level);

  // Départ des échos : une psyché, d'où sortent les reflets.
  const q = world.level.echoSpawn;
  if (q) {
    const x = q.x / SUB - 3, y = q.y / SUB + LEVEL_Y - 5;
    const w = ACTOR_W / SUB + 6, h = ACTOR_H / SUB + 5;
    rect(P, x - 1, y - 1, w + 2, h + 1, C.brass);
    rect(P, x - 1, y - 1, w + 2, 1, C.paper3);
    rect(P, x + (w >> 1) - 2, y - 4, 4, 3, C.brass);
    rect(P, x, y, w, h, '#182040');
    E.globalAlpha = 0.5 + 0.12 * Math.sin(t * 1.7);
    rect(E, x, y, w, h, '#0c1226');
    for (let k = 0; k < h - 2; k += 2) {
      const sx = x + 1 + ((k * 3 + Math.floor(t * 6)) % (w - 2));
      px(E, sx, y + 1 + k, '#6a84c8');
    }
    E.globalAlpha = 1;
    lights.push({ x: x + w / 2, y: y + h / 2, r: 30, color: '#8fa6d8', intensity: 0.35, flicker: 0, shadows: false, halo: 0.4 });
  }

  // Relais : une dalle de laiton ; elle s'allume quand on s'y tient, et reste
  // marquée si c'est de là que l'on part désormais.
  for (const rl of world.relays) {
    const x = rl.col * TILE, y = LEVEL_Y + rl.row * TILE;
    const here = !!spawn && spawn.x === rl.spawn.x && spawn.y === rl.spawn.y;
    rect(P, x + 1, y + 14, 14, 2, C.brass);
    rect(P, x + 1, y + 14, 14, 1, C.paper3);
    rect(P, x + 2, y + 15, 12, 1, C.wood1);
    const col = rl.active ? C.lamp4 : here ? C.lamp2 : '#6a5428';
    // Une petite borne à lanterne, pour qu'on le remarque de loin.
    rect(P, x + 1, y + 5, 2, 9, C.iron1);
    rect(P, x, y + 3, 4, 3, C.iron2);
    rect(E, x + 1, y + 4, 2, 1, col);
    // Deux chevrons : « d'ici ».
    for (const k of [5, 9]) { px(E, x + k, y + 13, col); px(E, x + k + 1, y + 12, col); px(E, x + k + 2, y + 13, col); }
    if (rl.active || here) {
      const a = rl.active ? 1 : 0.5;
      for (let i = 0; i < 5; i++) {
        const k = (t * (0.6 + hash(i + 3) * 0.6) + hash(i * 7)) % 1;
        E.globalAlpha = (1 - k) * 0.8 * a;
        px(E, x + 3 + Math.floor(hash(i * 11 + 1) * 10), Math.round(y + 12 - k * 22), C.lamp3);
      }
      E.globalAlpha = 1;
      lights.push({ x: x + 8, y: y + 10, r: rl.active ? 44 : 28, color: C.lamp2, intensity: 0.6 * a, flicker: 0, shadows: false, halo: 0.7 });
      // Debout dessus : un mot discret, « on repartira d'ici ».
      if (rl.active) {
        const label = textSprite('RELAIS', C.paper3, null);
        E.globalAlpha = 0.55 + 0.3 * Math.sin(t * 2.5);
        E.drawImage(label, Math.round(x + 8 - label.width / 2), y - 22);
        E.globalAlpha = 1;
      }
    }
  }

  // Tourniquets : un fût de laiton, des bras, et des chevrons qui disent le sens.
  for (const { col, row, dir } of cells.gates) {
    const x = col * TILE, y = LEVEL_Y + row * TILE;
    rect(P, x + 7, y, 2, TILE, C.brass);
    rect(P, x + 7, y, 1, TILE, C.paper3);
    for (const ky of [3, 11]) {
      rect(P, x + 2, y + ky, 12, 1, C.iron2);
      rect(P, x + (dir > 0 ? 2 : 12), y + ky - 1, 2, 3, C.iron2);
    }
    const off = Math.floor(t * 10) % 5;
    for (let k = 0; k < 2; k++) {
      const cx = x + 8 + dir * (((off + k * 5) % 10) - 5);
      if (cx < x + 1 || cx > x + TILE - 3) continue;
      E.globalAlpha = 0.75;
      px(E, cx, y + 6, C.signalGreen); px(E, cx + dir, y + 7, C.signalGreen); px(E, cx, y + 8, C.signalGreen);
    }
    E.globalAlpha = 1;
    // Le mauvais côté : un point rouge.
    px(E, x + (dir > 0 ? 14 : 1), y + 7, C.signalRed);
  }

  // Miroirs : une lame d'argent en diagonale ; pivot de laiton s'il tourne.
  for (const { col, row } of cells.mirrors) {
    const x = col * TILE, y = LEVEL_Y + row * TILE;
    const slash = world.mirrorType(col, row) === T_MIRROR_A;
    const pivot = world.mirrorAt.get(row * GRID_W + col);
    for (let k = 2; k < TILE - 2; k++) {
      const yy = slash ? y + TILE - 1 - k : y + k;
      px(P, x + k, yy, C.stone4);
      px(P, x + k, yy + 1, C.stone1);
      E.globalAlpha = 0.55 + 0.25 * Math.sin(t * 2 + k * 0.6);
      px(E, x + k, yy, C.moon2);
    }
    E.globalAlpha = 1;
    if (pivot) {
      rect(P, x + 6, y + 6, 4, 4, C.brass);
      rect(E, x + 7, y + 7, 2, 2, pivot.flipped ? C.signalGreen : C.lamp1);
    }
  }

  // Récepteurs : une lentille, éteinte ou pleine de lumière.
  for (const rc of world.receivers) {
    const cx = rc.col * TILE + 8, cy = LEVEL_Y + rc.row * TILE + 8;
    for (let yy = -4; yy <= 4; yy++) {
      for (let xx = -4; xx <= 4; xx++) {
        const d = xx * xx + yy * yy;
        if (d > 18) continue;
        px(P, cx + xx, cy + yy, d > 10 ? C.brass : '#101828');
        if (d <= 10 && rc.pressed) px(E, cx + xx, cy + yy, rc.lit ? (d < 4 ? C.lamp4 : C.lamp2) : C.lamp0);
      }
    }
    if (!rc.pressed) px(E, cx - 1, cy - 1, '#3a4a70');
    else lights.push({ x: cx, y: cy, r: 40, color: C.lamp2, intensity: rc.lit ? 0.8 : 0.4, flicker: 0, shadows: false, halo: 0.8 });
    // Rémanence : un anneau qui se vide.
    if (rc.hold > 0 && rc.pressed && !rc.lit) {
      const n = Math.ceil((12 * rc.timer) / rc.hold);
      for (let i = 0; i < n; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        px(E, Math.round(cx + Math.cos(a) * 6), Math.round(cy + Math.sin(a) * 6), C.lamp3);
      }
    }
  }

  // Courants d'air : des filets qui filent dans le sens de la rafale ; juste
  // avant qu'elle reprenne, quelques-uns la devancent.
  for (const wd of world.winds) {
    let k = wd.on ? 1 : 0;
    if (!wd.on && wd.cycle) {
      const period = wd.cycle[0] + wd.cycle[1];
      const pos = (((world.tick + wd.phase) % period) + period) % period;
      if (period - pos <= 30) k = 0.3;
    }
    if (!k) continue;
    const x = wd.x / SUB, y = wd.y / SUB + LEVEL_Y, w = wd.w / SUB, h = wd.h / SUB;
    const dir = Math.sign(wd.dx);
    const n = Math.min(40, Math.max(3, Math.round((w * h * k) / 450)));
    for (let i = 0; i < n; i++) {
      const a = hash(i + 1), b = hash(i * 7 + 3);
      const len = 4 + Math.round(b * 7);
      const speed = 120 + b * 120;
      const lx = x + ((((a * w + dir * t * speed) % w) + w) % w);
      const ly = y + 1 + Math.floor(hash(i * 13 + 5) * (h - 2)) + Math.round(Math.sin(t * 3 + i) * 1);
      E.globalAlpha = (0.18 + 0.2 * b) * (k < 1 ? 0.8 : 1);
      rect(E, Math.round(Math.max(x, Math.min(lx, x + w - len))), ly, len, 1, C.moon1);
    }
    E.globalAlpha = 1;
  }

  // Tapis roulants : chevrons qui défilent dans le sens du tapis.
  for (const { col, row, dir } of cells.conv) {
    const x = col * TILE, y = LEVEL_Y + row * TILE;
    const off = Math.floor(t * 30) % 6;
    for (let k = -6; k < TILE + 6; k += 6) {
      const cx = x + k + (dir > 0 ? off : 6 - off);
      if (cx < x || cx > x + TILE - 3) continue;
      px(P, cx, y + 1, C.lamp1);
      px(P, cx + dir, y + 2, C.lamp1);
      px(P, cx, y + 3, C.lamp1);
    }
  }

  // Tableaux : une toile vivante, que seuls les échos traversent.
  for (const { col, row } of cells.ghost) {
    const x = col * TILE, y = LEVEL_Y + row * TILE;
    for (let j = 3; j < TILE - 3; j += 2) {
      for (let i = 3; i < TILE - 3; i += 2) {
        const v = Math.sin((col * TILE + i) / 5 + t * 1.3) + Math.cos((row * TILE + j) / 4 - t);
        // Une toile sombre où passe un reflet lent : on devine qu'elle n'est pas tout à fait là.
        if (v > 1.2) rect(E, x + i, y + j, 2, 2, '#4a5a8a');
        else if (v > 0.6) rect(E, x + i, y + j, 2, 2, '#241c3a');
      }
    }
  }

  // Vitrines : un verre qui arrête les échos, pas nous.
  for (const { col, row } of cells.glass) {
    const x = col * TILE, y = LEVEL_Y + row * TILE;
    E.globalAlpha = 0.1;
    rect(E, x + 2, y, TILE - 4, TILE, '#9ec9ff');
    E.globalAlpha = 0.35;
    for (let k = 0; k < 6; k++) px(E, x + 4 + k, y + 3 + k, C.moon2);
    rect(E, x + 2, y, 1, TILE, '#c4dcf8');
    rect(E, x + TILE - 3, y, 1, TILE, '#c4dcf8');
    E.globalAlpha = 1;
  }

  // Leviers : socle, manche penché à gauche (repos) ou à droite (basculé).
  for (const lv of world.levers) {
    const x = lv.x / SUB, y = lv.y / SUB + LEVEL_Y;
    rect(P, x + 3, y + 12, 10, 4, C.iron1);
    rect(P, x + 3, y + 12, 10, 1, C.iron2);
    const dir = lv.pressed ? 1 : -1;
    for (let k = 0; k < 9; k++) px(P, x + 8 + Math.round((dir * k) / 2), y + 12 - k, C.iron2);
    rect(P, x + 7 + dir * 4, y + 2, 3, 3, lv.pressed ? C.signalGreen : C.signalRed);
    const col = lv.pressed ? C.signalGreen : C.signalRed;
    rect(E, x + 7, y + 13, 2, 1, col);
    lights.push({ x: x + 8, y: y + 12, r: 20, color: col, intensity: 0.4, flicker: 0, shadows: false, halo: 0.5 });
  }

  // Échafaudages : planches et tubes ; ils tremblent avant de céder.
  for (const c of world.crumbles) {
    if (c.state === 'gone') {
      // Quelques débris qui tombent, juste après l'effondrement.
      continue;
    }
    const shake = c.state === 'shaking' ? Math.round(Math.sin(t * 60) * (1 + (CRUMBLE_TICKS - c.timer) / 12)) : 0;
    const x = c.x / SUB + shake, y = c.y / SUB + LEVEL_Y, w = c.w / SUB;
    E.save();
    E.globalCompositeOperation = 'destination-out';
    rect(E, x, y, w, 16, '#000');
    E.restore();
    rect(P, x, y, w, 5, C.wood3);
    rect(P, x, y, w, 1, C.wood4);
    rect(P, x, y + 5, w, 1, C.wood1);
    for (let k = 4; k < w; k += 16) {
      rect(P, x + k, y + 6, 2, 10, C.iron2);
      for (let j = 0; j < 8; j++) px(P, x + k + 2 + j, y + 7 + j, C.iron1);
    }
    for (let k = 7; k < w; k += 11) px(P, x + k, y + 2, C.wood1);
    if (c.state === 'shaking') for (let k = 0; k < 3; k++) px(E, x + ((k * 13 + Math.floor(t * 20)) % w), y + 6 + k * 2, C.paper2);
  }

  // Ressorts : un auvent bombé, qui s'écrase quand il renvoie quelqu'un.
  for (const sp of world.springs) {
    const x = sp.x / SUB, y = sp.y / SUB + LEVEL_Y;
    const sq = sp.squash > 0 ? Math.min(3, sp.squash) : 0;
    rect(P, x + 1, y + 4, TILE - 2, 2, C.iron1);
    for (let k = 0; k < 4; k++) rect(P, x + 3 + k * 3, y + 1 + sq, 1, 3 - Math.min(2, sq), C.iron2);
    for (let k = 0; k < TILE; k += 4) {
      rect(P, x + k, y + sq, 2, 2, '#a8443a');
      rect(P, x + k + 2, y + sq, 2, 2, C.paper3);
    }
  }
}

/** Neige ou pluie, sur tout l'écran, en pixels nets. */
export function drawWeather(E, weather, view, t) {
  if (!weather) return;
  const x0 = -view.ox, y0 = -view.oy, W = view.w, H = view.h;
  if (weather === 'snow') {
    const n = Math.round((W * H) / 700);
    for (let i = 0; i < n; i++) {
      const a = ((i * 2654435761) >>> 0) / 4294967296;
      const b = ((i * 1597334677) >>> 0) / 4294967296;
      const speed = 8 + b * 14;
      const y = y0 + ((b * H + t * speed) % H);
      const x = x0 + ((((a * W + Math.sin(t * 0.7 + i) * 6 + t * 5) % W) + W) % W);
      E.globalAlpha = 0.45 + b * 0.45;
      px(E, Math.round(x), Math.round(y), C.moon2);
      if (b > 0.85) px(E, Math.round(x) + 1, Math.round(y), C.moon1);
    }
    E.globalAlpha = 1;
  } else if (weather === 'wind') {
    // Sur le toit du train : l'air file vers l'arrière, en longs traits.
    const n = Math.round((W * H) / 4200);
    E.fillStyle = C.moon1;
    for (let i = 0; i < n; i++) {
      const a = hash(i + 1), b = hash(i * 7 + 2);
      const len = 6 + Math.round(b * 14);
      const x = x0 + W - ((((a * (W + 40) + t * (260 + b * 220)) % (W + 40)) + W + 40) % (W + 40));
      const y = y0 + Math.floor(hash(i * 3 + 9) * H) + Math.round(Math.sin(t * 2 + i) * 2);
      E.globalAlpha = 0.12 + 0.18 * b;
      E.fillRect(Math.round(x), y, len, 1);
    }
    E.globalAlpha = 1;
  } else if (weather === 'rain') {
    const n = Math.round((W * H) / 900);
    E.globalAlpha = 0.4;
    E.fillStyle = C.moon0;
    for (let i = 0; i < n; i++) {
      const a = ((i * 2654435761) >>> 0) / 4294967296;
      const b = ((i * 1597334677) >>> 0) / 4294967296;
      const y = y0 + ((b * H + t * (180 + b * 80)) % H);
      const x = x0 + ((((a * W - (y - y0) * 0.25) % W) + W) % W);
      E.fillRect(Math.round(x), Math.round(y), 1, 4);
    }
    E.globalAlpha = 1;
  }
}

/** Marée : un corps d'eau sombre et translucide, une surface qui ondule. */
export function drawWater(P, E, world, view, lights, t) {
  if (!world.level.water) return;
  const y = Math.round(world.waterY() / SUB) + LEVEL_Y;
  const x0 = -view.ox, W = view.w, bottom = view.h - view.oy;
  if (y >= bottom) return;
  P.globalAlpha = 0.5;
  rect(P, x0, y, W, bottom - y, '#16306a');
  P.globalAlpha = 0.35;
  rect(P, x0, y + 6, W, bottom - y - 6, '#0a1636');
  P.globalAlpha = 1;
  // Surface : une ligne claire qui ondule, quelques éclats de lune.
  E.globalAlpha = 0.65;
  for (let x = x0 - (x0 & 1); x < x0 + W; x += 2) {
    const yy = y + Math.round(Math.sin(x / 9 + t * 2.2) * 0.9 + Math.sin(x / 23 - t * 1.3) * 0.6);
    rect(E, x, yy, 2, 1, '#5c7cc8');
  }
  for (let i = 0; i < 14; i++) {
    const a = hash(i + 11);
    const blink = Math.sin(t * (1.5 + a * 2) + i * 2.1);
    if (blink < 0.4) continue;
    E.globalAlpha = blink * 0.8;
    rect(E, Math.round(x0 + ((a * W + t * 6) % W)), y + 2 + Math.floor(hash(i * 5) * 10), 2, 1, C.moon1);
  }
  E.globalAlpha = 1;
  lights.push({ x: x0 + W / 2, y, r: Math.max(80, W * 0.4), color: '#3a5aa8', intensity: 0.25, flicker: 0, shadows: false, halo: 0 });
}

/**
 * Le paysage qui défile (le train roule) : collines, villages, poteaux,
 * peints à chaque image puis découpés au masque des vitres ou du ciel.
 */
export function drawMotion(P, E, motion, view, t, bufs) {
  const key = `${view.w}x${view.h}`;
  if (bufs.key !== key) {
    bufs.key = key;
    bufs.m = makeCanvas(view.w, view.h);
    bufs.l = makeCanvas(view.w, view.h);
  }
  const M = bufs.m.getContext('2d'), L = bufs.l.getContext('2d');
  for (const c of [M, L]) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, view.w, view.h);
    c.setTransform(1, 0, 0, 1, view.ox, view.oy);
  }
  const x0 = -view.ox, x1 = view.w - view.ox;
  const { y0, y1 } = motion.band;
  const h = y1 - y0;
  // Trois plans de collines, de plus en plus proches, de plus en plus vite.
  const layers = [
    { speed: 14, base: y0 + h * 0.55, amp: h * 0.18, col: '#141a36', f: 41 },
    { speed: 45, base: y0 + h * 0.72, amp: h * 0.16, col: '#0d1226', f: 23 },
    { speed: 150, base: y0 + h * 0.9, amp: h * 0.08, col: '#070a16', f: 11 },
  ];
  layers.forEach((ly, li) => {
    M.fillStyle = ly.col;
    for (let x = x0; x < x1; x++) {
      const o = x + t * ly.speed;
      const top = Math.round(ly.base - ly.amp * (0.6 + 0.4 * Math.sin(o / ly.f) + 0.25 * Math.sin(o / (ly.f * 0.37) + li)));
      M.fillRect(x, top, 1, y1 + 40 - top);
    }
    // Fenêtres de villages, sur les deux plans lointains.
    if (li < 2) {
      const step = li ? 19 : 13;
      for (let k = Math.floor((x0 + t * ly.speed) / step) - 1; k * step - t * ly.speed < x1; k++) {
        if (hash(k * 3 + li) > 0.22) continue;
        const x = Math.round(k * step - t * ly.speed);
        const o = k * step;
        const top = ly.base - ly.amp * (0.6 + 0.4 * Math.sin(o / ly.f));
        L.fillStyle = hash(k) > 0.5 ? C.lamp2 : C.lamp3;
        L.globalAlpha = 0.5 + 0.5 * hash(k * 11);
        L.fillRect(x, Math.round(top + 2 + hash(k * 7) * 4), 1, 1);
      }
      L.globalAlpha = 1;
    }
  });
  // Poteaux de caténaire qui passent en un éclair.
  const step = 190, speed = 420;
  for (let k = Math.floor((x0 + t * speed) / step) - 1; k * step - t * speed < x1 + 10; k++) {
    const x = Math.round(k * step - t * speed);
    M.fillStyle = '#05070f';
    M.fillRect(x, y0 - 40, 3, h + 80);
    M.fillRect(x - 8, y0 + h * 0.12, 16, 2);
  }
  // Découpe : seulement là où l'on voit dehors.
  for (const c of [M, L]) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(motion.mask, 0, 0);
  }
  for (const [ctx, img, op] of [[P, bufs.m, 'source-over'], [E, bufs.m, 'destination-out'], [E, bufs.l, 'lighter']]) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = op;
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
}
