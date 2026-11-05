// Vignettes des niveaux pour le sélecteur : la pièce, éclairée, sans personne.

import { buildScene } from '../render/renderer.js';
import { Lighting } from '../render/lighting.js';
import { makeCanvas } from '../render/pixel.js';
import { VIEW_W, VIEW_H } from '../render/screen.js';

const cache = new Map();
let lighting = null;

/** Image (canvas) d'un niveau, mise en cache. */
export function levelThumb(level) {
  let img = cache.get(level.id);
  if (img) return copy(img);
  lighting ??= new Lighting();
  const scene = buildScene(level);
  img = makeCanvas(VIEW_W, VIEW_H);
  const ctx = img.getContext('2d');
  ctx.drawImage(scene.albedo, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(lighting.buildLightMap(scene.theme.ambient, scene.lights, [], 0, 0, 0), 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(scene.emissive, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  cache.set(level.id, img);
  return copy(img);
}

/** Un canvas ne peut être qu'à un endroit du document : on en donne une copie. */
function copy(src) {
  const c = makeCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
