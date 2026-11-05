// Point d'entrée : monte la page, branche les entrées et lance la boucle.

import '@fontsource/press-start-2p/latin.css';
import { Input } from './core/input.js';
import { startLoop } from './core/loop.js';
import { Renderer } from './render/renderer.js';
import { fitCanvas } from './render/screen.js';
import { Game } from './game.js';
import { LEVELS } from './levels/index.js';

const $ = (id) => document.getElementById(id);
const canvas = $('screen');

// --- Entrées -------------------------------------------------------------
const input = new Input();
input.attachKeyboard();
input.attachTouch($('stick-zone'), $('stick-base'), $('stick-knob'), $('btn-jump'));

const bindCommand = (el, name) => {
  // pointerdown plutôt que click : réaction immédiate, et le bouton ne prend
  // jamais le focus (l'espace ne le « recliquerait » pas).
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.command(name);
  });
};
bindCommand($('btn-replay'), 'replay');
bindCommand($('btn-restart'), 'restart');
canvas.addEventListener('pointerdown', () => input.command('confirm'));

// --- Mise en page --------------------------------------------------------
const coarse = window.matchMedia('(pointer: coarse)');
function setTouch(on) {
  document.body.classList.toggle('touch', on);
  layout();
}

function layout() {
  const touch = document.body.classList.contains('touch');
  const bar = 44;
  const below = touch ? 150 : 28; // commandes tactiles, ou ligne d'aide clavier
  const w = window.innerWidth;
  const h = window.innerHeight - bar - below - 8;
  const scale = fitCanvas(canvas, w, h);
  if (renderer && renderer.scale !== scale) renderer.resize(scale);
}

// Qualité : forcée par l'adresse (?qualite=basse|haute), sinon adaptative.
const forced = new URLSearchParams(location.search).get('qualite');
let quality = forced === 'basse' ? 'low' : 'high';
const frameTimes = [];
let lastFrame = 0;
/** Si l'appareil ne tient pas ~45 images/s, on passe en qualité basse. */
function watchPerformance(now) {
  if (forced || quality === 'low') return;
  if (lastFrame) frameTimes.push(now - lastFrame);
  lastFrame = now;
  if (frameTimes.length < 90) return;
  const sorted = [...frameTimes].sort((a, b) => a - b);
  frameTimes.length = 0;
  if (sorted[sorted.length >> 1] > 22) {
    quality = 'low';
    renderer.resize(renderer.scale, quality);
  }
}
document.addEventListener('visibilitychange', () => { frameTimes.length = 0; lastFrame = 0; });

let renderer = null;
setTouch(coarse.matches);
coarse.addEventListener?.('change', (e) => setTouch(e.matches));
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && !document.body.classList.contains('touch')) setTouch(true);
});
window.addEventListener('resize', layout);
window.visualViewport?.addEventListener('resize', layout);

// --- Jeu -----------------------------------------------------------------
// La police pixel doit être chargée avant de peindre le moindre texte.
await document.fonts.load('8px "Press Start 2P"', 'ÉCHO éà').catch(() => {});
renderer = new Renderer(canvas);
renderer.resize(1, quality);
layout();
const game = new Game({ levels: LEVELS, input, renderer });

// Accès direct à un niveau pour tester : …/Eco/#niveau=2
const m = location.hash.match(/niveau=(\d+)/);
if (m) game.load(Number(m[1]) - 1);

startLoop({
  tick: () => game.tick(),
  render: (alpha) => {
    game.render(alpha);
    watchPerformance(performance.now());
  },
});
