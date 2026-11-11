# Écho — conception des niveaux

Neuf chapitres de dix pièces. On change d'ambiance à chaque chapitre ; on passe de
l'un à l'autre en train (ou en métro, en funiculaire). La difficulté monte doucement à
l'intérieur d'un chapitre, et d'un chapitre à l'autre.

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
| 5 | Le train de nuit | plaques lourdes (`weight`), lampe du contrôleur (faisceau `erase` qui efface les échos), vent sur le toit (`winds`), pièces à échos limités (`maxEchoes`) |
| 6 | La mer | minuteries (`hold`), marée (`water`), tout ensemble ; le dernier train |
| 7 | La fête foraine | échos qui partent d'ailleurs (`Q`), reflets (`echo.mirror`), tourniquets `(` `)` |
| 8 | L'observatoire | miroirs `/` `\` (fixes ou pivotants), récepteurs `s…z`, ponts de lumière (`bridge`) |
| 9 | Le retour | malles `M` qui restent en place, relais `R`, de moins en moins d'échos ; le choix final |

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
40. **La halle des locomotives** (`locomotives`, halle, sans chrono, fin de chapitre).
    Le vieux train exposé, qu'on disait immobile pour toujours. Une énigme douce ;
    on monte, et il repart.

## Chapitre 5 — Le train de nuit (41 à 50)

Dans les voitures (`wagon` : banquettes, filets à bagages, fenêtres où défile la nuit)
et sur le toit (`toit` : le vent, les caténaires, le paysage qui file). Nouveautés :

- **Plaques lourdes** : `"buttons": {"a": {"weight": 2}}` ; il faut deux corps dessus
  (joueur, échos, valises). Une valise + un écho, deux échos, ou un écho + soi.
- **Lampe du contrôleur** : faisceau `"erase": true` (souvent cyclique). Il ne fait rien
  au joueur, mais un écho qu'il touche s'efface pour la tentative. Les corps (joueur,
  valise) l'arrêtent : on peut faire écran à un écho.
- **Vent** : zones `winds` qui poussent tout ce qui s'y trouve (rafales avec `cycle`).
  Le vent pousse aussi les échos et les valises : un écho immobile dérive.
- **Moins d'échos** : `maxEchoes` (1 à 4) ; il faut faire plus avec moins.

41. **Le couloir des voitures** (`couloir`, wagon). Une plaque lourde : un écho et
    soi-même dessus, puis il faut partir… et l'écho seul ne suffit plus. Idée : un
    écho + une valise.
42. **Le compartiment** (`compartiment`, wagon). Valises sur le filet, plaque lourde ;
    un écho pousse une valise sur la plaque et y reste.
43. **Le contrôleur** (`controleur`, wagon). La lampe passe et repasse dans le couloir :
    l'écho qui tient le bouton s'efface quand elle l'atteint. Le protéger (se placer
    entre la lampe et lui, ou y glisser une valise) ou agir pendant qu'elle est éteinte.
44. **Sur le toit** (`toit`, toit). Le vent par rafales ; sauter entre les voitures entre
    deux rafales. Un écho immobile dérive avec le vent : on s'en sert pour qu'il
    atteigne un bouton qu'on ne peut pas tenir soi-même.
45. **Le soufflet** (`soufflet`, toit). Entre deux voitures : le vent emporte les échos
    hors des boutons ; une valise sur la plaque lourde avec un écho résiste.
46. **Le wagon-restaurant** (`restaurant`, wagon). Deux échos seulement (`maxEchoes`),
    plaque lourde, levier : une tentative doit faire deux tâches.
47. **Les couchettes** (`couchettes`, wagon). Montée par les couchettes (plateformes
    fines), une lampe du contrôleur qui balaie de haut en bas : la tour d'échos doit
    se construire pendant qu'elle est éteinte, ou à l'abri.
48. **Le tunnel** (`tunnel`, toit). Plafond bas, vent continu, dash ; la lampe d'un
    signal efface les échos qui dérivent trop loin.
49. **La locomotive** (`locomotive`, toit). Tout le chapitre : plaque lourde, lampe,
    vent, trois échos au plus.
50. **L'aube** (`aube`, toit, fin de chapitre, sans chrono). Le jour se lève presque ;
    on rejoint l'avant du train qui arrive au bord de la mer.

## Chapitre 6 — La mer (51 à 60)

Le terminus au bord de la mer (`terminus` : grande verrière, affiches de bains de mer)
et la côte (`mer` : la mer et la lune, le phare, la jetée, les rochers). Nouveautés :

- **Minuteries** : `"buttons": {"a": {"hold": 120}}` ; le bouton reste actif quelques
  instants après qu'on l'a quitté. On orchestre des fenêtres de temps.
- **Marée** : `"water": {"row", "amp", "period", "phase"}` ; l'eau monte et redescend
  (toujours au même moment de chaque tentative). Le joueur s'y noie s'il a la tête sous
  l'eau ; les échos, non : un écho peut tenir un bouton sous la mer, et sa tête
  émerger comme un rocher.

51. **Le terminus** (`terminus`, terminus). Une minuterie : appuyer, puis courir ; trop
    loin pour soi seul. Un écho appuie au bon moment, la porte s'ouvre quand on arrive.
52. **La plage** (`plage`, mer). La marée monte : rejoindre les rochers. Un écho sous
    l'eau tient un bouton ; à marée haute, sa tête est une île.
53. **La jetée** (`jetee`, mer). Planches fragiles, ressorts, marée.
54. **Le phare** (`phare`, mer). Monter le phare ; sa lampe (faisceau `erase`
    cyclique) efface les échos dans l'escalier ; minuteries aux paliers.
55. **Les cabines de plage** (`cabines`, mer). Plaques lourdes et valises ; la marée
    emporte… rien (les valises restent), mais noie le joueur : trois échos au plus.
56. **Le port** (`port`, mer). Barques qui montent et descendent (plateformes), marée,
    minuteries.
57. **La digue** (`digue`, mer). Vent de mer et marée, dash.
58. **La grotte** (`grotte`, mer). Une grotte marine qui se remplit ; leviers et
    signaux cycliques.
59. **La marée haute** (`maree-haute`, mer). L'épreuve finale : quatre échos, marée,
    minuteries, plaques lourdes, lampe.
60. **Le dernier train** (`dernier-train`, terminus, sans chrono, fin de chapitre).
    Douce. Le dernier train attend au bout du quai, la mer derrière la verrière. Il
    repart le long de la côte, vers les lumières d'une fête.

## Chapitre 7 — La fête foraine (61 à 70)

Une fête foraine sur la jetée, la nuit : guirlandes d'ampoules, grande roue, manège
(`foire`), et le palais des glaces (`glaces`). Nouveautés :

- **L'autre entrée** : une case `Q` ; les échos partent de là, pas de notre départ.
  Ils refont nos gestes, ailleurs.
- **Reflets** : `"echo": {"mirror": true}` ; les échos rejouent nos gestes en inversant
  la gauche et la droite. Je vais à droite, mon reflet va à gauche. Tout ce qui diffère
  entre son côté et le mien (une marche, un mur, un tourniquet) le fait diverger.
- **Tourniquets** `)` et `(` : on ne les franchit que dans un sens. Ce qui me laisse
  passer arrête mon reflet.

Ce qu'on fait découvrir : *se rejoindre au milieu* ; *mimer* (sauter par-dessus rien,
attendre sans raison, pour que le reflet franchisse ce qu'il a de son côté) ; *aller
là-bas pour qu'il vienne ici*.

61. **L'autre entrée** (`autre-entree`, foire). Deux allées séparées par une palissade.
    L'écho part de `Q`, dans l'autre allée, et refait nos pas : on marche de ce côté
    jusqu'au repère, il s'arrête sur le bouton de l'autre.
62. **Le palais des glaces** (`palais-glaces`, glaces). Premier reflet, salle
    symétrique. Le bouton n'existe que de son côté : on va se placer là où serait le
    bouton, du nôtre.
63. **Face à face** (`face-a-face`, glaces). La sortie est en hauteur, au milieu. On
    marche jusqu'au centre ; le reflet aussi. Sa tête devient la marche.
64. **Les tourniquets** (`tourniquets`, foire). Mon tourniquet me laisse passer ; le
    sien l'arrête, juste sur un bouton. Peu importe combien de temps je marche.
65. **Les miroirs déformants** (`miroirs-deformants`, glaces). Les deux côtés ne se
    ressemblent plus : le sien a un escalier, le mien est plat. Il faut sauter au bon
    endroit, par-dessus rien, pour qu'il monte.
66. **Le train fantôme** (`train-fantome`, foire). Sa porte s'ouvre avec une plaque de
    mon côté, la mienne avec un bouton du sien : je lui tiens la porte en direct, puis
    il me tient la mienne.
67. **La grande roue** (`grande-roue`, foire). Deux nacelles (plateformes en boucle)
    qui ne montent pas en même temps. Pour qu'il prenne la sienne, je dois sauter
    quand SA nacelle passe, pas la mienne : mimer, en rythme.
68. **L'envers du décor** (`envers`, glaces). Il me faut une marche de MON côté : pour
    que mon reflet vienne ici, je dois aller me placer là-bas.
69. **La galerie des glaces** (`galerie-glaces`, glaces). L'épreuve : trois reflets,
    une leçon chacun (venir ici, être arrêté par un tourniquet, mimer), et l'ordre
    compte (on ne monte que sur un plus ancien).
70. **Le funiculaire** (`funiculaire`, foire, sans chrono, fin de chapitre). Douce.
    Deux plaques, une à chaque bout : chaque reflet est là où je n'étais pas. On
    croise. Le funiculaire monte vers l'observatoire.

## Chapitre 8 — L'observatoire (71 à 80)

Sur la colline, sous la Voie lactée (`colline`), puis sous la coupole, parmi les
instruments de laiton (`coupole`). Nouveautés, toutes de lumière :

- **Miroirs** `/` et `\` : des cases pleines qui renvoient les faisceaux à angle droit.
  Un miroir **pivotant** (`"mirrors"`) bascule d'une diagonale à l'autre quand son lien
  (bouton, levier, récepteur) est actif.
- **Récepteurs** `s t u w x y z` : actifs tant qu'un faisceau les atteint. Tout corps
  placé dans le faisceau leur fait de l'ombre : un écho est un volet qu'on pose.
- **Ponts de lumière** : faisceau `"bridge": true`, sans danger ; ses portions
  horizontales portent comme une plateforme fine, au ras du haut de leur rangée. Un
  corps DANS le faisceau le coupe : le pont s'arrête là, et ce qui était posé plus loin
  tombe.

À savoir : un faisceau passe à mi-hauteur de sa rangée. Dans la rangée où l'on a les
pieds, il traverse le corps ; dans la rangée juste au-dessus, il passe à 1 px de la
tête (il n'est coupé que si l'on saute).

71. **La passerelle** (`passerelle`, colline). Un pont de lumière au-dessus du ravin,
    allumé tant qu'une plaque est tenue. L'écho allume, on marche sur la lumière.
72. **L'ombre portée** (`ombre-portee`, coupole). Un récepteur éclairé tient la porte
    fermée. Le faisceau qui l'éclaire nous tuerait ; un écho lâché dedans (« Rejouer »
    en plein vol) lui fait de l'ombre.
73. **Le miroir tournant** (`miroir-tournant`, coupole). Le faisceau tombe sur un
    miroir pivotant : pont vers la gauche, ou pont vers la droite. Le levier est sur
    l'îlot de gauche : celui qui bascule reste de l'autre côté.
74. **La trappe de lumière** (`trappe`, coupole). La sortie est SOUS le pont de
    lumière, au milieu du vide. On s'arrête au-dessus ; l'écho vient se mettre dans le
    faisceau, en amont : le pont s'efface sous nos pieds.
75. **L'escalier de lumière** (`escalier-lumiere`, colline). Trois ponts, trois plaques
    à minuterie, un seul écho : il allume les marches l'une après l'autre, au rythme
    où l'on monte.
76. **La persistance** (`persistance`, coupole). Une seule lumière, deux récepteurs à
    rémanence, une porte qui veut les deux. Un écho resté au levier fait aller et
    venir le miroir : il jongle.
77. **Le planétaire** (`planetaire`, coupole). Deux miroirs pivotants, un faisceau
    mortel. Lire le trajet de la lumière : la plaque qui la détourne est au milieu du
    feu ; seul un écho peut y aller.
78. **Le verrou de lumière** (`verrou`, coupole). Une porte que sa propre lumière tient
    ouverte : le faisceau passe par l'ouverture et atteint le récepteur qui l'ouvre.
    Un appui suffit… jusqu'à ce que quelqu'un saute dans le rayon. L'écho, en allant à
    son poste, le coupe : c'est à nous d'armer le verrou, après son passage.
79. **La chambre noire** (`chambre-noire`, coupole). L'épreuve : ombre, miroir, pont
    coupé ; trois échos.
80. **La grande lunette** (`grande-lunette`, coupole, sans chrono, fin de chapitre).
    Douce. On aligne deux miroirs ; la lumière d'une étoile ouvre la coupole. En bas,
    le premier train du matin.

## Chapitre 9 — Le retour (81 à 90)

La première gare, à l'aube (`aube` : le quai sous un ciel rose ; `matin` : le hall, le
soleil dans les vitres). On n'a plus ni dash, ni escalade, ni saut au mur : on marche
et on saute, comme au début. Et les échos se font rares. Nouveautés :

- **Malles** `M` : des blocs poussables qui ne reviennent pas à leur place. D'une
  tentative à l'autre, une malle reste où on l'a laissée (« Effacer » remet tout en
  place). Un écho qui a poussé la malle la repousse à chaque fois.
- **Relais** `R` : si l'on « rejoue » (ou si le temps s'écoule) debout dessus, la
  tentative suivante part de là. Chaque écho repart d'où son enregistrement a commencé.
- Ce qu'on fait découvrir : *le travail des échos oubliés reste* (avec `maxEchoes`,
  les vieilles bandes disparaissent, pas ce qu'elles ont déplacé) ; *l'ordre dans
  lequel on enregistre* (une bande ne vit que quelques tentatives).

81. **Le quai, à l'aube** (`quai-aube`, aube). Aucun écho (`maxEchoes` 0), quatre
    secondes. La malle doit aller jusqu'à la plaque, trop loin pour une seule vie.
    Elle reste où on la laisse.
82. **La correspondance** (`correspondance`, matin). Premier relais. Une plaque à
    minuterie près du départ ouvre une grille tout au bout, trop loin. On s'arrête sur
    le relais ; à la tentative suivante on part de là, et l'écho du premier trajet
    repasse sur la plaque, à la même seconde.
83. **Le marchepied** (`marchepied`, aube). Un seul écho. La malle, poussée au pied du
    premier mur par des tentatives qu'on oubliera, reste une marche pour tout le
    monde ; il en faut une seconde, plus loin : la tête de l'écho.
84. **Le portillon** (`portillon`, matin). Le relais est derrière un tourniquet : on
    n'en revient pas. L'écho qui tient la plaque d'avant doit être enregistré AVANT de
    partir ; et il ne vivra qu'une tentative de plus (`maxEchoes` 2).
85. **La salle des pas perdus** (`pas-perdus-matin`, matin). Un seul écho. La malle
    doit rester SUR la plaque, mais l'écho qui l'y a poussée la repousse plus loin.
    Il faut une tentative pour le retenir : se mettre en travers.
86. **Les deux quais** (`deux-quais`, aube). Le relais d'abord, les aides ensuite : la
    bande du trajet ne sert à rien, autant qu'elle soit la première oubliée.
87. **Seul** (`seul`, aube). Aucun écho. Deux malles, des relais, des vies de cinq
    secondes : une malle au fond du fossé pour passer, l'autre sur la plaque.
88. **La consigne** (`consigne-matin`, matin). Le coffre : une aide dehors (avant), le
    relais dedans, une aide dedans. Trois échos, pas un de plus, et une seule
    tentative où tous les trois existent.
89. **Le premier train** (`premier-train`, aube). L'épreuve : malle, cale, relais, un
    seul écho.
90. **Le quai** (`quai-matin`, aube, sans chrono). La fin, douce. Le premier train du
    matin ; sa porte s'ouvre quand on est cinq sur le marchepied : soi, et ses quatre
    échos. Monter tous ensemble, ou rester sur le banc : deux fins.
