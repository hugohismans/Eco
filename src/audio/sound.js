// Sons du jeu, tous synthétisés avec la Web Audio API (aucun fichier).
//
// - Effets courts : saut, réception, bouton, porte, valise, faisceau, chute,
//   écho qui repart, réussite, tic du chrono, interface.
// - Ambiance de gare : bourdonnement électrique et vent, dosés selon la pièce,
//   et parfois un carillon lointain.
// - Une réverbération synthétique donne l'acoustique d'un grand hall.
// Les sons des échos sont plus faibles et plus sourds que ceux du joueur.
//
// Le navigateur n'autorise le son qu'après un geste : `unlock()` est appelé
// au premier appui (clavier, souris ou doigt).

const MASTER = 0.8;

/** Ambiance par pièce : niveau du bourdonnement, du vent, de la réverbération. */
const AMBIENCE = {
  quai: { hum: 0.006, wind: 0.05, reverb: 0.18 },
  voie: { hum: 0.004, wind: 0.065, reverb: 0.12 },
  train: { hum: 0.01, wind: 0.045, reverb: 0.16 },
  hall: { hum: 0.02, wind: 0.01, reverb: 0.38 },
  guichets: { hum: 0.022, wind: 0.008, reverb: 0.32 },
  attente: { hum: 0.016, wind: 0.008, reverb: 0.26 },
  souterrain: { hum: 0.03, wind: 0.02, reverb: 0.45 },
  menu: { hum: 0.008, wind: 0.035, reverb: 0.2 },
  neige: { hum: 0.003, wind: 0.08, reverb: 0.1 },
  chalet: { hum: 0.012, wind: 0.03, reverb: 0.15 },
  ville: { hum: 0.012, wind: 0.05, reverb: 0.12 },
  rue: { hum: 0.016, wind: 0.035, reverb: 0.2 },
  musee: { hum: 0.01, wind: 0.005, reverb: 0.55 },
  reserve: { hum: 0.025, wind: 0.008, reverb: 0.35 },
  halle: { hum: 0.008, wind: 0.02, reverb: 0.6 },
  // Chapitre 5 : le train roule (bourdonnement grave, claquement des rails).
  wagon: { hum: 0.026, wind: 0.025, reverb: 0.1, rails: 0.09 },
  toit: { hum: 0.012, wind: 0.11, reverb: 0.05, rails: 0.06 },
  // Chapitre 6 : la mer.
  mer: { hum: 0.002, wind: 0.09, reverb: 0.16 },
  terminus: { hum: 0.012, wind: 0.04, reverb: 0.5 },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.theme = 'menu';
    this.nextChime = 0;
  }

  /** Crée le contexte audio (au premier geste de l'utilisateur). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.connect(this.master);

    // Réverbération : réponse impulsionnelle de bruit qui décroît.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 2.2, 2.8);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.3;
    this.reverb.connect(this.wet).connect(this.master);
    this.send = ctx.createGain();
    this.send.connect(this.reverb);

    this.noiseBuf = noiseBuffer(ctx, 2);
    this.buildAmbience();
    this.buildLoops();
    this.setTheme(this.theme);

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.05);
  }

  /** Ambiance d'une pièce (thème du niveau, ou « menu »). */
  setTheme(theme) {
    this.theme = theme;
    if (!this.ctx) return;
    const a = AMBIENCE[theme] ?? AMBIENCE.hall;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(a.hum, t, 0.8);
    this.windGain.gain.setTargetAtTime(a.wind, t, 0.8);
    this.wet.gain.setTargetAtTime(a.reverb, t, 0.5);
    this.rails = a.rails ?? 0;
  }

  // --- Ambiance -----------------------------------------------------------

  buildAmbience() {
    const ctx = this.ctx;
    // Bourdonnement : fondamentale et harmoniques du secteur, très filtrées.
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.connect(this.humGain).connect(this.amb);
    for (const [f, g, type] of [[50, 1, 'sine'], [100, 0.5, 'sine'], [150, 0.25, 'triangle']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(lp);
      o.start();
    }
    // Vent : bruit filtré dont le timbre et le souffle ondulent lentement.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 0.6;
    const swell = ctx.createGain();
    swell.gain.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(bp).connect(swell).connect(this.windGain).connect(this.amb);
    src.start();
    const lfo = lfoOsc(ctx, 0.07, 0.3);
    lfo.connect(swell.gain);
    const lfo2 = lfoOsc(ctx, 0.045, 260);
    lfo2.connect(bp.frequency);
  }

  /** Boucles continues : valise qui frotte, monte-charge, faisceau. */
  buildLoops() {
    const ctx = this.ctx;
    const loop = (make) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      make(g);
      g.connect(this.sfx);
      return g;
    };
    this.pushGain = loop((g) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 340;
      f.Q.value = 1.4;
      s.connect(f).connect(g);
      s.start();
    });
    this.liftGain = loop((g) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 62;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 240;
      o.connect(f).connect(g);
      o.start();
    });
    this.laserGain = loop((g) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 117;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 940;
      f.Q.value = 5;
      const trem = ctx.createGain();
      trem.gain.value = 0.8;
      lfoOsc(ctx, 7, 0.2).connect(trem.gain);
      o.connect(f).connect(trem).connect(g);
      o.start();
    });
  }

  /** État des boucles continues, une fois par tick. */
  update({ pushing, lift, laser, sliding }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // La glissade le long d'un mur réutilise le frottement, plus aigu et plus doux.
    this.pushGain.gain.setTargetAtTime(pushing ? 0.09 : sliding ? 0.05 : 0, t, 0.04);
    this.liftGain.gain.setTargetAtTime(lift ? 0.05 : 0, t, 0.1);
    this.laserGain.gain.setTargetAtTime(laser ? 0.022 : 0, t, 0.15);
    // Dans le train : le double claquement des joints de rail, régulier.
    if (this.rails) {
      if (!this.nextRail || this.nextRail < t - 1) this.nextRail = t + 0.2;
      if (t > this.nextRail) {
        this.nextRail += 1.15;
        for (const d of [0, 0.13]) this.noise({ type: 'lowpass', f: 240, dur: 0.07, gain: this.rails, delay: d, wet: 0.05 });
      }
    }
    // Carillon lointain, de temps en temps (réglé sur l'horloge audio).
    if (!this.nextChime) this.nextChime = t + 25 + Math.random() * 30;
    if (t > this.nextChime) {
      this.nextChime = t + 50 + Math.random() * 50;
      this.chime();
    }
  }

  // --- Briques ----------------------------------------------------------------

  /** Note simple avec enveloppe ; `to` : glissement de fréquence. */
  tone({ type = 'sine', f, to = null, dur = 0.1, gain = 0.1, attack = 0.004, delay = 0, lp = null, wet = 0.4 }) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const g = envelope(ctx, t0, attack, dur, gain);
    let node = o.connect(g);
    if (lp) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = lp;
      node = g.connect(fl);
    }
    node.connect(this.sfx);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      node.connect(s).connect(this.send);
    }
    o.start(t0);
    o.stop(t0 + attack + dur + 0.05);
  }

  /** Souffle de bruit filtré ; `to` : glissement du filtre. */
  noise({ f = 1000, to = null, q = 1, type = 'bandpass', dur = 0.1, gain = 0.1, attack = 0.004, delay = 0, wet = 0.3 }) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t0);
    if (to) fl.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const g = envelope(ctx, t0, attack, dur, gain);
    const out = s.connect(fl).connect(g);
    out.connect(this.sfx);
    if (wet) {
      const w = ctx.createGain();
      w.gain.value = wet;
      out.connect(w).connect(this.send);
    }
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + attack + dur + 0.05);
  }

  // --- Effets -------------------------------------------------------------------

  /**
   * Joue l'effet correspondant à un événement du monde ou de la session.
   * @param {string} type
   * @param {object|null} source le corps à l'origine (pour atténuer les échos)
   */
  event(type, source = null) {
    if (!this.ctx || this.muted) return;
    const echo = source?.kind === 'echo';
    const v = echo ? 0.35 : 1;
    const lp = echo ? 1400 : null;
    switch (type) {
      case 'jump':
        this.tone({ type: echo ? 'triangle' : 'square', f: 290, to: 540, dur: 0.09, gain: 0.05 * v, lp: lp ?? 2600 });
        break;
      case 'dash':
        // Ruée : souffle qui monte, petite note claquante.
        this.noise({ f: 700, to: 3200, q: 1.1, dur: 0.18, gain: 0.09 * v, wet: 0.25 });
        this.tone({ type: echo ? 'triangle' : 'square', f: 520, to: 1040, dur: 0.07, gain: 0.035 * v, lp: lp ?? 3000 });
        break;
      case 'walljump':
        this.noise({ type: 'lowpass', f: 900, dur: 0.05, gain: 0.07 * v, wet: 0.1 });
        this.tone({ type: echo ? 'triangle' : 'square', f: 340, to: 620, dur: 0.09, gain: 0.05 * v, lp: lp ?? 2600 });
        break;
      case 'grab':
        this.noise({ type: 'lowpass', f: 600, dur: 0.04, gain: 0.06 * v, wet: 0.05 });
        break;
      case 'tired':
        this.tone({ type: 'triangle', f: 300, to: 180, dur: 0.18, gain: 0.04 * v, wet: 0.2 });
        break;
      case 'lever':
        this.noise({ type: 'lowpass', f: 500, dur: 0.08, gain: 0.12 * v, wet: 0.3 });
        this.tone({ type: 'square', f: 180, to: 120, dur: 0.06, gain: 0.04 * v, lp: 900 });
        break;
      case 'crumble-shake':
        this.noise({ f: 900, to: 400, q: 3, dur: 0.4, gain: 0.05 * v, wet: 0.2 });
        break;
      case 'crumble':
        this.noise({ type: 'lowpass', f: 700, to: 120, dur: 0.5, gain: 0.16, wet: 0.4 });
        break;
      case 'spring':
        this.tone({ type: 'triangle', f: 220, to: 880, dur: 0.18, gain: 0.07 * v, wet: 0.3 });
        break;
      case 'alarm':
        for (let i = 0; i < 6; i++) this.tone({ type: 'square', f: i % 2 ? 880 : 660, dur: 0.18, gain: 0.04, delay: i * 0.2, lp: 2400, wet: 0.5 });
        break;
      case 'sensor-on':
        this.tone({ type: 'sine', f: 1320, dur: 0.05, gain: 0.025 * v, wet: 0.2 });
        break;
      case 'erase':
        // Un écho pris dans la lampe : un souffle clair qui s'éteint.
        this.tone({ type: 'sine', f: 1560, to: 2400, dur: 0.35, gain: 0.04, wet: 0.7 });
        this.noise({ f: 4000, to: 9000, q: 1, dur: 0.4, gain: 0.03, wet: 0.6 });
        break;
      case 'drown':
        this.noise({ type: 'lowpass', f: 900, to: 200, dur: 0.6, gain: 0.14, wet: 0.4 });
        this.tone({ type: 'sine', f: 300, to: 120, dur: 0.5, gain: 0.05, wet: 0.4 });
        break;
      case 'land':
        this.noise({ type: 'lowpass', f: 420, dur: 0.06, gain: 0.09 * v, wet: 0.1 });
        break;
      case 'block-land':
        this.noise({ type: 'lowpass', f: 260, dur: 0.12, gain: 0.16 });
        this.tone({ f: 90, to: 60, dur: 0.12, gain: 0.08 });
        break;
      case 'button-down':
        this.tone({ type: 'square', f: 1150, dur: 0.02, gain: 0.03, lp: 3000 });
        this.tone({ f: 240, to: 170, dur: 0.14, gain: 0.1 });
        break;
      case 'button-up':
        this.tone({ type: 'square', f: 760, dur: 0.02, gain: 0.02, lp: 2500 });
        break;
      case 'door-open':
        this.noise({ f: 500, to: 1500, q: 2, dur: 0.45, gain: 0.07 });
        this.tone({ type: 'sawtooth', f: 70, to: 90, dur: 0.45, gain: 0.04, lp: 320 });
        break;
      case 'door-close':
        this.noise({ f: 1400, to: 450, q: 2, dur: 0.35, gain: 0.06 });
        this.noise({ type: 'lowpass', f: 220, dur: 0.12, gain: 0.14, delay: 0.3 });
        break;
      case 'laser-on':
        this.tone({ type: 'sawtooth', f: 180, to: 900, dur: 0.12, gain: 0.03, lp: 2000 });
        break;
      case 'platform-on':
        this.noise({ type: 'lowpass', f: 300, dur: 0.15, gain: 0.08 });
        break;
      case 'death':
        this.tone({ type: 'sawtooth', f: 620, to: 70, dur: 0.55, gain: 0.07, lp: 1800 });
        this.noise({ type: 'highpass', f: 3000, dur: 0.3, gain: 0.05 });
        break;
      case 'exit':
      case 'won':
        // Arpège chaud, comme une lampe qui s'allume.
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone({ type: 'triangle', f, dur: 0.7, gain: 0.05, delay: i * 0.11, wet: 0.7 }));
        break;
      case 'stay':
        // Accord doux et long : on reste.
        [220, 261.63, 329.63, 392].forEach((f, i) =>
          this.tone({ type: 'sine', f, dur: 2.2, attack: 0.4, gain: 0.04, delay: i * 0.25, wet: 0.8 }));
        break;
      case 'depart':
        // La porte du train, puis le train qui s'en va.
        this.tone({ f: 659.25, dur: 0.5, gain: 0.05, wet: 0.6 });
        this.tone({ f: 523.25, dur: 0.8, gain: 0.05, delay: 0.45, wet: 0.6 });
        this.noise({ type: 'lowpass', f: 180, to: 60, dur: 3.2, attack: 0.8, gain: 0.1, delay: 0.6, wet: 0.2 });
        break;
      case 'replay':
        // Le temps qui revient en arrière : souffle descendant, note qui retombe.
        this.noise({ f: 2400, to: 300, q: 1.2, dur: 0.45, gain: 0.06 });
        this.tone({ f: 880, to: 440, dur: 0.4, gain: 0.03, wet: 0.7 });
        break;
      case 'restart':
        this.noise({ f: 1200, to: 200, q: 1, dur: 0.35, gain: 0.05 });
        break;
      case 'retry':
        this.tone({ f: 330, to: 220, dur: 0.3, gain: 0.03, wet: 0.6 });
        break;
      case 'tick':
        this.tone({ type: 'triangle', f: 1500, dur: 0.025, gain: 0.05, wet: 0.2 });
        this.noise({ type: 'highpass', f: 4000, dur: 0.015, gain: 0.02, wet: 0 });
        break;
      case 'tick-last':
        this.tone({ type: 'triangle', f: 1900, dur: 0.03, gain: 0.06, wet: 0.25 });
        break;
      case 'ui':
        this.tone({ type: 'square', f: 1250, dur: 0.02, gain: 0.025, lp: 3500, wet: 0.1 });
        break;
      case 'ui-move':
        this.tone({ type: 'square', f: 880, dur: 0.015, gain: 0.015, lp: 3000, wet: 0 });
        break;
      default:
        break;
    }
  }

  /** Carillon de gare, très loin. */
  chime() {
    if (this.muted) return;
    this.tone({ f: 783.99, dur: 1.2, gain: 0.012, wet: 1 });
    this.tone({ f: 659.25, dur: 1.6, gain: 0.012, delay: 0.55, wet: 1 });
  }
}

function envelope(ctx, t0, attack, dur, gain) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
  return g;
}

function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

/** Oscillateur basse fréquence (modulation), déjà démarré. */
function lfoOsc(ctx, freq, depth) {
  const o = ctx.createOscillator();
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g);
  o.start();
  return g;
}
