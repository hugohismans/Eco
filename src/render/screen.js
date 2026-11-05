// Mise à l'échelle de l'écran de jeu.
//
// La pièce a une taille fixe en pixels du jeu (SCENE_W × SCENE_H) : c'est le
// « repère de la scène », dans lequel tout est dessiné. L'image affichée, elle,
// remplit tout l'écran : on choisit le plus grand facteur ENTIER qui fait
// tenir la pièce, puis on agrandit l'image (view.w × view.h pixels du jeu)
// jusqu'aux bords. Le décor (ciel, murs, sol) se prolonge autour de la pièce.
// Le navigateur affiche le canvas sans lissage (image-rendering: pixelated) :
// chaque pixel du jeu reste un carré net de N × N pixels de l'écran.

import { GRID_W, GRID_H, TILE } from '../sim/constants.js';

/** Bandeau du haut (chrono, compteurs), en pixels du jeu. */
export const HUD_H = 24;
/** Bandeau du bas (narration). */
export const FOOT_H = 24;
export const LEVEL_Y = HUD_H;
/** Taille de la scène (pièce + bandeaux), en pixels du jeu. */
export const VIEW_W = GRID_W * TILE;
export const VIEW_H = HUD_H + GRID_H * TILE + FOOT_H;

/**
 * Image affichée : taille en pixels du jeu, et position de la scène dedans.
 * Partagée par le rendu (mise à jour par `computeView`).
 */
export const view = { w: VIEW_W, h: VIEW_H, ox: 0, oy: 0, scale: 1 };

/** Zone à peindre, dans le repère de la scène (déborde autour de la pièce). */
export function sceneBounds(v = view) {
  return { x0: -v.ox, y0: -v.oy, x1: v.w - v.ox, y1: v.h - v.oy, w: v.w, h: v.h };
}

/**
 * Calcule l'image plein écran.
 * @param {number} cssW largeur disponible (px CSS)
 * @param {number} cssH hauteur disponible (px CSS)
 * @param {{ dpr?: number, safeTop?: number, controls?: number }} opts
 *   safeTop : encoche (px CSS) ; controls : hauteur réservée aux commandes
 *   tactiles en bas (px CSS), sous la pièce si la place le permet.
 */
export function computeView(cssW, cssH, { dpr = 1, safeTop = 0, controls = 0 } = {}) {
  const W = Math.floor(cssW * dpr), H = Math.floor(cssH * dpr);
  let scale = Math.max(1, Math.floor(Math.min(W / VIEW_W, H / VIEW_H)));
  // Commandes tactiles en bas : si elles couvriraient le sol de la pièce, on
  // prend un cran de zoom en moins (le bandeau de narration peut être couvert).
  if (controls > 0 && scale > 1) {
    const room = (s) => Math.floor(H / s) - VIEW_H + FOOT_H - Math.ceil((controls * dpr) / s);
    if (room(scale) < 0) scale -= 1;
  }
  const w = Math.max(VIEW_W, Math.floor(W / scale));
  const h = Math.max(VIEW_H, Math.floor(H / scale));
  const ox = Math.floor((w - VIEW_W) / 2);
  const toGame = (css) => Math.ceil((css * dpr) / scale);
  let oy = Math.floor((h - VIEW_H) / 2);
  if (controls > 0) {
    // Écran en hauteur : la pièce monte pour laisser les commandes en dessous.
    oy = Math.max(toGame(safeTop), Math.floor((h - toGame(controls) - VIEW_H) / 2));
    oy = Math.min(oy, h - VIEW_H);
  }
  Object.assign(view, { w, h, ox, oy, scale });
  return view;
}

/** Applique la taille CSS du canvas (pleine page, à un pixel physique près). */
export function fitCanvas(canvas, dpr = 1) {
  canvas.style.width = `${(view.w * view.scale) / dpr}px`;
  canvas.style.height = `${(view.h * view.scale) / dpr}px`;
}
