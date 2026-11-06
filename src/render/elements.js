// Éléments animés des chapitres 2 à 4 : leviers, échafaudages, ressorts,
// tapis roulants, tableaux, vitrines ; et la météo (neige, pluie).
// Tout est dessiné dans le repère de la scène (P : albedo, E : émissif).

import { TILE, SUB, GRID_W, GRID_H, T_CONV_L, T_CONV_R, T_GHOST, T_GLASS, CRUMBLE_TICKS } from '../sim/constants.js';
import { C } from './palette.js';
import { rect, px } from './pixel.js';
import { LEVEL_Y } from './screen.js';

/** Cases spéciales d'un niveau, repérées une fois. */
const cellsCache = new WeakMap();
function specialCells(level) {
  let c = cellsCache.get(level);
  if (c) return c;
  c = { conv: [], ghost: [], glass: [] };
  for (let r = 0; r < GRID_H; r++) {
    for (let col = 0; col < GRID_W; col++) {
      const t = level.tiles[r * GRID_W + col];
      if (t === T_CONV_L || t === T_CONV_R) c.conv.push({ col, row: r, dir: t === T_CONV_L ? -1 : 1 });
      else if (t === T_GHOST) c.ghost.push({ col, row: r });
      else if (t === T_GLASS) c.glass.push({ col, row: r });
    }
  }
  cellsCache.set(level, c);
  return c;
}

export function drawElements(P, E, world, lights, t) {
  const cells = specialCells(world.level);

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
