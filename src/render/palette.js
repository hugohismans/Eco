// Palette commune à toutes les pièces : nuit profonde, lampes orangées, bois,
// briques, affiches jaunies. Chaque pièce y pioche ; aucune couleur « libre »
// ailleurs dans le rendu, pour garder une image cohérente d'un niveau à l'autre.

export const C = {
  // Nuit
  ink: '#05060f',
  night0: '#0a0e24',
  night1: '#111735',
  night2: '#1a2148',
  night3: '#232d5c',
  night4: '#2f3c73',
  night5: '#3f4f8a',
  // Lune, lumières froides
  moon0: '#8fa6d8',
  moon1: '#c4d2f0',
  moon2: '#eef3ff',
  // Lampes
  lamp0: '#c8632a',
  lamp1: '#ff9a3c',
  lamp2: '#ffb35c',
  lamp3: '#ffd089',
  lamp4: '#fff0c8',
  // Briques
  brick0: '#3a1f1d',
  brick1: '#5a2e26',
  brick2: '#74392c',
  brick3: '#8f4a34',
  brick4: '#a65d3f',
  // Bois
  wood0: '#2e1b12',
  wood1: '#4a2c1a',
  wood2: '#6b4024',
  wood3: '#8c5a32',
  wood4: '#b07a46',
  // Pierre
  stone0: '#2c2b3a',
  stone1: '#3d3c4f',
  stone2: '#55546a',
  stone3: '#727189',
  stone4: '#9998ae',
  // Affiches, laiton
  paper0: '#7d6a45',
  paper1: '#a89062',
  paper2: '#c9b27a',
  paper3: '#e3cf98',
  brass: '#d1a257',
  // Fer, signaux
  iron0: '#14151f',
  iron1: '#23263a',
  iron2: '#363a55',
  signalRed: '#ff5a4a',
  signalGreen: '#7dffb0',
  // Personnage
  silhouette: '#07070d',
  rim: '#ffcf8a',
};

/** Teintes pâles des échos : bleu, rose, jaune, vert (dans l'ordre des tentatives). */
export const ECHO_TINTS = ['#9ec9ff', '#ffadd6', '#ffe08a', '#a6f0b6'];

/** '#rrggbb' -> [r, g, b] */
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** '#rrggbb' + alpha -> 'rgba(…)' */
export function rgba(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
