import { readFileSync } from 'node:fs';
import http from 'node:http';
import { HttpError } from './errors.js';

const FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/app.css': { file: 'app.css', type: 'text/css; charset=utf-8' },
};

const publicDir = new URL('./public/', import.meta.url);
const assets = new Map(
  Object.entries(FILES).map(([route, asset]) => [
    route,
    { type: asset.type, body: readFileSync(new URL(asset.file, publicDir)) },
  ]),
);

const SELECTOR = /^[a-zA-Z0-9._:-]{1,128}$/;
const ACTIONS = new Set(['start', 'stop', 'restart', 'update']);

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function sendError(response, error) {
  const known = error instanceof HttpError;
  const status = known ? error.status : 500;
  const message = known ? error.message : 'Une erreur interne est survenue.';
  sendJson(response, status, { message });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 16_384) {
        reject(new HttpError(413, 'Requête trop volumineuse.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Le corps de la requête n’est pas du JSON valide.'));
      }
    });
    request.on('error', reject);
  });
}

function integrationPath(pathname) {
  const match = pathname.match(/^\/api\/integrations\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) {
    return null;
  }
  const selector = decodeURIComponent(match[1]);
  const action = match[2] ? decodeURIComponent(match[2]) : null;
  if (!SELECTOR.test(selector)) {
    throw new HttpError(400, 'Sélecteur d’intégration invalide.');
  }
  return { selector, action };
}

export function createApp(runtime) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      const { pathname } = url;

      if (request.method === 'GET' && assets.has(pathname)) {
        const asset = assets.get(pathname);
        response.writeHead(200, {
          'Content-Type': asset.type,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(asset.body);
        return;
      }

      if (pathname === '/api/session' && request.method === 'GET') {
        sendJson(response, 200, runtime.session());
        return;
      }
      if (pathname === '/api/session' && request.method === 'PUT') {
        const body = await readJson(request);
        const session = await runtime.connect({
          gladysUrl: body.gladys_url,
          apiKey: body.api_key,
        });
        sendJson(response, 200, session);
        return;
      }
      if (pathname === '/api/session' && request.method === 'DELETE') {
        sendJson(response, 200, runtime.disconnect());
        return;
      }
      if (pathname === '/api/integrations' && request.method === 'GET') {
        sendJson(response, 200, { integrations: await runtime.list() });
        return;
      }

      const target = integrationPath(pathname);
      if (target && request.method === 'POST' && target.action && ACTIONS.has(target.action)) {
        sendJson(response, 200, await runtime.act(target.selector, target.action));
        return;
      }
      if (target && request.method === 'GET' && target.action === 'logs') {
        const lines = url.searchParams.get('lines') || '200';
        const container = url.searchParams.get('container') || undefined;
        sendJson(response, 200, await runtime.logs(target.selector, { lines, container }));
        return;
      }
      if (target && request.method === 'DELETE' && !target.action) {
        sendJson(response, 200, await runtime.uninstall(target.selector));
        return;
      }

      sendJson(response, 404, { message: 'Ressource introuvable.' });
    } catch (error) {
      sendError(response, error);
    }
  });
}

export function startHttpServer(runtime, { port = 4317, host = '0.0.0.0' } = {}) {
  const server = createApp(runtime);
  server.listen(port, host);
  return server;
}
