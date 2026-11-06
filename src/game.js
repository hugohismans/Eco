// Chef d'orchestre : relie entrées, session de niveau, rendu, son, menus et
// sauvegarde.
//
// Il reçoit les ticks de la boucle à pas fixe, applique les commandes
// (« Rejouer », « Recommencer », « Menu ») toujours entre deux ticks, puis fait
// avancer la session. La simulation, elle, ne sait rien de tout cela.
//
// Modes :
//   menu     écran titre ou sélecteur ; la pièce derrière est figée, sans HUD
//   playing  on joue
//   paused   menu de pause ; la simulation est arrêtée
//   leaving  on vient de réussir : la lumière monte, puis l'écran de réussite
//   won      écran de réussite (ou de fin, au dernier niveau)

import { parseLevel } from './sim/level.js';
import { Session } from './sim/session.js';
import { levelThumb } from './ui/thumbs.js';

/** Durée entre la réussite et l'écran de réussite (ticks). */
const LEAVE_TICKS = 70;

export class Game {
  /**
   * @param {{ levels: object[], input: import('./core/input.js').Input,
   *           renderer: import('./render/renderer.js').Renderer,
   *           sound: import('./audio/sound.js').Sound,
   *           save: import('./core/save.js').Save,
   *           menus: import('./ui/menus.js').Menus }} deps
   */
  constructor({ levels, chapters = {}, input, renderer, sound, save, menus }) {
    this.chapters = chapters;
    // Numérotation : « 2.3 » = troisième pièce du chapitre 2.
    const count = {};
    this.levels = levels.map((def, i) => {
      const lv = parseLevel(def);
      count[lv.chapter] = (count[lv.chapter] ?? 0) + 1;
      return Object.freeze({ ...lv, number: i + 1, label: `${lv.chapter}.${count[lv.chapter]}` });
    });
    this.input = input;
    this.renderer = renderer;
    this.sound = sound;
    this.save = save;
    this.menus = menus;
    this.mode = 'menu';
    this.modeTicks = 0;
    this.index = 0;
    this.session = new Session(this.levels[0]);
  }

  // --- Navigation -----------------------------------------------------------

  setMode(mode) {
    this.mode = mode;
    this.modeTicks = 0;
  }

  /** Index du niveau où reprendre : le dernier ouvert, sinon le premier non réussi. */
  resumeIndex() {
    const last = this.levels.findIndex((l) => l.id === this.save.data.last);
    if (last >= 0 && !this.save.isDone(this.levels[last].id)) return last;
    const firstTodo = this.levels.findIndex((l, i) => !this.save.isDone(l.id) && this.save.isUnlocked(this.levels, i));
    return firstTodo >= 0 ? firstTodo : Math.max(0, last);
  }

  /** Écran titre, avec la pièce où l'on en est derrière. */
  showTitle() {
    this.index = this.resumeIndex();
    this.session = new Session(this.levels[this.index]);
    this.sound.setTheme('menu');
    this.setMode('menu');
    this.menus.title({
      hasProgress: Object.keys(this.save.data.levels).length > 0,
      muted: this.save.muted,
      onPlay: () => this.play(this.resumeIndex()),
      onLevels: () => this.showLevels(() => this.showTitle()),
      onToggleSound: () => this.toggleSound(),
    });
  }

  showLevels(onBack) {
    if (this.mode === 'playing') this.setMode('paused');
    this.menus.levels({
      levels: this.levels,
      chapters: this.chapters,
      save: this.save,
      thumb: levelThumb,
      current: this.index,
      onPick: (i) => this.play(i),
      onBack,
    });
  }

  /** Lance un niveau (sans vérifier le verrou : l'adresse #niveau=N le permet). */
  play(index) {
    this.menus.hide();
    // Sur téléphone, on passe en plein écran (là où le navigateur le permet ;
    // sur iPhone, il faut « Ajouter à l'écran d'accueil »).
    const root = document.documentElement;
    if (document.body.classList.contains('touch') && root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation?.lock?.('landscape'))
        .catch(() => {});
    }
    this.index = Math.max(0, Math.min(index, this.levels.length - 1));
    const level = this.levels[this.index];
    this.session = new Session(level);
    this.save.setLast(level.id);
    this.sound.setTheme(level.theme);
    this.showControlsFor(level);
    this.setMode('playing');
  }

  /** Boutons tactiles et aide clavier selon les capacités du niveau. */
  showControlsFor(level) {
    const ab = new Set(level.abilities);
    document.body.classList.toggle('can-dash', ab.has('dash'));
    document.body.classList.toggle('can-grab', ab.has('grab'));
    const hint = document.getElementById('keys-hint');
    if (!hint) return;
    const lines = ['Flèches / ZQSD : bouger', 'Espace ou C : sauter'];
    if (ab.has('dash')) lines.push('X : dash (+ direction)');
    if (ab.has('grab')) lines.push('Z ou Maj : s\u2019agripper');
    if (level.stay) lines.push('Bas ou E : rester');
    hint.innerHTML = lines.join('<br>');
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.setMode('paused');
    this.menus.pause({
      muted: this.save.muted,
      onResume: () => { this.menus.hide(); this.setMode('playing'); },
      onRestart: () => { this.menus.hide(); this.session.restart(); this.setMode('playing'); },
      onLevels: () => this.showLevels(() => this.pauseAgain()),
      onTitle: () => this.showTitle(),
      onToggleSound: () => this.toggleSound(),
    });
  }

  pauseAgain() {
    this.setMode('playing');
    this.pause();
  }

  toggleSound() {
    this.save.muted = !this.save.muted;
    this.sound.setMuted(this.save.muted);
  }

  /** La pièce est réussie : on enregistre, puis on montre le bilan. */
  finishLevel() {
    const s = this.session;
    const level = s.level;
    const prev = this.save.level(level.id);
    const stats = {
      attempts: s.attemptCount,
      echoes: s.world.actors.length - 1,
      ticks: s.levelTick,
    };
    this.save.recordWin(level.id, { ...stats, outcome: level.endings ? s.outcome : null });
    const record = {
      attempts: !prev || stats.attempts < prev.bestAttempts,
      echoes: !prev || stats.echoes < prev.bestEchoes,
      time: !prev || stats.ticks < prev.bestTime,
    };
    record.any = !!prev && (record.attempts || record.echoes || record.time);
    this.setMode('won');

    if (level.endings) {
      this.menus.end({
        phrase: level.endings[s.outcome] ?? '',
        outcome: s.outcome,
        seen: Object.keys(this.save.data.endings).length,
        onLevels: () => this.showLevels(() => this.showTitle()),
        onTitle: () => this.showTitle(),
      });
      return;
    }
    const hasNext = this.index < this.levels.length - 1;
    if (level.chapterEnd && hasNext) {
      // Fin de chapitre : le train part, on change de lieu.
      const next = this.levels[this.index + 1];
      this.menus.chapter({
        done: this.chapters[level.chapter]?.title ?? '',
        number: next.chapter,
        title: this.chapters[next.chapter]?.title ?? '',
        stats,
        onNext: () => this.play(this.index + 1),
        onLevels: () => this.showLevels(() => this.showTitle()),
      });
      return;
    }
    this.menus.won({
      level,
      stats,
      record,
      hasNext,
      onNext: () => this.play(this.index + 1),
      onReplay: () => this.play(this.index),
      onLevels: () => this.showLevels(() => this.showTitle()),
    });
  }

  // --- Boucle -------------------------------------------------------------------

  /** Un pas de simulation (appelé 60 fois par seconde). */
  tick() {
    const commands = this.input.takeCommands();
    const bits = this.input.sample();
    this.modeTicks++;

    if (this.mode === 'playing') {
      const s = this.session;
      for (const c of commands) {
        if (c === 'replay') s.replay();
        else if (c === 'restart') s.restart();
        else if (c === 'menu') { this.pause(); return; }
      }
      const world = s.world;
      s.step(bits);
      for (const e of world.events) {
        this.sound.event(e.type, e.source);
        if (e.type === 'exit' && s.level.endings) this.sound.event('depart');
      }
      for (const e of s.drainEvents()) this.sound.event(e.type);
      this.tickSounds();
      if (s.state === 'won') this.setMode('leaving');
    } else if (this.mode === 'leaving') {
      this.sound.update({});
      if (this.modeTicks >= LEAVE_TICKS) this.finishLevel();
    } else {
      this.sound.update({});
    }
  }

  /** Tic du chrono, boucles continues (valise, monte-charge, faisceau). */
  tickSounds() {
    const s = this.session;
    const left = s.ticksLeft;
    if (left != null && left > 0 && !s.world.player.dead) {
      if (left <= 60 && left % 30 === 0) this.sound.event('tick-last');
      else if (left <= 180 && left % 60 === 0) this.sound.event('tick');
    }
    const w = s.world;
    this.sound.update({
      pushing: w.actors.some((a) => a.pushing),
      sliding: w.player.sliding,
      lift: w.platforms.some((p) => p.moving),
      laser: w.lasers.some((l) => l.on),
    });
  }

  render(alpha) {
    const moving = this.mode === 'playing';
    // En sortant : la lumière de la porte envahit doucement l'écran.
    let fade = 0;
    if (this.mode === 'leaving') fade = Math.min(0.6, this.modeTicks / 60);
    else if (this.mode === 'won') fade = 0.6;
    else if (this.mode === 'paused') fade = 0.35;
    else if (this.mode === 'menu') fade = 0.15;
    this.renderer.draw(this.session, moving ? alpha : 1, {
      hideHud: this.mode === 'menu' || this.mode === 'won',
      fade,
      touch: document.body.classList.contains('touch'),
    });
  }
}
