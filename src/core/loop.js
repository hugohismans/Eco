// Boucle à pas fixe : la simulation avance toujours de 1/60 s par tick,
// quel que soit le framerate de l'écran. Le temps réel s'accumule ; on
// consomme autant de ticks entiers qu'il en contient, et le reste sert
// uniquement à interpoler l'affichage entre deux ticks.

import { TPS } from '../sim/constants.js';

const STEP_MS = 1000 / TPS;
/** Au-delà, on lâche du temps plutôt que de rattraper (onglet en veille…). */
const MAX_TICKS_PER_FRAME = 8;

/**
 * @param {{ tick: () => void, render: (alpha: number) => void }} handlers
 * @returns {{ stop: () => void }}
 */
export function startLoop({ tick, render }) {
  let acc = 0;
  let last = performance.now();
  let raf = 0;

  function frame(now) {
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250;
    acc += dt;
    let n = 0;
    while (acc >= STEP_MS && n < MAX_TICKS_PER_FRAME) {
      tick();
      acc -= STEP_MS;
      n++;
    }
    if (n === MAX_TICKS_PER_FRAME) acc = 0;
    render(acc / STEP_MS);
    raf = requestAnimationFrame(frame);
  }

  // Au retour sur l'onglet, on repart sans rattrapage.
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    acc = 0;
  });

  raf = requestAnimationFrame(frame);
  return { stop: () => cancelAnimationFrame(raf) };
}
