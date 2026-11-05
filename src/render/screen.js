// Mise à l'échelle de l'écran de jeu.
//
// Le canvas a une résolution interne fixe (VIEW_W × VIEW_H). On l'agrandit
// d'un facteur ENTIER en pixels physiques de l'appareil, et le navigateur
// l'affiche sans lissage (image-rendering: pixelated) : chaque pixel du jeu
// devient un carré net de N×N pixels de l'écran.

import { GRID_W, GRID_H, TILE } from '../sim/constants.js';

/** Bandeau du haut (chrono, compteurs), en pixels du jeu. */
export const HUD_H = 24;
/** Bandeau du bas (narration). */
export const FOOT_H = 24;
export const LEVEL_Y = HUD_H;
export const VIEW_W = GRID_W * TILE;
export const VIEW_H = HUD_H + GRID_H * TILE + FOOT_H;

/**
 * Ajuste la taille affichée du canvas à l'espace disponible (px CSS).
 * @returns {number} le facteur d'échelle retenu (en pixels physiques)
 */
export function fitCanvas(canvas, availW, availH) {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.floor(Math.min((availW * dpr) / VIEW_W, (availH * dpr) / VIEW_H)));
  canvas.style.width = `${(VIEW_W * scale) / dpr}px`;
  canvas.style.height = `${(VIEW_H * scale) / dpr}px`;
  return scale;
}
