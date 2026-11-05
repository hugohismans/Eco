// Rendu provisoire (phase 1) : formes simples, palette nocturne.
//
// Le rendu ne fait que LIRE l'état de la session et du monde ; il ne modifie
// jamais la simulation. Il interpole les positions entre deux ticks
// (`alpha` ∈ [0, 1[) pour rester fluide sur les écrans à plus de 60 Hz.

import { TILE, SUB, GRID_W, GRID_H, TPS, T_SOLID, T_ONEWAY, DOOR_TICKS, MAX_ECHOES } from '../sim/constants.js';
import { VIEW_W, VIEW_H, LEVEL_Y, HUD_H } from './screen.js';

export const PALETTE = {
  nightDeep: '#0b1026',
  night: '#141d3f',
  nightHigh: '#1f2b57',
  hud: '#080c1d',
  brick: '#4b2c2a',
  brickDark: '#36201f',
  wood: '#8a5a34',
  woodLight: '#b07a46',
  lamp: '#ffb35c',
  lampSoft: '#ffd89a',
  poster: '#d9c48a',
  door: '#6a4429',
  doorDark: '#4a2e1c',
  text: '#f4e2c0',
  textDim: '#8d93b8',
  silhouette: '#07070e',
};

/** Teintes pâles des échos : bleu, rose, jaune, vert. */
export const ECHO_TINTS = ['#9ec9ff', '#ffadd6', '#ffe08a', '#a6f0b6'];

const TRAIL_LEN = 10;
/** Durée d'affichage de la narration (ticks) et des fondus. */
const NARRATION_TICKS = 5 * TPS;
const NARRATION_FADE = 30;

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.staticLayer = null;
    this.staticLevel = null;
    this.trails = new Map();
    this.trailWorld = null;
    this.trailTick = -1;
  }

  /**
   * Dessine une image complète.
   * @param {import('../sim/session.js').Session} session
   * @param {number} alpha fraction de tick écoulée depuis le dernier pas
   * @param {{ overlay?: { title: string, hint: string } | null }} ui
   */
  draw(session, alpha, ui = {}) {
    const ctx = this.ctx;
    const world = session.world;
    if (this.staticLevel !== session.level) this.buildStatic(session.level);

    ctx.drawImage(this.staticLayer, 0, 0);
    ctx.save();
    ctx.translate(0, LEVEL_Y);
    this.drawExit(world.level.exit, world.tick);
    for (const b of world.buttons) this.drawButton(b);
    for (const d of world.doors) this.drawDoor(d);
    this.drawActors(world, alpha);
    ctx.restore();

    this.drawHud(session);
    this.drawNarration(session);
    if (ui.overlay) this.drawOverlay(ui.overlay);
  }

  // --- Décor fixe, dessiné une fois par niveau ----------------------------

  buildStatic(level) {
    const layer = document.createElement('canvas');
    layer.width = VIEW_W;
    layer.height = VIEW_H;
    const ctx = layer.getContext('2d');

    // Ciel nocturne en bandes (pas de dégradé lissé).
    const bands = [PALETTE.nightDeep, PALETTE.night, PALETTE.nightHigh];
    const bandH = Math.ceil(VIEW_H / bands.length);
    bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, i * bandH, VIEW_W, bandH);
    });

    ctx.save();
    ctx.translate(0, LEVEL_Y);
    for (const d of level.decor) drawDecor(ctx, d);

    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        const t = level.tiles[r * GRID_W + c];
        const above = r > 0 ? level.tiles[(r - 1) * GRID_W + c] : T_SOLID;
        const x = c * TILE, y = r * TILE;
        if (t === T_SOLID) {
          ctx.fillStyle = PALETTE.brick;
          ctx.fillRect(x, y, TILE, TILE);
          // Joints de briques décalés une rangée sur deux.
          ctx.fillStyle = PALETTE.brickDark;
          ctx.fillRect(x, y + 7, TILE, 1);
          ctx.fillRect(x, y + 15, TILE, 1);
          ctx.fillRect(x + ((r & 1) ? 4 : 11), y, 1, 7);
          ctx.fillRect(x + ((r & 1) ? 11 : 4), y + 8, 1, 7);
          if (above !== T_SOLID) {
            // Bord de quai en bois là où l'on marche.
            ctx.fillStyle = PALETTE.wood;
            ctx.fillRect(x, y, TILE, 3);
            ctx.fillStyle = PALETTE.woodLight;
            ctx.fillRect(x, y, TILE, 1);
          }
        } else if (t === T_ONEWAY) {
          ctx.fillStyle = PALETTE.wood;
          ctx.fillRect(x, y, TILE, 3);
          ctx.fillStyle = PALETTE.woodLight;
          ctx.fillRect(x, y, TILE, 1);
        }
      }
    }
    ctx.restore();

    // Bandeaux haut et bas.
    ctx.fillStyle = PALETTE.hud;
    ctx.fillRect(0, 0, VIEW_W, HUD_H);
    ctx.fillRect(0, LEVEL_Y + GRID_H * TILE, VIEW_W, VIEW_H);

    this.staticLayer = layer;
    this.staticLevel = level;
  }

  // --- Éléments dynamiques -------------------------------------------------

  drawExit(ex, tick) {
    const ctx = this.ctx;
    const x = ex.x / SUB, y = ex.y / SUB, w = ex.w / SUB, h = ex.h / SUB;
    // Encadrement de porte, lumière chaude qui respire doucement.
    ctx.fillStyle = PALETTE.doorDark;
    ctx.fillRect(x - 1, y - 2, w + 2, h + 2);
    ctx.fillStyle = (tick >> 5) & 1 ? PALETTE.lamp : PALETTE.lampSoft;
    ctx.fillRect(x + 1, y, w - 2, h);
    ctx.fillStyle = PALETTE.lampSoft;
    ctx.fillRect(x + 3, y + 2, w - 6, h - 2);
  }

  drawButton(b) {
    const ctx = this.ctx;
    const x = b.x / SUB, w = b.w / SUB;
    const bottom = (b.y + b.h) / SUB;
    ctx.fillStyle = PALETTE.brickDark;
    ctx.fillRect(x, bottom - 1, w, 1);
    const plateH = b.pressed ? 1 : 3;
    ctx.fillStyle = b.pressed ? PALETTE.lampSoft : PALETTE.lamp;
    ctx.fillRect(x + 1, bottom - 1 - plateH, w - 2, plateH);
  }

  drawDoor(d) {
    const ctx = this.ctx;
    const x = d.x / SUB, y = d.y / SUB, w = d.w / SUB, h = d.h / SUB;
    const hidden = Math.floor((h * d.open) / DOOR_TICKS);
    if (hidden >= h) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const py = y - hidden;
    ctx.fillStyle = PALETTE.door;
    ctx.fillRect(x + 2, py, w - 4, h);
    ctx.fillStyle = PALETTE.doorDark;
    for (let k = 4; k < h; k += 6) ctx.fillRect(x + 2, py + k, w - 4, 1);
    ctx.fillRect(x + 2, py, 1, h);
    ctx.fillRect(x + w - 3, py, 1, h);
    ctx.restore();
  }

  drawActors(world, alpha) {
    const ctx = this.ctx;
    // Traînées des échos, échantillonnées à chaque nouveau tick.
    if (this.trailWorld !== world) {
      this.trails.clear();
      this.trailWorld = world;
      this.trailTick = -1;
    }
    if (world.tick !== this.trailTick) {
      this.trailTick = world.tick;
      for (const a of world.actors) {
        if (a.kind !== 'echo') continue;
        let t = this.trails.get(a);
        if (!t) this.trails.set(a, (t = []));
        t.push([a.x, a.y]);
        if (t.length > TRAIL_LEN) t.shift();
      }
    }

    for (const a of world.actors) {
      const x = Math.round((a.prevX + (a.x - a.prevX) * alpha) / SUB);
      const y = Math.round((a.prevY + (a.y - a.prevY) * alpha) / SUB);
      if (a.kind === 'echo') {
        const tint = ECHO_TINTS[(a.attempt - 1) % ECHO_TINTS.length];
        const trail = this.trails.get(a) ?? [];
        trail.forEach(([tx, ty], i) => {
          ctx.globalAlpha = 0.04 + (0.16 * i) / TRAIL_LEN;
          drawSilhouette(ctx, Math.round(tx / SUB), Math.round(ty / SUB), a, tint, world.tick);
        });
        ctx.globalAlpha = a.finished ? 0.35 : 0.6;
        drawSilhouette(ctx, x, y, a, tint, world.tick);
        ctx.globalAlpha = 1;
      } else {
        drawSilhouette(ctx, x, y, a, PALETTE.silhouette, world.tick);
      }
    }
  }

  // --- Interface -----------------------------------------------------------

  drawHud(session) {
    const ctx = this.ctx;
    // Chrono : une barre qui se vide.
    const left = session.ticksLeft;
    const barX = 4, barY = 4, barW = VIEW_W - 8, barH = 4;
    ctx.fillStyle = PALETTE.nightHigh;
    ctx.fillRect(barX, barY, barW, barH);
    if (left != null) {
      const fill = Math.ceil((barW * left) / session.level.duration);
      const urgent = left < 3 * TPS && ((left >> 3) & 1);
      ctx.fillStyle = urgent ? PALETTE.lampSoft : PALETTE.lamp;
      ctx.fillRect(barX, barY, fill, barH);
    }

    ctx.font = '8px monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'left';
    ctx.fillText(`ESSAI ${session.attemptCount}`, 4, 12);
    ctx.textAlign = 'right';
    const echoes = session.world.actors.length - 1;
    ctx.fillText(`ÉCHOS ${echoes}/${MAX_ECHOES}`, VIEW_W - 4, 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(session.level.name, VIEW_W / 2, 12);
  }

  drawNarration(session) {
    const t = session.levelTick;
    const text = session.level.narration;
    if (!text || t >= NARRATION_TICKS) return;
    const a = Math.min(1, t / NARRATION_FADE, (NARRATION_TICKS - t) / NARRATION_FADE);
    const ctx = this.ctx;
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(text, VIEW_W / 2, VIEW_H - 12, VIEW_W - 8);
    ctx.globalAlpha = 1;
  }

  drawOverlay({ title, hint }) {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = PALETTE.nightDeep;
    ctx.fillRect(0, LEVEL_Y, VIEW_W, GRID_H * TILE);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '8px monospace';
    ctx.fillStyle = PALETTE.lampSoft;
    ctx.fillText(title, VIEW_W / 2, VIEW_H / 2 - 8);
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(hint, VIEW_W / 2, VIEW_H / 2 + 8, VIEW_W - 8);
  }
}

/**
 * Silhouette provisoire : tête ronde, corps, jambes qui alternent en marchant.
 * (x, y) = coin haut-gauche de la boîte de collision, en pixels.
 */
function drawSilhouette(ctx, x, y, a, color, tick) {
  ctx.fillStyle = color;
  const w = a.w / SUB, h = a.h / SUB;
  // Tête.
  ctx.fillRect(x + 3, y, 4, 1);
  ctx.fillRect(x + 2, y + 1, 6, 5);
  ctx.fillRect(x + 3, y + 6, 4, 1);
  // Corps.
  ctx.fillRect(x + 1, y + 7, w - 2, 9);
  // Jambes.
  const walking = a.onGround && a.vx !== 0;
  const step = walking ? (tick >> 3) & 1 : 0;
  const airborne = !a.onGround;
  if (airborne) {
    ctx.fillRect(x + 2, y + 16, 3, 4);
    ctx.fillRect(x + 6, y + 16, 3, 5);
  } else {
    ctx.fillRect(x + 2, y + 16, 3, h - 16 - step);
    ctx.fillRect(x + 5 + (a.facing > 0 ? 1 : 0), y + 16, 3, h - 16 - (1 - step) * (walking ? 1 : 0));
  }
}

/** Éléments de décor (sans effet sur la simulation). */
function drawDecor(ctx, d) {
  const x = d.col * TILE, y = d.row * TILE;
  if (d.type === 'bench') {
    // Banc posé sur le sol de la case (row = case où il se trouve).
    ctx.fillStyle = PALETTE.wood;
    ctx.fillRect(x - 6, y + 8, 28, 2);
    ctx.fillRect(x - 6, y + 3, 28, 2);
    ctx.fillStyle = PALETTE.doorDark;
    ctx.fillRect(x - 4, y + 10, 2, 6);
    ctx.fillRect(x + 18, y + 10, 2, 6);
    ctx.fillRect(x - 4, y + 5, 1, 3);
    ctx.fillRect(x + 19, y + 5, 1, 3);
  } else if (d.type === 'lamp') {
    // Réverbère : halo chaud en anneaux, mât jusqu'au sol.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = PALETTE.lamp;
    ctx.fillRect(x - 10, y - 6, 36, 28);
    ctx.globalAlpha = 0.18;
    ctx.fillRect(x - 4, y - 2, 24, 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.lampSoft;
    ctx.fillRect(x + 5, y + 2, 6, 4);
    ctx.fillStyle = PALETTE.brickDark;
    ctx.fillRect(x + 4, y, 8, 2);
    ctx.fillRect(x + 7, y + 6, 2, 200);
  } else if (d.type === 'clock') {
    ctx.fillStyle = PALETTE.poster;
    ctx.fillRect(x + 2, y, 12, 12);
    ctx.fillRect(x, y + 2, 16, 8);
    ctx.fillStyle = PALETTE.doorDark;
    ctx.fillRect(x + 7, y + 2, 2, 5);
    ctx.fillRect(x + 7, y + 6, 4, 1);
  }
}
