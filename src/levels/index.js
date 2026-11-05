// Liste ordonnée des niveaux. Pour en ajouter un : créer le fichier JSON
// (format décrit dans src/sim/level.js) et l'importer ici.
import quai from './01-quai.json';
import hall from './02-hall.json';
import guichets from './03-guichets.json';
import attente from './04-attente.json';
import souterrain from './05-souterrain.json';
import voie from './06-voie.json';
import train from './07-train.json';

export const LEVELS = [quai, hall, guichets, attente, souterrain, voie, train];
