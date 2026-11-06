// Fonds des chapitres 2 à 4 : la montagne, la ville, le musée.
//
// Même règle que pour la gare : on peint l'albedo (la couleur des choses) et
// l'émissif lointain (étoiles, fenêtres allumées) ; la lumière vient ensuite.
// `B` est la zone à peindre, dans le repère de la scène (elle déborde autour
// de la pièce pour remplir tout l'écran).

import { TILE } from '../sim/constants.js';
import { C } from './palette.js';
import { rect, px, checker, sparse, rng } from './pixel.js';
import { VIEW_W, VIEW_H, LEVEL_Y } from './screen.js';
import { solidAt, cellRange } from './themes.js';

/** Ciel de nuit en bandes tramées. */
function skyBands(A, B, cols) {
  const step = VIEW_H / (cols.length + 1);
  for (let i = 0; i < cols.length; i++) {
    const y0 = i === 0 ? B.y0 : Math.round(i * step);
    const y1 = i + 1 < cols.length ? Math.round((i + 1) * step) : B.y1;
    rect(A, B.x0, y0, B.w, y1 - y0, cols[i]);
    if (i > 0) {
      checker(A, B.x0, y0, B.w, 4, cols[i - 1], B.x0 & 1);
      sparse(A, B.x0, y0 + 4, B.w, 6, cols[i - 1]);
    }
  }
}

function stars(Em, B, r, yMax, n) {
  const count = Math.round((n * B.w) / VIEW_W);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(B.x0 + r() * B.w);
    const y = Math.floor(B.y0 + r() * (yMax - B.y0));
    const b = r();
    px(Em, x, y, b > 0.8 ? C.moon2 : b > 0.4 ? C.moon1 : C.moon0);
  }
}

function moon(Em, lights, mx, my, rad = 8) {
  for (let y = -rad; y <= rad; y++) {
    for (let x = -rad; x <= rad; x++) {
      const d = x * x + y * y;
      if (d <= rad * rad) px(Em, mx + x, my + y, d > (rad - 1) * (rad - 1) ? C.moon1 : C.moon2);
    }
  }
  rect(Em, mx - 3, my - 2, 2, 2, C.moon1);
  rect(Em, mx + 2, my + 2, 3, 3, C.moon1);
  lights.push({ x: mx, y: my, r: 130, color: C.moon1, intensity: 0.3, flicker: 0, halo: 0.5 });
}

/** La montagne : pics enneigés, forêt de sapins, chalets au loin. */
export function paintMountains(level, A, Em, lights, theme, B) {
  const r = rng(11);
  skyBands(A, B, [C.night3, C.night4, '#46578f', '#5f74b0']);
  stars(Em, B, r, VIEW_H * 0.5, 90);
  moon(Em, lights, Math.round(VIEW_W * 0.8), Math.round(VIEW_H * 0.14), 9);
  // Deux chaînes de montagnes : la plus lointaine pâle, la plus proche sombre.
  // Crêtes en dents de scie (somme de triangles), plus naturelles qu'un sinus.
  const tri = (v) => 1 - Math.abs((((v % 2) + 2) % 2) - 1);
  const ridge = (x, base, amp, f, ph) => base - amp * (0.65 * tri(x / f + ph) + 0.35 * tri(x / (f * 0.43) + ph * 3));
  for (let x = B.x0; x < B.x1; x++) {
    const far = Math.round(ridge(x, VIEW_H * 0.62, 46, 47, 0.4));
    rect(A, x, far, 1, B.y1 - far, '#3a4a80');
    // Neige sur les crêtes.
    if (far < VIEW_H * 0.5) rect(A, x, far, 1, 3 + ((x * 7) % 3), C.moon0);
    const near = Math.round(ridge(x, VIEW_H * 0.72, 30, 29, 2.1));
    rect(A, x, near, 1, B.y1 - near, C.night2);
    if (near < VIEW_H * 0.62) rect(A, x, near, 1, 2, '#6f84bf');
  }
  // Sapins au pied des pentes.
  for (let x = B.x0 - 10; x < B.x1; x += 7 + Math.floor(r() * 9)) {
    const h = 14 + Math.floor(r() * 16);
    const base = Math.round(VIEW_H * 0.75);
    for (let k = 0; k < h; k++) {
      const w = Math.max(1, Math.round((k / h) * 7));
      rect(A, x - w, base - h + k, w * 2 + 1, 1, C.night1);
    }
    if (r() < 0.5) px(A, x, base - h, C.moon0);
  }
  // Quelques chalets éclairés au loin.
  for (let i = 0; i < Math.max(3, B.w / 120); i++) {
    const x = Math.floor(B.x0 + r() * B.w), y = Math.round(VIEW_H * 0.74) - 3;
    rect(A, x, y, 8, 5, C.night1);
    rect(A, x - 1, y - 2, 10, 2, C.moon0);
    px(Em, x + 2, y + 2, C.lamp1);
    px(Em, x + 5, y + 2, C.lamp2);
  }
}

/** Le chalet : planches de sapin, poutres, lambris. */
export function paintChalet(level, A, Em, lights, theme, B) {
  rect(A, B.x0, B.y0, B.w, B.h, C.wood2);
  const X0 = B.x0 - (((B.x0 % 6) + 6) % 6);
  for (let x = X0; x < B.x1; x += 6) {
    rect(A, x, B.y0, 1, B.h, C.wood1);
    for (let y = B.y0 + ((x * 13) % 23); y < B.y1; y += 23) px(A, x + 3, y, C.wood1); // nœuds
    if ((x / 6) % 3 === 0) rect(A, x + 1, B.y0, 1, B.h, C.wood3);
  }
  // Poutres horizontales.
  for (let y = 40; y < B.y1; y += 64) {
    rect(A, B.x0, y, B.w, 5, C.wood1);
    rect(A, B.x0, y, B.w, 1, C.wood3);
  }
  const R = cellRange(B);
  for (let r = R.r0; r < R.r1; r++) {
    for (let c = R.c0; c < R.c1; c++) {
      if (solidAt(level, c, r)) continue;
      const x = c * TILE, y = LEVEL_Y + r * TILE;
      if (solidAt(level, c, r + 1)) {
        rect(A, x, y + 6, TILE, 10, C.wood1);
        rect(A, x, y + 6, TILE, 1, C.wood3);
        rect(A, x + 3, y + 9, 10, 5, C.wood0);
      }
    }
  }
}

/** La ville vue des toits : immeubles au loin, fenêtres allumées, ciel orangé. */
export function paintCity(level, A, Em, lights, theme, B) {
  const r = rng(23);
  skyBands(A, B, [C.night2, C.night3, '#3e3a72', '#5a4470', '#7a5068']);
  stars(Em, B, r, VIEW_H * 0.3, 30);
  const layer = (base, minH, maxH, col, winP, winCol) => {
    let x = B.x0 - 8;
    while (x < B.x1) {
      const w = 12 + Math.floor(r() * 22);
      const h = minH + Math.floor(r() * (maxH - minH));
      rect(A, x, base - h, w, B.y1 - base + h, col);
      if (r() < 0.3) { rect(A, x + 3, base - h - 6, 1, 6, col); } // antenne
      if (r() < 0.2) { rect(A, x + 2, base - h - 8, 7, 8, col); rect(A, x + 1, base - h - 9, 9, 1, col); } // château d'eau
      for (let wy = base - h + 3; wy < base - 2; wy += 4) {
        for (let wx = x + 2; wx < x + w - 2; wx += 3) if (r() < winP) px(Em, wx, wy, r() < 0.7 ? winCol : C.lamp3);
      }
      x += w + Math.floor(r() * 3);
    }
  };
  layer(Math.round(VIEW_H * 0.62), 20, 70, '#2a2650', 0.12, C.lamp0);
  layer(Math.round(VIEW_H * 0.75), 16, 60, C.night1, 0.2, C.lamp1);
  // Lueur de la ville sur les nuages bas.
  for (let i = 0; i < B.w / 60; i++) sparse(A, B.x0 + i * 60 + (i * 17) % 30, Math.round(VIEW_H * 0.2) + (i * 11) % 20, 40, 3, '#7a5068');
}

/** La rue : façades d'immeubles, balcons, fenêtres éclairées. */
export function paintStreet(level, A, Em, lights, theme, B) {
  const r = rng(31);
  rect(A, B.x0, B.y0, B.w, B.h, '#5d4a4a');
  let x = B.x0 - 20;
  const palettes = [['#6b5248', '#56413a'], ['#5a5a66', '#474752'], ['#7a6250', '#5e4b3e'], [C.brick2, C.brick1]];
  while (x < B.x1) {
    const w = 48 + Math.floor(r() * 40);
    const [face, dark] = palettes[Math.floor(r() * palettes.length)];
    rect(A, x, B.y0, w, B.h, face);
    rect(A, x, B.y0, 1, B.h, dark);
    rect(A, x + w - 1, B.y0, 1, B.h, dark);
    // Étages : fenêtres hautes, volets, balcons.
    for (let y = 8; y < VIEW_H * 0.7; y += 34) {
      rect(A, x, y + 28, w, 2, dark);
      for (let wx = x + 6; wx < x + w - 10; wx += 16) {
        rect(A, wx - 1, y + 4, 10, 20, dark);
        rect(A, wx, y + 5, 8, 18, C.ink);
        if (r() < 0.45) {
          rect(Em, wx, y + 5, 8, 18, r() < 0.5 ? C.lamp0 : '#5a3a28');
          rect(Em, wx + 1, y + 6, 6, 6, C.lamp1);
          rect(Em, wx + 3, y + 5, 1, 18, '#000');
          lights.push({ x: wx + 4, y: y + 14, r: 26, color: C.lamp1, intensity: 0.25, flicker: 0, shadows: false, halo: 0.2 });
        }
        if (r() < 0.35) { rect(A, wx - 3, y + 24, 14, 1, C.iron1); for (let k = 0; k < 14; k += 2) px(A, wx - 3 + k, y + 22, C.iron1); }
      }
    }
    x += w;
  }
}

/** Le musée : marbre veiné, pilastres, cimaise dorée. */
export function paintMuseum(level, A, Em, lights, theme, B) {
  const marble = '#a49c92', vein = '#8c847a', light = '#b8b0a4';
  rect(A, B.x0, B.y0, B.w, B.h, theme.wallColor ?? '#6e3a3a');
  sparse(A, B.x0, B.y0, B.w, B.h, '#5e3030');
  // Pilastres de marbre.
  for (let cx = 24 + 80 * Math.floor((B.x0 - 24) / 80); cx < B.x1; cx += 80) {
    rect(A, cx, B.y0, 14, B.h, marble);
    for (let y = B.y0 - (B.y0 % 7); y < B.y1; y += 7) px(A, cx + 3 + ((y * 5) % 8), y, vein);
    rect(A, cx, B.y0, 1, B.h, light);
    rect(A, cx + 13, B.y0, 1, B.h, vein);
  }
  const R = cellRange(B);
  for (let r = R.r0; r < R.r1; r++) {
    for (let c = R.c0; c < R.c1; c++) {
      if (solidAt(level, c, r)) continue;
      const x = c * TILE, y = LEVEL_Y + r * TILE;
      if (solidAt(level, c, r + 1)) {
        // Lambris sombre et cimaise dorée.
        rect(A, x, y + 4, TILE, 12, C.wood1);
        rect(A, x, y + 3, TILE, 1, C.brass);
        rect(A, x + 2, y + 7, 12, 7, C.wood0);
      }
      if (solidAt(level, c, r - 1)) {
        rect(A, x, y, TILE, 3, light);
        rect(A, x, y + 3, TILE, 1, C.brass);
      }
    }
  }
}

/** La réserve : murs de béton, rayonnages, caisses entassées dans l'ombre. */
export function paintStorage(level, A, Em, lights, theme, B) {
  const r = rng(41);
  rect(A, B.x0, B.y0, B.w, B.h, '#4a4a56');
  sparse(A, B.x0, B.y0, B.w, B.h, '#3c3c48');
  for (let x = B.x0 - (((B.x0 % 70) + 70) % 70); x < B.x1; x += 70) {
    // Rayonnage : montants, étagères, caisses.
    rect(A, x + 4, B.y0, 2, B.h, C.iron1);
    rect(A, x + 58, B.y0, 2, B.h, C.iron1);
    for (let y = 30; y < VIEW_H; y += 40) {
      rect(A, x + 4, y, 56, 2, C.iron2);
      for (let k = x + 8; k < x + 54; k += 10 + Math.floor(r() * 6)) {
        const h = 8 + Math.floor(r() * 12);
        rect(A, k, y - h, 9, h, r() < 0.5 ? C.wood2 : C.paper0);
        rect(A, k, y - h, 9, 1, C.wood3);
      }
    }
  }
}

/** La halle : grande verrière de fer, la nuit au-dessus, murs de brique. */
export function paintHall(level, A, Em, lights, theme, B) {
  rect(A, B.x0, B.y0, B.w, B.h, C.brick1);
  // Ciel derrière la verrière (haut de la scène).
  const top = Math.round(VIEW_H * 0.45);
  rect(A, B.x0, B.y0, B.w, top - B.y0, C.night3);
  const r = rng(53);
  stars(Em, B, r, top - 10, 40);
  for (let x = B.x0 - (((B.x0 % 56) + 56) % 56); x < B.x1; x += 56) {
    // Arcs de fer et vitrages.
    for (let k = 0; k <= 56; k++) {
      const y = Math.round(top - Math.sin((k / 56) * Math.PI) * 40);
      px(A, x + k, y, C.iron1);
      px(A, x + k, y + 1, C.iron2);
    }
    for (let k = 0; k < 56; k += 8) rect(A, x + k, B.y0, 1, top - Math.round(Math.sin((k / 56) * Math.PI) * 40) - B.y0, C.iron1);
    rect(A, x, top, 3, B.y1 - top, C.iron1);
  }
  // Murs de brique sous la verrière.
  for (let y = top + 2; y < B.y1; y += 4) {
    rect(A, B.x0, y + 3, B.w, 1, C.brick0);
    for (let x = B.x0 + (((y >> 2) & 1) ? 4 : 0); x < B.x1; x += 8) px(A, x, y, C.brick0);
  }
}

// --- Chapitres 5 et 6 -----------------------------------------------------------

/**
 * Dans une voiture : boiseries vernies, tissu crème, une rangée de fenêtres où
 * défile la nuit (l'animation est ajoutée par le rendu, dans `theme.motionRects`).
 */
export function paintWagon(level, A, Em, lights, theme, B) {
  rect(A, B.x0, B.y0, B.w, B.h, '#7a6a58');
  sparse(A, B.x0, B.y0, B.w, B.h, '#6a5a4a');
  // Bandeau de boiserie en bas, filet doré.
  const R = cellRange(B);
  for (let r = R.r0; r < R.r1; r++) {
    for (let c = R.c0; c < R.c1; c++) {
      if (solidAt(level, c, r)) continue;
      const x = c * TILE, y = LEVEL_Y + r * TILE;
      if (solidAt(level, c, r + 1)) {
        rect(A, x, y, TILE, TILE, C.wood1);
        rect(A, x, y, TILE, 1, C.brass);
        rect(A, x + 2, y + 4, 12, 9, C.wood0);
      }
    }
  }
  // Fenêtres : rangée continue à mi-hauteur de la scène.
  const rects = [];
  const y0 = Math.round(VIEW_H * 0.3), h = 34;
  for (let x = B.x0 - (((B.x0 % 56) + 56) % 56) + 8; x < B.x1; x += 56) {
    rect(A, x - 3, y0 - 3, 46, h + 6, C.wood2);
    rect(A, x - 3, y0 - 3, 46, 1, C.wood3);
    rect(A, x, y0, 40, h, C.ink);
    rect(Em, x, y0, 40, h, C.night1);
    rect(Em, x, y0 + h - 8, 40, 8, '#0c1020');
    rect(A, x + 19, y0, 2, h, C.wood1);
    rects.push({ x, y: y0, w: 40, h });
  }
  theme.motionRects = rects;
}

/** Sur le toit du train : la nuit, des collines qui filent (animées), les caténaires. */
export function paintTrainRoof(level, A, Em, lights, theme, B) {
  const r = rng(61);
  skyBands(A, B, [C.night2, C.night3, C.night4, '#46578f']);
  stars(Em, B, r, VIEW_H * 0.55, 70);
  moon(Em, lights, Math.round(VIEW_W * 0.2), Math.round(VIEW_H * 0.16), 8);
  theme.motionRects = null; // tout le ciel visible
}

/** La côte : mer, lune, chemin de lune sur l'eau, horizon. */
export function paintSea(level, A, Em, lights, theme, B) {
  const r = rng(71);
  skyBands(A, B, [C.night3, C.night4, '#4a5a94', '#6a6ea8']);
  stars(Em, B, r, VIEW_H * 0.5, 80);
  const mx = Math.round(VIEW_W * 0.7);
  moon(Em, lights, mx, Math.round(VIEW_H * 0.18), 10);
  const horizon = Math.round(VIEW_H * 0.58);
  rect(A, B.x0, horizon, B.w, B.y1 - horizon, '#1c2a5a');
  for (let y = horizon; y < B.y1; y += 3) {
    const off = (y * 7) % 11;
    for (let x = B.x0 + off; x < B.x1; x += 11) rect(A, x, y, 4, 1, '#26366c');
  }
  // Chemin de lune : reflets qui s'élargissent vers nous.
  for (let y = horizon + 1; y < B.y1; y += 2) {
    const k = (y - horizon) / (VIEW_H - horizon);
    const w = 4 + k * 40;
    for (let i = 0; i < 2; i++) {
      const x = mx - w / 2 + ((y * 13 + i * 29) % Math.max(1, Math.round(w)));
      rect(Em, x, y, 2 + Math.round(k * 3), 1, k < 0.25 ? C.moon0 : k < 0.6 ? '#5a6ea8' : '#3a4a84');
    }
  }
  lights.push({ x: mx, y: horizon + 30, r: 120, color: C.moon0, intensity: 0.25, flicker: 0, shadows: false, halo: 0 });
  theme.motionRects = null;
}

/** Le terminus : verrière de fer, et derrière les grandes baies, la mer. */
export function paintTerminus(level, A, Em, lights, theme, B) {
  paintHall(level, A, Em, lights, theme, B);
  const top = Math.round(VIEW_H * 0.45);
  // Grandes baies cintrées sur la mer.
  for (let x = B.x0 - (((B.x0 % 112) + 112) % 112) + 20; x < B.x1; x += 112) {
    const y = top + 8, w = 70, h = 60;
    rect(A, x - 3, y - 3, w + 6, h + 6, C.stone2);
    rect(A, x, y, w, h, C.ink);
    // Le verre ne s'éclaire que par l'émissif : ciel de nuit, mer sombre, chemin de lune.
    rect(Em, x, y, w, h * 0.55, C.night1);
    for (let k = 0; k < 9; k++) px(Em, x + ((k * 23 + 7) % w), y + 3 + ((k * 11) % 26), C.moon0);
    rect(Em, x, y + h * 0.55, w, h * 0.45, '#0b1330');
    rect(Em, x, y + h * 0.55, w, 1, '#2a3a70');
    for (let k = 0; k < 7; k++) rect(Em, x + 44 - k + ((k * 5) % 3), y + h * 0.55 + 3 + k * 4, 3 + k, 1, k < 3 ? C.moon0 : '#5a6ea8');
    // Meneaux : ils masquent aussi la lueur du verre.
    for (const [ctx, col] of [[A, C.iron1], [Em, '#000']]) {
      rect(ctx, x + w / 2 - 1, y, 2, h, col);
      rect(ctx, x, y + 20, w, 1, col);
    }
  }
}
