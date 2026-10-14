import { HttpError } from './errors.js';
import { authorizationHeader, normalizeGladysUrl } from './present.js';

const TIMEOUTS = {
  list: 15_000,
  action: 300_000,
  logs: 30_000,
  uninstall: 120_000,
};

async function readBody(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function failureMessage(status, body) {
  if (body && typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim();
  }
  if (status === 401) {
    return 'Gladys a refusé la clé API ou le jeton.';
  }
  if (status === 403) {
    return 'Ce compte n’a pas les droits administrateur requis.';
  }
  return `Gladys a répondu ${status}.`;
}

export function createGladysAdmin({ baseUrl, apiKey, fetchImpl = fetch }) {
  const root = normalizeGladysUrl(baseUrl);
  const authorization = authorizationHeader(apiKey);

  async function request(method, path, { query, timeout = TIMEOUTS.list } = {}) {
    const url = new URL(path, `${root}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
        },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      const aborted = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new HttpError(
        502,
        aborted ? 'Gladys n’a pas répondu à temps.' : 'Impossible de joindre l’instance Gladys.',
      );
    }
    const body = await readBody(response);
    if (!response.ok) {
      throw new HttpError(response.status, failureMessage(response.status, body));
    }
    return body;
  }

  return {
    baseUrl: root,
    list() {
      return request('GET', '/api/v1/external_integration');
    },
    act(selector, action) {
      return request('POST', `/api/v1/external_integration/${encodeURIComponent(selector)}/${action}`, {
        timeout: TIMEOUTS.action,
      });
    },
    logs(selector, { lines = 200, container } = {}) {
      return request('GET', `/api/v1/external_integration/${encodeURIComponent(selector)}/logs`, {
        query: { lines, container: container && container !== 'main' ? container : undefined },
        timeout: TIMEOUTS.logs,
      });
    },
    uninstall(selector) {
      return request('DELETE', `/api/v1/external_integration/${encodeURIComponent(selector)}`, {
        timeout: TIMEOUTS.uninstall,
      });
    },
  };
}
