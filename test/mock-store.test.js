import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockStore } from '../src/mock-store.js';

test('démonstration : démarrer, arrêter, forcer, mettre à jour, journaux, désinstaller', () => {
  const store = createMockStore({ startupDelayMs: 0 });
  const stopped = store.list().find((item) => item.selector === 'ext-demo-telegram');
  assert.equal(stopped.status, 'STOPPED');
  assert.equal(store.logs('ext-demo-telegram'), '');

  const started = store.act('ext-demo-telegram', 'start');
  assert.equal(started.integration.status, 'LOADING');
  assert.equal(started.update_result, null);

  const stoppedAgain = store.act('ext-demo-telegram', 'stop');
  assert.equal(stoppedAgain.integration.status, 'STOPPED');

  const restart = store.act('ext-demo-telegram', 'restart');
  assert.equal(restart.integration.status, 'LOADING');

  const forced = store.act('ext-demo-frigate', 'update');
  assert.equal(forced.update_result.up_to_date, true);
  assert.equal(forced.integration.version, '0.14.1');
  assert.match(store.logs('ext-demo-frigate', { lines: 20 }), /Déjà à jour/);

  const updated = store.act('ext-demo-open-meteo', 'update');
  assert.equal(updated.update_result.up_to_date, false);
  assert.equal(updated.integration.version, '1.6.2');
  assert.equal(updated.integration.update_available, false);

  assert.match(store.logs('ext-demo-frigate', { container: 'mqtt' }), /MQTT/);
  assert.match(store.logs('ext-demo-telegram'), /Redémarrage demandé/);
  assert.throws(() => store.logs('ext-demo-frigate', { container: 'inconnu' }), /Conteneur introuvable/);

  assert.equal(store.uninstall('ext-demo-telegram').success, true);
  assert.equal(
    store.list().some((item) => item.selector === 'ext-demo-telegram'),
    false,
  );
});
