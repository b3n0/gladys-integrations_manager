import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizationHeader, normalizeGladysUrl, presentIntegration, statusLabel } from '../src/present.js';

test('le nom affiché vient du manifeste, avec le statut français', () => {
  const view = presentIntegration(
    {
      selector: 'ext-meteo',
      name: 'ext-meteo',
      version: '1.4.0',
      latest_version: '1.6.2',
      update_available: true,
      status: 'RUNNING',
      manifest: {
        name: 'Open-Meteo',
        type: 'weather',
        containers: [{ name: 'mqtt' }],
        energy_contracts: { templates: [{ pricing_mode: 'delegated' }] },
      },
    },
    'ext-meteo',
  );
  assert.equal(view.name, 'Open-Meteo');
  assert.equal(view.status_label, statusLabel('RUNNING'));
  assert.deepEqual(view.containers, ['mqtt']);
  assert.equal(view.has_delegated_contracts, true);
  assert.equal(view.self, true);
  assert.equal(view.update_available, true);
});

test('une clé API reste brute et un JWT reçoit Bearer', () => {
  assert.equal(authorizationHeader('clef-locale'), 'clef-locale');
  assert.equal(authorizationHeader('Bearer clef-locale'), 'clef-locale');
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
  assert.equal(authorizationHeader(jwt), `Bearer ${jwt}`);
  assert.equal(authorizationHeader(`Bearer ${jwt}`), `Bearer ${jwt}`);
});

test('l’adresse Gladys perd le suffixe d’API', () => {
  assert.equal(normalizeGladysUrl('http://192.168.1.10:1443/'), 'http://192.168.1.10:1443');
  assert.equal(normalizeGladysUrl('http://192.168.1.10:1443/api/v1'), 'http://192.168.1.10:1443');
  assert.equal(
    normalizeGladysUrl('http://192.168.1.10:1443/api/integration/v1/'),
    'http://192.168.1.10:1443',
  );
});
