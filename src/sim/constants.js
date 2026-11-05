// Constantes de la simulation.
//
// Toute la simulation travaille en entiers, en « sous-pixels » (SUB sous-pixels
// = 1 pixel). Aucune valeur flottante n'entre dans l'état du monde : deux
// exécutions avec les mêmes entrées donnent exactement le même résultat, sur
// n'importe quelle machine.

/** Ticks de simulation par seconde (pas fixe). */
export const TPS = 60;

/** Taille d'une case de la grille, en pixels. */
export const TILE = 16;

/** Sous-pixels par pixel. */
export const SUB = 16;

/** Taille d'une case en sous-pixels. */
export const TILE_SUB = TILE * SUB;

/** Dimensions de la grille d'un niveau (une pièce = un écran, format portrait). */
export const GRID_W = 14;
export const GRID_H = 18;

/** Nombre maximal d'échos simultanés. */
export const MAX_ECHOES = 4;

// --- Entrées -------------------------------------------------------------
// Une entrée de tick est un octet : un bit par commande.
export const IN_LEFT = 1;
export const IN_RIGHT = 2;
export const IN_JUMP = 4;
export const IN_ACT = 8;

// --- Types de cases ------------------------------------------------------
export const T_EMPTY = 0;
export const T_SOLID = 1;
/** Plateforme fine : traversable par-dessous, solide quand on retombe dessus. */
export const T_ONEWAY = 2;

// --- Personnage (joueur et échos partagent exactement ces valeurs) -------
export const ACTOR_W = 10 * SUB;
export const ACTOR_H = 22 * SUB;

/** Vitesse de marche maximale (sous-pixels par tick) : 1,25 px/tick = 75 px/s. */
export const RUN_SPEED = 20;
export const GROUND_ACCEL = 4;
export const GROUND_DECEL = 5;
export const AIR_ACCEL = 3;
export const AIR_DECEL = 2;

export const GRAVITY = 6;
export const MAX_FALL = 112;

/**
 * Impulsion de saut. Avec GRAVITY = 6, le sommet est atteint ~39 px plus haut :
 * on franchit 2 cases (32 px) mais pas 3 (48 px). Debout sur un écho (22 px),
 * on atteint 3 cases : c'est la « courte échelle ».
 */
export const JUMP_VEL = 90;

/** Tolérance après avoir quitté un rebord (ticks). */
export const COYOTE_TICKS = 6;
/**
 * Un saut dure au moins ce nombre de ticks avant que relâcher la touche ne le
 * raccourcisse : même une pichenette sur l'écran franchit une marche (≈ 28 px).
 */
export const JUMP_MIN_TICKS = 6;
/** Mémoire d'un appui sur saut juste avant d'atterrir (ticks). */
export const JUMP_BUFFER_TICKS = 6;

// --- Éléments ---------------------------------------------------------------
/** Durée d'ouverture / de fermeture d'une porte (ticks). */
export const DOOR_TICKS = 12;
