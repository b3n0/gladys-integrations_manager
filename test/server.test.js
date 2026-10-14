import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../src/server.js';
import { createRuntime } from '../src/runtime.js';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

test('la page et les actions de démonstration restent sur place', async () => {
  const runtime = createRuntime({ startupDelayMs: 0 });
  const server = createApp(runtime);
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  try {
    const page = await fetch(`${base}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Intégrations installées/);
    assert.match(html, /lang="fr"/);

    const script = await (await fetch(`${base}/app.js`)).text();
    for (const label of ['Démarrer', 'Arrêter', 'Redémarrer', 'Mettre à jour', 'Forcer la mise à jour', 'Journaux', 'Désinstaller', 'Oui, désinstaller']) {
      assert.match(script, new RegExp(label));
    }

    const session = await readJson(await fetch(`${base}/api/session`));
    assert.equal(session.body.mode, 'mock');

    const list = await readJson(await fetch(`${base}/api/integrations`));
    assert.equal(list.body.integrations.length, 5);
    const telegram = list.body.integrations.find((item) => item.selector === 'ext-demo-telegram');
    assert.equal(telegram.status, 'STOPPED');

    const started = await readJson(await fetch(`${base}/api/integrations/ext-demo-telegram/start`, { method: 'POST' }));
    assert.equal(started.body.integration.status, 'LOADING');

    const logs = await readJson(await fetch(`${base}/api/integrations/ext-demo-frigate/logs?lines=50&container=mqtt`));
    assert.match(logs.body.logs, /MQTT/);

    const removed = await readJson(await fetch(`${base}/api/integrations/ext-demo-telegram`, { method: 'DELETE' }));
    assert.equal(removed.body.success, true);
    const after = await readJson(await fetch(`${base}/api/integrations`));
    assert.equal(after.body.integrations.some((item) => item.selector === 'ext-demo-telegram'), false);

    const missing = await readJson(await fetch(`${base}/api/integrations/ext-inconnu/start`, { method: 'POST' }));
    assert.equal(missing.status, 404);

    const empty = createRuntime({ startupDelayMs: 0 });
    for (const item of (await empty.list())) {
      await empty.uninstall(item.selector);
    }
    assert.deepEqual(await empty.list(), []);
  } finally {
    await close(server);
  }
});

test('une instance Gladys est appelée sur les routes de supervision', async () => {
  const seen = [];
  let updated = false;
  const gladys = http.createServer((request, response) => {
    seen.push(`${request.method} ${request.url} auth=${request.headers.authorization}`);
    response.setHeader('Content-Type', 'application/json');
    if (request.url.startsWith('/api/v1/external_integration/ext-demo/logs')) {
      response.end(JSON.stringify({ logs: 'ligne de journal' }));
      return;
    }
    if (request.method === 'DELETE') {
      response.end(JSON.stringify({ success: true }));
      return;
    }
    if (request.method === 'POST' && request.url.endsWith('/update')) {
      updated = true;
    }
    const version = updated ? '1.2.0' : '1.0.0';
    const integration = {
      selector: 'ext-demo',
      name: 'ext-demo',
      version,
      latest_version: '1.2.0',
      update_available: !updated,
      status: request.method === 'POST' && request.url.endsWith('/stop') ? 'STOPPED' : 'RUNNING',
      manifest: { name: 'Démo', type: 'device', containers: [{ name: 'mqtt' }] },
    };
    if (request.url === '/api/v1/external_integration') {
      response.end(JSON.stringify([integration]));
      return;
    }
    response.end(JSON.stringify(integration));
  });
  const gladysPort = await listen(gladys);
  const runtime = createRuntime({ startupDelayMs: 0 });
  const server = createApp(runtime);
  const port = await listen(server);
  try {
    const refused = await fetch(`http://127.0.0.1:${port}/api/session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gladys_url: 'http://127.0.0.1:9', api_key: 'x' }),
    });
    assert.equal(refused.status, 502);
    const stillMock = await (await fetch(`http://127.0.0.1:${port}/api/session`)).json();
    assert.equal(stillMock.mode, 'mock');

    const connected = await fetch(`http://127.0.0.1:${port}/api/session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gladys_url: `http://127.0.0.1:${gladysPort}/api/v1`, api_key: 'clef-admin' }),
    });
    assert.equal(connected.status, 200);
    assert.equal((await connected.json()).mode, 'gladys');

    const list = await (await fetch(`http://127.0.0.1:${port}/api/integrations`)).json();
    assert.equal(list.integrations[0].name, 'Démo');
    assert.equal(list.integrations[0].update_available, true);

    const update = await (
      await fetch(`http://127.0.0.1:${port}/api/integrations/ext-demo/update`, { method: 'POST' })
    ).json();
    assert.equal(update.update_result.up_to_date, false);
    assert.equal(update.integration.version, '1.2.0');

    await fetch(`http://127.0.0.1:${port}/api/integrations/ext-demo/start`, { method: 'POST' });
    await fetch(`http://127.0.0.1:${port}/api/integrations/ext-demo/stop`, { method: 'POST' });
    await fetch(`http://127.0.0.1:${port}/api/integrations/ext-demo/restart`, { method: 'POST' });
    const logs = await (
      await fetch(`http://127.0.0.1:${port}/api/integrations/ext-demo/logs?lines=200&container=mqtt`)
    ).json();
    assert.equal(logs.logs, 'ligne de journal');
    await fetch(`http://127.0.0.1:${port}/api/integrations/ext-demo`, { method: 'DELETE' });

    const joined = seen.join('\n');
    assert.match(joined, /auth=clef-admin/);
    assert.match(joined, /POST \/api\/v1\/external_integration\/ext-demo\/start/);
    assert.match(joined, /POST \/api\/v1\/external_integration\/ext-demo\/stop/);
    assert.match(joined, /POST \/api\/v1\/external_integration\/ext-demo\/restart/);
    assert.match(joined, /POST \/api\/v1\/external_integration\/ext-demo\/update/);
    assert.match(joined, /GET \/api\/v1\/external_integration\/ext-demo\/logs\?lines=200&container=mqtt/);
    assert.match(joined, /DELETE \/api\/v1\/external_integration\/ext-demo/);
  } finally {
    await close(server);
    await close(gladys);
  }
});
