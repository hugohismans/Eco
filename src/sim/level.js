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
//   "buttons": { "a": { "weight": 2, "hold": 90 } },  plaque lourde (n corps), minuterie (ticks)
//   "winds": [ { "col", "row", "cols", "rows", "dx": 12, "cycle": [on, off], "phase" } ],
//   "water": { "row": 12, "amp": 3, "period": 600, "phase": 0 },  marée (rangées, ticks)
//   "maxEchoes": 2,                                   moins d'échos autorisés
// Faisceau "erase": true : la lampe du contrôleur, qui efface les échos qu'elle touche.
//   "echo": { "mirror": true },                       les échos sont des reflets (gauche et droite inversées)
//   "mirrors": [ { "col", "row", "buttons": ["j"] } ], miroir pivotant : il bascule quand son lien est actif
//   "receivers": { "s": { "hold": 60 } },             récepteur à rémanence (ticks)
// Faisceau "bridge": true : pont de lumière ; ses portions horizontales portent comme
//   une plateforme fine (au ras du haut de leur rangée). Un corps dans le faisceau le coupe.
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
//   j…r  levier (bascule : on l'actionne avec Bas / interaction)
//   ~  glace (glissante, on ne s'y agrippe pas)
//   { }  tapis roulant vers la gauche / la droite
//   %  échafaudage fragile (cède peu après qu'on s'y est posé)
//   S  ressort (renvoie en l'air)
//   !  tableau : les échos le traversent, pas le joueur ni les valises
//   ?  vitrine : le joueur et les valises la traversent, pas les échos
//   Q  départ des échos (s'il diffère du nôtre)
//   )  tourniquet : on ne le franchit que vers la droite     (  seulement vers la gauche
//   /  \  miroirs (pleins) : ils renvoient les faisceaux à angle droit
//   s t u w x y z  récepteur (plein) : actif tant qu'un faisceau l'atteint
//   M  malle : un bloc poussable qui reste où il est d'une tentative à l'autre
//   R  relais : si l'on « rejoue » debout dessus, la tentative suivante part de là
//
// Une porte est ouverte, un faisceau est allumé, une plateforme est « active »
// quand ses boutons le sont : tous (and), au moins un (or), ou un nombre
// impair (xor) ; « invert » renverse la condition. « buttons » peut citer des
// boutons, des leviers ou des capteurs (faisceaux « sensor »).
// Faisceaux, options : "cycle": [ticks allumé, ticks éteint], "phase": décalage ;
// "sensor": "id" (barrière lumineuse non mortelle, active quand on la coupe),
// "latch": true (une fois coupée, elle reste active : une alarme).
//
// Le résultat est une structure immuable, en sous-pixels, que le monde lit.

import {
  GRID_W, GRID_H, TILE, TILE_SUB, SUB, TPS,
  T_EMPTY, T_SOLID, T_ONEWAY, ACTOR_W, ACTOR_H,
  BLOCK_TYPES, PLATFORM_H, PLATFORM_SPEED, ABILITIES,
  T_ICE, T_CONV_L, T_CONV_R, T_GHOST, T_GLASS, SPRING_H,
  T_GATE_R, T_GATE_L, T_MIRROR_A, T_MIRROR_B, T_RECEIVER,
} from './constants.js';

const TILE_CHARS = {
  '#': T_SOLID, '=': T_ONEWAY, '~': T_ICE, '{': T_CONV_L, '}': T_CONV_R, '!': T_GHOST, '?': T_GLASS,
  ')': T_GATE_R, '(': T_GATE_L, '/': T_MIRROR_A, '\\': T_MIRROR_B,
};
/** Récepteurs : lettres libres de la fin de l'alphabet (« v » est un émetteur). */
const RECEIVER_CHARS = 'stuwxyz';

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
  const levers = [];
  const crumbles = [];
  const springs = [];
  const receivers = [];
  const relays = [];
  let echoSpawn = null;

  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const ch = grid[r][c];
      let t = T_EMPTY;
      if (TILE_CHARS[ch] !== undefined) t = TILE_CHARS[ch];
      else if (ch === '.' || ch === ' ') t = T_EMPTY;
      else if (ch >= 'j' && ch <= 'r') {
        if (levers.some((l) => l.id === ch)) throw new Error(`${where} : le levier « ${ch} » apparaît deux fois.`);
        levers.push({ id: ch, col: c, row: r, x: c * TILE_SUB, y: r * TILE_SUB, w: TILE_SUB, h: TILE_SUB });
      } else if (ch === '%') {
        // Les cases voisines sur une même rangée forment une seule passerelle.
        const prev = crumbles[crumbles.length - 1];
        if (prev && prev.row === r && prev.col + prev.cols === c) {
          prev.cols++;
          prev.w += TILE_SUB;
        } else {
          crumbles.push({ col: c, row: r, cols: 1, x: c * TILE_SUB, y: r * TILE_SUB, w: TILE_SUB, h: TILE_SUB });
        }
      } else if (ch === 'S') {
        springs.push({ col: c, row: r, x: c * TILE_SUB, y: (r + 1) * TILE_SUB - SPRING_H, w: TILE_SUB, h: SPRING_H });
      }
      else if (RECEIVER_CHARS.includes(ch)) {
        if (receivers.some((x) => x.id === ch)) throw new Error(`${where} : le récepteur « ${ch} » apparaît deux fois.`);
        t = T_RECEIVER;
        receivers.push({ id: ch, col: c, row: r, x: c * TILE_SUB, y: r * TILE_SUB, w: TILE_SUB, h: TILE_SUB, hold: 0 });
      } else if (ch === 'Q') {
        if (echoSpawn) throw new Error(`${where} : un seul départ des échos « Q » est permis.`);
        echoSpawn = { col: c, row: r };
      } else if (ch === 'R') {
        relays.push({ ...makeButton(`R${relays.length}`, c, r), spawn: spawnAt(c, r) });
      }
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
          persist: !!bt.persist,
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

  // Capteurs : des faisceaux « sensor », avec un identifiant utilisable comme un bouton.
  const sensorIds = (def.lasers ?? []).filter((l) => l.sensor).map((l) => String(l.sensor));
  const buttonIds = new Set([
    ...buttons.map((b) => b.id), ...levers.map((l) => l.id), ...sensorIds, ...receivers.map((x) => x.id),
  ]);
  if (buttonIds.size !== buttons.length + levers.length + sensorIds.length + receivers.length) {
    throw new Error(`${where} : un identifiant de bouton, de levier ou de capteur est utilisé deux fois.`);
  }
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
    if (mode !== 'and' && mode !== 'or' && mode !== 'xor') {
      throw new Error(`${where} : mode « ${l.mode} » inconnu pour ${label} (and / or / xor).`);
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
      link: cfg?.buttons ? link(cfg, `le faisceau (${e.col}, ${e.row})`, true) : null,
      cycle: cfg?.cycle ? [cfg.cycle[0] | 0, cfg.cycle[1] | 0] : null,
      phase: cfg?.phase | 0,
      sensor: cfg?.sensor ? String(cfg.sensor) : null,
      latch: !!cfg?.latch,
      erase: !!cfg?.erase,
      bridge: !!cfg?.bridge,
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

  // Boutons particuliers : plaques lourdes et minuteries.
  for (const [id, cfg] of Object.entries(def.buttons ?? {})) {
    const b = buttons.find((x) => x.id === id);
    if (!b) throw new Error(`${where} : « buttons » cite un bouton « ${id} » absent de la grille.`);
    b.weight = Math.max(1, cfg.weight | 0 || 1);
    b.hold = Math.max(0, cfg.hold | 0);
  }
  for (const b of buttons) { b.weight ??= 1; b.hold ??= 0; }

  // Récepteurs à rémanence.
  for (const [id, cfg] of Object.entries(def.receivers ?? {})) {
    const rc = receivers.find((x) => x.id === id);
    if (!rc) throw new Error(`${where} : « receivers » cite un récepteur « ${id} » absent de la grille.`);
    rc.hold = Math.max(0, cfg.hold | 0);
  }

  // Miroirs pivotants : ils basculent d'une diagonale à l'autre quand leur lien est actif.
  const mirrors = (def.mirrors ?? []).map((m) => {
    const t = tiles[m.row * GRID_W + m.col];
    if (t !== T_MIRROR_A && t !== T_MIRROR_B) throw new Error(`${where} : aucun miroir en (${m.col}, ${m.row}).`);
    return { col: m.col, row: m.row, ...link(m, `le miroir (${m.col}, ${m.row})`, true) };
  });

  // Courants d'air (vent) : zones qui poussent horizontalement.
  const winds = (def.winds ?? []).map((wd, i) => {
    if (!wd.dx) throw new Error(`${where} : le vent ${i + 1} n'a pas de force « dx ».`);
    return {
      x: wd.col * TILE_SUB, y: wd.row * TILE_SUB,
      w: (wd.cols ?? 1) * TILE_SUB, h: (wd.rows ?? 1) * TILE_SUB,
      dx: wd.dx | 0,
      cycle: wd.cycle ? [wd.cycle[0] | 0, wd.cycle[1] | 0] : null,
      phase: wd.phase | 0,
    };
  });

  // Marée : la surface monte et redescend en dents de scie, en entiers.
  const water = def.water
    ? {
      y0: def.water.row * TILE_SUB,
      amp: Math.round((def.water.amp ?? 0) * TILE_SUB),
      period: Math.max(2, def.water.period | 0 || 600),
      phase: def.water.phase | 0,
    }
    : null;

  const maxEchoes = def.maxEchoes == null ? null : Math.max(0, Math.min(4, def.maxEchoes | 0));

  const abilities = def.abilities ?? [];
  for (const ab of abilities) {
    if (!ABILITIES.includes(ab)) throw new Error(`${where} : capacité « ${ab} » inconnue (${ABILITIES.join(', ')}).`);
  }
  if (def.teach && !abilities.includes(def.teach)) {
    throw new Error(`${where} : « teach » (${def.teach}) doit faire partie des capacités du niveau.`);
  }

  // Le personnage apparaît centré dans sa case, les pieds au bas de la case.
  const spawnPos = spawnAt(spawn.col, spawn.row);

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
    levers,
    crumbles,
    springs,
    doors,
    blocks,
    lasers,
    platforms,
    stay,
    endings: def.endings ?? null,
    winds,
    water,
    maxEchoes,
    receivers,
    mirrors,
    relays,
    /** Départ des échos, s'il diffère du nôtre ; reflets (gauche et droite inversées). */
    echoSpawn: echoSpawn ? spawnAt(echoSpawn.col, echoSpawn.row) : null,
    echoMirror: !!def.echo?.mirror,
    abilities: Object.freeze([...abilities]),
    teach: def.teach ?? null,
    chapter: def.chapter ?? 1,
    /** Dernier niveau d'un chapitre : la sortie mène au chapitre suivant. */
    chapterEnd: !!def.chapterEnd,
    decor: def.decor ?? [],
  });
}

/** Position d'un personnage centré dans la case, les pieds au bas de la case. */
function spawnAt(col, row) {
  return {
    x: col * TILE_SUB + ((TILE * SUB - ACTOR_W) >> 1),
    y: (row + 1) * TILE_SUB - ACTOR_H,
  };
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
