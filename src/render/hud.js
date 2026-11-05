// Interface dessinée dans le jeu, en police pixel : chrono, essais, échos,
// nom de la pièce, narration, messages. Calque transparent à la résolution
// interne, posé en dernier, au-dessus de l'éclairage (il reste toujours lisible).

import { MAX_ECHOES, TPS } from '../sim/constants.js';
import { C, ECHO_TINTS } from './palette.js';
import { rect, px, checker, sparse, textSprite, wrapText, GLYPH } from './pixel.js';
import { VIEW_W, VIEW_H } from './screen.js';

/** Durée de la narration (ticks) : apparition lettre à lettre, tenue, fondu. */
const NARRATION_START = 20;
const NARRATION_TYPE = 2; // ticks par lettre
const NARRATION_HOLD = 3.5 * TPS;
const NARRATION_FADE = 40;
const NAME_TICKS = 3 * TPS;

/** Petit pictogramme d'écho (tête et épaules), 7 × 8. */
const ICON = [
  '..###..',
  '.#####.',
  '.#####.',
  '..###..',
  '.#####.',
  '#######',
  '#######',
  '#######',
];

export function drawHud(ctx, session, ui) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  // Voile du bandeau haut, tramé.
  rect(ctx, 0, 0, VIEW_W, 16, 'rgba(5,6,15,0.55)');
  checker(ctx, 0, 16, VIEW_W, 3, 'rgba(5,6,15,0.55)');
  sparse(ctx, 0, 19, VIEW_W, 4, 'rgba(5,6,15,0.55)');

  // Chrono : une mèche qui se consume.
  const left = session.ticksLeft;
  if (left != null) {
    const x0 = 6, y0 = 3, w = VIEW_W - 12;
    rect(ctx, x0, y0, w, 2, C.night2);
    const fill = Math.ceil((w * left) / session.level.duration);
    const urgent = left < 3 * TPS;
    const blink = urgent && ((left >> 3) & 1);
    rect(ctx, x0, y0, fill, 2, blink ? C.lamp3 : C.lamp1);
    rect(ctx, x0, y0, fill, 1, blink ? C.lamp4 : C.lamp2);
    if (fill > 0) {
      rect(ctx, x0 + fill - 2, y0 - 1, 2, 4, C.lamp4);
      px(ctx, x0 + fill, y0, C.lamp3);
    }
  }

  // Tentatives.
  ctx.drawImage(textSprite(`ESSAI ${session.attemptCount}`, C.paper3), 6, 8);

  // Échos : quatre emplacements, teintés selon la tentative rejouée.
  const echoes = session.world.actors.filter((a) => a.kind === 'echo');
  for (let i = 0; i < MAX_ECHOES; i++) {
    const x = VIEW_W - 6 - (MAX_ECHOES - i) * 10 + 2;
    const y = 8;
    const e = echoes[i];
    const col = e ? ECHO_TINTS[(e.attempt - 1) % ECHO_TINTS.length] : C.night4;
    for (let r = 0; r < ICON.length; r++) {
      for (let c = 0; c < ICON[r].length; c++) {
        if (ICON[r][c] !== '#') continue;
        // Emplacement vide : seulement le contour.
        const edge = r === 0 || r === ICON.length - 1 || ICON[r][c - 1] !== '#' || ICON[r][c + 1] !== '#' || ICON[r - 1]?.[c] !== '#';
        if (e || edge) px(ctx, x + c, y + r, col);
      }
    }
  }

  // Nom de la pièce, au début du niveau.
  const t = session.levelTick;
  if (t < NAME_TICKS) {
    const a = Math.min(1, t / 20, (NAME_TICKS - t) / 30);
    ctx.globalAlpha = Math.max(0, a);
    const name = session.level.name.toUpperCase();
    const s = textSprite(name, C.lamp3);
    ctx.drawImage(s, Math.round((VIEW_W - s.width) / 2), 30);
    ctx.globalAlpha = 1;
  }

  drawNarration(ctx, session.level.narration, t);
  if (ui.overlay) drawOverlay(ctx, ui.overlay, ui.overlayTicks ?? 999);
}

/** La phrase du niveau : écrite lettre à lettre en bas de l'écran, puis fondue. */
function drawNarration(ctx, text, t) {
  if (!text) return;
  const lines = wrapText(text, 26);
  const total = lines.reduce((n, l) => n + l.length, 0);
  const typed = Math.floor((t - NARRATION_START) / NARRATION_TYPE);
  const end = NARRATION_START + total * NARRATION_TYPE + NARRATION_HOLD;
  if (typed <= 0 || t > end + NARRATION_FADE) return;
  const fade = t > end ? 1 - (t - end) / NARRATION_FADE : 1;

  // Voile tramé derrière le texte.
  const boxH = lines.length * 11 + 6;
  const y0 = VIEW_H - boxH - 2;
  ctx.globalAlpha = fade;
  checker(ctx, 0, y0 - 3, VIEW_W, 3, 'rgba(5,6,15,0.6)');
  rect(ctx, 0, y0, VIEW_W, VIEW_H - y0, 'rgba(5,6,15,0.6)');

  let shown = typed;
  lines.forEach((line, i) => {
    const n = Math.max(0, Math.min(line.length, shown));
    shown -= line.length;
    if (n === 0) return;
    const s = textSprite(line, C.paper3);
    const x = Math.round((VIEW_W - line.length * GLYPH) / 2);
    const y = y0 + 4 + i * 11;
    ctx.drawImage(s, 0, 0, n * GLYPH + 1, s.height, x, y, n * GLYPH + 1, s.height);
  });
  ctx.globalAlpha = 1;
}

function drawOverlay(ctx, { title, hint }, ticks) {
  const a = Math.min(1, ticks / 30);
  ctx.globalAlpha = a;
  const lines = wrapText(title, 26);
  const y = Math.round(VIEW_H / 2 - lines.length * 6 - 8);
  lines.forEach((l, i) => {
    const s = textSprite(l, C.lamp4);
    ctx.drawImage(s, Math.round((VIEW_W - s.width) / 2), y + i * 12);
  });
  if (ticks > 40 && ((ticks >> 5) & 1) === 0) {
    const s = textSprite(hint, C.paper2);
    ctx.drawImage(s, Math.round((VIEW_W - s.width) / 2), y + lines.length * 12 + 14);
  }
  ctx.globalAlpha = 1;
}
