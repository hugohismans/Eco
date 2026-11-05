// Petits outils de dessin en pixels.

/** Canvas hors écran. */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return c;
}

/** Rectangle plein. */
export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  // Toujours sur la grille de pixels : aucun bord flou.
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Un pixel. */
export function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

/**
 * Tramage en damier (transition « 16 bits » entre deux teintes) :
 * un pixel sur deux en `color`, sur la zone donnée.
 */
export function checker(ctx, x, y, w, h, color, phase = 0) {
  ctx.fillStyle = color;
  for (let j = 0; j < h; j++) {
    for (let i = (j + phase) & 1; i < w; i += 2) ctx.fillRect(x + i, y + j, 1, 1);
  }
}

/** Tramage clairsemé : un pixel sur huit, en quinconce. */
export function sparse(ctx, x, y, w, h, color, phase = 0) {
  ctx.fillStyle = color;
  for (let j = 0; j < h; j += 2) {
    const off = ((j >> 1) + phase) & 1 ? 2 : 0;
    for (let i = off; i < w; i += 4) ctx.fillRect(x + i, y + j, 1, 1);
  }
}

/**
 * Générateur pseudo-aléatoire à graine (mulberry32). Réservé au DÉCOR :
 * la simulation n'utilise jamais de hasard.
 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine stable à partir d'une chaîne. */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// --- Texte en police pixel ----------------------------------------------

export const FONT = '"Press Start 2P"';
/** Chasse fixe de la police, en pixels, à la taille 8. */
export const GLYPH = 8;

const textCache = new Map();

/**
 * Rend un texte en police pixel, sans anti-crénelage (alpha seuillé), avec
 * une ombre portée d'un pixel. Le résultat est mis en cache.
 * @returns {HTMLCanvasElement}
 */
export function textSprite(text, color, shadow = '#05060f') {
  const key = `${text}|${color}|${shadow}`;
  let c = textCache.get(key);
  if (c) return c;
  const w = Math.max(1, text.length * GLYPH);
  c = makeCanvas(w + 1, GLYPH + 2);
  const ctx = c.getContext('2d');
  ctx.font = `8px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 0, 0);
  // Seuil : chaque pixel est plein ou vide, jamais flou.
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const mask = new Uint8Array(c.width * c.height);
  for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] >= 110 ? 1 : 0;
  ctx.clearRect(0, 0, c.width, c.height);
  const paint = (dx, dy, col) => {
    ctx.fillStyle = col;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (mask[y * c.width + x]) ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    }
  };
  if (shadow) paint(1, 1, shadow);
  paint(0, 0, color);
  if (textCache.size > 400) textCache.clear();
  textCache.set(key, c);
  return c;
}

/** Coupe un texte en lignes d'au plus `maxChars` caractères, sur les espaces. */
export function wrapText(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
