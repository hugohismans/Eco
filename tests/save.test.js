// Sauvegarde : progression, déverrouillage, records, stockage indisponible.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Save } from '../src/core/save.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), map: m };
}

const LEVELS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('déverrouillage, records et fins sont gardés', () => {
  globalThis.localStorage = fakeStorage();
  const s = new Save();
  assert.equal(s.isUnlocked(LEVELS, 0), true);
  assert.equal(s.isUnlocked(LEVELS, 1), false);
  s.recordWin('a', { attempts: 4, echoes: 2, ticks: 900 });
  s.recordWin('a', { attempts: 6, echoes: 1, ticks: 1200 });
  assert.equal(s.isUnlocked(LEVELS, 1), true);
  assert.equal(s.isUnlocked(LEVELS, 2), false);
  const again = new Save();
  assert.deepEqual(again.level('a'), { done: true, bestAttempts: 4, bestEchoes: 1, bestTime: 900 });
  again.recordWin('c', { attempts: 1, echoes: 0, ticks: 10, outcome: 'stay' });
  assert.deepEqual(new Save().data.endings, { stay: true });
  again.muted = true;
  assert.equal(new Save().muted, true);
});

test('sans stockage (navigation privée), rien ne casse', () => {
  globalThis.localStorage = {
    getItem() { throw new Error('bloqué'); },
    setItem() { throw new Error('bloqué'); },
  };
  const s = new Save();
  s.recordWin('a', { attempts: 1, echoes: 0, ticks: 5 });
  assert.equal(s.isDone('a'), true);
});

test('une sauvegarde abîmée est ignorée', () => {
  globalThis.localStorage = fakeStorage();
  localStorage.setItem('echo.save', '{pas du json');
  assert.equal(new Save().isDone('a'), false);
});
