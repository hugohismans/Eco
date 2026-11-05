// Lecture d'un niveau décrit en JSON.
//
// Format :
// {
//   "id": "hall",                 identifiant unique (sauvegarde, URL)
//   "name": "Le hall",            nom affiché
//   "theme": "hall",              ambiance visuelle (quai, hall, guichets…)
//   "narration": "…",             la phrase affichée au début du niveau
//   "duration": 10,               durée d'une tentative en secondes (null = sans chrono)
//   "grid": ["##############", …] GRID_H lignes de GRID_W caractères
//   "doors": { "1": { "buttons": ["a", "b"], "mode": "and" } },
//   "lasers": [ { "col": 0, "row": 15, "buttons": ["c"], "mode": "or", "invert": true } ],
//   "platforms": [ { "col": 10, "row": 16, "cols": 1, "to": { "col": 10, "row": 12 },
//                    "buttons": ["b"], "mode": "or", "behavior": "loop", "speed": 12 } ],
//   "stay": { "col": 6, "row": 15, "cols": 2 },    zone où l'on peut « rester » (fin)
//   "endings": { "exit": "…", "stay": "…" },       phrases de fin (dernier niveau)
//   "exitStyle": "door" | "train",
//   "abilities": ["walljump", "grab", "dash"],     capacités disponibles
//   "teach": "dash",                                capacité présentée ici (carte)
//   "decor": [ { "type": "bench", "col": 3, "row": 14 } ]   (purement visuel)
// }
//
// Légende de la grille :
//   #  mur / sol            =  plateforme fine (traversable par-dessous)
//   .  vide                 P  départ du personnage
//   E  sortie (une ou plusieurs cases contiguës)
//   a…i  bouton pressoir (posé au bas de sa case)
//   1…9  porte (les cases d'un même chiffre forment un rectangle)
//   B  valise    K  caisse  (blocs poussables, posés au bas de leur case)
//   > < v ^  émetteur de faisceau (case pleine), tirant dans ce sens
//
// Une porte est ouverte, un faisceau est allumé, une plateforme est « active »
// quand ses boutons le sont : tous (and) ou au moins un (or) ; « invert »
// renverse la condition. Un faisceau sans boutons est toujours allumé.
//
// Le résultat est une structure immuable, en sous-pixels, que le monde lit.

import {
  GRID_W, GRID_H, TILE, TILE_SUB, SUB, TPS,
  T_EMPTY, T_SOLID, T_ONEWAY, ACTOR_W, ACTOR_H,
  BLOCK_TYPES, PLATFORM_H, PLATFORM_SPEED, ABILITIES,
} from './constants.js';

/** Hauteur visible d'un bouton relevé (px) : sert aussi de capteur. */
const BUTTON_SENSOR_H = 4;

const LASER_DIRS = { '>': [1, 0], '<': [-1, 0], v: [0, 1], '^': [0, -1] };

/**
 * Transforme la description JSON en niveau prêt à simuler.
 * Lève une erreur explicite si la description est incohérente.
 */
export function parseLevel(def) {
  const where = `Niveau « ${def.id ?? '?'} »`;
  const grid = def.grid;
  if (!Array.isArray(grid) || grid.length !== GRID_H) {
    throw new Error(`${where} : la grille doit compter ${GRID_H} lignes.`);
  }
  grid.forEach((row, r) => {
    if (row.length !== GRID_W) {
      throw new Error(`${where} : la ligne ${r} doit compter ${GRID_W} caractères (elle en a ${row.length}).`);
    }
  });

  const tiles = new Uint8Array(GRID_W * GRID_H);
  let spawn = null;
  const exitCells = [];
  const buttons = [];
  const doorCells = new Map(); // chiffre -> liste de cases
  const blocks = [];
  const emitters = [];

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const ch = grid[r][c];
      let t = T_EMPTY;
      if (ch === '#') t = T_SOLID;
      else if (ch === '=') t = T_ONEWAY;
      else if (ch === '.' || ch === ' ') t = T_EMPTY;
      else if (ch === 'P') {
        if (spawn) throw new Error(`${where} : un seul départ « P » est permis.`);
        spawn = { col: c, row: r };
      } else if (ch === 'E') exitCells.push({ col: c, row: r });
      else if (ch >= 'a' && ch <= 'i') {
        if (buttons.some((b) => b.id === ch)) {
          throw new Error(`${where} : le bouton « ${ch} » apparaît deux fois.`);
        }
        buttons.push(makeButton(ch, c, r));
      } else if (ch >= '1' && ch <= '9') {
        if (!doorCells.has(ch)) doorCells.set(ch, []);
        doorCells.get(ch).push({ col: c, row: r });
      } else if (BLOCK_TYPES[ch]) {
        const bt = BLOCK_TYPES[ch];
        blocks.push({
          type: bt.type,
          w: bt.w,
          h: bt.h,
          x: c * TILE_SUB + ((TILE_SUB - bt.w) >> 1),
          y: (r + 1) * TILE_SUB - bt.h,
        });
      } else if (LASER_DIRS[ch]) {
        t = T_SOLID;
        emitters.push({ col: c, row: r, dir: LASER_DIRS[ch] });
      } else {
        throw new Error(`${where} : caractère inconnu « ${ch} » (ligne ${r}, colonne ${c}).`);
      }
      tiles[r * GRID_W + c] = t;
    }
  }

  if (!spawn) throw new Error(`${where} : il manque le départ « P ».`);
  if (exitCells.length === 0) throw new Error(`${where} : il manque la sortie « E ».`);

  const buttonIds = new Set(buttons.map((b) => b.id));
  /** Vérifie une liaison {buttons, mode, invert} et la normalise. */
  const link = (l, label, required) => {
    if (!l || !Array.isArray(l.buttons) || l.buttons.length === 0) {
      if (required) throw new Error(`${where} : ${label} n'est reliée à aucun bouton.`);
      return null;
    }
    for (const b of l.buttons) {
      if (!buttonIds.has(b)) throw new Error(`${where} : ${label} cite un bouton « ${b} » absent de la grille.`);
    }
    const mode = (l.mode ?? 'and').toLowerCase();
    if (mode !== 'and' && mode !== 'or') {
      throw new Error(`${where} : mode « ${l.mode} » inconnu pour ${label} (and / or).`);
    }
    return { buttons: [...l.buttons], mode, invert: !!l.invert };
  };

  // Portes.
  const doorLinks = def.doors ?? {};
  const doors = [];
  for (const [id, cells] of doorCells) {
    const rect = cellsToRect(cells, `${where}, porte ${id}`);
    doors.push({ id, ...rect, ...link(doorLinks[id], `la porte ${id}`, true) });
  }
  for (const id of Object.keys(doorLinks)) {
    if (!doorCells.has(id)) throw new Error(`${where} : la porte ${id} est décrite mais absente de la grille.`);
  }

  // Faisceaux : origine au bord de la case émettrice, sur son axe.
  const laserLinks = def.lasers ?? [];
  const lasers = emitters.map((e, i) => {
    const cfg = laserLinks.find((l) => l.col === e.col && l.row === e.row);
    const [dx, dy] = e.dir;
    const cx = e.col * TILE_SUB + (TILE_SUB >> 1);
    const cy = e.row * TILE_SUB + (TILE_SUB >> 1);
    return {
      id: `L${i}`,
      col: e.col,
      row: e.row,
      dx,
      dy,
      ox: cx + dx * (TILE_SUB >> 1),
      oy: cy + dy * (TILE_SUB >> 1),
      link: cfg ? link(cfg, `le faisceau (${e.col}, ${e.row})`, true) : null,
    };
  });
  for (const l of laserLinks) {
    if (!emitters.some((e) => e.col === l.col && e.row === l.row)) {
      throw new Error(`${where} : aucun émetteur de faisceau en (${l.col}, ${l.row}).`);
    }
  }

  // Plateformes mobiles.
  const platforms = (def.platforms ?? []).map((p, i) => {
    const label = `la plateforme ${i + 1}`;
    if (!p.to) throw new Error(`${where} : ${label} n'a pas de destination « to ».`);
    if (p.to.col !== p.col && p.to.row !== p.row) {
      throw new Error(`${where} : ${label} doit se déplacer en ligne droite (même colonne ou même rangée).`);
    }
    const behavior = p.behavior ?? 'hold';
    if (behavior !== 'hold' && behavior !== 'loop') {
      throw new Error(`${where} : ${label} : comportement « ${behavior} » inconnu (hold / loop).`);
    }
    return {
      id: `M${i}`,
      x0: p.col * TILE_SUB,
      y0: p.row * TILE_SUB,
      x1: p.to.col * TILE_SUB,
      y1: p.to.row * TILE_SUB,
      w: (p.cols ?? 1) * TILE_SUB,
      h: PLATFORM_H,
      speed: p.speed ?? PLATFORM_SPEED,
      behavior,
      ...link(p, label, true),
    };
  });

  // Zone « rester » (dernier niveau).
  const stay = def.stay
    ? {
      x: def.stay.col * TILE_SUB,
      y: def.stay.row * TILE_SUB,
      w: (def.stay.cols ?? 1) * TILE_SUB,
      h: (def.stay.rows ?? 1) * TILE_SUB,
    }
    : null;

  const abilities = def.abilities ?? [];
  for (const ab of abilities) {
    if (!ABILITIES.includes(ab)) throw new Error(`${where} : capacité « ${ab} » inconnue (${ABILITIES.join(', ')}).`);
  }
  if (def.teach && !abilities.includes(def.teach)) {
    throw new Error(`${where} : « teach » (${def.teach}) doit faire partie des capacités du niveau.`);
  }

  // Le personnage apparaît centré dans sa case, les pieds au bas de la case.
  const spawnPos = {
    x: spawn.col * TILE_SUB + ((TILE * SUB - ACTOR_W) >> 1),
    y: (spawn.row + 1) * TILE_SUB - ACTOR_H,
  };

  return Object.freeze({
    id: def.id,
    name: def.name ?? def.id,
    theme: def.theme ?? 'hall',
    narration: def.narration ?? '',
    /** Durée d'une tentative en ticks, ou null pour « sans chrono ». */
    duration: def.duration == null ? null : Math.round(def.duration * TPS),
    width: GRID_W,
    height: GRID_H,
    tiles,
    spawn: spawnPos,
    exit: cellsToRect(exitCells, `${where}, sortie`),
    exitStyle: def.exitStyle ?? 'door',
    buttons,
    doors,
    blocks,
    lasers,
    platforms,
    stay,
    endings: def.endings ?? null,
    abilities: Object.freeze([...abilities]),
    teach: def.teach ?? null,
    decor: def.decor ?? [],
  });
}

function makeButton(id, col, row) {
  // Capteur : une bande basse de la case, légèrement rentrée sur les côtés.
  return {
    id,
    col,
    row,
    x: col * TILE_SUB + 2 * SUB,
    y: (row + 1) * TILE_SUB - BUTTON_SENSOR_H * SUB,
    w: (TILE - 4) * SUB,
    h: BUTTON_SENSOR_H * SUB,
  };
}

/** Rectangle englobant d'un groupe de cases ; vérifie qu'il est plein. */
function cellsToRect(cells, label) {
  let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (const { col, row } of cells) {
    c0 = Math.min(c0, col); c1 = Math.max(c1, col);
    r0 = Math.min(r0, row); r1 = Math.max(r1, row);
  }
  if ((c1 - c0 + 1) * (r1 - r0 + 1) !== cells.length) {
    throw new Error(`${label} : les cases doivent former un rectangle plein.`);
  }
  return {
    col: c0, row: r0, cols: c1 - c0 + 1, rows: r1 - r0 + 1,
    x: c0 * TILE_SUB, y: r0 * TILE_SUB,
    w: (c1 - c0 + 1) * TILE_SUB, h: (r1 - r0 + 1) * TILE_SUB,
  };
}
