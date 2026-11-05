// Progression et réglages, gardés dans le navigateur (localStorage).
//
// Tout accès est protégé : en navigation privée, ou si le stockage est
// bloqué, le jeu fonctionne normalement, il oublie seulement en partant.

const KEY = 'echo.save';
const VERSION = 1;

function blank() {
  return {
    version: VERSION,
    /** Par niveau (id) : { done, bestAttempts, bestEchoes, bestTime } */
    levels: {},
    /** Fins vues au dernier niveau : { exit: true, stay: true } */
    endings: {},
    /** Dernier niveau ouvert (id). */
    last: null,
    settings: { muted: false },
  };
}

export class Save {
  constructor() {
    this.data = blank();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.version === VERSION) {
          this.data = { ...blank(), ...d, settings: { ...blank().settings, ...d.settings } };
        }
      }
    } catch {
      // Stockage indisponible ou illisible : on repart de zéro.
    }
  }

  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Stockage plein ou bloqué : tant pis, la partie continue.
    }
  }

  level(id) {
    return this.data.levels[id] ?? null;
  }

  isDone(id) {
    return !!this.data.levels[id]?.done;
  }

  /**
   * Un niveau est ouvert s'il est le premier, s'il a déjà été réussi, ou si
   * le précédent l'a été.
   */
  isUnlocked(levels, index) {
    if (index === 0) return true;
    return this.isDone(levels[index].id) || this.isDone(levels[index - 1].id);
  }

  /** Enregistre une réussite ; garde les meilleurs chiffres. */
  recordWin(id, { attempts, echoes, ticks, outcome }) {
    const prev = this.data.levels[id] ?? {};
    const best = (a, b) => (a == null ? b : Math.min(a, b));
    this.data.levels[id] = {
      done: true,
      bestAttempts: best(prev.bestAttempts, attempts),
      bestEchoes: best(prev.bestEchoes, echoes),
      bestTime: best(prev.bestTime, ticks),
    };
    if (outcome) this.data.endings[outcome] = true;
    this.write();
  }

  setLast(id) {
    this.data.last = id;
    this.write();
  }

  get muted() {
    return !!this.data.settings.muted;
  }

  set muted(v) {
    this.data.settings.muted = !!v;
    this.write();
  }

  /** Efface toute la progression (les réglages restent). */
  reset() {
    const settings = this.data.settings;
    this.data = { ...blank(), settings };
    this.write();
  }
}
