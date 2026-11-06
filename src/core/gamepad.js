// Manettes (API Gamepad), disposition « standard » (Xbox, PlayStation, Switch Pro…).
//
//   Stick gauche ou croix : se déplacer, viser le dash, grimper
//   A (croix)            : sauter
//   X (carré) ou B (rond) : dash
//   Gâchettes ou bumpers  : s'agripper
//   Y (triangle)          : rejouer        Select / Share : effacer les échos
//   Start / Options       : menu
// Dans les menus : stick ou croix pour choisir, A pour valider, B ou Start pour revenir.
//
// La manette est lue une fois par tick, comme le reste des entrées : la
// simulation ne voit toujours qu'un octet par tick.

import { IN_LEFT, IN_RIGHT, IN_JUMP, IN_UP, IN_DOWN, IN_DASH, IN_GRAB } from '../sim/constants.js';

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const STICK_DEAD = 0.4;
/** Répétition dans les menus quand on garde une direction (ticks). */
const REPEAT_FIRST = 22;
const REPEAT_NEXT = 8;

const pressed = (pad, i) => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.4);

export class Gamepads {
  constructor() {
    this.prev = new Set();
    this.navHeld = null;
    this.navTicks = 0;
    this.connected = false;
    this.onChange = () => {};
    window.addEventListener('gamepadconnected', () => this.refresh());
    window.addEventListener('gamepaddisconnected', () => this.refresh());
  }

  refresh() {
    const was = this.connected;
    this.connected = this.pads().length > 0;
    if (was !== this.connected) this.onChange(this.connected);
  }

  pads() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    return [...list].filter((p) => p && p.connected);
  }

  /**
   * Lecture d'un tick.
   * @returns {{ bits: number, edges: Set<string>, nav: string|null }}
   *   bits : commandes tenues (jeu) ; edges : boutons venant d'être pressés ;
   *   nav : direction de menu (avec répétition) ou null.
   */
  poll() {
    const held = new Set();
    let bits = 0;
    let dir = null;
    for (const pad of this.pads()) {
      // Stick gauche, en huit secteurs, et croix directionnelle.
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > STICK_DEAD) {
        const sector = Math.round(Math.atan2(ay, ax) / (Math.PI / 4));
        const dirs = {
          0: IN_RIGHT, 1: IN_RIGHT | IN_DOWN, 2: IN_DOWN, 3: IN_LEFT | IN_DOWN,
          4: IN_LEFT, '-4': IN_LEFT, '-3': IN_LEFT | IN_UP, '-2': IN_UP, '-1': IN_RIGHT | IN_UP,
        };
        bits |= dirs[sector] ?? 0;
      }
      if (pressed(pad, B.LEFT)) bits |= IN_LEFT;
      if (pressed(pad, B.RIGHT)) bits |= IN_RIGHT;
      if (pressed(pad, B.UP)) bits |= IN_UP;
      if (pressed(pad, B.DOWN)) bits |= IN_DOWN;
      if (pressed(pad, B.A)) bits |= IN_JUMP;
      if (pressed(pad, B.X) || pressed(pad, B.B)) bits |= IN_DASH;
      if ([B.LB, B.RB, B.LT, B.RT].some((i) => pressed(pad, i))) bits |= IN_GRAB;
      for (const [name, i] of Object.entries(B)) if (pressed(pad, i)) held.add(name);
    }
    if (bits & IN_UP) dir = 'up';
    else if (bits & IN_DOWN) dir = 'down';
    else if (bits & IN_LEFT) dir = 'left';
    else if (bits & IN_RIGHT) dir = 'right';

    const edges = new Set([...held].filter((n) => !this.prev.has(n)));
    this.prev = held;
    if (held.size > 0 && !this.connected) this.refresh();

    // Navigation de menu : un pas tout de suite, puis répétition si l'on insiste.
    let nav = null;
    if (dir !== this.navHeld) {
      this.navHeld = dir;
      this.navTicks = 0;
      nav = dir;
    } else if (dir) {
      this.navTicks++;
      if (this.navTicks >= REPEAT_FIRST && (this.navTicks - REPEAT_FIRST) % REPEAT_NEXT === 0) nav = dir;
    }
    return { bits, edges, nav };
  }

  /** Petite vibration (si la manette le permet). */
  rumble(ms = 120, strong = 0.6, weak = 0.3) {
    for (const pad of this.pads()) {
      pad.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })
        ?.catch?.(() => {});
    }
  }
}
