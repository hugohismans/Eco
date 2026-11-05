// Lecture d'un niveau décrit en JSON.
//
// Format :
// {
//   "id": "hall",                 identifiant unique (sauvegarde, URL)
//   "name": "Le hall",            nom affiché
//   "narration": "…",             la phrase affichée au début du niveau
//   "duration": 10,               durée d'une tentative en secondes (null = sans chrono)
//   "grid": ["##############", …] GRID_H lignes de GRID_W caractères
//   "theme": "hall",              ambiance visuelle (quai, hall…)
//   "doors": { "1": { "buttons": ["a", "b"], "mode": "and" } },
//   "decor": [ { "type": "bench", "col": 3, "row": 14 } ]   (purement visuel)
// }
//
// Légende de la grille :
//   #  mur / sol            =  plateforme fine (traversable par-dessous)
//   .  vide                 P  départ du personnage
//   E  sortie (une ou plusieurs cases contiguës)
//   a…i  bouton pressoir (posé au bas de sa case)
//   1…9  porte (les cases d'un même chiffre forment un rectangle)
//
// Le résultat est une structure immuable, en sous-pixels, que le monde lit.

import {
  GRID_W, GRID_H, TILE, TILE_SUB, SUB, TPS,
  T_EMPTY, T_SOLID, T_ONEWAY, ACTOR_W, ACTOR_H,
} from './constants.js';

/** Hauteur visible d'un bouton relevé (px) : sert aussi de capteur. */
const BUTTON_SENSOR_H = 4;

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
      } else {
        throw new Error(`${where} : caractère inconnu « ${ch} » (ligne ${r}, colonne ${c}).`);
      }
      tiles[r * GRID_W + c] = t;
    }
  }

  if (!spawn) throw new Error(`${where} : il manque le départ « P ».`);
  if (exitCells.length === 0) throw new Error(`${where} : il manque la sortie « E ».`);

  const links = def.doors ?? {};
  const doors = [];
  for (const [id, cells] of doorCells) {
    const rect = cellsToRect(cells, `${where}, porte ${id}`);
    const link = links[id];
    if (!link || !Array.isArray(link.buttons) || link.buttons.length === 0) {
      throw new Error(`${where} : la porte ${id} n'est reliée à aucun bouton (clé « doors »).`);
    }
    for (const b of link.buttons) {
      if (!buttons.some((x) => x.id === b)) {
        throw new Error(`${where} : la porte ${id} cite un bouton « ${b} » absent de la grille.`);
      }
    }
    const mode = (link.mode ?? 'and').toLowerCase();
    if (mode !== 'and' && mode !== 'or') {
      throw new Error(`${where} : mode « ${link.mode} » inconnu pour la porte ${id} (and / or).`);
    }
    doors.push({ id, ...rect, buttons: [...link.buttons], mode, invert: !!link.invert });
  }
  for (const id of Object.keys(links)) {
    if (!doorCells.has(id)) throw new Error(`${where} : la porte ${id} est décrite mais absente de la grille.`);
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
    buttons,
    doors,
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
