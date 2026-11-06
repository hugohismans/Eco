// Éléments de décor décrits dans le JSON des niveaux (« decor »).
//
// Chaque élément se peint dans les calques albedo (A) et émissif (Em), et
// déclare au besoin des lumières et des volumes lumineux (cônes, rais de lune,
// reflets) que l'éclairage animera à chaque image. Aucun n'a d'effet sur la
// simulation.
//
// Coordonnées : `col`, `row` en cases ; `dx`, `dy` décalage facultatif en px.

import { TILE, SUB } from '../sim/constants.js';

const SUB_PX = SUB;
import { C } from './palette.js';
import { rect, px, checker, sparse, textSprite } from './pixel.js';
import { LEVEL_Y, VIEW_H } from './screen.js';
import { floorRowBelow, ceilingRowAbove } from './themes.js';

const cellX = (d) => d.col * TILE + (d.dx ?? 0);
const cellY = (d) => LEVEL_Y + d.row * TILE + (d.dy ?? 0);
const floorY = (level, col, row) => LEVEL_Y + floorRowBelow(level, col, row) * TILE;

let seedCounter = 1;

/**
 * Fenêtre de wagon : cadre de bois, rideaux, et derrière la vitre la nuit qui
 * défile (le rendu y fait passer le paysage, voir `out.motion`).
 */
function trainWindow(d, level, A, Em, out) {
  const x = cellX(d), y = cellY(d);
  const w = (d.cols ?? 2) * TILE, h = (d.rows ?? 2) * TILE;
  rect(A, x - 3, y - 3, w + 6, h + 6, C.wood2);
  rect(A, x - 3, y - 3, w + 6, 1, C.wood3);
  rect(A, x - 4, y + h + 2, w + 8, 2, C.brass);
  rect(A, x, y, w, h, C.ink);
  rect(Em, x, y, w, h, C.night1);
  rect(Em, x, y + h - 7, w, 7, '#0c1020');
  for (let k = 0; k < 4; k++) px(Em, x + 3 + k, y + 3 + k, '#3a4a80');
  // Rideaux de velours, à demi tirés.
  for (const cx of [x - 2, x + w - 3]) {
    rect(A, cx, y - 2, 5, h + 3, '#6e2630');
    for (let k = 0; k < h; k += 3) px(A, cx + 2, y + k, '#9a3a40');
  }
  rect(A, x - 3, y - 4, w + 6, 2, C.brass);
  out.motion.push({ x: x + 3, y, w: w - 6, h });
  out.lights.push({ x: x + w / 2, y: y + h, r: 40, color: C.moon0, intensity: 0.2, flicker: 0, shadows: false, halo: 0 });
}

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
    if (level.theme === 'wagon') return trainWindow(d, level, A, Em, out);
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
    } else if (v === 'texte') {
      rect(A, x + 2, y + 3, w - 4, 4, C.brick3);
      rect(A, x + 2, y + 9, w - 6, 1, C.paper0);
      rect(A, x + 2, y + 11, w - 8, 1, C.paper0);
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

  /** Guichet : comptoir de bois, vitre éclairée, hygiaphone, « BILLETS ». */
  counter(d, level, A, Em, out) {
    const x = cellX(d), y = cellY(d);
    const w = (d.cols ?? 2) * TILE;
    const fy = floorY(level, d.col, d.row);
    // Caisson et fronton.
    rect(A, x, y, w, fy - y, C.wood1);
    rect(A, x - 2, y - 4, w + 4, 4, C.wood3);
    rect(A, x - 2, y - 4, w + 4, 1, C.wood4);
    // Plaque émaillée numérotée au-dessus du guichet.
    const label = String(d.label ?? '1');
    const pw = label.length * 8 + 6;
    const plx = x + Math.round((w - pw) / 2);
    rect(A, plx, y - 16, pw, 11, C.paper3);
    rect(A, plx + 1, y - 15, pw - 2, 9, '#2b4f9a');
    A.drawImage(textSprite(label, C.paper3, null), plx + 3, y - 15);
    // Vitre (émissif chaud) avec la silhouette vide d'une chaise.
    const gx = x + 4, gy = y + 3, gw = w - 8, gh = 18;
    rect(A, gx, gy, gw, gh, C.ink);
    rect(Em, gx, gy, gw, gh, C.lamp0);
    rect(Em, gx + 1, gy + 1, gw - 2, gh - 6, C.lamp1);
    rect(Em, gx + 2, gy + 2, gw - 4, 3, C.lamp2);
    rect(Em, gx + (gw >> 1) - 3, gy + 8, 6, 7, '#000');
    rect(Em, gx + (gw >> 1) - 3, gy + 6, 1, 3, '#000');
    rect(Em, gx + (gw >> 1) - 2, gy + 2, 4, 2, C.lamp3);
    rect(A, gx + (gw >> 1) - 2, gy + 10, 4, 3, C.iron1);
    // Tablette et façade à panneaux.
    rect(A, x - 1, gy + gh, w + 2, 3, C.wood4);
    rect(A, x - 1, gy + gh + 3, w + 2, 1, C.wood0);
    for (let k = x + 3; k < x + w - 6; k += 10) {
      rect(A, k, gy + gh + 7, 7, fy - gy - gh - 10, C.wood2);
      px(A, k, gy + gh + 7, C.wood3);
    }
    out.lights.push({ x: gx + gw / 2, y: gy + gh / 2, r: 54, color: C.lamp1, intensity: 0.7, flicker: 0, shadows: false, halo: 0.5 });
  },

  /** Tableau des départs : lettres orangées sur fond noir, une ligne qui clignote. */
  board(d, level, A, Em, out) {
    const x = cellX(d), y = cellY(d);
    const w = (d.cols ?? 6) * TILE;
    rect(A, x - 2, y - 2, w + 4, 38, C.iron1);
    rect(A, x, y, w, 34, C.ink);
    rect(A, x - 2, y - 2, w + 4, 1, C.iron2);
    const lines = ['DEPARTS', '23:59 DERNIER', '--:-- ------'];
    lines.forEach((t, i) => {
      Em.drawImage(textSprite(t.slice(0, Math.floor(w / 8) - 1), i === 0 ? C.lamp3 : C.lamp1, null), x + 4, y + 2 + i * 11);
    });
    out.lights.push({ x: x + w / 2, y: y + 17, r: 60, color: C.lamp1, intensity: 0.45, flicker: 0, shadows: false, halo: 0.3 });
  },

  /** Radiateur en fonte, sous la fenêtre. */
  radiator(d, level, A) {
    const x = cellX(d), y = cellY(d);
    rect(A, x - 4, y + 4, 26, 11, C.iron2);
    for (let k = 0; k < 6; k++) {
      rect(A, x - 3 + k * 4, y + 3, 3, 12, C.stone3);
      px(A, x - 3 + k * 4, y + 3, C.stone4);
    }
    rect(A, x - 4, y + 15, 26, 1, C.iron0);
  },

  /** Plante en pot, un peu fatiguée. */
  plant(d, level, A) {
    const x = cellX(d) + 8, y = cellY(d);
    rect(A, x - 4, y + 9, 9, 7, C.brick3);
    rect(A, x - 5, y + 9, 11, 2, C.brick4);
    const leaves = [[-1, 8, -6, 0], [0, 8, 0, -2], [1, 8, 6, 1], [0, 8, -3, -1], [0, 8, 4, -1]];
    for (const [ox, oy, tx, ty] of leaves) {
      for (let i = 0; i <= 6; i++) {
        px(A, Math.round(x + ox + (tx * i) / 6), Math.round(y + oy - i + (ty * i * i) / 36), i > 4 ? '#5d7a46' : '#3f5a34');
      }
    }
  },

  /** Applique murale grillagée (souterrain). */
  walllamp(d, level, A, Em, out) {
    const cx = cellX(d) + 8, y = cellY(d);
    rect(A, cx - 3, y, 7, 2, C.iron1);
    rect(A, cx - 4, y + 2, 9, 8, C.iron1);
    rect(Em, cx - 3, y + 3, 7, 6, C.lamp2);
    rect(Em, cx - 1, y + 4, 3, 3, C.lamp4);
    for (let k = 0; k < 3; k++) rect(Em, cx - 3, y + 4 + k * 2, 7, 1, '#000');
    rect(A, cx - 3, y + 10, 7, 1, C.iron0);
    const seed = seedCounter++;
    out.lights.push({ x: cx, y: y + 6, r: 80, color: C.lamp1, intensity: 1, flicker: seed, shadows: true, halo: 0.9 });
    const fy = floorY(level, d.col, d.row + 1);
    out.volumes.push({ type: 'cone', x: cx, y0: y + 9, y1: fy, w0: 8, w1: 40, color: C.lamp1, alpha: 0.12, flicker: seed, dust: 4 });
    out.volumes.push({ type: 'reflect', x: cx, y: fy, w: 12, h: 8, color: C.lamp2, alpha: 0.3, flicker: seed });
  },

  /** Portique de signalisation : poutre en treillis au-dessus de la voie. */
  gantry(d, level, A) {
    const x0 = cellX(d), y = cellY(d);
    const w = (d.cols ?? 5) * TILE;
    rect(A, x0, y, w, 2, C.iron1);
    rect(A, x0, y + 8, w, 2, C.iron1);
    for (let x = x0; x < x0 + w; x += 6) {
      for (let k = 0; k < 6; k++) px(A, x + k, y + 2 + k, C.iron1);
    }
    const fy = floorY(level, d.col, d.row + 1);
    rect(A, x0 + 2, y, 2, fy - y, C.iron1);
    rect(A, x0 + w - 4, y, 2, fy - y, C.iron1);
    // Feux éteints du portique.
    for (let k = 0; k < 3; k++) {
      const lx = x0 + 18 + k * 18;
      rect(A, lx - 3, y + 10, 7, 9, C.iron0);
      rect(A, lx - 2, y + 11, 5, 3, '#3a1414');
      rect(A, lx - 2, y + 15, 5, 3, '#143a22');
    }
  },

  /**
   * Le dernier train : voiture éclairée de l'intérieur, vitres chaudes, porte
   * ouverte (la sortie). À peindre devant les murs (`"layer": "front"`).
   */
  train(d, level, A, Em, out) {
    const x0 = cellX(d), y0 = cellY(d);
    const w = (d.cols ?? 4) * TILE + 16, h = (d.rows ?? 10) * TILE;
    const floor = LEVEL_Y + (d.floorRow ?? 12) * TILE;
    const ground = LEVEL_Y + (d.groundRow ?? 12) * TILE;
    // Caisse, selon la ligne : nuit (bleu), montagne (rouge), métro (vert), ancien (bois verni).
    const TRAIN_COLORS = {
      nuit: ['#4a64ab', '#2b3f78', '#33498a', C.paper3],
      montagne: ['#a8443a', '#6e2a24', '#8a362e', C.paper3],
      metro: ['#4f7a66', '#2e4a3e', '#3e6152', C.paper2],
      ancien: ['#6b4024', '#3a2214', '#4a2c1a', C.brass],
    };
    const [body, roof, roof2, band] = TRAIN_COLORS[d.variant ?? 'nuit'] ?? TRAIN_COLORS.nuit;
    rect(A, x0 + 2, y0 + 6, w, floor - y0 - 6, body);
    rect(A, x0 + 6, y0, w - 6, 3, roof);
    rect(A, x0 + 3, y0 + 3, w - 1, 3, roof2);
    rect(A, x0 + 2, y0 + 6, 1, floor - y0 - 6, roof);
    rect(A, x0 + 2, y0 + 22, w, 3, band);
    rect(A, x0 + 2, floor - 14, w, 2, band);
    for (let k = y0 + 28; k < floor - 16; k += 6) rect(A, x0 + 2, k, 1, 3, roof2);
    // Bandeau lumineux sous le toit.
    rect(Em, x0 + 4, y0 + 8, w - 4, 1, C.lamp2);
    // Vitres, sauf devant la porte.
    const ex = level.exit;
    const doorX0 = ex.x / SUB_PX - 4, doorX1 = (ex.x + ex.w) / SUB_PX + 4;
    for (let wx = x0 + 4; wx < x0 + w - 6; wx += 17) {
      if (wx + 13 > doorX0 && wx < doorX1) continue;
      rect(A, wx, y0 + 30, 13, 18, C.ink);
      rect(Em, wx, y0 + 30, 13, 18, C.lamp1);
      rect(Em, wx + 1, y0 + 31, 11, 7, C.lamp2);
      rect(Em, wx + 2, y0 + 42, 5, 6, '#000');
      rect(Em, wx + 2, y0 + 40, 3, 2, '#000');
    }
    // Encadrement de la porte (la sortie est dessinée dedans) et marchepied.
    const dx = doorX0 + 1, dy = ex.y / SUB_PX + LEVEL_Y - 4;
    if (level.exitStyle === 'train') {
      rect(A, dx, dy, doorX1 - doorX0 - 2, ex.h / SUB_PX + 4, C.iron2);
      rect(A, dx + 1, dy + 1, doorX1 - doorX0 - 4, 1, C.stone3);
    }
    // Dessous de caisse dans l'ombre, bogies et roues posées sur les rails.
    rect(A, x0 + 2, floor, w, ground - floor, C.iron0);
    rect(A, x0 + 2, floor, w, 3, C.iron1);
    rect(A, x0 + 6, floor + 10, w - 8, 2, C.iron1);
    const wy = ground - 6;
    for (const bx of [x0 + 20, x0 + w - 12]) {
      rect(A, bx - 12, wy - 9, 24, 4, C.iron1);
      for (let k = -1; k <= 1; k += 2) {
        const cx = bx + k * 7;
        for (let yy = -5; yy <= 5; yy++) {
          for (let xx = -5; xx <= 5; xx++) if (xx * xx + yy * yy <= 25) px(A, cx + xx, wy + yy, xx * xx + yy * yy > 12 ? C.iron2 : C.iron1);
        }
        px(A, cx, wy, C.stone3);
      }
    }
    // Numéro de voiture.
    A.drawImage(textSprite('2', C.paper3, null), x0 + 22, y0 + 8);
    out.lights.push({ x: x0 + w / 2, y: y0 + 40, r: 96, color: C.lamp1, intensity: 0.8, flicker: 0, shadows: false, halo: 0 });
    out.lights.push({ x: x0 + 24, y: y0 + 10, r: 50, color: C.lamp2, intensity: 0.5, flicker: 0, shadows: false, halo: 0.3 });
  },
};

Object.assign(DECOR, {
  // --- Chapitre 2 : la montagne ------------------------------------------------
  /** Poêle à bois : fonte, porte vitrée rougeoyante, tuyau jusqu'au plafond. */
  stove(d, level, A, Em, out) {
    const x = cellX(d) + 2, fy = floorY(level, d.col, d.row);
    const y = fy - 18;
    rect(A, x, y, 12, 18, C.iron1);
    rect(A, x - 1, y, 14, 2, C.iron2);
    rect(A, x + 1, fy - 2, 2, 2, C.iron0);
    rect(A, x + 9, fy - 2, 2, 2, C.iron0);
    rect(Em, x + 3, y + 6, 6, 5, C.lamp0);
    rect(Em, x + 4, y + 7, 4, 3, C.lamp2);
    rect(A, x + 5, LEVEL_Y + (ceilingRowAbove(level, d.col, d.row) + 1) * TILE, 2, y - LEVEL_Y - (ceilingRowAbove(level, d.col, d.row) + 1) * TILE, C.iron1);
    const seed = seedCounter++;
    out.lights.push({ x: x + 6, y: y + 8, r: 70, color: C.lamp1, intensity: 0.9, flicker: seed, shadows: true, halo: 0.6 });
  },

  /** Sapin enneigé (dehors). `rows` : hauteur en cases. */
  pine(d, level, A) {
    const cx = cellX(d) + 8, fy = floorY(level, d.col, d.row);
    const h = (d.rows ?? 3) * TILE;
    rect(A, cx - 1, fy - 5, 3, 5, C.wood1);
    for (let k = 0; k < h - 4; k++) {
      const w = Math.round(((k % 9) / 9 + k / h) * 6) + 1;
      rect(A, cx - w, fy - h + k, w * 2 + 1, 1, '#1f3a34');
      if (k % 9 === 0) rect(A, cx - w, fy - h + k, w * 2 + 1, 1, C.moon1);
    }
  },

  /** Paire de skis appuyée contre le mur. */
  skis(d, level, A) {
    const x = cellX(d) + 4, fy = floorY(level, d.col, d.row);
    for (const [ox, col] of [[0, '#a8443a'], [4, '#2b4f9a']]) {
      for (let k = 0; k < 30; k++) px(A, x + ox + Math.floor(k / 10), fy - 1 - k, col);
      px(A, x + ox + 3, fy - 31, col);
    }
  },

  // --- Chapitre 3 : la ville -------------------------------------------------------
  /** Enseigne au néon : texte qui luit (rose, bleu, vert, ambre). */
  neon(d, level, A, Em, out) {
    const colors = { rose: '#ff6ab4', bleu: '#6ad2ff', vert: '#7dffb0', ambre: C.lamp2 };
    const col = colors[d.color ?? 'rose'] ?? colors.rose;
    const text = d.text ?? 'HOTEL';
    const x = cellX(d), y = cellY(d);
    const w = text.length * 8 + 6;
    rect(A, x, y, w, 12, C.iron0);
    rect(A, x + 1, y - 4, 1, 4, C.iron1);
    rect(A, x + w - 2, y - 4, 1, 4, C.iron1);
    Em.drawImage(textSprite(text, col, null), x + 3, y + 2);
    out.lights.push({ x: x + w / 2, y: y + 6, r: 60, color: col, intensity: 0.55, flicker: d.flicker ? seedCounter++ : 0, shadows: false, halo: 0.6 });
  },

  /** Vitrine de boutique éclairée, avec son enseigne. */
  shopfront(d, level, A, Em, out) {
    const x = cellX(d), y = cellY(d);
    const w = (d.cols ?? 3) * TILE, h = (d.rows ?? 2) * TILE;
    rect(A, x - 2, y - 10, w + 4, h + 10, C.wood1);
    rect(A, x - 2, y - 10, w + 4, 8, '#2e4a3e');
    if (d.label) A.drawImage(textSprite(d.label.slice(0, Math.floor(w / 8)), C.paper3, null), x + 2, y - 10);
    rect(A, x, y, w, h, C.ink);
    rect(Em, x, y, w, h, '#5a3a28');
    rect(Em, x + 2, y + 2, w - 4, h - 8, C.lamp0);
    for (let k = x + 4; k < x + w - 6; k += 9) rect(Em, k, y + h - 12, 5, 6, C.lamp2);
    rect(A, x + (w >> 1), y, 1, h, C.wood1);
    out.lights.push({ x: x + w / 2, y: y + h / 2, r: 64, color: C.lamp1, intensity: 0.6, flicker: 0, shadows: false, halo: 0.4 });
  },

  /** Cheminée de toit en briques, avec son chapeau. */
  chimney(d, level, A) {
    const x = cellX(d) + 3, fy = floorY(level, d.col, d.row);
    rect(A, x, fy - 20, 10, 20, C.brick2);
    for (let y = fy - 20; y < fy; y += 4) rect(A, x, y + 3, 10, 1, C.brick1);
    rect(A, x - 1, fy - 22, 12, 2, C.stone2);
    rect(A, x + 2, fy - 26, 6, 4, C.iron1);
  },

  /** Antenne de télévision. */
  antenna(d, level, A) {
    const x = cellX(d) + 8, fy = floorY(level, d.col, d.row);
    rect(A, x, fy - 30, 1, 30, C.iron1);
    for (let k = 0; k < 3; k++) rect(A, x - 6 + k * 2, fy - 28 + k * 5, 13 - k * 4, 1, C.iron1);
  },

  // --- Chapitre 4 : le musée -------------------------------------------------------
  /** Tableau accroché (décor) : cadre doré, toile sombre et colorée. */
  painting(d, level, A, Em, out) {
    const x = cellX(d), y = cellY(d);
    const w = (d.cols ?? 2) * TILE - 4, h = (d.rows ?? 2) * TILE - 4;
    rect(A, x, y, w, h, C.brass);
    rect(A, x + 1, y + 1, w - 2, h - 2, C.wood1);
    const v = (d.variant ?? 1) % 4;
    const pal = [['#2b4f9a', '#c9b27a'], ['#6e2a24', '#e3cf98'], ['#2e4a3e', '#a6f0b6'], ['#3a2a40', '#ffadd6']][v];
    rect(A, x + 3, y + 3, w - 6, h - 6, pal[0]);
    if (v === 0) rect(A, x + 3, y + 3 + Math.floor((h - 6) * 0.6), w - 6, 2, pal[1]); // horizon
    if (v === 1) { rect(A, x + (w >> 1) - 3, y + 6, 6, 8, pal[1]); rect(A, x + (w >> 1) - 5, y + 14, 10, h - 20, pal[1]); } // portrait
    if (v === 2) for (let k = 0; k < 4; k++) rect(A, x + 5 + k * 5, y + h - 8 - k * 3, 3, 4 + k * 3, pal[1]); // nature morte
    if (v === 3) for (let k = 0; k < 5; k++) px(A, x + 5 + ((k * 7) % (w - 10)), y + 5 + ((k * 5) % (h - 10)), pal[1]); // étoiles
    out.lights.push({ x: x + w / 2, y: y - 4, r: 30, color: C.lamp3, intensity: 0.35, flicker: 0, shadows: false, halo: 0 });
    rect(Em, x + 2, y - 3, w - 4, 1, C.lamp0); // petite rampe éclairante
  },

  /** Statue sur son socle. */
  statue(d, level, A) {
    const x = cellX(d) + 2, fy = floorY(level, d.col, d.row);
    rect(A, x - 2, fy - 8, 16, 8, '#9c948a');
    rect(A, x - 2, fy - 8, 16, 1, '#c4bcb0');
    const top = fy - 30;
    rect(A, x + 4, top, 4, 5, '#b8b0a4');
    rect(A, x + 2, top + 5, 8, 12, '#b8b0a4');
    rect(A, x + 3, top + 17, 2, 5, '#b8b0a4');
    rect(A, x + 7, top + 17, 2, 5, '#b8b0a4');
    rect(A, x + 10, top + 6, 2, 7, '#a49c92');
  },

  /** Verrière : la lumière de la lune tombe du plafond. */
  skylight(d, level, A, Em, out) {
    const x = cellX(d), y = cellY(d);
    const w = (d.cols ?? 3) * TILE;
    const fy = floorY(level, d.col, d.row + 1);
    rect(Em, x, y, w, 3, C.night4);
    for (let k = x; k < x + w; k += 8) rect(Em, k, y, 1, 3, '#000');
    out.volumes.push({ type: 'shaft', x0: x, x1: x + w, y0: y + 3, y1: fy, slant: d.slant ?? 0.1, color: C.moon1, alpha: 0.12, dust: 8 });
    out.lights.push({ x: x + w / 2, y: fy - 10, r: 50, color: C.moon0, intensity: 0.35, flicker: 0, shadows: false, halo: 0 });
  },

  /** Cordon de velours entre deux poteaux. */
  rope(d, level, A) {
    const x = cellX(d), fy = floorY(level, d.col, d.row);
    const w = (d.cols ?? 2) * TILE;
    for (const px0 of [x + 2, x + w - 4]) { rect(A, px0, fy - 12, 2, 12, C.brass); rect(A, px0 - 1, fy - 1, 4, 1, C.brass); }
    for (let k = 0; k < w - 6; k++) px(A, x + 3 + k, fy - 10 + Math.round(Math.sin((k / (w - 6)) * Math.PI) * 3), '#a8443a');
  },

  // --- Chapitre 5 : le train de nuit ---------------------------------------------
  /** Banquette de compartiment, velours rouge, dossier d'un côté (`flip`). */
  seat(d, level, A) {
    const x = cellX(d) - 3, fy = floorY(level, d.col, d.row);
    const w = 22;
    const bx = d.flip ? x + w - 6 : x;
    rect(A, x, fy - 8, w, 8, C.wood1);
    rect(A, x, fy - 8, w, 1, C.wood3);
    rect(A, x + 1, fy - 2, 2, 2, C.iron0);
    rect(A, x + w - 3, fy - 2, 2, 2, C.iron0);
    rect(A, x - 1, fy - 12, w + 2, 4, '#6e2630');
    rect(A, x - 1, fy - 12, w + 2, 1, '#9a3a40');
    rect(A, bx, fy - 28, 6, 17, '#6e2630');
    rect(A, bx + (d.flip ? 0 : 5), fy - 28, 1, 17, '#9a3a40');
    rect(A, bx, fy - 28, 6, 4, C.paper3); // têtière de dentelle
    for (let k = 0; k < 3; k++) px(A, bx + 1 + k * 2, fy - 24, C.paper2);
  },

  /** Valises (décor) : au sol, ou sur le filet à bagages (`rack`). */
  luggage(d, level, A) {
    const x = cellX(d) + 1;
    const base = d.rack ? cellY(d) + 12 : floorY(level, d.col, d.row);
    if (d.rack) {
      rect(A, x - 4, base, 24, 1, C.brass);
      rect(A, x - 4, base + 3, 24, 1, C.brass);
      for (let k = 0; k < 24; k += 3) px(A, x - 4 + k, base + 1 + (k & 1), C.brass);
      rect(A, x - 5, base - 2, 1, 7, C.brass);
      rect(A, x + 20, base - 2, 1, 7, C.brass);
    }
    const v = (d.variant ?? d.col) % 3;
    const pal = [['#5a3424', '#7a4a30'], ['#2e3e52', '#46607a'], ['#4a3a24', '#6e5634']][v];
    rect(A, x, base - 9, 15, 9, pal[0]);
    rect(A, x, base - 9, 15, 1, pal[1]);
    rect(A, x + 4, base - 9, 1, 9, C.wood0);
    rect(A, x + 10, base - 9, 1, 9, C.wood0);
    rect(A, x + 6, base - 11, 4, 2, C.wood0);
    px(A, x, base - 9, C.brass);
    px(A, x + 14, base - 9, C.brass);
    if (!d.single) {
      rect(A, x + 2, base - 15, 10, 6, pal[1]);
      rect(A, x + 2, base - 15, 10, 1, C.paper1);
      rect(A, x + 6, base - 16, 2, 1, C.wood0);
    }
  },

  /** Caténaire : câble porteur en chaînette, fil de contact, pendules. */
  catenary(d, level, A, Em) {
    const x0 = cellX(d), y = cellY(d) + 2;
    const w = (d.cols ?? 6) * TILE;
    for (let k = 0; k < w; k++) {
      const sag = Math.round(Math.sin((k / w) * Math.PI) * 4);
      px(A, x0 + k, y + sag, C.iron1);
      if (k % 16 === 8) rect(A, x0 + k, y + sag, 1, 9 - sag, C.iron1);
    }
    rect(A, x0, y + 9, w, 1, C.iron2);
    for (let k = 5; k < w; k += 37) px(Em, x0 + k, y + 9, '#4a5c96');
    if (d.poles) {
      for (const px0 of [x0, x0 + w - 2]) {
        const fy = floorY(level, Math.floor(px0 / TILE), d.row + 1);
        rect(A, px0, y - 3, 2, fy - y + 3, C.iron1);
        rect(A, px0 - 3, y - 3, 8, 1, C.iron2);
      }
    }
  },

  // --- Chapitre 6 : la mer ------------------------------------------------------------
  /**
   * Phare au loin : tour à bandes, lanterne, pinceau qui balaie la nuit.
   * Il se dresse toujours sur son îlot, à l'horizon de la mer (seule `col` compte).
   */
  lighthouse(d, level, A, Em, out) {
    const cx = cellX(d) + 8, base = Math.round(VIEW_H * 0.58) + 1;
    rect(A, cx - 14, base - 2, 28, 3, '#141a30');
    rect(A, cx - 9, base - 4, 18, 2, '#141a30');
    const h = (d.rows ?? 3) * TILE;
    const top = base - h;
    for (let y = top + 8; y < base; y++) {
      const k = (y - top - 8) / (h - 8);
      const half = Math.round(3 + k * 3);
      const band = Math.floor((y - top) / 7) % 2;
      rect(A, cx - half, y, half * 2, 1, band ? '#8a3a3a' : '#c8c0b0');
    }
    rect(A, cx - 7, base - 2, 14, 2, '#2a2e3c');
    rect(A, cx - 4, top + 6, 8, 2, C.iron1);
    rect(A, cx - 3, top + 1, 6, 5, C.ink);
    rect(Em, cx - 2, top + 2, 4, 3, C.lamp4);
    rect(A, cx - 3, top - 1, 6, 2, C.iron1);
    px(A, cx, top - 2, C.iron1);
    out.lights.push({ x: cx, y: top + 3, r: 70, color: C.lamp3, intensity: 0.7, flicker: 0, shadows: false, halo: 1.2 });
    out.volumes.push({ type: 'sweep', x: cx, y: top + 3, len: d.reach ?? 220, spread: 9, color: C.lamp3, alpha: 0.28, speed: 0.9 });
  },

  /** Barque de pêcheur amarrée, lanterne au mât. */
  boat(d, level, A, Em, out) {
    const x = cellX(d), base = cellY(d) + TILE;
    const w = (d.cols ?? 3) * TILE;
    for (let k = 0; k < 7; k++) {
      const inset = Math.round((k * k) / 5);
      rect(A, x + inset, base - 7 + k, w - inset * 2, 1, k < 2 ? '#5a3a28' : '#2e2420');
    }
    rect(A, x, base - 8, w, 1, C.wood3);
    rect(A, x + (w >> 1) - 6, base - 15, 12, 7, C.wood1);
    rect(A, x + (w >> 1) - 4, base - 13, 4, 3, C.ink);
    rect(Em, x + (w >> 1) - 4, base - 13, 4, 3, C.lamp1);
    const mx = x + (w >> 2);
    rect(A, mx, base - 34, 1, 26, C.wood1);
    rect(A, mx - 2, base - 30, 3, 3, C.iron1);
    rect(Em, mx - 1, base - 29, 1, 1, C.lamp4);
    out.lights.push({ x: mx, y: base - 29, r: 40, color: C.lamp2, intensity: 0.55, flicker: seedCounter++, shadows: false, halo: 0.8 });
    out.volumes.push({ type: 'reflect', x: mx, y: base + 2, w: 10, h: 12, color: C.lamp2, alpha: 0.3 });
  },

  /** Bouée de chenal : rouge et blanche, feu à éclats. */
  buoy(d, level, A, Em, out) {
    const cx = cellX(d) + 8, base = cellY(d) + TILE;
    rect(A, cx - 5, base - 6, 10, 6, '#8a2a2a');
    rect(A, cx - 5, base - 6, 10, 1, '#b84a40');
    rect(A, cx - 3, base - 14, 6, 8, '#a83430');
    rect(A, cx - 3, base - 11, 6, 2, C.paper3);
    rect(A, cx - 1, base - 18, 2, 4, C.iron1);
    rect(Em, cx - 1, base - 20, 2, 2, '#ff6a50');
    const phase = (d.col * 0.37) % 1;
    out.lights.push({ x: cx, y: base - 19, r: 46, color: '#ff6a50', intensity: 0.8, flicker: 0, shadows: false, halo: 1, blink: 2.4, blinkPhase: phase * 2.4 });
  },

  /** Locomotive à vapeur exposée (devant les murs : `"layer": "front"`). */
  locomotive(d, level, A, Em, out) {
    const x0 = cellX(d), fy = floorY(level, d.col, d.row);
    const w = (d.cols ?? 8) * TILE;
    // Chaudière, cabine, cheminée, roues.
    rect(A, x0 + 10, fy - 40, w - 50, 22, '#1e2430');
    rect(A, x0 + 10, fy - 40, w - 50, 2, '#3a4258');
    for (let k = x0 + 18; k < x0 + w - 44; k += 16) rect(A, k, fy - 40, 2, 22, C.brass);
    rect(A, x0 + w - 40, fy - 58, 38, 40, '#2a2030');
    rect(A, x0 + w - 36, fy - 54, 14, 12, C.ink);
    rect(Em, x0 + w - 35, fy - 53, 12, 10, C.lamp1);
    rect(A, x0 + 16, fy - 56, 8, 16, '#1e2430');
    rect(A, x0 + 14, fy - 58, 12, 3, '#3a4258');
    rect(Em, x0 + 4, fy - 34, 6, 6, C.lamp3);
    out.lights.push({ x: x0 + 7, y: fy - 31, r: 60, color: C.lamp2, intensity: 0.6, flicker: 0, shadows: false, halo: 0.8 });
    for (const wx of [x0 + 24, x0 + 48, x0 + 72]) {
      for (let yy = -9; yy <= 9; yy++) for (let xx = -9; xx <= 9; xx++) if (xx * xx + yy * yy <= 81) px(A, wx + xx, fy - 10 + yy, xx * xx + yy * yy > 60 ? '#6e2a24' : '#1e2430');
    }
    rect(A, x0 + 20, fy - 11, 60, 2, C.stone3);
  },
});

/**
 * Peint les éléments de décor d'un niveau. `layer` : 'back' (derrière les murs,
 * par défaut) ou 'front' (devant, comme le train).
 */
export function paintDecor(level, A, Em, out, layer = 'back') {
  if (layer === 'back') seedCounter = 1;
  for (const d of level.decor) {
    if ((d.layer ?? 'back') !== layer) continue;
    const fn = DECOR[d.type];
    if (!fn) throw new Error(`Niveau « ${level.id} » : décor inconnu « ${d.type} ».`);
    fn(d, level, A, Em, out);
  }
}
