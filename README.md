# Écho

Un puzzle game 2D en pixel art, en vue de côté. On se réveille la nuit sur le quai
d'une petite gare, avec la sensation d'être déjà venu. Chaque pièce se joue en
tentatives de quelques secondes ; chaque tentative terminée devient un **écho**
qui rejoue exactement ce qu'on a fait, pendant qu'on recommence à côté de lui.
Jusqu'à quatre échos coexistent. Le but : monter dans le dernier train.

- Jouer : <https://hugohismans.github.io/Eco/>
- Accès direct à un niveau (test) : `…/Eco/#niveau=2`

## Commandes

| | Ordinateur | Téléphone |
|---|---|---|
| Marcher | ← → ou A D (Q D en AZERTY) | joystick, à gauche |
| Sauter | Espace ou ↑ | bouton « Saut », à droite |
| Rejouer (nouvelle tentative) | R | bouton « Rejouer » |
| Recommencer (efface les échos) | Retour arrière | bouton « Recommencer » |
| Interagir (rester sur le quai) | Bas, S ou E | joystick vers le bas |

## Travailler en local

Il faut Node 22.

```sh
npm ci           # dépendances (versions figées)
npm run dev      # serveur de développement : http://localhost:5173/Eco/
npm test         # tests de la simulation (déterminisme, niveaux solubles)
npm run build    # construit le site dans dist/
npm run preview  # sert dist/ en local
```

Chaque push sur `main` lance `.github/workflows/deploy.yml` : tests, build Vite,
publication sur GitHub Pages.

## Organisation

```
src/sim/        simulation pure (aucun accès au DOM) : testable sous Node
  constants.js  pas de temps, grille, physique du personnage
  level.js      lecture et validation des niveaux JSON
  physics.js    déplacement avec collisions, axe par axe
  actor.js      le personnage (joueur et échos : même code)
  world.js      une tentative : pièce, boutons, portes, faisceaux, corps
  bodies.js     valises et plateformes mobiles
  session.js    suite des tentatives, enregistrement, échos, chrono
src/core/       boucle à pas fixe, entrées clavier / tactile
src/render/     mise à l'échelle entière, pixel art, éclairage, interface (lit l'état, ne l'écrit jamais)
src/levels/     un fichier JSON par pièce, et index.js pour l'ordre
src/game.js     relie entrées, session et rendu
tests/          tests node:test
```

## Image

Le pixel art est net : il est dessiné à la résolution interne (224 × 336) et agrandi
d'un facteur entier, sans lissage. La lumière, elle, est douce : elle est calculée
dans des calques lisses et composée à la résolution de l'écran.

1. **Albedo** : la couleur des choses (fond, murs, décor, silhouette).
2. **Carte de lumière** (multiplication) : ambiance de la pièce et sources (lampes,
   lune, porte, voyants, échos), avec les ombres portées par le personnage.
3. **Volumes** (addition) : cônes des lampes, rais de lune, reflets sur le sol
   mouillé, brume, rayons de la porte de sortie.
4. **Émissif** (net, addition) : ce qui brille par soi-même (ampoules, vitres,
   étoiles, échos, liseré de lumière sur la silhouette, poussières dans la lumière).
5. **Halo** : l'émissif réduit trois fois puis réagrandi (bloom).
6. Vignette, puis l'interface en police pixel.

Si l'appareil ne tient pas la cadence, le jeu passe tout seul en qualité basse : la
composition se fait alors à la résolution interne (lumière « pixel »). On peut forcer
la qualité avec `?qualite=haute` ou `?qualite=basse`.

Les ambiances (`quai`, `hall`…) sont dans `src/render/themes.js`, les éléments de
décor (`lamp`, `pendant`, `window`, `clock`, `poster`, `bench`, `canopy`, `facade`,
`sign`) dans `src/render/decor.js`, la silhouette dans `src/render/sprites.js`.

## Simulation

- Pas fixe de 60 ticks par seconde, indépendant du framerate (accumulateur de temps).
- État entièrement en entiers (sous-pixels), aucun hasard : même entrées, même résultat.
- Une tentative est enregistrée comme un octet d'entrées par tick (gauche, droite,
  saut, interaction). Un écho relit ces entrées avec la même logique que le joueur,
  jamais des positions : si le monde a changé, son trajet peut changer aussi.
- Les échos heurtent le monde mais ne bloquent pas le joueur. On peut se tenir sur la
  tête d'un écho plus ancien (courte échelle).

## Niveaux

1. **Le quai** : marcher jusqu'à la porte du hall (tutoriel).
2. **Le hall** : un écho reste sur le bouton pendant qu'on passe la porte.
3. **Les guichets** : deux boutons, une porte en AND (deux échos).
4. **La salle d'attente** : pousser la valise du porte-bagages jusqu'au bouton.
5. **Le souterrain** : courte échelle sur un écho pour atteindre le rebord.
6. **Le passage de la voie** : les plaques déclenchent le faisceau ; un écho
   placé devant l'arrête pendant qu'on passe.
7. **Le dernier train** : sans chrono. Valise dans le faisceau, échos sur les
   boutons de la barrière et du monte-charge, puis monter dans le train… ou
   s'asseoir sur le banc (touche Bas / S, joystick vers le bas). Deux fins.

Les solutions sont jouées par un robot dans `tests/levels.test.js` (et l'on y
vérifie aussi qu'elles ne marchent pas sans les échos).

## Format des niveaux

Voir l'en-tête de `src/sim/level.js`. En bref :

```json
{
  "id": "hall",
  "name": "Le hall",
  "theme": "hall",
  "narration": "Une phrase, affichée au début du niveau.",
  "duration": 10,
  "grid": ["##############", "#P..a.....1.E#", "…"],
  "doors": { "1": { "buttons": ["a"], "mode": "and" } },
  "lasers": [{ "col": 0, "row": 15, "buttons": ["c"], "mode": "or", "invert": true }],
  "platforms": [{ "col": 10, "row": 16, "to": { "col": 10, "row": 12 },
                  "buttons": ["b"], "behavior": "loop" }],
  "stay": { "col": 6, "row": 15, "cols": 2 },
  "endings": { "exit": "…", "stay": "…" },
  "decor": [{ "type": "lamp", "col": 3, "row": 9 }]
}
```

La grille fait 14 colonnes sur 18 lignes :

| Caractère | Élément |
|---|---|
| `#` | mur / sol |
| `=` | plateforme fine (traversable par-dessous) |
| `P` | départ |
| `E` | sortie |
| `a`…`i` | bouton pressoir (actif tant qu'un corps est dessus) |
| `1`…`9` | porte reliée à des boutons (`and` / `or`, `invert`) |
| `B`, `K` | valise, caisse (blocs poussables) |
| `>` `<` `v` `^` | émetteur de faisceau mortel, tirant dans ce sens |

- `duration` en secondes, `null` pour un niveau sans chrono.
- Un faisceau s'arrête sur le premier mur, porte, plateforme, valise ou écho ; s'il
  touche le joueur, la tentative reprend (elle ne devient pas un écho).
- Une plateforme `hold` va vers `to` tant que ses boutons sont actifs et revient
  sinon ; une plateforme `loop` fait l'aller-retour tant qu'ils sont actifs.
- `stay` : zone où l'on peut choisir de rester (fin `stay`) ; la sortie donne la fin `exit`.
