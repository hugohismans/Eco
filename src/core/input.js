// Entrées : clavier et écran tactile.
//
// Clavier (comme les jeux de plateforme de précision) :
//   flèches ou WASD/ZQSD : se déplacer, viser (dash), grimper
//   C, Espace ou K : sauter      X ou J : dash      Z, Maj ou L : s'agripper
//   E (ou Bas) : interagir      R : rejouer      Retour arrière : effacer les échos
//   Échap ou P : menu
// Tactile : joystick flottant à gauche (8 directions), boutons à droite.
//
// La simulation ne voit qu'un octet par tick. `sample()` le compose à partir
// des touches tenues ET des appuis survenus depuis le dernier tick : un tap
// très bref, relâché entre deux ticks, n'est donc jamais perdu.

import {
  IN_LEFT, IN_RIGHT, IN_JUMP, IN_ACT, IN_UP, IN_DOWN, IN_DASH, IN_GRAB,
} from '../sim/constants.js';

// e.code désigne la position physique : KeyA/KeyW/KeyD/KeyS couvrent aussi
// bien WASD (QWERTY) que ZQSD (AZERTY).
const KEY_BITS = {
  ArrowLeft: IN_LEFT, KeyA: IN_LEFT,
  ArrowRight: IN_RIGHT, KeyD: IN_RIGHT,
  ArrowUp: IN_UP, KeyW: IN_UP,
  ArrowDown: IN_DOWN, KeyS: IN_DOWN,
  Space: IN_JUMP, KeyC: IN_JUMP, KeyK: IN_JUMP,
  KeyX: IN_DASH, KeyJ: IN_DASH,
  KeyZ: IN_GRAB, ShiftLeft: IN_GRAB, ShiftRight: IN_GRAB, KeyL: IN_GRAB,
  KeyE: IN_ACT,
};

const KEY_COMMANDS = {
  KeyR: 'replay',
  Backspace: 'restart',
  Delete: 'restart',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Escape: 'menu',
  KeyP: 'menu',
};

/** Rayon du joystick (px CSS) et part du rayon sous laquelle on ne bouge pas. */
const STICK_RADIUS = 40;
const STICK_DEAD = 0.3;

export class Input {
  constructor() {
    this.keys = new Set();
    /** Bits appuyés depuis le dernier tick (même s'ils sont déjà relâchés). */
    this.latched = 0;
    this.touchBits = 0;
    this.commands = [];
    /** Vrai dès qu'un doigt a touché l'écran. */
    this.usedTouch = false;
    /** Quand un menu est ouvert, le clavier sert au menu, pas au jeu. */
    this.menuOpen = false;
  }

  /** Ouvre ou ferme la parenthèse « menu » : on relâche tout. */
  setMenuOpen(open) {
    this.menuOpen = open;
    this.releaseTouch?.();
    this.keys.clear();
    this.latched = 0;
    this.touchBits = 0;
    this.commands = [];
  }

  /** Octet d'entrée du tick courant. */
  sample() {
    let bits = this.touchBits | this.latched;
    for (const code of this.keys) bits |= KEY_BITS[code] ?? 0;
    this.latched = 0;
    return bits;
  }

  /** Commandes (rejouer, effacer, menu, confirmer) depuis le dernier appel. */
  takeCommands() {
    const out = this.commands;
    this.commands = [];
    return out;
  }

  command(name) {
    this.commands.push(name);
  }

  attachKeyboard(target = window) {
    target.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.menuOpen) return;
      const bit = KEY_BITS[e.code];
      const cmd = KEY_COMMANDS[e.code];
      if (bit !== undefined) {
        if (!e.repeat) this.latched |= bit;
        this.keys.add(e.code);
        e.preventDefault();
      } else if (cmd) {
        if (!e.repeat) this.commands.push(cmd);
        e.preventDefault();
      }
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Fenêtre quittée : on relâche tout pour ne pas courir indéfiniment.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchBits = 0;
    });
  }

  /**
   * Commandes tactiles, posées en transparence sur le jeu.
   * Joystick « flottant » : il apparaît là où le pouce se pose dans sa zone.
   * @param {{ zone: HTMLElement, base: HTMLElement, knob: HTMLElement,
   *           jump: HTMLElement, dash: HTMLElement, grab: HTMLElement }} el
   */
  attachTouch({ zone, base, knob, jump, dash, grab }) {
    let stickId = null;
    let ox = 0, oy = 0;
    let stickBits = 0;
    const held = new Map(); // bit -> { el, ids: Set }
    const update = () => {
      let b = stickBits;
      for (const [bit, h] of held) if (h.ids.size > 0) b |= bit;
      this.touchBits = b;
    };

    const moveStick = (e) => {
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const prev = stickBits;
      stickBits = 0;
      if (len > STICK_RADIUS * STICK_DEAD) {
        // Huit secteurs de 45° : une diagonale quand l'angle s'y prête.
        const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
        const dirs = {
          0: IN_RIGHT, 1: IN_RIGHT | IN_DOWN, 2: IN_DOWN, 3: IN_LEFT | IN_DOWN,
          4: IN_LEFT, '-4': IN_LEFT, '-3': IN_LEFT | IN_UP, '-2': IN_UP, '-1': IN_RIGHT | IN_UP,
        };
        stickBits = dirs[sector] ?? 0;
      }
      this.latched |= stickBits & ~prev;
      update();
    };

    const releaseStick = () => {
      stickId = null;
      stickBits = 0;
      knob.style.transform = '';
      base.classList.remove('active');
      update();
    };

    zone.addEventListener('pointerdown', (e) => {
      // Un nouveau doigt reprend toujours le joystick : si l'ancien a été
      // « perdu » (geste système, rotation…), il ne bloque plus rien.
      this.usedTouch = true;
      stickId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch { /* déjà relâché */ }
      const r = zone.getBoundingClientRect();
      ox = e.clientX;
      oy = e.clientY;
      base.style.left = `${ox - r.left}px`;
      base.style.top = `${oy - r.top}px`;
      base.classList.add('active');
      moveStick(e);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      // Plus aucun doigt posé alors qu'on croyait en tenir un : on lâche.
      if (e.pointerType !== 'mouse' && e.buttons === 0 && e.pressure === 0) { releaseStick(); return; }
      moveStick(e);
    });

    const bindButton = (el, bit) => {
      if (!el) return;
      const h = { el, ids: new Set() };
      held.set(bit, h);
      el.addEventListener('pointerdown', (e) => {
        this.usedTouch = true;
        h.ids.add(e.pointerId);
        try { el.setPointerCapture(e.pointerId); } catch { /* déjà relâché */ }
        el.classList.add('pressed');
        this.latched |= bit;
        update();
        e.preventDefault();
      });
    };
    bindButton(jump, IN_JUMP);
    bindButton(dash, IN_DASH);
    bindButton(grab, IN_GRAB);

    // Fin d'un doigt, d'où qu'elle vienne : relâché, annulé, capture perdue.
    // Écoutée sur toute la fenêtre pour ne jamais en manquer une.
    const endPointer = (e) => {
      if (e.pointerId === stickId) releaseStick();
      for (const h of held.values()) {
        if (h.ids.delete(e.pointerId) && h.ids.size === 0) h.el.classList.remove('pressed');
      }
      update();
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      window.addEventListener(type, endPointer, true);
    }
    // Plus aucun doigt sur l'écran : tout est relâché, quoi qu'on ait cru.
    window.addEventListener('touchend', (e) => { if (e.touches.length === 0) this.releaseTouch(); }, true);
    window.addEventListener('touchcancel', () => this.releaseTouch(), true);

    /** Relâche toutes les commandes tactiles (menu, onglet quitté, rotation). */
    this.releaseTouch = () => {
      releaseStick();
      for (const h of held.values()) { h.ids.clear(); h.el.classList.remove('pressed'); }
      update();
    };
    window.addEventListener('blur', this.releaseTouch);
    document.addEventListener('visibilitychange', this.releaseTouch);
    window.addEventListener('orientationchange', this.releaseTouch);
  }
}
