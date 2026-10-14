import { createGladysAdmin } from './gladys-admin.js';
import { HttpError } from './errors.js';
import { createMockStore } from './mock-store.js';
import { presentIntegration } from './present.js';

const ACTIONS = new Set(['start', 'stop', 'restart', 'update']);

function credentialsFromEnv(env) {
  const gladysUrl = env.GLADYS_URL || env.GLADYS_HOST_API_URL || '';
  const apiKey = env.GLADYS_API_KEY || env.GLADYS_ACCESS_TOKEN || '';
  if (!gladysUrl || !apiKey) {
    return null;
  }
  return { gladysUrl, apiKey };
}

export function createRuntime({ env = process.env, fetchImpl = fetch, store, startupDelayMs } = {}) {
  const mock = store || createMockStore({ startupDelayMs });
  const selfSelector = env.GLADYS_INTEGRATION_SELECTOR || null;
  const busy = new Set();
  let client = null;
  let message = null;

  function session() {
    return {
      mode: client ? 'gladys' : 'mock',
      configured: Boolean(client),
      gladys_url: client ? client.baseUrl : null,
      self_selector: selfSelector,
      message,
    };
  }

  function presentList(rawList) {
    if (!Array.isArray(rawList)) {
      throw new HttpError(502, 'Gladys n’a pas renvoyé la liste des intégrations.');
    }
    return rawList.map((item) => presentIntegration(item, selfSelector));
  }

  async function list() {
    if (!client) {
      return presentList(mock.list());
    }
    return presentList(await client.list());
  }

  function lock(selector) {
    if (busy.has(selector)) {
      throw new HttpError(409, 'Une action est déjà en cours pour cette intégration.');
    }
    busy.add(selector);
  }

  async function act(selector, action) {
    if (!ACTIONS.has(action)) {
      throw new HttpError(404, 'Action inconnue.');
    }
    lock(selector);
    try {
      if (!client) {
        return mock.act(selector, action, selfSelector);
      }
      const beforeList = await client.list();
      const before = beforeList.find((item) => item.selector === selector);
      if (!before) {
        throw new HttpError(404, 'Intégration introuvable.');
      }
      const returned = await client.act(selector, action);
      let after = returned && typeof returned === 'object' ? { ...before, ...returned } : before;
      try {
        const refreshed = await client.list();
        const found = refreshed.find((item) => item.selector === selector);
        if (found) {
          after = found;
        }
      } catch {
        after = {
          ...after,
          latest_version: after.latest_version ?? before.latest_version,
          update_available: after.update_available ?? before.update_available,
        };
      }
      const updateResult =
        action === 'update' ? { version: after.version, up_to_date: after.version === before.version } : null;
      return { integration: presentIntegration(after, selfSelector), update_result: updateResult };
    } finally {
      busy.delete(selector);
    }
  }

  async function logs(selector, options) {
    if (!client) {
      return { logs: mock.logs(selector, options) };
    }
    const body = await client.logs(selector, options);
    return { logs: body && typeof body.logs === 'string' ? body.logs : '' };
  }

  async function uninstall(selector) {
    lock(selector);
    try {
      if (!client) {
        return mock.uninstall(selector);
      }
      await client.uninstall(selector);
      return { success: true };
    } finally {
      busy.delete(selector);
    }
  }

  async function connect({ gladysUrl, apiKey }) {
    const next = createGladysAdmin({ baseUrl: gladysUrl, apiKey, fetchImpl });
    await next.list();
    client = next;
    message = null;
    return session();
  }

  function disconnect() {
    client = null;
    message = null;
    mock.reset();
    return session();
  }

  async function applyEnvironment() {
    const credentials = credentialsFromEnv(env);
    if (!credentials) {
      return session();
    }
    try {
      return await connect(credentials);
    } catch (error) {
      client = null;
      message = error instanceof Error ? error.message : 'Instance Gladys injoignable.';
      return session();
    }
  }

  async function useCredentials(gladysUrl, apiKey) {
    if (!apiKey) {
      client = null;
      message = null;
      return session();
    }
    return connect({ gladysUrl, apiKey });
  }

  return {
    session,
    list,
    act,
    logs,
    uninstall,
    connect,
    disconnect,
    applyEnvironment,
    useCredentials,
  };
}
