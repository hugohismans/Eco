# Écho — conception des niveaux

Quatre chapitres de dix pièces. On change d'ambiance à chaque chapitre ; on passe de
l'un à l'autre en train (ou en métro). La difficulté monte doucement à l'intérieur
d'un chapitre, et d'un chapitre à l'autre.

## Principes

- **Une idée par pièce.** Chaque niveau montre une mécanique, ou une façon nouvelle de
  se servir d'une ancienne. Le « déclic » doit venir d'une observation, pas d'une
  adresse au pixel près.
- **Les échos rejouent des gestes, pas des positions.** C'est le cœur du jeu : si le
  monde a changé (une porte ouverte, une passerelle effondrée, un levier basculé), un
  écho peut faire autre chose que ce qu'on avait vu. Les pièces les plus fines
  reposent sur ces divergences.
- **Le temps est partagé.** Tous les échos repartent à zéro en même temps que nous :
  un écho qui actionne quelque chose à 4 s le fera toujours à 4 s. On orchestre.
- **L'ordre compte.** On ne monte que sur la tête d'un écho plus ancien ; un écho plus
  récent peut monter sur un plus ancien, jamais l'inverse.
- **Une tentative peut faire plusieurs choses** (pousser une valise, puis tenir un
  bouton ; basculer un levier, attendre, le rebasculer).
- **Moins d'échos, plus de sens.** Quatre échos au plus. Les dernières pièces en
  demandent trois ou quatre, pas avant.
- **Toujours honnête.** Les faisceaux cycliques préviennent (la lentille clignote
  avant de s'allumer). Rien n'est caché.

## Astuces à faire découvrir (sans les dire)

1. **S'arrêter au bon moment.** Un écho dont la bande est finie reste là où il était,
   immobile, pour toujours. En appuyant sur « Rejouer » au bon moment, on « pose » un
   écho à un endroit où l'on ne pourrait pas rester soi-même (sous un faisceau qui va
   s'allumer, en plein vol au-dessus d'un fossé…).
2. **Tomber pour construire.** Arrêter la tentative en plein saut : l'écho termine sa
   chute sans dommage (les faisceaux ne lui font rien) et devient une marche, une
   cale, un bouchon de faisceau.
3. **La tête d'un écho est un sol.** Elle recharge l'endurance ET le dash.
4. **Le passé franchit ce qui nous arrêtait.** Une porte fermée pour nous pendant
   l'enregistrement peut être ouverte pendant la relecture : l'écho continue alors son
   chemin, avec les mêmes gestes, plus loin qu'on ne l'a vu aller.
5. **Les échos se contrarient.** Deux échos qui basculent le même levier s'annulent ;
   un écho qui casse un échafaudage le casse aussi pour nous ; une alarme déclenchée
   par un vieil écho maladroit nous ferme la porte : il faut savoir « Effacer ».

## Mécaniques par chapitre

| Chapitre | Lieu | Nouveautés |
|---|---|---|
| 1 | La gare, la nuit | boutons, portes, valises, faisceaux, monte-charge, courte échelle, saut au mur, escalade, dash |
| 2 | La gare d'altitude | glace `~`, leviers `j…r`, faisceaux cycliques, téléphérique (plateforme en boucle) |
| 3 | La ville | ressorts `S`, échafaudages fragiles `%`, tapis roulants `{ }`, barrières lumineuses (capteurs) et alarmes |
| 4 | Le musée | tableaux `!` (seuls les échos les traversent), vitrines `?` (seuls les échos s'y heurtent), tout ensemble |

## Chapitre 1 — La gare, la nuit (niveaux 1 à 10, faits)

Tutoriel, puis une mécanique par pièce. Le dernier niveau : on monte dans le train de
nuit, qui mène au chapitre 2.

## Chapitre 2 — La gare d'altitude (11 à 20)

Neige qui tombe, chalets de bois, poêles, glace. Ambiances `neige` (dehors) et
`chalet` (dedans).

11. **L'arrivée** (`arrivee`, neige). Le train vient de s'arrêter. Quai verglacé. Un
    bouton au milieu de la glace doit être tenu pendant qu'on va à la porte : sur la
    glace, on ne s'arrête pas net ; il faut contre-braquer pour rester dessus. L'écho
    refait exactement ce contre-braquage. Doux.
12. **La salle des pas perdus** (`pas-perdus`, chalet). Premier levier. Il est tout au
    fond à gauche, la porte tout au fond à droite, le chrono est court : on ne peut
    pas basculer le levier puis courir à temps. Avec un écho, on se partage le
    travail : il bascule, on court dès le début.
13. **Les signaux** (`signaux`, neige). Une plaque sous un faisceau cyclique (allumé,
    éteint). On peut atteindre la plaque pendant qu'il est éteint, mais pas y rester.
    L'astuce n° 1 : arriver sur la plaque, puis « Rejouer » avant qu'il ne
    s'allume. L'écho, sa bande finie, reste sur la plaque, et le faisceau s'arrête sur
    sa tête. Narration : « Parfois, il suffit de s'arrêter au bon moment. »
14. **Le téléphérique** (`telepherique`, neige). Une cabine (plateforme en boucle)
    au-dessus d'un vide gardé par un faisceau ; elle ne roule que si un bouton est
    tenu. Un écho tient le bouton ; on monte dans la cabine. En chemin, un faisceau
    cyclique barre la trajectoire : sauter au bon moment, ou attendre la cabine
    suivante.
15. **La consigne** (`consigne`, chalet). Un seul levier, deux portes à la suite : la
    première s'ouvre levier baissé, la seconde levier levé (lien inversé). Il faut
    que le levier change d'état pendant qu'on avance entre les deux portes. Un seul
    écho suffit s'il bascule, attend, et rebascule (une tentative, deux tâches).
16. **Le gouffre** (`gouffre`, neige). Un fossé trop large, même avec un dash, avec un
    faisceau mortel au fond. L'astuce n° 2 : sauter dedans et « Rejouer » en plein
    vol. L'écho tombe au fond sans dommage, arrête le faisceau, et sa tête (qui
    recharge le dash) devient une marche au milieu du fossé. Narration : « Tomber,
    parfois, c'est construire. »
17. **L'aiguillage** (`aiguillage`, chalet). Deux cabines commandées par un même
    levier : l'une roule levier baissé, l'autre levier levé. Il faut prendre la
    première puis la seconde : un écho bascule le levier pendant qu'on est en route.
18. **Le refuge** (`refuge`, neige). Une haute paroi avec une bande de glace au
    milieu (on ne peut pas s'y agripper). Un écho resté agrippé sous la glace : on se
    pose sur sa tête (endurance ET dash rechargés), on passe la glace en dash vers le
    haut, on se raccroche au-dessus. Sans écho, on n'a plus de dash quand il le faut.
19. **Le poste d'aiguillage** (`poste`, chalet). Deux leviers en « xor » sur une
    porte, un faisceau cyclique, de la glace : trois échos à orchestrer. Le piège :
    deux échos qui touchent le même levier s'annulent.
20. **Le train de la vallée** (`train-vallee`, neige, fin de chapitre, sans chrono).
    Tout ensemble : glace, levier, l'écho-marche du gouffre, téléphérique. On monte
    dans le train qui descend vers la ville.

## Chapitre 3 — La ville (21 à 30)

Pluie, toits, néons, vitrines de boutiques, pavés mouillés. Ambiances `rue` (au sol,
façades) et `ville` (sur les toits, la ligne des immeubles au loin).

21. **Le parvis** (`parvis`, rue). Les ressorts (auvents) : un bouton sur un balcon
    qu'on n'atteint qu'en rebondissant. Un écho le tient pendant qu'on passe la porte
    en bas.
22. **Les échafaudages** (`echafaudages`, rue). Une passerelle fragile au-dessus d'un
    bouton. L'écho s'y engage, elle cède, il tombe sur le bouton et le tient : le
    passé nous casse le plancher, utilement. Mais il faut alors franchir le trou qu'il
    a laissé.
23. **Le passage couvert** (`passage`, rue). Tapis roulants. On pousse une valise sur
    un tapis qui l'emmène jusqu'à un bouton contre un mur, lentement. Un écho pousse
    la valise pendant qu'on file vers la porte. Un tapis à contresens nous ralentit.
24. **Le parking** (`parking`, ville). Barrières lumineuses : l'une ouvre une porte
    tant qu'on la coupe (un écho s'y tient) ; l'autre est une alarme qui verrouille
    la sortie pour toute la tentative si on la coupe. Une tentative ratée qui a coupé
    l'alarme devient un écho qui la recoupe à chaque fois : il faut l'effacer.
25. **Les toits** (`toits`, ville). Course sur les toits : ressorts, cheminées
    fragiles, dash. Un écho part loin tenir un bouton ; il faut qu'il arrive avant
    nous, donc ne pas emprunter les mêmes cheminées que lui.
26. **Le marché couvert** (`marche`, rue). Tapis roulants et valises, deux boutons en
    AND. Un écho qui reste immobile sur un tapis arrive « plus tard » sur un bouton :
    le tapis sert d'horloge.
27. **Le tramway** (`tramway`, rue). Une rame (plateforme en boucle horizontale) passe
    et repasse ; elle arrête les faisceaux. On marche à l'abri derrière elle le long
    d'un faisceau mortel ; une barrière lumineuse ne s'ouvre que quand la rame la
    coupe, ou quand un écho s'y tient.
28. **Le chantier** (`chantier`, ville). Échafaudages fragiles qu'on escalade : ils
    cèdent aussi quand on s'y agrippe. Un écho qui grimpe avant nous détruit nos
    prises ; à moins de s'en servir pour faire tomber un mur fragile qui barre la
    route.
29. **L'enseigne** (`enseigne`, ville). Une tour de trois échos (courte échelle sur
    courte échelle) pour atteindre l'enseigne lumineuse, sur un plancher fragile qui
    cède au bout d'un moment : il faut bâtir vite, et dans l'ordre.
30. **Le dernier métro** (`metro`, rue, fin de chapitre, sans chrono). Tout ensemble.
    On monte dans le métro vers le musée.

## Chapitre 4 — Le musée (31 à 40)

Galeries de marbre, tableaux, vitrines, verrières, la réserve, puis la halle des
locomotives. Ambiances `musee`, `reserve`, `halle`.

31. **L'entrée** (`entree`, musee). Les tableaux : un bouton dans une salle fermée,
    derrière un tableau. On marche contre le tableau, bloqué ; l'écho, lui, passe au
    travers et continue jusqu'au bouton, contre le mur du fond.
32. **La galerie des portraits** (`portraits`, musee). Même idée, sans mur pour
    arrêter l'écho : il faut qu'il s'arrête pile sur la plaque, donc « marcher à
    l'aveugle » contre le tableau le bon nombre d'instants. Des repères au sol aident.
33. **Les vitrines** (`vitrines`, musee). Les vitrines arrêtent les échos, pas nous :
    elles servent de butée (l'écho s'y arrête juste sur un bouton) ; et un écho
    enfermé derrière une vitrine ne peut plus nous gêner.
34. **La salle des statues** (`statues`, musee). Échos empilés à trois de haut ; des
    vitrines en couloir les alignent les uns sur les autres.
35. **Le système d'alarme** (`alarme`, musee). Les alarmes ferment les volets, mais
    ouvrent aussi l'issue de secours : un écho déclenche l'alarme au bon moment.
36. **La réserve** (`reserve`, reserve). Les valises ne traversent pas les tableaux ;
    un écho passe à travers pour ouvrir de l'intérieur ce qui laissera passer la
    valise.
37. **L'atelier de restauration** (`atelier`, reserve). Un tapis roulant emporte un
    écho immobile à travers un tableau, dans une pièce fermée où il tient une plaque.
38. **La verrière** (`verriere`, musee). Montée sous la verrière : des vitrines au
    plafond empêchent les échos de suivre ; escalade, dash, repos sur des têtes
    d'échos, faisceaux cycliques.
39. **Le grand escalier** (`grand-escalier`, musee). L'épreuve : quatre échos, tout ce
    qu'on a appris.
40. **La halle des locomotives** (`locomotives`, halle, sans chrono). Le vieux train
    exposé, la verrière, le banc. Une dernière énigme, douce ; puis le choix :
    monter dans le train, ou rester sur le banc. Deux fins.
