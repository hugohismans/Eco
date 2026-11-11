// Ambiances des pièces : fond, matière des murs et des sols, lumière ambiante.
//
// Le fond et les cases sont peints UNE fois par niveau, en deux calques à la
// résolution interne :
//   - « albedo » : la couleur des choses, avant éclairage ;
//   - « emissive » : ce qui brille par soi-même (étoiles, fenêtres, ampoules).
// L'éclairage (lighting.js) multiplie ensuite l'albedo par une carte de lumière
// lisse, puis ajoute l'émissif et son halo.

import {
  GRID_W, GRID_H, TILE, T_SOLID, T_ONEWAY, T_ICE, T_CONV_L, T_CONV_R, T_GHOST, T_GLASS,
  T_MIRROR_A, T_MIRROR_B, T_RECEIVER,
} from '../sim/constants.js';
import {
  paintMountains, paintChalet, paintCity, paintStreet, paintMuseum, paintStorage, paintHall,
  paintWagon, paintTrainRoof, paintSea, paintTerminus,
  paintFair, paintMirrorHall, paintHill, paintDome, paintDawn,
} from './backdrops.js';
import { C } from './palette.js';
import { rect, px, checker, sparse, rng } from './pixel.js';
import { VIEW_W, VIEW_H, LEVEL_Y, sceneBounds } from './screen.js';

/** Case de la grille pour le dessin : au-delà des bords, on prolonge. */
export function drawTileAt(level, col, row) {
  const c = Math.max(0, Math.min(GRID_W - 1, col));
  const r = Math.max(0, Math.min(GRID_H - 1, row));
  if (col < 0 || col >= GRID_W) {
    // Sur les côtés : on prolonge le mur s'il y en a un, sinon l'espace reste ouvert.
    return MASSIVE.has(level.tiles[r * GRID_W + c]) ? level.tiles[r * GRID_W + c] : 0;
  }
  return level.tiles[r * GRID_W + c];
}

/** Cases « pleines » pour le dessin (bords, ombres, lambris). */
const MASSIVE = new Set([T_SOLID, T_ICE, T_CONV_L, T_CONV_R, T_MIRROR_A, T_MIRROR_B, T_RECEIVER]);
export const solidAt = (level, c, r) => MASSIVE.has(drawTileAt(level, c, r));

/** Cases (rangées, colonnes) couvrant la zone à peindre, avec une marge. */
export function cellRange(B) {
  return {
    r0: Math.floor((B.y0 - LEVEL_Y) / TILE) - 2,
    r1: Math.ceil((B.y1 - LEVEL_Y) / TILE) + 2,
    c0: Math.floor(B.x0 / TILE) - 1,
    c1: Math.ceil(B.x1 / TILE) + 1,
  };
}

/** Zone par défaut : la scène seule (vignettes, tests). */
const SCENE = { x0: 0, y0: 0, x1: VIEW_W, y1: VIEW_H, w: VIEW_W, h: VIEW_H };

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

// --- Chapitres 2 à 4 -----------------------------------------------------
Object.assign(THEMES, {
  /** La gare d'altitude, dehors : montagnes, sapins, neige qui tombe. */
  neige: {
    ambient: '#5e6cab', fog: { color: '#c4d2f0', alpha: 0.14 }, tiles: 'snowstone', wet: false,
    weather: 'snow', backdrop: paintMountains,
  },
  /** Le chalet : bois de sapin, poêle, fenêtres givrées. */
  chalet: {
    ambient: '#4a4880', fog: null, tiles: 'wood', wet: false, weather: null, backdrop: paintChalet,
  },
  /** La ville, sur les toits : pluie, enseignes, ligne des immeubles. */
  ville: {
    ambient: '#565290', fog: { color: '#9a7aa8', alpha: 0.1 }, tiles: 'roof', wet: true,
    weather: 'rain', backdrop: paintCity,
  },
  /** La rue : façades, vitrines, pavés mouillés. */
  rue: {
    ambient: '#4c4a86', fog: { color: '#8fa6d8', alpha: 0.1 }, tiles: 'pavement', wet: true,
    weather: 'rain', backdrop: paintStreet,
  },
  /** Le musée : tentures rouges, marbre, dorures. */
  musee: {
    ambient: '#4e4a86', fog: null, tiles: 'marble', wet: true, weather: null, backdrop: paintMuseum,
  },
  /** La réserve du musée : béton, rayonnages, caisses. */
  reserve: {
    ambient: '#3c4070', fog: null, tiles: 'concrete', wet: false, weather: null, backdrop: paintStorage,
  },
  /** La halle des locomotives : verrière de fer, la nuit au-dessus. */
  halle: {
    ambient: '#55609c', fog: { color: '#c4d2f0', alpha: 0.08 }, tiles: 'stone', wet: true,
    weather: null, backdrop: paintHall,
  },
});

Object.assign(THEMES, {
  /** Dans le train : boiseries, banquettes, la nuit qui défile aux fenêtres. */
  wagon: {
    ambient: '#4c4880', fog: null, tiles: 'wood', wet: false, weather: null, motion: 'windows',
    backdrop: paintWagon,
  },
  /** Sur le toit du train : le vent, la nuit qui file. */
  toit: {
    ambient: '#56619f', fog: { color: '#8fa6d8', alpha: 0.1 }, tiles: 'roof', wet: false,
    weather: 'wind', motion: 'sky', backdrop: paintTrainRoof,
  },
  /** La côte : la mer, la lune, les rochers. */
  mer: {
    ambient: '#5a66a6', fog: { color: '#c4d2f0', alpha: 0.12 }, tiles: 'rock', wet: true,
    weather: null, backdrop: paintSea,
  },
  /** Le terminus au bord de la mer : verrière, grandes baies. */
  terminus: {
    ambient: '#55609c', fog: null, tiles: 'stone', wet: true, weather: null, backdrop: paintTerminus,
  },
});

// --- Chapitres 7 à 9 --------------------------------------------------------
Object.assign(THEMES, {
  /** La fête foraine, sur la jetée : planches, guirlandes, la mer derrière. */
  foire: {
    ambient: '#544c90', fog: { color: '#ff9a8a', alpha: 0.06 }, tiles: 'wood', wet: false,
    weather: null, backdrop: paintFair,
  },
  /** Le palais des glaces : velours sombre, grands miroirs, dorures. */
  glaces: {
    ambient: '#4a4688', fog: null, tiles: 'marble', wet: true, weather: null, backdrop: paintMirrorHall,
  },
  /** La colline de l'observatoire : la Voie lactée, la roche, l'herbe rase. */
  colline: {
    ambient: '#4e5a9c', fog: { color: '#8fa6d8', alpha: 0.08 }, tiles: 'rock', wet: false,
    weather: null, backdrop: paintHill,
  },
  /** Sous la coupole : tôles rivetées, laiton, la fente ouverte sur les étoiles. */
  coupole: {
    ambient: '#40487e', fog: null, tiles: 'metal', wet: false, weather: null, backdrop: paintDome,
  },
  /** La première gare, à l'aube : le quai sous un ciel rose. */
  aube: {
    ambient: '#9a86ac', fog: { color: '#ffc8a8', alpha: 0.16 }, tiles: 'stone', wet: true,
    weather: null, backdrop: paintDawn, dawn: true,
  },
  /** Le hall au petit matin : le soleil entre par les vitres. */
  matin: {
    ambient: '#8c7a94', fog: null, tiles: 'brick', wet: true, backdrop: paintInterior,
    wall: '#a08468', wallDark: '#8a6f58', pilasters: true, dawn: true,
  },
});

export function themeOf(level) {
  return THEMES[level.theme] ?? THEMES.hall;
}

// --- Fonds ----------------------------------------------------------------

/** Ciel nocturne, étoiles, lune, collines et lumières de la ville. */
function paintSky(level, A, Em, lights, theme, B = SCENE) {
  const r = rng(7);
  // Repères dessinés pour une scène de 224 × 336, adaptés à la scène actuelle.
  const KY = VIEW_H / 336, KX = VIEW_W / 224;
  const Y = (v) => Math.round(v * KY), X = (v) => Math.round(v * KX);
  // Ciel en bandes tramées (pas de dégradé lisse : c'est la lumière qui l'est).
  const bands = [
    [0, C.night3],
    [Y(70), C.night4],
    [Y(140), C.night5],
    [Y(200), '#5a6aa8'],
  ];
  for (let i = 0; i < bands.length; i++) {
    const y0 = i === 0 ? B.y0 : bands[i][0];
    const col = bands[i][1];
    const y1 = i + 1 < bands.length ? bands[i + 1][0] : B.y1;
    rect(A, B.x0, y0, B.w, y1 - y0, col);
    if (i > 0) {
      checker(A, B.x0, y0, B.w, 4, bands[i - 1][1], B.x0 & 1);
      sparse(A, B.x0, y0 + 4, B.w, 6, bands[i - 1][1]);
    }
  }
  // Voiles de nuages.
  for (const [cx, cy, w] of [[X(40), Y(52), 70], [X(150), Y(30), 90], [X(110), Y(96), 60], [X(200), Y(120), 50]]) {
    sparse(A, cx - w / 2, cy, w, 3, C.night5, 1);
    checker(A, cx - w / 3, cy + 1, (w * 2) / 3, 2, C.night5);
    rect(A, cx - w / 5, cy + 1, w / 2.5, 1, '#5a6aa8');
  }
  // Étoiles (émissives : elles ne dépendent pas de l'éclairage).
  const nStars = Math.round((60 * B.w * (Y(180) - B.y0)) / (224 * 180));
  for (let i = 0; i < nStars; i++) {
    const x = Math.floor(B.x0 + r() * B.w);
    const y = Math.floor(B.y0 + r() * (Y(180) - B.y0));
    const b = r();
    px(Em, x, y, b > 0.8 ? C.moon2 : b > 0.4 ? C.moon1 : C.moon0);
    if (b > 0.94) {
      px(Em, x - 1, y, C.moon0); px(Em, x + 1, y, C.moon0);
      px(Em, x, y - 1, C.moon0); px(Em, x, y + 1, C.moon0);
    }
  }
  // Lune.
  const mx = X(178), my = Y(46);
  for (let y = -8; y <= 8; y++) {
    for (let x = -8; x <= 8; x++) {
      const d = x * x + y * y;
      if (d <= 64) px(Em, mx + x, my + y, d > 49 ? C.moon1 : C.moon2);
    }
  }
  for (const [x, y, s] of [[-3, -2, 2], [2, 3, 3], [3, -4, 1], [-4, 4, 1]]) rect(Em, mx + x, my + y, s, s, C.moon1);
  lights.push({ x: mx, y: my, r: 120, color: C.moon1, intensity: 0.28, flicker: 0, halo: 0.5 });

  // Collines lointaines et ville.
  const hillTop = (x) => Y(214) + Math.round(6 * Math.sin(x / 23) + 4 * Math.sin(x / 9 + 1));
  for (let x = B.x0; x < B.x1; x++) rect(A, x, hillTop(x), 1, B.y1 - hillTop(x), C.night2);
  for (let x = B.x0; x < B.x1; x += 1) if ((((x * 7) % 5) + 5) % 5 === 0) px(A, x, hillTop(x) - 1, C.night3);
  let x = B.x0 + 4;
  while (x < B.x1) {
    const w = 6 + Math.floor(r() * 10);
    const h = 6 + Math.floor(r() * 16);
    const base = Y(236);
    rect(A, x, base - h, w, h + 40, C.night1);
    for (let wy = base - h + 2; wy < base - 1; wy += 3) {
      for (let wx = x + 1; wx < x + w - 1; wx += 2) {
        if (r() < 0.22) px(Em, wx, wy, r() < 0.5 ? C.lamp0 : C.lamp1);
      }
    }
    x += w + 1 + Math.floor(r() * 6);
  }
  // Pylône et caténaire au loin.
  for (let y = Y(196); y < Y(236); y++) px(A, X(30), y, C.night1);
  rect(A, X(30) - 4, Y(198), 9, 1, C.night1);
  for (let x2 = B.x0; x2 < B.x1; x2++) px(A, x2, Y(199) + Math.round(3 * Math.cos((x2 - X(30)) / 60)), C.night2);
}

/** Intérieur : enduit ocre, pilastres de briques, lambris et corniches. */
function paintInterior(level, A, Em, lights, theme, B = SCENE) {
  const wall = theme.wall;
  const wallDark = theme.wallDark;
  const X0 = B.x0 - (((B.x0 % 8) + 8) % 8), Y0 = B.y0 - (((B.y0 % 8) + 8) % 8);
  rect(A, B.x0, B.y0, B.w, B.h, wall);
  // Grain de l'enduit, ou rayures d'un papier peint.
  if (theme.stripes) {
    for (let x = X0; x < B.x1; x += 8) {
      rect(A, x, B.y0, 3, B.h, wallDark);
      for (let y = Y0 + ((x >> 3) & 1 ? 4 : 0); y < B.y1; y += 8) px(A, x + 5, y, wallDark);
    }
  } else {
    sparse(A, X0, Y0, B.x1 - X0, B.y1 - Y0, wallDark);
  }
  // Pilastres de briques toutes les quatre cases.
  for (let cx = 32 + 64 * Math.floor((B.x0 - 32) / 64); theme.pilasters && cx < B.x1; cx += 64) {
    for (let y = Y0; y < B.y1; y += 4) {
      rect(A, cx, y, 12, 3, C.brick3);
      rect(A, cx, y + 3, 12, 1, C.brick1);
      px(A, cx + ((y >> 2) & 1 ? 3 : 8), y, C.brick1);
    }
    rect(A, cx - 1, B.y0, 1, B.h, C.brick1);
    rect(A, cx + 12, B.y0, 1, B.h, C.brick1);
  }
  // Lambris au-dessus de chaque sol, corniche sous chaque plafond.
  const R = cellRange(B);
  for (let r = R.r0; r < R.r1; r++) {
    for (let c = R.c0; c < R.c1; c++) {
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
function paintTiled(level, A, Em, lights, theme, B = SCENE) {
  const tile = '#a9a28e';
  const grout = '#7d7768';
  const hi = '#c4bda6';
  rect(A, B.x0, B.y0, B.w, B.h, tile);
  const Y0 = B.y0 - (((B.y0 % 12) + 12) % 12), X0 = B.x0 - (((B.x0 % 12) + 12) % 12);
  for (let y = Y0; y < B.y1; y += 6) {
    rect(A, B.x0, y + 5, B.w, 1, grout);
    const off = (((y - Y0) / 6) & 1) ? 6 : 0;
    for (let x = X0 + off; x < B.x1; x += 12) {
      rect(A, x, y, 1, 5, grout);
      rect(A, x + 1, y, 10, 1, hi);
    }
  }
  // Bandeau de carreaux bruns à mi-hauteur de chaque pièce, et soubassement.
  const R = cellRange(B);
  for (let r = R.r0; r < R.r1; r++) {
    for (let c = R.c0; c < R.c1; c++) {
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
export function paintTiles(level, theme, A, B = SCENE) {
  const R = cellRange(B);
  for (let r = R.r0; r < R.r1; r++) {
    for (let c = R.c0; c < R.c1; c++) {
      const t = drawTileAt(level, c, r);
      const x = c * TILE, y = LEVEL_Y + r * TILE;
      if (t === T_SOLID) {
        const style = theme.tiles;
        if (style === 'stone' || style === 'pavement') paintStone(level, A, c, r, x, y, style === 'stone');
        else if (style === 'snowstone') { paintStone(level, A, c, r, x, y, false); paintSnowCap(level, A, c, r, x, y); }
        else if (style === 'concrete') paintConcrete(level, A, c, r, x, y);
        else if (style === 'ballast') paintBallast(level, A, c, r, x, y);
        else if (style === 'wood') paintWood(level, A, c, r, x, y);
        else if (style === 'roof') paintRoof(level, A, c, r, x, y);
        else if (style === 'marble') paintMarble(level, A, c, r, x, y);
        else if (style === 'rock') paintRock(level, A, c, r, x, y);
        else if (style === 'metal') paintMetal(level, A, c, r, x, y);
        else paintBrick(level, A, c, r, x, y);
      } else if (t === T_ONEWAY) {
        paintPlank(A, x, y);
      } else if (t === T_ICE) {
        paintIce(level, A, c, r, x, y);
      } else if (t === T_CONV_L || t === T_CONV_R) {
        paintConveyor(A, x, y);
      } else if (t === T_GHOST) {
        paintGhostFrame(level, A, c, r, x, y);
      } else if (t === T_MIRROR_A || t === T_MIRROR_B || t === T_RECEIVER) {
        paintInstrument(A, x, y);
      }
    }
  }
  // Ombre portée douce des murs sur le fond (occlusion ambiante, tramée).
  for (let r = R.r0; r < R.r1; r++) {
    for (let c = R.c0; c < R.c1; c++) {
      if (solidAt(level, c, r)) continue;
      const x = c * TILE, y = LEVEL_Y + r * TILE;
      const ao = 'rgba(5,6,15,0.35)';
      if (solidAt(level, c, r - 1)) { rect(A, x, y, TILE, 2, ao); rect(A, x, y + 2, TILE, 3, 'rgba(5,6,15,0.18)'); }
      if (solidAt(level, c - 1, r)) { rect(A, x, y, 2, TILE, ao); rect(A, x + 2, y, 3, TILE, 'rgba(5,6,15,0.18)'); }
      if (solidAt(level, c + 1, r)) { rect(A, x + TILE - 2, y, 2, TILE, ao); rect(A, x + TILE - 5, y, 3, TILE, 'rgba(5,6,15,0.18)'); }
    }
  }
}

function paintStone(level, A, c, r, x, y, safetyLine = true) {
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
    if (safetyLine) rect(A, x, y + 2, TILE, 1, C.paper2);
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

/** Neige posée sur le dessus des murs, et quelques glaçons dessous. */
function paintSnowCap(level, A, c, r, x, y) {
  if (!solidAt(level, c, r - 1)) {
    rect(A, x, y - 2, TILE, 4, C.moon1);
    rect(A, x, y - 2, TILE, 1, C.moon2);
    for (let k = 0; k < TILE; k += 5) px(A, x + k + (c % 3), y + 2, C.moon0);
  }
  if (!solidAt(level, c, r + 1)) {
    for (let k = 2; k < TILE; k += 5) rect(A, x + k, y + TILE, 1, 2 + ((c + k) % 3), C.moon0);
  }
}

function paintIce(level, A, c, r, x, y) {
  rect(A, x, y, TILE, TILE, '#7fa6d6');
  rect(A, x, y, TILE, 1, '#dcecff');
  for (let k = 0; k < 3; k++) rect(A, x + 2 + k * 5, y + 3 + k * 3, 3, 1, '#c4dcf8');
  rect(A, x + 9, y + 9, 4, 1, '#a8c6ee');
  if (!solidAt(level, c - 1, r)) rect(A, x, y, 1, TILE, '#4d6ea0');
  if (!solidAt(level, c + 1, r)) rect(A, x + TILE - 1, y, 1, TILE, '#4d6ea0');
  if (!solidAt(level, c, r + 1)) {
    rect(A, x, y + TILE - 1, TILE, 1, '#4d6ea0');
    for (let k = 1; k < TILE; k += 4) rect(A, x + k, y + TILE, 1, 2 + (k % 3), '#a8c6ee');
  }
}

function paintConveyor(A, x, y) {
  rect(A, x, y, TILE, TILE, C.iron1);
  rect(A, x, y, TILE, 4, C.iron0);
  // Rouleaux (les chevrons qui défilent sont animés par le rendu).
  for (let k = 3; k < TILE; k += 6) {
    rect(A, x + k - 2, y + 6, 4, 4, C.iron2);
    px(A, x + k - 1, y + 7, C.stone3);
  }
  rect(A, x, y + TILE - 2, TILE, 2, C.iron0);
}

/** Cadre doré d'un tableau (la toile, vivante, est dessinée par le rendu). */
function paintGhostFrame(level, A, c, r, x, y) {
  const g = (dc, dr) => drawTileAt(level, c + dc, r + dr) === T_GHOST;
  rect(A, x, y, TILE, TILE, '#2e2440');
  // La toile : un paysage de nuit, sombre.
  for (let k = 3; k < TILE - 3; k += 3) px(A, x + k, y + 9 + ((c * 3 + k) % 3), '#4a3a5a');
  if (!g(0, -1)) { rect(A, x, y, TILE, 3, C.brass); rect(A, x, y, TILE, 1, C.paper3); }
  if (!g(0, 1)) { rect(A, x, y + TILE - 3, TILE, 3, C.brass); rect(A, x, y + TILE - 1, TILE, 1, C.wood1); }
  if (!g(-1, 0)) { rect(A, x, y, 3, TILE, C.brass); rect(A, x, y, 1, TILE, C.paper3); }
  if (!g(1, 0)) { rect(A, x + TILE - 3, y, 3, TILE, C.brass); rect(A, x + TILE - 1, y, 1, TILE, C.wood1); }
}

function paintWood(level, A, c, r, x, y) {
  rect(A, x, y, TILE, TILE, C.wood2);
  for (let k = 0; k < TILE; k += 5) {
    rect(A, x, y + k + 4, TILE, 1, C.wood1);
    px(A, x + ((c * 7 + k) % 14) + 1, y + k + 2, C.wood1);
  }
  rect(A, x, y, TILE, 1, C.wood3);
  if (!solidAt(level, c, r - 1)) { rect(A, x, y, TILE, 3, C.wood3); rect(A, x, y, TILE, 1, C.wood4); }
  if (!solidAt(level, c - 1, r)) rect(A, x, y, 1, TILE, C.wood0);
  if (!solidAt(level, c + 1, r)) rect(A, x + TILE - 1, y, 1, TILE, C.wood0);
}

/** Toit de zinc : agrafes verticales, rebord clair. */
function paintRoof(level, A, c, r, x, y) {
  rect(A, x, y, TILE, TILE, '#4c5266');
  for (let k = 3; k < TILE; k += 6) rect(A, x + k, y, 1, TILE, '#3a3f52');
  for (let k = 5; k < TILE; k += 6) rect(A, x + k, y, 1, TILE, '#5e6580');
  if (!solidAt(level, c, r - 1)) { rect(A, x, y, TILE, 2, '#8a92ac'); rect(A, x, y + 2, TILE, 1, '#2e3244'); }
  if (!solidAt(level, c - 1, r)) rect(A, x, y, 1, TILE, '#2e3244');
  if (!solidAt(level, c + 1, r)) rect(A, x + TILE - 1, y, 1, TILE, '#2e3244');
}

/** Rocher de bord de mer : pierre sombre, arêtes claires, un peu d'algue. */
function paintRock(level, A, c, r, x, y) {
  rect(A, x, y, TILE, TILE, '#2e3446');
  for (let k = 0; k < 6; k++) px(A, x + ((c * 5 + k * 7) % TILE), y + ((r * 3 + k * 5) % TILE), '#3e465c');
  rect(A, x + ((c * 3) % 9), y + 7, 5, 1, '#232838');
  if (!solidAt(level, c, r - 1)) {
    rect(A, x, y, TILE, 2, '#5a6480');
    for (let k = 1; k < TILE; k += 5) px(A, x + k, y + 2, '#3a5a46');
  }
  if (!solidAt(level, c - 1, r)) rect(A, x, y, 1, TILE, '#1c2030');
  if (!solidAt(level, c + 1, r)) rect(A, x + TILE - 1, y, 1, TILE, '#1c2030');
}

/** Tôles rivetées de l'observatoire, filet de laiton sur le dessus. */
function paintMetal(level, A, c, r, x, y) {
  rect(A, x, y, TILE, TILE, '#3a4258');
  rect(A, x, y + TILE - 1, TILE, 1, '#2a3044');
  rect(A, x + (((r & 1) ? 8 : 0)), y, 1, TILE, '#2a3044');
  for (const [dx, dy] of [[3, 3], [12, 3], [3, 12], [12, 12]]) px(A, x + dx, y + dy, '#5a6480');
  if (!solidAt(level, c, r - 1)) {
    rect(A, x, y, TILE, 3, '#56607c');
    rect(A, x, y, TILE, 1, C.brass);
    rect(A, x, y + 3, TILE, 1, '#2a3044');
  }
  if (!solidAt(level, c - 1, r)) rect(A, x, y, 1, TILE, '#242a3c');
  if (!solidAt(level, c + 1, r)) rect(A, x + TILE - 1, y, 1, TILE, '#242a3c');
}

/** Boîtier d'un instrument d'optique (miroir, récepteur) : fonte et laiton. */
function paintInstrument(A, x, y) {
  rect(A, x, y, TILE, TILE, C.iron1);
  rect(A, x, y, TILE, 1, C.brass);
  rect(A, x, y + TILE - 1, TILE, 1, C.iron0);
  rect(A, x, y, 1, TILE, C.iron2);
  rect(A, x + TILE - 1, y, 1, TILE, C.iron0);
  rect(A, x + 2, y + 2, TILE - 4, TILE - 4, C.iron0);
  for (const [dx, dy] of [[1, 1], [14, 1], [1, 14], [14, 14]]) px(A, x + dx, y + dy, C.brass);
}

function paintMarble(level, A, c, r, x, y) {
  rect(A, x, y, TILE, TILE, '#9c948a');
  for (let k = 0; k < TILE; k++) px(A, x + k, y + Math.round(6 + 4 * Math.sin((c * TILE + k) / 5 + r)), '#857d74');
  rect(A, x, y + TILE - 1, TILE, 1, '#7a736b');
  if (!solidAt(level, c, r - 1)) { rect(A, x, y, TILE, 3, '#c4bcb0'); rect(A, x, y + 3, TILE, 1, C.brass); }
  if (!solidAt(level, c - 1, r)) rect(A, x, y, 1, TILE, '#6e675f');
  if (!solidAt(level, c + 1, r)) rect(A, x + TILE - 1, y, 1, TILE, '#6e675f');
}

function paintPlank(A, x, y) {
  rect(A, x, y, TILE, 4, C.wood3);
  rect(A, x, y, TILE, 1, C.wood4);
  rect(A, x, y + 3, TILE, 1, C.wood1);
  px(A, x + 3, y + 4, C.wood1);
  px(A, x + 12, y + 4, C.wood1);
}
