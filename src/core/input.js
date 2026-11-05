// Entrées : clavier (flèches, WASD/ZQSD, espace) et écran tactile (joystick
// virtuel à gauche, bouton de saut à droite).
//
// La simulation ne voit qu'un octet par tick. `sample()` le compose à partir
// des touches tenues ET des appuis survenus depuis le dernier tick : un tap
// très bref, relâché entre deux ticks, n'est donc jamais perdu.

import { IN_LEFT, IN_RIGHT, IN_JUMP, IN_ACT } from '../sim/constants.js';

// e.code désigne la position physique : KeyA/KeyW/KeyD/KeyS couvrent aussi
// bien WASD (QWERTY) que ZQSD (AZERTY).
const KEY_BITS = {
  ArrowLeft: IN_LEFT, KeyA: IN_LEFT,
  ArrowRight: IN_RIGHT, KeyD: IN_RIGHT,
  ArrowUp: IN_JUMP, KeyW: IN_JUMP, Space: IN_JUMP,
  ArrowDown: IN_ACT, KeyS: IN_ACT, KeyE: IN_ACT,
};

const KEY_COMMANDS = {
  KeyR: 'replay',
  Backspace: 'restart',
  Delete: 'restart',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
};

/** Distance (px CSS) au-delà de laquelle le joystick donne une direction. */
const STICK_DEAD = 10;
const STICK_RADIUS = 38;

export class Input {
  constructor() {
    this.keys = new Set();
    /** Bits appuyés depuis le dernier tick (même s'ils sont déjà relâchés). */
    this.latched = 0;
    this.touchBits = 0;
    this.commands = [];
    /** Vrai dès qu'un doigt a touché l'écran. */
    this.usedTouch = false;
  }

  /** Octet d'entrée du tick courant. */
  sample() {
    let bits = this.touchBits | this.latched;
    for (const code of this.keys) bits |= KEY_BITS[code] ?? 0;
    this.latched = 0;
    // Gauche + droite ensemble s'annulent dans la simulation : rien à faire ici.
    return bits;
  }

  /** Commandes (rejouer, recommencer, confirmer) depuis le dernier appel. */
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
      const bit = KEY_BITS[e.code];
      const cmd = KEY_COMMANDS[e.code];
      if (bit !== undefined) {
        if (!e.repeat) this.latched |= bit;
        this.keys.add(e.code);
        if (bit === IN_JUMP) this.commands.push('confirm');
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
   * Joystick « flottant » : il apparaît là où le pouce se pose dans la zone.
   * @param {HTMLElement} zone zone de capture (moitié gauche)
   * @param {HTMLElement} base cercle de base
   * @param {HTMLElement} knob pastille mobile
   * @param {HTMLElement} jumpBtn bouton de saut
   */
  attachTouch(zone, base, knob, jumpBtn) {
    let stickId = null;
    let ox = 0, oy = 0;
    let stickBits = 0;
    const jumpIds = new Set();

    const update = () => {
      this.touchBits = stickBits | (jumpIds.size > 0 ? IN_JUMP : 0);
    };

    const moveStick = (e) => {
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const prev = stickBits;
      stickBits = 0;
      if (dx < -STICK_DEAD) stickBits |= IN_LEFT;
      if (dx > STICK_DEAD) stickBits |= IN_RIGHT;
      // Vers le bas, franchement : interaction.
      if (dy > STICK_RADIUS * 0.7 && Math.abs(dx) < STICK_RADIUS * 0.6) stickBits |= IN_ACT;
      this.latched |= stickBits & ~prev;
      update();
    };

    zone.addEventListener('pointerdown', (e) => {
      if (stickId !== null) return;
      this.usedTouch = true;
      stickId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
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
      if (e.pointerId === stickId) moveStick(e);
    });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      stickBits = 0;
      knob.style.transform = '';
      base.classList.remove('active');
      update();
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);

    jumpBtn.addEventListener('pointerdown', (e) => {
      this.usedTouch = true;
      jumpIds.add(e.pointerId);
      jumpBtn.setPointerCapture(e.pointerId);
      jumpBtn.classList.add('pressed');
      this.latched |= IN_JUMP;
      this.commands.push('confirm');
      update();
      e.preventDefault();
    });
    const endJump = (e) => {
      jumpIds.delete(e.pointerId);
      if (jumpIds.size === 0) jumpBtn.classList.remove('pressed');
      update();
    };
    jumpBtn.addEventListener('pointerup', endJump);
    jumpBtn.addEventListener('pointercancel', endJump);
  }
}
