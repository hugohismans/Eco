// Éléments de décor décrits dans le JSON des niveaux (« decor »).
//
// Chaque élément se peint dans les calques albedo (A) et émissif (Em), et
// déclare au besoin des lumières et des volumes lumineux (cônes, rais de lune,
// reflets) que l'éclairage animera à chaque image. Aucun n'a d'effet sur la
// simulation.
//
// Coordonnées : `col`, `row` en cases ; `dx`, `dy` décalage facultatif en px.

import { TILE } from '../sim/constants.js';
import { C } from './palette.js';
import { rect, px, checker, sparse, textSprite } from './pixel.js';
import { LEVEL_Y } from './screen.js';
import { floorRowBelow, ceilingRowAbove } from './themes.js';

const cellX = (d) => d.col * TILE + (d.dx ?? 0);
const cellY = (d) => LEVEL_Y + d.row * TILE + (d.dy ?? 0);
const floorY = (level, col, row) => LEVEL_Y + floorRowBelow(level, col, row) * TILE;

let seedCounter = 1;

export const DECOR = {
  /** Banc de quai : lattes de bois, pieds en fonte. Posé au bas de sa case. */
  bench(d, level, A) {
    const x = cellX(d) - 6, y = cellY(d);
    // Dossier.
    rect(A, x, y + 1, 28, 2, C.wood3);
    rect(A, x, y + 1, 28, 1, C.wood4);
    rect(A, x, y + 4, 28, 2, C.wood3);
    rect(A, x, y + 6, 28, 1, C.wood1);
    // Assise.
    rect(A, x - 1, y + 9, 30, 2, C.wood4);
    rect(A, x - 1, y + 11, 30, 1, C.wood1);
    // Fonte.
    for (const lx of [x + 1, x + 24]) {
      rect(A, lx, y, 2, 16, C.iron1);
      rect(A, lx - 1, y + 8, 4, 1, C.iron2);
      rect(A, lx - 1, y + 15, 4, 1, C.iron1);
      px(A, lx + 2, y + 12, C.iron1);
    }
  },

  /** Réverbère à gaz sur un mât : vraie source de lumière, cône et reflet. */
  lamp(d, level, A, Em, out) {
    const cx = cellX(d) + 8, y = cellY(d);
    const fy = floorY(level, d.col, d.row + 1);
    // Mât et socle.
    rect(A, cx - 1, y + 11, 2, fy - y - 11, C.iron1);
    rect(A, cx - 2, fy - 4, 4, 4, C.iron1);
    rect(A, cx - 3, fy - 1, 6, 1, C.iron0);
    rect(A, cx - 3, y + 16, 6, 1, C.iron1);
    px(A, cx, y + 17, C.iron2);
    // Lanterne : chapeau, verre (émissif), montants.
    rect(A, cx - 2, y - 2, 4, 1, C.iron1);
    rect(A, cx - 4, y - 1, 8, 2, C.iron2);
    rect(A, cx - 3, y + 1, 6, 8, C.iron1);
    rect(Em, cx - 2, y + 2, 4, 6, C.lamp3);
    rect(Em, cx - 1, y + 3, 2, 3, C.lamp4);
    rect(A, cx - 3, y + 9, 6, 2, C.iron2);
    const seed = seedCounter++;
    out.lights.push({ x: cx, y: y + 5, r: 100, color: C.lamp2, intensity: 1.15, flicker: seed, shadows: true, halo: 1 });
    out.volumes.push({ type: 'cone', x: cx, y0: y + 9, y1: fy, w0: 5, w1: 54, color: C.lamp2, alpha: 0.2, flicker: seed, dust: 7 });
    out.volumes.push({ type: 'reflect', x: cx, y: fy, w: 12, h: 12, color: C.lamp3, alpha: 0.4, flicker: seed });
  },

  /** Suspension (lampe d'intérieur) au bout d'un câble. `cable` : longueur en px. */
  pendant(d, level, A, Em, out) {
    const cx = cellX(d) + 8, y = cellY(d);
    const top = d.cable != null
      ? y - d.cable
      : LEVEL_Y + (ceilingRowAbove(level, d.col, d.row - 1) + 1) * TILE;
    const fy = floorY(level, d.col, d.row + 1);
    rect(A, cx, top, 1, y - top, C.iron0);
    // Abat-jour émaillé.
    rect(A, cx - 2, y, 5, 1, C.iron1);
    rect(A, cx - 4, y + 1, 9, 2, C.lamp0);
    rect(A, cx - 6, y + 3, 13, 2, C.lamp1);
    rect(A, cx - 6, y + 3, 13, 1, C.lamp2);
    rect(Em, cx - 3, y + 5, 7, 1, C.lamp4);
    rect(Em, cx - 2, y + 6, 5, 1, C.lamp3);
    const seed = seedCounter++;
    out.lights.push({ x: cx, y: y + 6, r: 112, color: C.lamp2, intensity: 1.15, flicker: seed, shadows: true, halo: 0.8 });
    out.volumes.push({ type: 'cone', x: cx, y0: y + 5, y1: fy, w0: 12, w1: 64, color: C.lamp2, alpha: 0.22, flicker: seed, dust: 6 });
    out.volumes.push({ type: 'reflect', x: cx, y: fy, w: 14, h: 10, color: C.lamp3, alpha: 0.3, flicker: seed });
  },

  /** Haute fenêtre cintrée : nuit dehors, rai de lune qui descend en biais. */
  window(d, level, A, Em, out) {
    const x = cellX(d), y = cellY(d);
    const w = (d.cols ?? 2) * TILE, h = (d.rows ?? 4) * TILE;
    const fy = floorY(level, d.col, d.row + (d.rows ?? 4));
    // Encadrement de pierre et appui.
    rect(A, x - 2, y + 4, w + 4, h - 4, C.stone2);
    rect(A, x - 3, y + h - 1, w + 6, 3, C.stone3);
    // Arc : rangées plus étroites vers le haut.
    for (let k = 0; k < 6; k++) {
      const inset = Math.round(6 - Math.sqrt(36 - (6 - k) * (6 - k)));
      rect(A, x - 2 + inset, y + k - 2, w + 4 - inset * 2, 1, C.stone2);
    }
    // Vitres (émissives) : ciel de nuit, lueur de lune.
    const pane = (px0, py0, pw, ph) => {
      // Le verre est sombre dans l'albedo : sa lueur vient seulement de l'émissif.
      rect(A, px0, py0, pw, ph, C.ink);
      rect(Em, px0, py0, pw, ph, C.night1);
      checker(Em, px0, py0 + Math.floor(ph * 0.5), pw, Math.ceil(ph * 0.5), C.night2);
    };
    for (let k = 0; k < 4; k++) {
      const inset = Math.round(5 - Math.sqrt(25 - (5 - k) * (5 - k)));
      pane(x + inset, y + k, w - inset * 2, 1);
    }
    pane(x, y + 4, w, h - 5);
    // Reflet de lune sur le verre.
    for (let k = 0; k < 5; k++) px(Em, x + 3 + k, y + 8 + k, C.night5);
    for (let k = 0; k < 3; k++) px(Em, x + 5 + k, y + 8 + k, C.night5);
    // Meneaux (ils masquent l'émissif).
    for (const ctx of [A, Em]) {
      const col = ctx === A ? C.iron1 : '#000';
      rect(ctx, x + (w >> 1) - 1, y, 2, h, col);
      for (let k = y + 14; k < y + h - 2; k += 14) rect(ctx, x, k, w, 1, col);
    }
    out.lights.push({ x: x + w / 2, y: y + h - 4, r: 48, color: C.moon0, intensity: 0.3, flicker: 0, shadows: false, halo: 0.12 });
    out.volumes.push({ type: 'shaft', x0: x, x1: x + w, y0: y + 6, y1: fy, slant: d.slant ?? 0.45, color: C.moon1, alpha: 0.13, dust: 9 });
    out.lights.push({ x: x + w / 2 + (fy - y) * (d.slant ?? 0.45) * 0.8, y: fy - 6, r: 34, color: C.moon0, intensity: 0.3, flicker: 0, shadows: false, halo: 0 });
  },

  /** Horloge de gare : toujours 23 h 58, juste avant le dernier train. */
  clock(d, level, A, Em, out) {
    const cx = cellX(d) + 8, cy = cellY(d) + 7;
    for (let y = -8; y <= 8; y++) {
      for (let x = -8; x <= 8; x++) {
        const r2 = x * x + y * y;
        if (r2 <= 64) px(A, cx + x, cy + y, r2 > 42 ? C.iron1 : C.paper3);

      }
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      px(A, cx + Math.round(Math.sin(a) * 5), cy - Math.round(Math.cos(a) * 5), C.paper0);
    }
    // Aiguilles : heures presque sur 12, minutes sur 58.
    const hand = (angle, len, col) => {
      for (let i = 0; i <= len; i++) px(A, cx + Math.round(Math.sin(angle) * i), cy - Math.round(Math.cos(angle) * i), col);
    };
    hand(-0.03 * Math.PI * 2, 3, C.iron0);
    hand((58 / 60) * Math.PI * 2, 5, C.iron0);
    px(A, cx, cy, C.signalRed);
    rect(A, cx - 1, cy - 12, 2, 4, C.iron1);
    out.lights.push({ x: cx, y: cy, r: 24, color: C.paper3, intensity: 0.2, flicker: 0, shadows: false, halo: 0 });
  },

  /** Affiche jaunie. `variant` : train, mer, texte. */
  poster(d, level, A) {
    const x = cellX(d), y = cellY(d);
    const w = (d.cols ?? 1) * TILE - 2, h = (d.rows ?? 2) * TILE - 4;
    rect(A, x + 1, y + 1, w, h, C.paper0);
    rect(A, x, y, w, h, C.paper2);
    rect(A, x + 1, y + 1, w - 2, h - 2, C.paper3);
    const v = d.variant ?? 'train';
    if (v === 'train') {
      rect(A, x + 2, y + 3, w - 4, h * 0.45, '#c98a5a');
      rect(A, x + 2, y + 3 + Math.floor(h * 0.3), w - 4, 2, C.brick3);
      rect(A, x + 3, y + Math.floor(h * 0.38), w - 6, 3, C.night3);
      px(A, x + 4, y + Math.floor(h * 0.38) + 3, C.iron0);
      px(A, x + w - 5, y + Math.floor(h * 0.38) + 3, C.iron0);
    } else if (v === 'mer') {
      rect(A, x + 2, y + 3, w - 4, h * 0.25, '#e8a86a');
      rect(A, x + 2, y + 3 + Math.floor(h * 0.25), w - 4, h * 0.25, '#5d8db0');
      px(A, x + (w >> 1), y + 5, C.lamp4);
    }
    for (let k = 0; k < 3; k++) rect(A, x + 2, y + h - 4 - k * 3, w - 5 - (k & 1) * 3, 1, C.paper0);
    // Coin décollé, punaise.
    px(A, x + w - 1, y, C.paper1);
    px(A, x + w - 2, y, C.paper1);
    px(A, x + 2, y + 1, C.signalRed);
  },

  /**
   * Marquise de quai : toiture de fer, lambrequin de bois découpé, colonnes
   * de fonte. `cols` : largeur, `pillars` : colonnes (n° de case) portant le toit.
   */
  canopy(d, level, A) {
    const x0 = cellX(d), y = cellY(d);
    const w = (d.cols ?? 8) * TILE;
    // Toiture et fermes.
    rect(A, x0, y - 6, w, 3, C.iron1);
    rect(A, x0, y - 3, w, 2, C.iron2);
    for (let x = x0; x < x0 + w; x += 8) {
      for (let k = 0; k < 6; k++) px(A, x + k, y - 6 - Math.floor(k / 2), C.iron1);
    }
    rect(A, x0, y - 9, w, 1, C.iron1);
    // Lambrequin : planches à bout pointu, typiques des gares.
    for (let x = x0; x < x0 + w; x += 4) {
      rect(A, x, y - 1, 3, 5, C.paper1);
      rect(A, x + 1, y + 4, 1, 2, C.paper1);
      px(A, x, y - 1, C.paper2);
      px(A, x + 3, y - 1, C.wood1);
    }
    rect(A, x0, y - 1, w, 1, C.paper2);
    // Colonnes.
    for (const pc of d.pillars ?? []) {
      const cx = pc * TILE + 8;
      const fy = floorY(level, pc, d.row + 1);
      rect(A, cx - 1, y + 4, 3, fy - y - 4, C.iron1);
      px(A, cx, y + 6, C.iron2);
      rect(A, cx - 3, y + 4, 7, 2, C.iron2);
      rect(A, cx - 2, fy - 3, 5, 3, C.iron2);
      for (let k = y + 10; k < fy - 4; k += 7) px(A, cx + 1, k, C.iron2);
    }
  },

  /** Façade de la gare (fond) : briques, corniche, fenêtre éclairée. */
  facade(d, level, A, Em, out) {
    const x0 = cellX(d), y0 = cellY(d);
    const w = (d.cols ?? 3) * TILE, h = (d.rows ?? 8) * TILE;
    rect(A, x0, y0, w, h, C.brick2);
    for (let y = y0; y < y0 + h; y += 4) {
      rect(A, x0, y + 3, w, 1, C.brick1);
      const off = ((y - y0) >> 2) & 1 ? 4 : 0;
      for (let x = x0 + off; x < x0 + w; x += 8) { rect(A, x, y, 1, 3, C.brick1); px(A, x + 1, y, C.brick3); }
    }
    // Corniche de pierre.
    rect(A, x0 - 3, y0 - 4, w + 3, 4, C.stone3);
    rect(A, x0 - 3, y0 - 4, w + 3, 1, C.stone4);
    for (let x = x0 - 2; x < x0 + w; x += 4) rect(A, x, y0, 2, 2, C.stone2);
    // Fenêtre de l'étage, rideau tiré, lumière chaude.
    const wx = x0 + 12, wy = y0 + 14;
    rect(A, wx - 2, wy - 2, 20, 26, C.stone2);
    rect(Em, wx, wy, 16, 22, C.lamp1);
    rect(Em, wx + 2, wy + 2, 12, 18, C.lamp2);
    rect(Em, wx + 9, wy + 2, 5, 18, C.lamp0);
    rect(Em, wx + 7, wy, 2, 22, '#000');
    rect(Em, wx, wy + 10, 16, 1, '#000');
    rect(A, wx + 7, wy, 2, 22, C.iron1);
    rect(A, wx, wy + 10, 16, 1, C.iron1);
    rect(A, wx - 3, wy + 22, 22, 2, C.stone3);
    out.lights.push({ x: wx + 8, y: wy + 11, r: 46, color: C.lamp1, intensity: 0.6, flicker: 0, shadows: false, halo: 0.6 });
    // Plaque émaillée « GARE ».
    const sx = x0 + 8, sy = y0 + 48;
    rect(A, sx - 2, sy - 2, 36, 13, C.paper3);
    rect(A, sx - 1, sy - 1, 34, 11, '#2b4f9a');
    A.drawImage(textSprite('GARE', C.paper3, null), sx + 1, sy + 1);
  },

  /** Plaque émaillée suspendue (« QUAI 1 »…). */
  sign(d, level, A) {
    const text = d.text ?? 'QUAI 1';
    const x = cellX(d), y = cellY(d);
    const w = text.length * 8 + 6;
    rect(A, x + 3, y - 6, 1, 6, C.iron1);
    rect(A, x + w - 4, y - 6, 1, 6, C.iron1);
    rect(A, x, y, w, 13, C.paper3);
    rect(A, x + 1, y + 1, w - 2, 11, '#2b4f9a');
    A.drawImage(textSprite(text, C.paper3, null), x + 3, y + 3);
  },
};

/** Peint tous les éléments de décor d'un niveau. */
export function paintDecor(level, A, Em, out) {
  seedCounter = 1;
  for (const d of level.decor) {
    const fn = DECOR[d.type];
    if (!fn) throw new Error(`Niveau « ${level.id} » : décor inconnu « ${d.type} ».`);
    fn(d, level, A, Em, out);
  }
}
