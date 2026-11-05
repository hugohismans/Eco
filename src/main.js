// Point d'entrée : monte la page, branche les entrées et lance la boucle.

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
  fitCanvas(canvas, w, h);
}

setTouch(coarse.matches);
coarse.addEventListener?.('change', (e) => setTouch(e.matches));
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && !document.body.classList.contains('touch')) setTouch(true);
});
window.addEventListener('resize', layout);
window.visualViewport?.addEventListener('resize', layout);

// --- Jeu -----------------------------------------------------------------
const renderer = new Renderer(canvas);
const game = new Game({ levels: LEVELS, input, renderer });

// Accès direct à un niveau pour tester : …/Eco/#niveau=2
const m = location.hash.match(/niveau=(\d+)/);
if (m) game.load(Number(m[1]) - 1);

startLoop({
  tick: () => game.tick(),
  render: (alpha) => game.render(alpha),
});
