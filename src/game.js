// Chef d'orchestre : relie entrées, session de niveau et rendu.
//
// Il reçoit les ticks de la boucle à pas fixe, applique les commandes
// (« Rejouer », « Recommencer ») toujours entre deux ticks, puis fait avancer
// la session. La simulation, elle, ne sait rien de tout cela.

import { parseLevel } from './sim/level.js';
import { Session } from './sim/session.js';

/** Délai avant d'accepter « continuer » après une réussite (ticks). */
const WON_DELAY = 30;

export class Game {
  /**
   * @param {{ levels: object[], input: import('./core/input.js').Input,
   *           renderer: import('./render/renderer.js').Renderer }} deps
   */
  constructor({ levels, input, renderer }) {
    this.levels = levels.map(parseLevel);
    this.input = input;
    this.renderer = renderer;
    this.mode = 'playing'; // 'playing' | 'won' | 'end'
    this.modeTicks = 0;
    this.load(0);
  }

  load(index) {
    this.index = Math.max(0, Math.min(index, this.levels.length - 1));
    this.session = new Session(this.levels[this.index]);
    this.mode = 'playing';
    this.modeTicks = 0;
  }

  /** Un pas de simulation (appelé 60 fois par seconde). */
  tick() {
    const commands = this.input.takeCommands();
    const bits = this.input.sample();
    this.modeTicks++;

    if (this.mode === 'playing') {
      for (const c of commands) {
        if (c === 'replay') this.session.replay();
        else if (c === 'restart') this.session.restart();
      }
      this.session.step(bits);
      if (this.session.state === 'won') {
        this.mode = this.index === this.levels.length - 1 ? 'end' : 'won';
        this.modeTicks = 0;
      }
    } else if (this.modeTicks > WON_DELAY && commands.includes('confirm')) {
      this.load(this.mode === 'end' ? 0 : this.index + 1);
    }
  }

  render(alpha) {
    let overlay = null;
    const hint = this.input.usedTouch ? 'Touchez pour continuer' : 'Espace pour continuer';
    if (this.mode === 'won') overlay = { title: 'La porte s’ouvre.', hint };
    else if (this.mode === 'end') overlay = { title: 'Fin de la phase 1. Merci !', hint: this.input.usedTouch ? 'Touchez pour recommencer' : 'Espace pour recommencer' };
    // En pause d'écran de réussite, on n'interpole plus.
    this.renderer.draw(this.session, this.mode === 'playing' ? alpha : 1, { overlay });
  }
}
