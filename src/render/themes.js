// Ambiances des pièces : fond, matière des murs et des sols, lumière ambiante.
//
// Le fond et les cases sont peints UNE fois par niveau, en deux calques à la
// résolution interne :
//   - « albedo » : la couleur des choses, avant éclairage ;
//   - « emissive » : ce qui brille par soi-même (étoiles, fenêtres, ampoules).
// L'éclairage (lighting.js) multiplie ensuite l'albedo par une carte de lumière
// lisse, puis ajoute l'émissif et son halo.

import { GRID_W, GRID_H, TILE, T_SOLID, T_ONEWAY } from '../sim/constants.js';
import { C } from './palette.js';
import { rect, px, checker, sparse, rng } from './pixel.js';
import { VIEW_W, VIEW_H, LEVEL_Y } from './screen.js';

/** Case de la grille pour le dessin : au-delà des bords, on prolonge. */
export function drawTileAt(level, col, row) {
  const c = Math.max(0, Math.min(GRID_W - 1, col));
  const r = Math.max(0, Math.min(GRID_H - 1, row));
  if (col < 0 || col >= GRID_W) {
    // Sur les côtés : on prolonge le mur s'il y en a un, sinon l'espace reste ouvert.
    return level.tiles[r * GRID_W + c] === T_SOLID ? T_SOLID : 0;
  }
  return level.tiles[r * GRID_W + c];
}

const solidAt = (level, c, r) => drawTileAt(level, c, r) === T_SOLID;

/** Première rangée solide sous (col, row), ou GRID_H. */
export function floorRowBelow(level, col, row) {
  for (let r = row; r < GRID_H; r++) if (solidAt(level, col, r)) return r;
  return GRID_H;
}

/** Première rangée solide au-dessus de (col, row), ou -1. */
export function ceilingRowAbove(level, col, row) {
  for (let r = row; r >= 0; r--) if (solidAt(level, col, r)) return r;
  return -1;
}

// --- Thèmes -------------------------------------------------------------

export const THEMES = {
  /** Le quai, dehors : ciel, lune, ville au loin ; sol en dalles de pierre. */
  quai: {
    ambient: '#56619f',
    fog: { color: '#8fa6d8', alpha: 0.16 },
    tiles: 'stone',
    wet: true,
    backdrop: paintSky,
  },
  /** Le hall : murs ocre, lambris, corniches ; sol en parquet ciré. */
  hall: {
    ambient: '#454b85',
    fog: null,
    tiles: 'brick',
    wet: true,
    backdrop: paintInterior,
    wall: '#86695a',
    wallDark: '#6e5649',
    pilasters: true,
  },
  /** Les guichets : boiseries plus sombres, enduit chaud. */
  guichets: {
    ambient: '#424780',
    fog: null,
    tiles: 'brick',
    wet: true,
    backdrop: paintInterior,
    wall: '#7d6450',
    wallDark: '#684f3f',
    pilasters: false,
  },
  /** La salle d'attente : papier peint vert à rayures, radiateur. */
  attente: {
    ambient: '#434a7c',
    fog: null,
    tiles: 'brick',
    wet: true,
    backdrop: paintInterior,
    wall: '#5e6b52',
    wallDark: '#4f5b45',
    stripes: true,
    pilasters: false,
  },
  /** Le souterrain : carreaux de faïence, béton, appliques grillagées. */
  souterrain: {
    ambient: '#3c4472',
    fog: { color: '#8fa6d8', alpha: 0.08 },
    tiles: 'concrete',
    wet: true,
    backdrop: paintTiled,
  },
  /** La voie : dehors, ballast et rails, portique de signalisation. */
  voie: {
    ambient: '#535d9a',
    fog: { color: '#8fa6d8', alpha: 0.2 },
    tiles: 'ballast',
    wet: false,
    backdrop: paintSky,
  },
  /** Le dernier train : le quai, la nuit, un train éclairé. */
  train: {
    ambient: '#56619f',
    fog: { color: '#8fa6d8', alpha: 0.14 },
    tiles: 'stone',
    wet: true,
    backdrop: paintSky,
  },
};

export function themeOf(level) {
  return THEMES[level.theme] ?? THEMES.hall;
}

// --- Fonds ----------------------------------------------------------------

/** Ciel nocturne, étoiles, lune, collines et lumières de la ville. */
function paintSky(level, A, Em, lights) {
  const r = rng(7);
  // Ciel en bandes tramées (pas de dégradé lisse : c'est la lumière qui l'est).
  const bands = [
    [0, C.night3],
    [70, C.night4],
    [140, C.night5],
    [200, '#5a6aa8'],
  ];
  for (let i = 0; i < bands.length; i++) {
    const [y0, col] = bands[i];
    const y1 = i + 1 < bands.length ? bands[i + 1][0] : VIEW_H;
    rect(A, 0, y0, VIEW_W, y1 - y0, col);
    if (i > 0) {
      checker(A, 0, y0, VIEW_W, 4, bands[i - 1][1]);
      sparse(A, 0, y0 + 4, VIEW_W, 6, bands[i - 1][1]);
    }
  }
  // Voiles de nuages.
  for (const [cx, cy, w] of [[40, 52, 70], [150, 30, 90], [110, 96, 60], [200, 120, 50]]) {
    sparse(A, cx - w / 2, cy, w, 3, C.night5, 1);
    checker(A, cx - w / 3, cy + 1, (w * 2) / 3, 2, C.night5);
    rect(A, cx - w / 5, cy + 1, w / 2.5, 1, '#5a6aa8');
  }
  // Étoiles (émissives : elles ne dépendent pas de l'éclairage).
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(r() * VIEW_W);
    const y = Math.floor(r() * 180);
    const b = r();
    px(Em, x, y, b > 0.8 ? C.moon2 : b > 0.4 ? C.moon1 : C.moon0);
    if (b > 0.94) {
      px(Em, x - 1, y, C.moon0); px(Em, x + 1, y, C.moon0);
      px(Em, x, y - 1, C.moon0); px(Em, x, y + 1, C.moon0);
    }
  }
  // Lune.
  const mx = 178, my = 46;
  for (let y = -8; y <= 8; y++) {
    for (let x = -8; x <= 8; x++) {
      const d = x * x + y * y;
      if (d <= 64) px(Em, mx + x, my + y, d > 49 ? C.moon1 : C.moon2);
    }
  }
  for (const [x, y, s] of [[-3, -2, 2], [2, 3, 3], [3, -4, 1], [-4, 4, 1]]) rect(Em, mx + x, my + y, s, s, C.moon1);
  lights.push({ x: mx, y: my, r: 120, color: C.moon1, intensity: 0.28, flicker: 0, halo: 0.5 });

  // Collines lointaines et ville.
  const hillTop = (x) => 214 + Math.round(6 * Math.sin(x / 23) + 4 * Math.sin(x / 9 + 1));
  for (let x = 0; x < VIEW_W; x++) rect(A, x, hillTop(x), 1, VIEW_H, C.night2);
  for (let x = 0; x < VIEW_W; x += 1) if (((x * 7) % 5) === 0) px(A, x, hillTop(x) - 1, C.night3);
  let x = 4;
  while (x < VIEW_W) {
    const w = 6 + Math.floor(r() * 10);
    const h = 6 + Math.floor(r() * 16);
    const base = 236;
    rect(A, x, base - h, w, h + 40, C.night1);
    for (let wy = base - h + 2; wy < base - 1; wy += 3) {
      for (let wx = x + 1; wx < x + w - 1; wx += 2) {
        if (r() < 0.22) px(Em, wx, wy, r() < 0.5 ? C.lamp0 : C.lamp1);
      }
    }
    x += w + 1 + Math.floor(r() * 6);
  }
  // Pylône et caténaire au loin.
  for (let y = 196; y < 236; y++) px(A, 30, y, C.night1);
  rect(A, 26, 198, 9, 1, C.night1);
  for (let x2 = 0; x2 < VIEW_W; x2++) px(A, x2, 199 + Math.round(3 * Math.cos((x2 - 30) / 60)), C.night2);
}

/** Intérieur : enduit ocre, pilastres de briques, lambris et corniches. */
function paintInterior(level, A, Em, lights, theme) {
  const wall = theme.wall;
  const wallDark = theme.wallDark;
  rect(A, 0, 0, VIEW_W, VIEW_H, wall);
  // Grain de l'enduit, ou rayures d'un papier peint.
  if (theme.stripes) {
    for (let x = 0; x < VIEW_W; x += 8) {
      rect(A, x, 0, 3, VIEW_H, wallDark);
      for (let y = (x >> 3) & 1 ? 4 : 0; y < VIEW_H; y += 8) px(A, x + 5, y, wallDark);
    }
  } else {
    sparse(A, 0, 0, VIEW_W, VIEW_H, wallDark);
  }
  // Pilastres de briques toutes les quatre cases.
  for (let cx = 32; theme.pilasters && cx < VIEW_W; cx += 64) {
    for (let y = 0; y < VIEW_H; y += 4) {
      rect(A, cx, y, 12, 3, C.brick3);
      rect(A, cx, y + 3, 12, 1, C.brick1);
      px(A, cx + ((y >> 2) & 1 ? 3 : 8), y, C.brick1);
    }
    rect(A, cx - 1, 0, 1, VIEW_H, C.brick1);
    rect(A, cx + 12, 0, 1, VIEW_H, C.brick1);
  }
  // Lambris au-dessus de chaque sol, corniche sous chaque plafond.
  for (let r = -2; r < GRID_H + 2; r++) {
    for (let c = 0; c < GRID_W; c++) {
      if (solidAt(level, c, r)) continue;
      const x = c * TILE, y = LEVEL_Y + r * TILE;
      if (solidAt(level, c, r + 1)) {
        rect(A, x, y + 2, TILE, 14, C.wood2);
        rect(A, x, y + 2, TILE, 2, C.wood3);
        rect(A, x, y + 4, TILE, 1, C.wood1);
        rect(A, x + 2, y + 7, 12, 7, C.wood1);
        rect(A, x + 3, y + 8, 10, 5, C.wood2);
        px(A, x + 3, y + 8, C.wood3);
      }
      if (solidAt(level, c, r - 1)) {
        rect(A, x, y, TILE, 3, C.paper1);
        rect(A, x, y + 3, TILE, 1, C.paper0);
        for (let k = 1; k < TILE; k += 3) px(A, x + k, y + 4, C.paper0);
      }
    }
  }
}

/** Souterrain : faïence blanche biseautée, bandeau de couleur, béton en bas. */
function paintTiled(level, A) {
  const tile = '#a9a28e';
  const grout = '#7d7768';
  const hi = '#c4bda6';
  rect(A, 0, 0, VIEW_W, VIEW_H, tile);
  for (let y = 0; y < VIEW_H; y += 6) {
    rect(A, 0, y + 5, VIEW_W, 1, grout);
    const off = (y / 6) & 1 ? 6 : 0;
    for (let x = off; x < VIEW_W; x += 12) {
      rect(A, x, y, 1, 5, grout);
      rect(A, x + 1, y, 10, 1, hi);
    }
  }
  // Bandeau de carreaux bruns à mi-hauteur de chaque pièce, et soubassement.
  for (let r = -2; r < GRID_H + 2; r++) {
    for (let c = 0; c < GRID_W; c++) {
      if (solidAt(level, c, r)) continue;
      const x = c * TILE, y = LEVEL_Y + r * TILE;
      if (solidAt(level, c, r + 1)) {
        rect(A, x, y + 4, TILE, 12, C.stone2);
        rect(A, x, y + 4, TILE, 1, C.stone3);
        for (let k = 0; k < TILE; k += 4) px(A, x + k, y + 9, C.stone1);
      }
      if (solidAt(level, c, r + 3) && !solidAt(level, c, r + 2) && !solidAt(level, c, r + 1)) {
        rect(A, x, y + 6, TILE, 3, C.brick3);
        rect(A, x, y + 9, TILE, 1, C.brick1);
      }
    }
  }
}

// --- Cases ----------------------------------------------------------------

/** Peint les cases solides et les plateformes fines, avec leurs bords. */
export function paintTiles(level, theme, A) {
  for (let r = -2; r < GRID_H + 2; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const t = drawTileAt(level, c, r);
      const x = c * TILE, y = LEVEL_Y + r * TILE;
      if (t === T_SOLID) {
        if (theme.tiles === 'stone') paintStone(level, A, c, r, x, y);
        else if (theme.tiles === 'concrete') paintConcrete(level, A, c, r, x, y);
        else if (theme.tiles === 'ballast') paintBallast(level, A, c, r, x, y);
        else paintBrick(level, A, c, r, x, y);
      } else if (t === T_ONEWAY) {
        paintPlank(A, x, y);
      }
    }
  }
  // Ombre portée douce des murs sur le fond (occlusion ambiante, tramée).
  for (let r = -1; r < GRID_H + 1; r++) {
    for (let c = 0; c < GRID_W; c++) {
      if (solidAt(level, c, r)) continue;
      const x = c * TILE, y = LEVEL_Y + r * TILE;
      const ao = 'rgba(5,6,15,0.35)';
      if (solidAt(level, c, r - 1)) { rect(A, x, y, TILE, 2, ao); rect(A, x, y + 2, TILE, 3, 'rgba(5,6,15,0.18)'); }
      if (solidAt(level, c - 1, r)) { rect(A, x, y, 2, TILE, ao); rect(A, x + 2, y, 3, TILE, 'rgba(5,6,15,0.18)'); }
      if (solidAt(level, c + 1, r)) { rect(A, x + TILE - 2, y, 2, TILE, ao); rect(A, x + TILE - 5, y, 3, TILE, 'rgba(5,6,15,0.18)'); }
    }
  }
}

function paintStone(level, A, c, r, x, y) {
  const top = !solidAt(level, c, r - 1);
  const left = !solidAt(level, c - 1, r);
  const right = !solidAt(level, c + 1, r);
  // Blocs de pierre 16 × 8, joints décalés.
  rect(A, x, y, TILE, TILE, C.stone2);
  for (let k = 0; k < 2; k++) {
    const by = y + k * 8;
    rect(A, x, by + 7, TILE, 1, C.stone1);
    const jx = x + (((r * 2 + k) & 1) ? 8 : 0);
    rect(A, jx, by, 1, 7, C.stone1);
    rect(A, x, by, TILE, 1, C.stone3);
    px(A, jx + 1, by + 1, C.stone3);
  }
  sparse(A, x, y + 1, TILE, TILE - 1, C.stone1, c + r);
  if (top) {
    // Dalle du quai : nez de marche clair, ligne de sécurité jaunie.
    rect(A, x, y, TILE, 4, C.stone3);
    rect(A, x, y, TILE, 1, C.stone4);
    rect(A, x, y + 2, TILE, 1, C.paper2);
    rect(A, x, y + 4, TILE, 1, C.stone0);
    for (let k = 1; k < TILE; k += 4) px(A, x + k, y + 3, C.stone2);
  }
  if (left) { rect(A, x, y, 1, TILE, C.stone0); }
  if (right) { rect(A, x + TILE - 1, y, 1, TILE, C.stone0); }
  if (!solidAt(level, c, r + 1)) rect(A, x, y + TILE - 1, TILE, 1, C.stone0);
}

function paintBrick(level, A, c, r, x, y) {
  const top = !solidAt(level, c, r - 1);
  const left = !solidAt(level, c - 1, r);
  const right = !solidAt(level, c + 1, r);
  const bottom = !solidAt(level, c, r + 1);
  rect(A, x, y, TILE, TILE, C.brick2);
  for (let k = 0; k < 4; k++) {
    const by = y + k * 4;
    rect(A, x, by + 3, TILE, 1, C.brick1);
    const off = ((r * 4 + k) & 1) ? 4 : 0;
    for (let bx = x + off; bx < x + TILE; bx += 8) {
      rect(A, bx, by, 1, 3, C.brick1);
      px(A, bx + 1, by, C.brick3);
      px(A, bx + 2, by, C.brick3);
    }
  }
  if (top) {
    // Parquet ciré.
    rect(A, x, y, TILE, 5, C.wood3);
    rect(A, x, y, TILE, 1, C.wood4);
    rect(A, x, y + 4, TILE, 1, C.wood1);
    rect(A, x + ((c * 5) % 11) + 2, y + 1, 1, 3, C.wood2);
    checker(A, x, y + 2, TILE, 1, C.wood2, c);
  }
  if (bottom) {
    rect(A, x, y + TILE - 3, TILE, 3, C.paper1);
    rect(A, x, y + TILE - 1, TILE, 1, C.paper0);
  }
  if (left) rect(A, x, y, 1, TILE, C.brick0);
  if (right) rect(A, x + TILE - 1, y, 1, TILE, C.brick0);
}

function paintConcrete(level, A, c, r, x, y) {
  const top = !solidAt(level, c, r - 1);
  rect(A, x, y, TILE, TILE, C.stone1);
  sparse(A, x, y, TILE, TILE, C.stone2, c * 3 + r);
  if (((c * 7 + r * 3) % 5) === 0) rect(A, x + 3, y + 6, 5, 1, C.stone0);
  if (top) {
    rect(A, x, y, TILE, 3, C.stone3);
    rect(A, x, y, TILE, 1, C.stone4);
    rect(A, x, y + 3, TILE, 1, C.stone0);
  }
  if (!solidAt(level, c - 1, r)) rect(A, x, y, 1, TILE, C.stone0);
  if (!solidAt(level, c + 1, r)) rect(A, x + TILE - 1, y, 1, TILE, C.stone0);
  if (!solidAt(level, c, r + 1)) rect(A, x, y + TILE - 1, TILE, 1, C.stone0);
}

/** Ballast et rails : traverses de bois, rail d'acier qui brille un peu. */
function paintBallast(level, A, c, r, x, y) {
  const top = !solidAt(level, c, r - 1);
  rect(A, x, y, TILE, TILE, C.stone1);
  for (let k = 0; k < 24; k++) {
    const gx = (k * 7 + c * 5 + r * 3) % TILE, gy = (k * 11 + c * 3) % TILE;
    px(A, x + gx, y + gy, k % 3 ? C.stone2 : C.stone0);
  }
  if (top) {
    rect(A, x, y, TILE, 2, C.stone2);
    // Traverse et rail vus de côté.
    rect(A, x + 2, y - 2, 12, 2, C.wood1);
    rect(A, x, y - 4, TILE, 2, C.iron2);
    rect(A, x, y - 4, TILE, 1, C.stone4);
  }
}

function paintPlank(A, x, y) {
  rect(A, x, y, TILE, 4, C.wood3);
  rect(A, x, y, TILE, 1, C.wood4);
  rect(A, x, y + 3, TILE, 1, C.wood1);
  px(A, x + 3, y + 4, C.wood1);
  px(A, x + 12, y + 4, C.wood1);
}
