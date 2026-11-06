// Écrans d'interface posés sur le canvas : titre, sélecteur de niveaux, pause,
// réussite, fin. Du HTML en police pixel, dimensionné en « pixels du jeu »
// (variable CSS --px) pour rester aligné sur la grille de l'image.
//
// Navigation : souris, doigt, ou clavier (flèches, Entrée/Espace, Échap).

/** Petit constructeur d'éléments. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const fmtTime = (ticks) => `${(ticks / 60).toFixed(1).replace('.', ',')} s`;

export class Menus {
  /**
   * @param {HTMLElement} root conteneur posé sur le canvas
   * @param {{ onOpen?: (open: boolean) => void, sound?: object }} opts
   */
  constructor(root, { onOpen, sound } = {}) {
    this.root = root;
    this.onOpen = onOpen ?? (() => {});
    this.sound = sound;
    this.current = null;
    this.onBack = null;
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  get open() {
    return this.current !== null;
  }

  hide() {
    this.root.replaceChildren();
    this.root.hidden = true;
    this.current = null;
    this.onBack = null;
    this.onOpen(false);
  }

  /** Affiche un écran : `content` est un élément, `onBack` la sortie par Échap. */
  show(name, content, onBack = null) {
    this.root.replaceChildren(content);
    this.root.hidden = false;
    this.root.dataset.screen = name;
    this.current = name;
    this.onBack = onBack;
    this.onOpen(true);
    // Focus sur le premier bouton principal (clavier), sans faire défiler.
    const first = content.querySelector('[data-autofocus]') ?? content.querySelector('button:not([disabled])');
    first?.focus({ preventScroll: true });
  }

  button(label, onClick, { primary = false, disabled = false, autofocus = false, cls = '' } = {}) {
    return h('button', {
      type: 'button',
      class: `ui-btn ${primary ? 'primary' : ''} ${cls}`,
      disabled,
      'data-autofocus': autofocus,
      on: {
        click: (e) => {
          e.preventDefault();
          this.sound?.event('ui');
          onClick();
        },
      },
    }, label);
  }

  onKey(e) {
    if (!this.open) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.onBack) { this.sound?.event('ui'); this.onBack(); }
      return;
    }
    const dirs = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };
    if (!(e.code in dirs)) return;
    e.preventDefault();
    const items = [...this.root.querySelectorAll('button:not([disabled])')];
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement);
    const next = items[(i + dirs[e.code] + items.length) % items.length] ?? items[0];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
    this.sound?.event('ui-move');
  }

  // --- Écrans ------------------------------------------------------------------

  /** Écran titre. */
  title({ hasProgress, muted, onPlay, onLevels, onToggleSound }) {
    const soundBtn = this.button(muted ? 'Son : coupé' : 'Son : oui', () => {
      onToggleSound();
      soundBtn.textContent = this.sound?.muted ? 'Son : coupé' : 'Son : oui';
    });
    this.show('title', h('div', { class: 'ui-screen ui-title' },
      h('h1', { class: 'ui-logo' }, 'ÉCHO'),
      h('p', { class: 'ui-sub' }, 'Une gare, la nuit.', h('br'), 'Les fois précédentes.'),
      h('div', { class: 'ui-actions' },
        this.button(hasProgress ? 'Continuer' : 'Commencer', onPlay, { primary: true, autofocus: true }),
        this.button('Niveaux', onLevels),
        soundBtn,
      ),
    ));
  }

  /**
   * Sélecteur de niveaux.
   * @param {{ levels: object[], save: import('../core/save.js').Save,
   *           thumb: (level: object) => HTMLCanvasElement, current: number,
   *           onPick: (i: number) => void, onBack: () => void }} p
   */
  levels({ levels, chapters = {}, save, thumb, current, onPick, onBack }) {
    const list = h('ol', { class: 'ui-levels' });
    let chapter = null;
    levels.forEach((lv, i) => {
      if (lv.chapter !== chapter) {
        chapter = lv.chapter;
        const title = chapters[chapter]?.title ?? '';
        list.append(h('li', { class: 'ui-chapter' }, `Chapitre ${chapter}`, h('span', {}, title)));
      }
      const unlocked = save.isUnlocked(levels, i);
      const rec = save.level(lv.id);
      let status;
      if (!unlocked) status = 'Fermé';
      else if (rec?.done) status = `Réussi · ${rec.bestAttempts} essai${rec.bestAttempts > 1 ? 's' : ''}`;
      else status = 'À faire';
      const card = h('button', {
        type: 'button',
        class: `ui-level ${rec?.done ? 'done' : ''} ${unlocked ? '' : 'locked'}`,
        disabled: !unlocked,
        'data-autofocus': i === current,
        on: { click: () => { this.sound?.event('ui'); onPick(i); } },
      },
      h('span', { class: 'ui-thumb' }, unlocked ? thumb(lv) : h('span', { class: 'ui-lock' }, '?')),
      h('span', { class: 'ui-level-text' },
        h('span', { class: 'ui-level-num' }, lv.label ?? String(i + 1).padStart(2, '0')),
        h('span', { class: 'ui-level-name' }, lv.name),
        h('span', { class: 'ui-level-status' }, status),
      ));
      list.append(h('li', {}, card));
    });
    const endings = Object.keys(save.data.endings).length;
    this.show('levels', h('div', { class: 'ui-screen ui-select' },
      h('h2', {}, 'Niveaux'),
      list,
      endings > 0 ? h('p', { class: 'ui-note' }, `Fins découvertes : ${endings} / 2`) : null,
      h('div', { class: 'ui-actions row' }, this.button('Retour', onBack)),
    ), onBack);
  }

  /** Pause, pendant une partie. */
  pause({ muted, onResume, onRestart, onLevels, onTitle, onToggleSound }) {
    const soundBtn = this.button(muted ? 'Son : coupé' : 'Son : oui', () => {
      onToggleSound();
      soundBtn.textContent = this.sound?.muted ? 'Son : coupé' : 'Son : oui';
    });
    this.show('pause', h('div', { class: 'ui-screen ui-pause' },
      h('h2', {}, 'Pause'),
      h('div', { class: 'ui-actions' },
        this.button('Reprendre', onResume, { primary: true, autofocus: true }),
        this.button('Effacer les échos', onRestart),
        this.button('Niveaux', onLevels),
        soundBtn,
        this.button('Écran titre', onTitle),
      ),
    ), onResume);
  }

  /** Réussite d'une pièce. */
  won({ level, stats, record, hasNext, onNext, onReplay, onLevels }) {
    const row = (label, value, best) => h('div', { class: 'ui-stat' },
      h('span', {}, label), h('span', { class: best ? 'best' : '' }, value));
    this.show('won', h('div', { class: 'ui-screen ui-won' },
      h('p', { class: 'ui-kicker' }, level.name),
      h('h2', {}, 'La porte s’ouvre.'),
      h('div', { class: 'ui-stats' },
        row('Essais', String(stats.attempts), record.attempts),
        row('Échos', String(stats.echoes), record.echoes),
        row('Temps', fmtTime(stats.ticks), record.time),
      ),
      record.any ? h('p', { class: 'ui-note' }, 'Nouveau record') : null,
      h('div', { class: 'ui-actions' },
        hasNext ? this.button('Continuer', onNext, { primary: true, autofocus: true }) : null,
        this.button('Rejouer la pièce', onReplay, { autofocus: !hasNext }),
        this.button('Niveaux', onLevels),
      ),
    ), onLevels);
  }

  /** Fin de chapitre : le train part, et un nouveau lieu commence. */
  chapter({ done, number, title, stats, onNext, onLevels }) {
    this.show('chapter', h('div', { class: 'ui-screen ui-chapter-card' },
      h('p', { class: 'ui-kicker' }, `${done} · terminé`),
      h('p', { class: 'ui-note dim' }, `${stats.attempts} essais · ${fmtTime(stats.ticks)}`),
      h('p', { class: 'ui-kicker' }, `Chapitre ${number}`),
      h('h2', { class: 'ui-chapter-title' }, title),
      h('div', { class: 'ui-actions' },
        this.button('Continuer', onNext, { primary: true, autofocus: true }),
        this.button('Niveaux', onLevels),
      ),
    ), onLevels);
  }

  /** Fin du jeu : la phrase de la fin choisie. */
  end({ phrase, outcome, seen, onLevels, onTitle }) {
    const other = outcome === 'exit' ? 'rester' : 'partir';
    this.show('end', h('div', { class: 'ui-screen ui-end' },
      h('p', { class: 'ui-ending' }, phrase),
      h('p', { class: 'ui-note' }, `Fin ${seen} sur 2`),
      seen < 2 ? h('p', { class: 'ui-note dim' }, `On aurait pu aussi ${other}.`) : null,
      h('div', { class: 'ui-actions' },
        this.button('Niveaux', onLevels, { primary: true, autofocus: true }),
        this.button('Écran titre', onTitle),
      ),
    ), onTitle);
  }
}
