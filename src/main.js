// Point d'entrée : monte la page, branche les entrées et lance la boucle.

import '@fontsource/press-start-2p/latin.css';
import { Input } from './core/input.js';
import { startLoop } from './core/loop.js';
import { Renderer } from './render/renderer.js';
import { computeView, fitCanvas, view } from './render/screen.js';
import { Game } from './game.js';
import { LEVELS } from './levels/index.js';
import { Sound } from './audio/sound.js';
import { Save } from './core/save.js';
import { Menus } from './ui/menus.js';

const $ = (id) => document.getElementById(id);
const canvas = $('screen');

// --- Entrées -------------------------------------------------------------
const input = new Input();
input.attachKeyboard();
input.attachTouch({
  zone: $('stick-zone'),
  base: $('stick-base'),
  knob: $('stick-knob'),
  jump: $('btn-jump'),
  dash: $('btn-dash'),
  grab: $('btn-grab'),
});

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
bindCommand($('btn-menu'), 'menu');

// --- Son et sauvegarde ------------------------------------------------------
const save = new Save();
const sound = new Sound();
sound.setMuted(save.muted);
// Le navigateur n'autorise le son qu'après un geste.
const unlock = () => sound.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// --- Menus -----------------------------------------------------------------------
const menus = new Menus($('overlay'), {
  sound,
  onOpen: (open) => {
    input.setMenuOpen(open);
    document.body.classList.toggle('menu', open);
  },
});

// --- Mise en page --------------------------------------------------------
const coarse = window.matchMedia('(pointer: coarse)');
function setTouch(on) {
  document.body.classList.toggle('touch', on);
  layout();
}

/** Hauteur de l'encoche en haut de l'écran (px CSS). */
function safeTop() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden';
  document.body.append(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

/** L'image remplit l'écran ; en tactile, la pièce laisse la place aux commandes. */
function layout() {
  const touch = document.body.classList.contains('touch');
  const vv = window.visualViewport;
  const w = vv ? vv.width : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const portrait = h > w;
  computeView(w, h, { dpr, safeTop: safeTop(), controls: touch && portrait ? 210 : 0 });
  fitCanvas(canvas, dpr);
  // Les écrans d'interface sont dessinés en « pixels du jeu ».
  $('frame').style.setProperty('--px', `${view.scale / dpr}px`);
  renderer?.resize(view.scale, renderer.quality, view);
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
    renderer.resize(renderer.scale, quality, view);
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
window.addEventListener('orientationchange', () => setTimeout(layout, 200));
window.visualViewport?.addEventListener('resize', layout);

// --- Jeu -----------------------------------------------------------------
// La police pixel doit être chargée avant de peindre le moindre texte.
await document.fonts.load('8px "Press Start 2P"', 'ÉCHO éà').catch(() => {});
renderer = new Renderer(canvas);
renderer.quality = quality;
layout();
const game = new Game({ levels: LEVELS, input, renderer, sound, save, menus });

// Accès direct à un niveau (tests) : …/Eco/#niveau=2 ; sinon, l'écran titre.
const m = location.hash.match(/niveau=(\d+)/);
if (m) game.play(Number(m[1]) - 1);
else game.showTitle();

// On quitte l'onglet en pleine partie : pause.
document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });
window.addEventListener('blur', () => game.pause());

startLoop({
  tick: () => game.tick(),
  render: (alpha) => {
    game.render(alpha);
    watchPerformance(performance.now());
  },
});
