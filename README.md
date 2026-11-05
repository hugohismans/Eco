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
  world.js      une tentative : pièce, boutons, portes, acteurs
  session.js    suite des tentatives, enregistrement, échos, chrono
src/core/       boucle à pas fixe, entrées clavier / tactile
src/render/     mise à l'échelle entière, rendu canvas (lit l'état, ne l'écrit jamais)
src/levels/     un fichier JSON par pièce, et index.js pour l'ordre
src/game.js     relie entrées, session et rendu
tests/          tests node:test
```

## Simulation

- Pas fixe de 60 ticks par seconde, indépendant du framerate (accumulateur de temps).
- État entièrement en entiers (sous-pixels), aucun hasard : même entrées, même résultat.
- Une tentative est enregistrée comme un octet d'entrées par tick (gauche, droite,
  saut, interaction). Un écho relit ces entrées avec la même logique que le joueur,
  jamais des positions : si le monde a changé, son trajet peut changer aussi.
- Les échos heurtent le monde mais ne bloquent pas le joueur. On peut se tenir sur la
  tête d'un écho plus ancien (courte échelle).

## Format des niveaux

Voir l'en-tête de `src/sim/level.js`. En bref :

```json
{
  "id": "hall",
  "name": "Le hall",
  "narration": "Une phrase, affichée au début du niveau.",
  "duration": 10,
  "grid": ["##############", "#P..a.....1.E#", "…"],
  "doors": { "1": { "buttons": ["a"], "mode": "and" } },
  "decor": [{ "type": "lamp", "col": 3, "row": 9 }]
}
```

La grille fait 14 colonnes sur 18 lignes. `#` mur, `=` plateforme fine, `P` départ,
`E` sortie, `a`…`i` boutons, `1`…`9` portes. `duration` en secondes, `null` pour un
niveau sans chrono.
