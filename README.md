# Écho

Un puzzle game 2D en pixel art, en vue de côté. On se réveille la nuit sur le quai
d'une petite gare, avec la sensation d'être déjà venu. Chaque pièce se joue en
tentatives de quelques secondes ; chaque tentative terminée devient un **écho**
qui rejoue exactement ce qu'on a fait, pendant qu'on recommence à côté de lui.
Jusqu'à quatre échos coexistent. Le but : monter dans le dernier train.

- Jouer : <https://hugohismans.github.io/Eco/>
- Accès direct à un niveau (test, sans verrou) : `…/Eco/#niveau=2`

## Interface, sauvegarde, son

- Écran titre (Commencer / Continuer), sélecteur de niveaux avec vignettes, pause
  (Échap, P ou bouton « Menu »), écran de réussite (essais, échos, temps, records),
  écran de fin avec les fins découvertes.
- Un niveau s'ouvre quand le précédent est réussi. La progression, les records,
  les fins vues et le réglage du son sont gardés dans le navigateur (`localStorage`,
  clé `echo.save`) ; sans stockage disponible, le jeu marche, il oublie seulement.
- Sons synthétisés (Web Audio, aucun fichier) : saut, réception, bouton, porte,
  valise qui frotte, monte-charge, faisceau qui grésille, chute, écho qui repart,
  tic du chrono dans les 3 dernières secondes, réussite, fins. Ambiance de gare
  (bourdonnement, vent, carillon lointain, réverbération) dosée selon la pièce.
  Les sons des échos sont plus faibles et plus sourds. Bouton pour couper le son.

## Commandes

| | Clavier | Manette | Téléphone |
|---|---|---|---|
| Se déplacer, viser, grimper | flèches ou WASD / ZQSD | stick gauche ou croix | joystick (8 directions) |
| Sauter | Espace, C ou K | A | « Saut » |
| Dash (si débloqué) | X ou J (+ direction) | X ou B (+ direction) | « Dash » (+ joystick) |
| S'agripper (si débloqué) | Z, Maj ou L (maintenu) | gâchettes ou bumpers | « Agripper » (maintenu) |
| Rester / levier | Bas ou E | bas | joystick vers le bas |
| Rejouer (nouvelle tentative) | R | Y | « Rejouer » |
| Effacer les échos | Retour arrière | Select | « Effacer » |
| Pause / menu | Échap ou P | Start | « Menu » |
| Dans les menus | flèches, Entrée, Échap | stick ou croix, A, B | toucher |

La manette (disposition standard : Xbox, PlayStation, Switch Pro…) est reconnue dès
qu'on appuie sur un bouton ; elle vibre un peu au dash, aux ressorts et quand on
touche un faisceau.

Le jeu se joue en largeur et occupe tout l'écran : l'image est agrandie d'un
facteur entier et le décor se prolonge autour de la pièce. Sur téléphone, les
commandes sont posées en transparence dans les marges (joystick à gauche, boutons à
droite) ; tenu droit, le téléphone affiche une invite à le tourner. Le jeu passe en
plein écran au lancement d'une partie (Android), ou s'installe sur l'écran d'accueil
(iPhone, « Ajouter à l'écran d'accueil », grâce à `public/manifest.webmanifest`).

## Mouvements et capacités

Les mouvements s'inspirent des jeux de plateforme de précision, et les échos les
rejouent comme le reste (ce sont des entrées, pas des positions).

- De base : marche, saut court ou long, tolérance au bord, appui mémorisé, coins de
  plafond rattrapés de quelques pixels.
- `walljump` (niveau 7) : glisser le long d'un mur en poussant vers lui, sauter
  d'un mur à l'autre.
- `grab` (niveau 8) : s'agripper, grimper et descendre, saut vertical depuis le
  mur ; une endurance limite l'escalade (la silhouette clignote quand elle
  s'épuise) et se recharge au sol, ou sur la tête d'un écho.
- `dash` (niveau 9) : une ruée dans l'une des huit directions, une fois par saut,
  rechargée au sol ; l'écharpe s'allume quand un dash est disponible.

Chaque niveau déclare ses capacités (`"abilities"`) et peut en présenter une
nouvelle (`"teach"`), qui s'affiche sur une carte au début.

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
src/core/       boucle à pas fixe, entrées clavier / manette / tactile, sauvegarde
src/audio/      sons et ambiance synthétisés
src/ui/         écrans d'interface (titre, niveaux, pause, réussite, fin), vignettes
src/render/     mise à l'échelle entière, pixel art, éclairage, interface (lit l'état, ne l'écrit jamais)
src/levels/     un fichier JSON par pièce, et index.js pour l'ordre
src/game.js     relie entrées, session et rendu
tests/          tests node:test
```

## Image

Le pixel art est net : il est dessiné à la résolution interne (scène de 448 × 260) et agrandi
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

Soixante pièces en six chapitres, chacun avec son ambiance ; on passe de l'un à
l'autre en train (puis en métro) :

1. **La gare, la nuit** (1–10) : boutons, portes, valises, faisceaux, monte-charge,
   courte échelle, puis saut au mur, escalade et dash ; on prend le train de nuit.
2. **La gare d'altitude** (11–20) : glace, leviers, faisceaux cycliques, téléphérique.
3. **La ville** (21–30) : ressorts, échafaudages fragiles, tapis roulants, barrières
   lumineuses et alarmes.
4. **Le musée** (31–40) : tableaux que seuls les échos traversent, vitrines qui
   n'arrêtent qu'eux ; dans la halle des locomotives, un vieux train attend.
5. **Le train de nuit** (41–50) : à bord et sur le toit ; courants d'air, plaques
   lourdes (deux corps), minuteries, la lampe du contrôleur qui efface les échos.
6. **La mer** (51–60) : le terminus, la côte, la marée qui monte et redescend,
   des pièces qui ne gardent que peu d'échos ; le dernier train et le choix final
   (monter, ou rester).

La conception de chaque pièce (idée, astuce, progression) est dans
[`docs/niveaux.md`](docs/niveaux.md). Chaque solution est jouée par un robot dans
`tests/levels.test.js` et `tests/chapter2.test.js` à `chapter6.test.js`, qui
vérifient aussi qu'elle ne marche pas sans les échos et que les raccourcis évidents
échouent.

## Format des niveaux

Voir l'en-tête de `src/sim/level.js`. En bref :

```json
{
  "id": "hall",
  "name": "Le hall",
  "theme": "hall",
  "narration": "Une phrase, affichée au début du niveau.",
  "duration": 10,
  "grid": ["############################", "#P......a...........1....E.#", "…"],
  "doors": { "1": { "buttons": ["a"], "mode": "and" } },
  "lasers": [{ "col": 0, "row": 15, "buttons": ["c"], "mode": "or", "invert": true }],
  "platforms": [{ "col": 10, "row": 16, "to": { "col": 10, "row": 12 },
                  "buttons": ["b"], "behavior": "loop" }],
  "stay": { "col": 6, "row": 15, "cols": 2 },
  "endings": { "exit": "…", "stay": "…" },
  "abilities": ["walljump", "grab", "dash"],
  "teach": "dash",
  "decor": [{ "type": "lamp", "col": 3, "row": 9 }]
}
```

La grille fait 28 colonnes sur 14 lignes (format paysage) :

| Caractère | Élément |
|---|---|
| `#` | mur / sol |
| `=` | plateforme fine (traversable par-dessous) |
| `P` | départ |
| `E` | sortie |
| `a`…`i` | bouton pressoir (actif tant qu'un corps est dessus) |
| `1`…`9` | porte reliée à des boutons (`and` / `or`, `invert`) |
| `B`, `K` | valise, caisse (blocs poussables) |
| `>` `<` `v` `^` | émetteur de faisceau, tirant dans ce sens |
| `j`…`r` | levier (bascule avec Bas ou E ; les échos aussi) |
| `~` | glace (on glisse, on ne s'y agrippe pas) |
| `{` `}` | tapis roulant vers la gauche / la droite |
| `%` | échafaudage fragile (cède peu après qu'on s'y est posé) |
| `S` | ressort |
| `!` | tableau : seuls les échos le traversent |
| `?` | vitrine : elle n'arrête que les échos |

- `duration` en secondes, `null` pour un niveau sans chrono ; `chapter` (1 à 6) ;
  `chapterEnd: true` pour la pièce qui mène au chapitre suivant.
- Faisceaux : `cycle: [allumé, éteint]` et `phase` (en ticks) ; `sensor: "id"` pour une
  barrière lumineuse non mortelle, utilisable comme un bouton ; `latch: true` pour une
  alarme qui reste déclenchée. Liens en `and`, `or` ou `xor`.
- Un faisceau s'arrête sur le premier mur, porte, plateforme, valise ou écho ; s'il
  touche le joueur, la tentative reprend (elle ne devient pas un écho).
- Une plateforme `hold` va vers `to` tant que ses boutons sont actifs et revient
  sinon ; une plateforme `loop` fait l'aller-retour tant qu'ils sont actifs.
- `buttons: { "a": { "weight": 2, "hold": 90 } }` : plaque lourde (il faut deux corps
  dessus) ; minuterie (elle reste active 90 ticks après qu'on l'a quittée).
- `winds: [{ col, row, cols, rows, dx, cycle, phase }]` : courant d'air qui pousse
  horizontalement de `dx` sous-pixels par tick tout ce qui s'y trouve.
- Faisceau `erase: true` : la lampe du contrôleur, sans danger pour le joueur, qui
  efface l'écho qu'elle touche (un corps ou une valise peut lui faire écran).
- `water: { row, amp, period, phase }` : marée ; la surface monte de `amp` rangées
  et redescend, en `period` ticks. Le joueur s'y noie ; les échos, non.
- `maxEchoes` : nombre d'échos gardés dans la pièce (4 par défaut).
- `stay` : zone où l'on peut choisir de rester (fin `stay`) ; la sortie donne la fin `exit`.
