// Éclairage « moderne » posé sur le pixel art.
//
// Le pixel art reste net (résolution interne, agrandi sans lissage). La
// lumière, elle, est calculée dans des calques lisses, agrandis AVEC lissage :
//   - carte de lumière : ambiance + sources (dégradés radiaux), avec ombres
//     portées par le personnage ; elle MULTIPLIE l'image ;
//   - volumes : cônes des lampes, rais de lune, reflets sur le sol mouillé,
//     brume, rayons de la porte ; ils s'AJOUTENT ;
//   - halo (bloom) : l'émissif réduit plusieurs fois puis réagrandi.
// Tout ceci ne lit que l'état du monde : la simulation n'en sait rien.

import { makeCanvas } from './pixel.js';
import { rgba } from './palette.js';
import { VIEW_W, VIEW_H } from './screen.js';

/** Scintillement doux d'une flamme de gaz (1 = nominal). */
export function flicker(seed, t) {
  if (!seed) return 1;
  let f = 1 + 0.035 * Math.sin(t * 2.3 + seed * 1.7) + 0.025 * Math.sin(t * 7.1 + seed * 4.1);
  // Rare petite baisse, comme un souffle d'air.
  const k = Math.floor(t * 3 + seed * 13.37);
  const n = Math.abs(Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453) % 1;
  if (n > 0.985) f *= 0.82;
  return f;
}

/** Feu à éclats (bouée, phare) : `blink` = période en secondes ; 1 allumé, 0 éteint. */
function blinkOf(L, t) {
  if (!L.blink) return 1;
  const k = ((t + (L.blinkPhase ?? 0)) / L.blink) % 1;
  return k < 0.18 ? 1 : k < 0.26 ? (0.26 - k) / 0.08 : 0;
}

export class Lighting {
  constructor() {
    this.temp = makeCanvas(256, 256);
    this.resize(VIEW_W, VIEW_H);
  }

  /** Taille des calques : celle de l'image affichée (pixels du jeu). */
  resize(w, h) {
    this.w = w;
    this.h = h;
    this.light = makeCanvas(w, h);
    this.volume = makeCanvas(w, h);
    this.b1 = makeCanvas(w / 2, h / 2);
    this.b2 = makeCanvas(w / 4, h / 4);
    this.b3 = makeCanvas(w / 8, h / 8);
  }

  /**
   * Carte de lumière.
   * @param {string} ambient couleur ambiante
   * @param {object[]} lights sources {x, y, r, color, intensity, flicker, shadows}
   * @param {{x:number,y:number,w:number,h:number}[]} occluders ce qui porte ombre
   * @param {number} t temps (s)
   */
  buildLightMap(ambient, lights, occluders, t, ox = 0, oy = 0) {
    const ctx = this.light.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const I = L.intensity * flicker(L.flicker, t) * blinkOf(L, t);
      if (I <= 0.01) continue;
      const near = L.shadows ? occluders.filter((o) => intersectsCircle(o, L.x, L.y, L.r)) : [];
      if (near.length === 0) {
        paintLight(ctx, L.x, L.y, L.r, L.color, I);
      } else {
        // Source dessinée à part, ombres découpées dedans, puis ajoutée.
        const size = Math.ceil(L.r * 2) + 2;
        const T = this.temp;
        if (T.width < size) { T.width = size; T.height = size; }
        const tc = T.getContext('2d');
        tc.globalCompositeOperation = 'source-over';
        tc.clearRect(0, 0, size, size);
        const ox = L.x - L.r - 1, oy = L.y - L.r - 1;
        paintLight(tc, L.x - ox, L.y - oy, L.r, L.color, I);
        tc.globalCompositeOperation = 'destination-out';
        for (const o of near) {
          for (const off of [-1.5, 1.5]) {
            castShadow(tc, L.x - ox + off, L.y - oy, { x: o.x - ox, y: o.y - oy, w: o.w, h: o.h }, L.r * 2.2, 0.5);
          }
        }
        ctx.drawImage(T, 0, 0, size, size, ox, oy, size, size);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    return this.light;
  }

  /**
   * Volumes lumineux additifs.
   * @param {object[]} volumes cônes, rais, reflets, rayons
   * @param {object[]} lights pour les halos autour des sources
   * @param {{color:string, alpha:number, floorY:number}|null} fog brume
   * @param {number} t temps (s)
   */
  buildVolumes(volumes, lights, fog, t, ox = 0, oy = 0) {
    const ctx = this.volume.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    ctx.globalCompositeOperation = 'lighter';

    for (const v of volumes) {
      const f = flicker(v.flicker, t) * (v.pulse ? 0.85 + 0.15 * Math.sin(t * 1.6) : 1);
      if (v.type === 'cone') {
        // Trois trapèzes emboîtés : bords doux, cœur plus dense.
        for (const [k, a] of [[1, 0.35], [0.7, 0.35], [0.4, 0.3]]) {
          trapezoid(ctx, v.x, v.y0, v.y1, v.w0 * k, v.w1 * k, 0, v.color, v.alpha * a * f);
        }
      } else if (v.type === 'shaft') {
        const cx = (v.x0 + v.x1) / 2, w = v.x1 - v.x0;
        for (const [k, a] of [[1.1, 0.35], [0.8, 0.35], [0.5, 0.3]]) {
          trapezoid(ctx, cx, v.y0, v.y1, w * k, w * k * 1.25, v.slant, v.color, v.alpha * a * f);
        }
      } else if (v.type === 'reflect') {
        // Reflet étiré dans le sol mouillé ou ciré.
        // Une flaque large et aplatie, plus une traînée verticale étroite.
        softEllipse(ctx, v.x, v.y + 1, v.w * 0.8, 3, v.color, v.alpha * f);
        softEllipse(ctx, v.x, v.y, v.w * 0.22, v.h * 1.4, v.color, v.alpha * 0.8 * f);
      } else if (v.type === 'beam') {
        // Lueur d'un faisceau : bande douce de part et d'autre du rayon.
        const horiz = v.y0 === v.y1;
        const half = 7;
        const g = horiz
          ? ctx.createLinearGradient(0, v.y0 - half, 0, v.y0 + half)
          : ctx.createLinearGradient(v.x0 - half, 0, v.x0 + half, 0);
        g.addColorStop(0, rgba(v.color, 0));
        g.addColorStop(0.5, rgba(v.color, v.alpha));
        g.addColorStop(1, rgba(v.color, 0));
        ctx.fillStyle = g;
        if (horiz) ctx.fillRect(Math.min(v.x0, v.x1), v.y0 - half, Math.abs(v.x1 - v.x0), half * 2);
        else ctx.fillRect(v.x0 - half, Math.min(v.y0, v.y1), half * 2, Math.abs(v.y1 - v.y0));
      } else if (v.type === 'sweep') {
        // Faisceau tournant d'un phare : un pinceau qui balaie l'horizon.
        const c = Math.cos(t * (v.speed ?? 0.9));
        const len = v.len * c;
        if (Math.abs(len) > 4) {
          const g = ctx.createLinearGradient(v.x, 0, v.x + len, 0);
          g.addColorStop(0, rgba(v.color, v.alpha * Math.abs(c)));
          g.addColorStop(1, rgba(v.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(v.x, v.y - 1);
          ctx.lineTo(v.x + len, v.y - v.spread);
          ctx.lineTo(v.x + len, v.y + v.spread);
          ctx.lineTo(v.x, v.y + 1);
          ctx.closePath();
          ctx.fill();
        }
      } else if (v.type === 'rays') {
        // Rayons qui s'échappent d'une porte entrouverte.
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.42 + Math.sin(t * 0.7 + i) * 0.05;
          const len = v.len * (0.7 + 0.3 * Math.sin(t * 1.3 + i * 2));
          const g = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, len);
          g.addColorStop(0, rgba(v.color, v.alpha * f));
          g.addColorStop(1, rgba(v.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(v.x, v.y);
          ctx.lineTo(v.x + Math.cos(a - 0.06) * len, v.y + Math.sin(a - 0.06) * len);
          ctx.lineTo(v.x + Math.cos(a + 0.06) * len, v.y + Math.sin(a + 0.06) * len);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Halos autour des sources (le « glow » moderne).
    for (const L of lights) {
      if (!L.halo) continue;
      const I = L.intensity * flicker(L.flicker, t) * blinkOf(L, t) * L.halo;
      const r = L.r * 0.32;
      const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, r);
      g.addColorStop(0, rgba(L.color, 0.55 * I));
      g.addColorStop(0.35, rgba(L.color, 0.18 * I));
      g.addColorStop(1, rgba(L.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(L.x - r, L.y - r, r * 2, r * 2);
    }

    // Brume rasante qui dérive lentement.
    if (fog) {
      const n = Math.ceil(this.w / 45);
      for (let i = 0; i < n; i++) {
        const x = ((i * 61 + t * (4 + i)) % (this.w + 120)) - 60 - ox;
        const y = fog.floorY - 6 + Math.sin(t * 0.3 + i) * 3;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, 0.22);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
        g.addColorStop(0, rgba(fog.color, fog.alpha));
        g.addColorStop(1, rgba(fog.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(-70, -70, 140, 140);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    return this.volume;
  }

  /** Halo de l'émissif : trois réductions successives, lissées. */
  bloom(emissive) {
    const steps = [[emissive, this.b1], [this.b1, this.b2], [this.b2, this.b3]];
    for (const [src, dst] of steps) {
      const c = dst.getContext('2d');
      c.imageSmoothingEnabled = true;
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, dst.width, dst.height);
      c.drawImage(src, 0, 0, dst.width, dst.height);
    }
    return [this.b1, this.b2, this.b3];
  }
}

/** Source ponctuelle : décroissance douce, proche de l'inverse du carré. */
function paintLight(ctx, x, y, r, color, I) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, Math.min(1, 0.95 * I)));
  g.addColorStop(0.12, rgba(color, Math.min(1, 0.7 * I)));
  g.addColorStop(0.35, rgba(color, 0.32 * I));
  g.addColorStop(0.65, rgba(color, 0.1 * I));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * Ombre d'un rectangle éclairé depuis (lx, ly) : on prolonge les deux coins
 * extrêmes (vus depuis la source) loin derrière l'obstacle. À utiliser en
 * mode 'destination-out' : l'ombre retire la lumière de CETTE source.
 */
function castShadow(ctx, lx, ly, o, len, strength) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  if (lx > o.x && lx < o.x + o.w && ly > o.y && ly < o.y + o.h) return;
  const base = Math.atan2(cy - ly, cx - lx);
  const corners = [[o.x, o.y], [o.x + o.w, o.y], [o.x, o.y + o.h], [o.x + o.w, o.y + o.h]];
  let min = Infinity, max = -Infinity, pMin = null, pMax = null;
  for (const p of corners) {
    let a = Math.atan2(p[1] - ly, p[0] - lx) - base;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    if (a < min) { min = a; pMin = p; }
    if (a > max) { max = a; pMax = p; }
  }
  const far = (p) => {
    const dx = p[0] - lx, dy = p[1] - ly;
    const d = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / d) * len, p[1] + (dy / d) * len];
  };
  const fMin = far(pMin), fMax = far(pMax);
  const dist = Math.hypot(cx - lx, cy - ly) || 1;
  const g = ctx.createLinearGradient(cx, cy, cx + ((cx - lx) / dist) * len * 0.6, cy + ((cy - ly) / dist) * len * 0.6);
  g.addColorStop(0, `rgba(0,0,0,${strength * 0.95})`);
  g.addColorStop(1, `rgba(0,0,0,${strength * 0.35})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(pMin[0], pMin[1]);
  ctx.lineTo(pMax[0], pMax[1]);
  ctx.lineTo(fMax[0], fMax[1]);
  ctx.lineTo(fMin[0], fMin[1]);
  ctx.closePath();
  ctx.fill();
}

/** Trapèze vertical (éventuellement penché), dégradé du haut vers le bas. */
function trapezoid(ctx, cx, y0, y1, w0, w1, slant, color, alpha) {
  const h = y1 - y0;
  const shift = h * slant;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.6, rgba(color, alpha * 0.55));
  g.addColorStop(1, rgba(color, alpha * 0.15));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - w0 / 2, y0);
  ctx.lineTo(cx + w0 / 2, y0);
  ctx.lineTo(cx + shift + w1 / 2, y1);
  ctx.lineTo(cx + shift - w1 / 2, y1);
  ctx.closePath();
  ctx.fill();
}

/** Tache lumineuse elliptique à bords doux (rx, ry : demi-axes). */
function softEllipse(ctx, x, y, rx, ry, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx / 32, ry / 32);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 32);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.5, rgba(color, alpha * 0.4));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-32, -32, 64, 64);
  ctx.restore();
}

function intersectsCircle(o, x, y, r) {
  const nx = Math.max(o.x, Math.min(x, o.x + o.w));
  const ny = Math.max(o.y, Math.min(y, o.y + o.h));
  return (nx - x) ** 2 + (ny - y) ** 2 < r * r;
}
