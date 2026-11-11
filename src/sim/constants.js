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

/** Dimensions de la grille d'un niveau (une pièce = un écran, format paysage). */
export const GRID_W = 28;
export const GRID_H = 14;

/** Nombre maximal d'échos simultanés. */
export const MAX_ECHOES = 4;

// --- Entrées -------------------------------------------------------------
// Une entrée de tick est un octet : un bit par commande.
export const IN_LEFT = 1;
export const IN_RIGHT = 2;
export const IN_JUMP = 4;
export const IN_ACT = 8;
export const IN_UP = 16;
export const IN_DOWN = 32;
export const IN_DASH = 64;
export const IN_GRAB = 128;

// --- Types de cases ------------------------------------------------------
export const T_EMPTY = 0;
export const T_SOLID = 1;
/** Plateforme fine : traversable par-dessous, solide quand on retombe dessus. */
export const T_ONEWAY = 2;
/** Glace : solide, glissante, impossible d'y rester agrippé. */
export const T_ICE = 3;
/** Tapis roulants : solides, emportent ce qui est posé dessus. */
export const T_CONV_L = 4;
export const T_CONV_R = 5;
/** Tableau : arrête le joueur et les valises, mais les échos le traversent. */
export const T_GHOST = 6;
/** Vitrine : laisse passer le joueur et les valises, arrête les échos. */
export const T_GLASS = 7;
/** Tourniquets : on ne les franchit que dans un sens (vers la droite / vers la gauche). */
export const T_GATE_R = 8;
export const T_GATE_L = 9;
/** Miroirs : pleins ; ils renvoient les faisceaux à angle droit ( « / » et « \ » ). */
export const T_MIRROR_A = 10;
export const T_MIRROR_B = 11;
/** Récepteur : plein ; actif tant qu'un faisceau l'atteint. */
export const T_RECEIVER = 12;

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

/** Vitesse d'une valise poussée (sous-pixels par tick) : 0,625 px/tick. */
export const PUSH_SPEED = 10;

/** Valises et caisses (sous-pixels). */
export const BLOCK_TYPES = {
  B: { type: 'valise', w: 14 * SUB, h: 12 * SUB },
  K: { type: 'caisse', w: 14 * SUB, h: 14 * SUB },
  // La malle : elle reste où on l'a laissée d'une tentative à l'autre.
  M: { type: 'malle', w: 14 * SUB, h: 14 * SUB, persist: true },
};

/** Épaisseur d'une plateforme mobile (monte-charge), en sous-pixels. */
export const PLATFORM_H = 6 * SUB;
/** Vitesse par défaut d'une plateforme mobile (sous-pixels par tick) : 0,75 px/tick. */
export const PLATFORM_SPEED = 12;
/** Pause d'une plateforme « en boucle » à chaque extrémité (ticks). */
export const PLATFORM_WAIT = 40;

/** Demi-épaisseur d'un faisceau (sous-pixels). */
export const BEAM_HALF = 1 * SUB;

/** Délai entre la chute du joueur dans un faisceau et la reprise (ticks). */
export const DEATH_TICKS = 50;

// --- Capacités débloquées au fil des niveaux --------------------------------
// Chaque niveau déclare celles dont on dispose : "walljump", "grab", "dash".
export const ABILITIES = ['walljump', 'grab', 'dash'];

/** Glissade le long d'un mur (vitesse de chute plafonnée). */
export const WALL_SLIDE_MAX = 40;
/** Distance de détection d'un mur à côté de soi. */
export const WALL_PROBE = 2 * SUB;
/** Saut au mur : élan horizontal, et durée pendant laquelle on ne peut pas revenir vers le mur. */
export const WALLJUMP_VX = 30;
export const WALLJUMP_LOCK = 10;

/** Escalade : vitesses, endurance (en ticks d'agrippement immobile). */
export const CLIMB_UP = 12;
export const CLIMB_DOWN = 24;
export const STAMINA_MAX = 300;
export const STAMINA_STILL = 1;
export const STAMINA_UP = 3;
export const STAMINA_CLIMBJUMP = 110;
/** Après un saut depuis le mur, on ne se raccroche pas tout de suite. */
export const GRAB_LOCK = 12;
/** Petit bond en haut d'un mur, pour se hisser sur le rebord. */
export const LEDGE_HOP_VY = 64;
export const LEDGE_HOP_VX = 20;

/** Dash : vitesse (droite et diagonale), durée, élan conservé à la fin. */
export const DASH_SPEED = 64;
export const DASH_DIAG = 45;
export const DASH_TICKS = 10;
/** Délai après un dash avant qu'il ne se recharge au sol (ticks). */
export const DASH_COOLDOWN = 6;
export const DASH_END_VY_UP = 32;
export const DASH_END_MAX_VX = 30;

/** Coin de plafond rattrapé en sautant : décalage maximal (px). */
export const CORNER_NUDGE = 4;

// --- Mécanismes des chapitres suivants --------------------------------------
/** Sur la glace, on accélère et on freine à peine (sous-pixels par tick²). */
export const ICE_ACCEL = 1;
/** Vitesse d'un tapis roulant (sous-pixels par tick) : 0,5 px/tick. */
export const CONVEYOR_SPEED = 8;
/** Ressort : impulsion verticale (≈ 5 cases de haut). */
export const SPRING_VEL = 128;
export const SPRING_H = 6 * SUB;
/** Échafaudage fragile : délai entre le premier appui et l'effondrement (ticks). */
export const CRUMBLE_TICKS = 30;
