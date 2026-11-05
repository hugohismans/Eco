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
    const touch = this.input.usedTouch;
    if (this.mode === 'won') {
      overlay = { title: 'La porte s\u2019ouvre.', hint: touch ? 'Touchez pour continuer' : 'Espace pour continuer' };
    } else if (this.mode === 'end') {
      // Dernier niveau : la phrase de la fin choisie (monter, ou rester).
      const endings = this.session.level.endings;
      const title = endings?.[this.session.outcome] ?? 'Fin. Merci !';
      overlay = { title, hint: touch ? 'Touchez pour revenir' : 'Espace pour revenir' };
    }
    // Après la réussite : la lumière de la porte envahit doucement l'écran.
    const fade = overlay ? Math.min(0.55, this.modeTicks / 50) : 0;
    this.renderer.draw(this.session, this.mode === 'playing' ? alpha : 1, {
      overlay,
      overlayTicks: this.modeTicks,
      fade,
    });
  }
}
