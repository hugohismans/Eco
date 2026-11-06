// Les niveaux : tous les fichiers JSON de ce dossier, dans l'ordre de leur nom
// (01-quai.json, 02-hall.json…). Pour en ajouter un, il suffit de créer le
// fichier (format décrit dans src/sim/level.js), avec son champ "chapter".

const files = import.meta.glob('./*.json', { eager: true, import: 'default' });

export const LEVELS = Object.keys(files).sort().map((k) => files[k]);

/** Les chapitres : un lieu, une ambiance. */
export const CHAPTERS = {
  1: { title: 'La gare, la nuit' },
  2: { title: 'La gare d’altitude' },
  3: { title: 'La ville' },
  4: { title: 'Le musée' },
};
