import { HttpError } from './errors.js';
import { presentIntegration } from './present.js';

const ACTIONS = new Set(['start', 'stop', 'restart', 'update']);

function line(text) {
  return `${new Date().toISOString()} ${text}`;
}

function seed() {
  return [
    {
      selector: 'ext-demo-open-meteo',
      name: 'ext-demo-open-meteo',
      version: '1.4.0',
      latest_version: '1.6.2',
      update_available: true,
      status: 'RUNNING',
      docker_image: 'ghcr.io/demo/open-meteo:1.4.0',
      store_slug: 'demo/open-meteo',
      manifest: { name: 'Open-Meteo', type: 'weather', containers: [] },
      logs: {
        main: [
          line('Connecté à l’API hôte Gladys.'),
          line('Prévision publiée pour la maison principale.'),
        ],
      },
    },
    {
      selector: 'ext-demo-frigate',
      name: 'ext-demo-frigate',
      version: '0.14.1',
      latest_version: '0.14.1',
      update_available: false,
      status: 'RUNNING',
      docker_image: 'ghcr.io/demo/frigate:0.14.1',
      store_slug: 'demo/frigate',
      manifest: {
        name: 'Frigate',
        type: 'device',
        containers: [{ name: 'mqtt' }],
      },
      logs: {
        main: [line('Détecteur prêt, caméra entrée en ligne.')],
        mqtt: [line('Broker MQTT à l’écoute sur le réseau privé.')],
      },
    },
    {
      selector: 'ext-demo-telegram',
      name: 'ext-demo-telegram',
      version: '2.1.0',
      latest_version: '2.1.0',
      update_available: false,
      status: 'STOPPED',
      docker_image: 'ghcr.io/demo/telegram:2.1.0',
      store_slug: 'demo/telegram',
      manifest: { name: 'Telegram', type: 'communication', containers: [] },
      logs: { main: [] },
    },
    {
      selector: 'ext-demo-nextcloud',
      name: 'ext-demo-nextcloud',
      version: '1.0.0',
      latest_version: '1.2.0',
      update_available: true,
      status: 'ERROR',
      docker_image: 'ghcr.io/demo/nextcloud-calendar:1.0.0',
      store_slug: 'demo/nextcloud-calendar',
      manifest: { name: 'Calendrier Nextcloud', type: 'calendar', containers: [] },
      logs: {
        main: [line('Cinq échecs de démarrage. Redémarrage automatique suspendu.')],
      },
    },
    {
      selector: 'ext-demo-tarif',
      name: 'ext-demo-tarif',
      version: '0.3.0',
      latest_version: null,
      update_available: false,
      status: 'DEGRADED',
      docker_image: 'ghcr.io/demo/tarif-dynamique:0.3.0',
      store_slug: 'demo/tarif-dynamique',
      manifest: {
        name: 'Tarif dynamique',
        type: 'provider',
        containers: [],
        energy_contracts: { templates: [{ pricing_mode: 'delegated' }] },
      },
      logs: {
        main: [line('Fournisseur de prix joignable, réponse plus lente que d’habitude.')],
      },
    },
  ];
}

export function createMockStore({ startupDelayMs = 700 } = {}) {
  const items = seed();
  const timers = new Map();

  function requireItem(selector) {
    const item = items.find((entry) => entry.selector === selector);
    if (!item) {
      throw new HttpError(404, 'Intégration introuvable.');
    }
    return item;
  }

  function cancelStartup(selector) {
    const timer = timers.get(selector);
    if (timer) {
      clearTimeout(timer);
      timers.delete(selector);
    }
  }

  function armRunning(item) {
    cancelStartup(item.selector);
    const timer = setTimeout(() => {
      timers.delete(item.selector);
      if (item.status === 'LOADING') {
        item.status = 'RUNNING';
        item.logs.main.push(line('Conteneur démarré, intégration en cours d’exécution.'));
      }
    }, startupDelayMs);
    timer.unref();
    timers.set(item.selector, timer);
  }

  function append(item, container, text) {
    if (!item.logs[container]) {
      item.logs[container] = [];
    }
    item.logs[container].push(line(text));
  }

  return {
    mode: 'mock',
    list() {
      return items.map((item) => structuredClone(item));
    },
    act(selector, action, selfSelector) {
      if (!ACTIONS.has(action)) {
        throw new HttpError(404, 'Action inconnue.');
      }
      const item = requireItem(selector);
      const previousVersion = item.version;
      if (action === 'stop') {
        cancelStartup(item.selector);
        item.status = 'STOPPED';
        append(item, 'main', 'Arrêt demandé par l’administrateur.');
      } else if (action === 'update') {
        const upToDate = !item.update_available;
        if (item.update_available && item.latest_version) {
          item.version = item.latest_version;
          item.docker_image = item.docker_image.replace(/:[^:]+$/, `:${item.version}`);
          item.update_available = false;
          append(item, 'main', `Mise à jour vers ${item.version} : image tirée, conteneur recréé.`);
        } else {
          append(item, 'main', 'Déjà à jour : image re-téléchargée, conteneur recréé.');
        }
        item.status = 'LOADING';
        armRunning(item);
        return {
          integration: presentIntegration(item, selfSelector),
          update_result: { version: item.version, up_to_date: upToDate && item.version === previousVersion },
        };
      } else {
        item.status = 'LOADING';
        append(item, 'main', action === 'restart' ? 'Redémarrage demandé.' : 'Démarrage demandé.');
        armRunning(item);
      }
      return { integration: presentIntegration(item, selfSelector), update_result: null };
    },
    logs(selector, { lines = 200, container } = {}) {
      const item = requireItem(selector);
      const names = (item.manifest.containers || []).map((entry) => entry.name);
      let key = 'main';
      if (container && container !== 'main') {
        if (!names.includes(container)) {
          throw new HttpError(404, 'Conteneur introuvable.');
        }
        key = container;
      }
      const rows = item.logs[key] || [];
      const safeLines = Math.min(5000, Math.max(1, Number(lines) || 200));
      return rows.slice(-safeLines).join('\n');
    },
    uninstall(selector) {
      const index = items.findIndex((entry) => entry.selector === selector);
      if (index === -1) {
        throw new HttpError(404, 'Intégration introuvable.');
      }
      cancelStartup(selector);
      items.splice(index, 1);
      return { success: true };
    },
    reset() {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      items.splice(0, items.length, ...seed());
    },
  };
}
