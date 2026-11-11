// Une session de niveau : la suite des tentatives et leurs échos.
//
// Chaque tentative enregistre l'entrée du joueur à chaque tick. Quand le
// chrono est écoulé (ou que le joueur demande « Rejouer »), la bande est
// rangée dans l'historique et un nouveau monde démarre : les MAX_ECHOES
// dernières bandes y sont rejouées en même temps que la nouvelle tentative.
// « Recommencer » vide l'historique, donc efface tous les échos.

import { MAX_ECHOES, DEATH_TICKS } from './constants.js';
import { World } from './world.js';

export class Session {
  /** @param {object} level niveau issu de parseLevel */
  constructor(level) {
    this.level = level;
    /** Tentatives terminées depuis le dernier « Recommencer » : [{tape, attempt}] */
    this.history = [];
    /** Nombre total de tentatives commencées dans ce niveau (affiché). */
    this.attemptCount = 0;
    /** Ticks écoulés depuis l'arrivée dans le niveau (narration). */
    this.levelTick = 0;
    /** 'playing' puis 'won'. */
    this.state = 'playing';
    /** Bande gagnante, une fois le niveau réussi. */
    this.winningTape = null;
    /** 'exit' ou 'stay' : comment le niveau s'est terminé. */
    this.outcome = null;
    /** Ticks écoulés depuis que le joueur a touché un faisceau. */
    this.deathTicks = 0;
    /** Événements de session depuis la dernière lecture : [{type}] */
    this.events = [];
    /** Départ du joueur s'il a « rejoué » sur un relais (sinon null : le départ du niveau). */
    this.spawn = null;
    /** Ce qui reste d'une tentative à l'autre (la place des malles), ou null. */
    this.carry = null;
    this.beginAttempt();
  }

  /** Les tentatives rejouées comme échos dans le monde courant. */
  get echoes() {
    const n = this.level.maxEchoes ?? MAX_ECHOES;
    return n === 0 ? [] : this.history.slice(-n);
  }

  /** Ticks restants avant la fin de la tentative, ou null sans chrono. */
  get ticksLeft() {
    if (this.level.duration == null) return null;
    return Math.max(0, this.level.duration - this.world.tick);
  }

  beginAttempt() {
    this.attemptCount++;
    this.attempt = this.attemptCount;
    this.recording = [];
    this.deathTicks = 0;
    this.world = new World(this.level, this.echoes, this.attempt, { spawn: this.spawn, carry: this.carry });
  }

  /** Avance d'un tick avec l'entrée du joueur (un octet). */
  step(input) {
    if (this.state !== 'playing') return;
    this.recording.push(input);
    this.world.step(input);
    this.levelTick++;

    if (this.world.won) {
      this.state = 'won';
      this.outcome = this.world.outcome;
      this.winningTape = Uint8Array.from(this.recording);
      this.events.push({ type: 'won', outcome: this.outcome });
      return;
    }
    // Le joueur a touché un faisceau : on reprend cette tentative sans
    // l'enregistrer (elle ne devient pas un écho).
    if (this.world.player.dead) {
      this.deathTicks++;
      if (this.deathTicks >= DEATH_TICKS) {
        this.beginAttempt();
        this.events.push({ type: 'retry' });
      }
      return;
    }
    if (this.level.duration != null && this.world.tick >= this.level.duration) {
      this.replay();
    }
  }

  /**
   * Termine la tentative en cours : elle devient un écho, et une nouvelle
   * tentative commence avec tous les échos rejoués depuis le début.
   */
  replay() {
    if (this.state !== 'playing' || this.recording.length === 0) return;
    if (this.world.player.dead) return;
    this.history.push({ tape: Uint8Array.from(this.recording), attempt: this.attempt, spawn: this.spawn });
    // Sur un relais : on repartira d'ici. Les malles restent où elles sont.
    const relay = this.world.relayUnderPlayer();
    if (relay) {
      this.spawn = relay.spawn;
      this.events.push({ type: 'relay' });
    }
    this.carry = this.world.carryState();
    this.beginAttempt();
    this.events.push({ type: 'replay' });
  }

  /** Efface tous les échos et reprend la pièce à zéro. */
  restart() {
    if (this.state !== 'playing') return;
    this.history = [];
    this.spawn = null;
    this.carry = null;
    this.beginAttempt();
    this.events.push({ type: 'restart' });
  }

  /** Vide et renvoie les événements de session et du dernier tick du monde. */
  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
