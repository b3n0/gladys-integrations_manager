const UNINSTALL_WARNING =
  'Êtes-vous sûr de vouloir désinstaller cette intégration ? Gladys supprime son conteneur, ses sous-conteneurs, son dossier de données, ses appareils, ses calendriers, sa configuration et l’intégration elle-même.';
const UNINSTALL_CALENDAR_WARNING =
  'Êtes-vous sûr de vouloir désinstaller cette intégration ? Son conteneur et sa configuration seront supprimés, et les calendriers qu’elle a créés seront supprimés avec leurs événements, pour tous les utilisateurs du foyer — pas seulement les vôtres.';
const UNINSTALL_ENERGY_WARNING =
  "Cette intégration calcule elle-même le coût de contrats d'énergie : les contrats qu'elle tarife ne seront plus calculés une fois désinstallée (leurs coûts existants sont conservés).";
const FORCE_UPDATE_TITLE =
  'Vérifie la dernière version publiée, re-télécharge l’image Docker et recrée le conteneur';

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 6h12v12H6z"/></svg>',
  restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M20 12a8 8 0 1 1-2.3-5.7M20 4v6h-6"/></svg>',
  update: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 19V5M6 11l6-6 6 6"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14"/></svg>',
  logs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M6 3h9l3 3v15H6zM9 12h6M9 16h6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M4 7h16M9 7V5h6v2m-7 0 1 13h6l1-13"/></svg>',
};

const state = {
  session: null,
  load: 'loading',
  error: '',
  integrations: [],
  pending: null,
  confirming: null,
  notices: {},
  logs: { selector: null, container: 'main' },
};

const board = document.querySelector('#board');
const lead = document.querySelector('#lead');
const mode = document.querySelector('#mode');
const banner = document.querySelector('#banner');
const logsDialog = document.querySelector('#logs-dialog');
const logsBody = document.querySelector('#logs-body');
const logsName = document.querySelector('#logs-name');
const logsContainer = document.querySelector('#logs-container');
const logsContainerLabel = document.querySelector('#logs-container-label');

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'title') node.title = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value != null) node.setAttribute(key, String(value));
  }
  for (const child of children) node.append(child);
  return node;
}

function icon(name) {
  const node = el('span', { class: 'icon', 'aria-hidden': 'true' });
  node.innerHTML = ICONS[name];
  return node;
}

function formatVersion(version) {
  if (!version) return null;
  const text = String(version);
  return text.startsWith('v') ? text : `v${text}`;
}

async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Erreur ${response.status}`);
  }
  return payload;
}

function currentIntegration() {
  return state.integrations.find((item) => item.selector === state.logs.selector) || null;
}

function renderChrome() {
  const live = state.session && state.session.mode === 'gladys';
  mode.textContent = live ? 'Instance Gladys' : 'Démonstration';
  mode.className = live ? 'mode live' : 'mode demo';
  document.querySelector('#disconnect').hidden = !live;
  if (state.load === 'loading') {
    lead.textContent = 'Chargement des intégrations…';
  } else if (state.load === 'error') {
    lead.textContent = 'La liste n’a pas pu être lue.';
  } else if (live) {
    lead.textContent = `Connecté à ${state.session.gladys_url}. Les boutons appellent les mêmes routes que l’écran de supervision de chaque intégration.`;
  } else {
    lead.textContent =
      'Jeu local, le temps de brancher une instance. Démarrer, arrêter, redémarrer, mettre à jour, lire les journaux et désinstaller se font sur cette page.';
  }
  banner.replaceChildren();
  if (state.session && state.session.message) {
    banner.append(
      el('div', { class: 'alert warning', role: 'status' }, [
        el('p', { text: state.session.message }),
        el('p', { text: 'Les actions ci-dessous restent simulées.' }),
      ]),
    );
  }
}

function noticeNode(integration) {
  const notice = state.notices[integration.selector];
  if (!notice) return null;
  return el('div', { class: `alert ${notice.kind}`, role: notice.kind === 'danger' ? 'alert' : 'status' }, [
    el('p', { text: notice.text }),
  ]);
}

function confirmNode(integration) {
  if (state.confirming !== integration.selector) return null;
  const paragraphs = [
    el('p', {
      text: integration.manifest_type === 'calendar' ? UNINSTALL_CALENDAR_WARNING : UNINSTALL_WARNING,
    }),
  ];
  if (integration.has_delegated_contracts) {
    paragraphs.push(el('p', { text: UNINSTALL_ENERGY_WARNING }));
  }
  if (integration.self) {
    paragraphs.push(el('p', { text: 'Cette intégration sert cette page : la désinstaller la ferme.' }));
  }
  const node = el('div', { class: 'alert danger', role: 'alert' }, [
    ...paragraphs,
    el('div', { class: 'btn-list' }, [
      button('Oui, désinstaller', 'btn btn-danger', 'trash', () => uninstall(integration), `Confirmer la désinstallation de ${integration.name}`),
      button('Annuler', 'btn btn-secondary', null, () => {
        state.confirming = null;
        render();
      }, `Annuler la désinstallation de ${integration.name}`),
    ]),
  ]);
  if (state.pending === integration.selector) {
    for (const child of node.querySelectorAll('button')) child.disabled = true;
  }
  return node;
}

function button(label, className, iconName, onClick, ariaLabel, title) {
  const node = el('button', {
    type: 'button',
    class: className,
    onclick: onClick,
    'aria-label': ariaLabel || label,
    title: title || '',
  });
  if (iconName) node.append(icon(iconName));
  node.append(document.createTextNode(label));
  return node;
}

function actions(integration) {
  const busy = state.pending === integration.selector;
  const updateLabel = integration.update_available ? 'Mettre à jour' : 'Forcer la mise à jour';
  const updateClass = integration.update_available ? 'btn btn-primary' : 'btn btn-force';
  const updateIcon = integration.update_available ? 'update' : 'download';
  const nodes = [
    button('Démarrer', 'btn btn-start', 'play', () => run(integration, 'start'), `Démarrer ${integration.name}`),
    button('Arrêter', 'btn btn-stop', 'stop', () => run(integration, 'stop'), `Arrêter ${integration.name}`),
    button('Redémarrer', 'btn btn-restart', 'restart', () => run(integration, 'restart'), `Redémarrer ${integration.name}`),
    button(
      updateLabel,
      updateClass,
      updateIcon,
      () => run(integration, 'update'),
      `${updateLabel} ${integration.name}`,
      integration.update_available ? '' : FORCE_UPDATE_TITLE,
    ),
    button('Journaux', 'btn btn-logs', 'logs', () => openLogs(integration), `Journaux de ${integration.name}`),
  ];
  if (state.confirming !== integration.selector) {
    nodes.push(
      button('Désinstaller', 'btn btn-danger', 'trash', () => {
        state.confirming = integration.selector;
        render();
      }, `Désinstaller ${integration.name}`),
    );
  }
  const list = el('div', { class: 'btn-list' }, nodes);
  if (busy) {
    for (const child of list.querySelectorAll('button')) child.disabled = true;
  }
  return list;
}

function renderTable() {
  const table = el('table', {});
  const head = el('thead', {}, [
    el('tr', {}, ['Nom', 'Version installée', 'Dernière version publiée', 'Statut', 'Actions'].map((label) => el('th', { text: label, scope: 'col' }))),
  ]);
  const body = el('tbody');
  for (const integration of state.integrations) {
    const latest = formatVersion(integration.latest_version);
    const nameCell = el('td', { 'data-label': 'Nom' }, [
      el('span', { class: 'name', text: integration.name }),
      el('span', {
        class: 'sub',
        text: integration.self ? `${integration.selector} · cette page` : integration.selector,
      }),
    ]);
    const row = el('tr', { class: state.pending === integration.selector ? 'row-busy' : '' }, [
      nameCell,
      el('td', { 'data-label': 'Version installée' }, [
        el('span', { class: 'version', text: formatVersion(integration.version) || '—' }),
      ]),
      el('td', { 'data-label': 'Dernière version publiée' }, [
        el('span', {
          class: integration.update_available ? 'version available' : 'version',
          text: latest || 'Inconnue',
        }),
        integration.update_available ? el('span', { class: 'sub', text: 'Mise à jour disponible' }) : '',
      ]),
      el('td', { 'data-label': 'Statut' }, [
        el('span', { class: `badge ${integration.status}`, text: integration.status_label }),
      ]),
      el('td', { 'data-label': 'Actions' }, [actions(integration), noticeNode(integration), confirmNode(integration)].filter(Boolean)),
    ]);
    body.append(row);
  }
  table.append(head, body);
  return table;
}

function render() {
  renderChrome();
  board.setAttribute('aria-busy', state.load === 'loading' ? 'true' : 'false');
  if (state.load === 'loading') {
    board.replaceChildren(el('p', { class: 'loading-label', text: 'Chargement des intégrations…' }));
    return;
  }
  if (state.load === 'error') {
    board.replaceChildren(
      el('div', { class: 'alert danger', role: 'alert' }, [
        el('p', { text: 'Une erreur s’est produite lors du chargement des intégrations.' }),
        state.error ? el('p', { text: state.error }) : '',
        button('Réessayer', 'btn btn-secondary', null, () => load()),
      ].filter(Boolean)),
    );
    return;
  }
  if (state.integrations.length === 0) {
    board.replaceChildren(
      el('div', { class: 'empty' }, [
        el('p', { class: 'name', text: 'Aucune intégration externe n’est installée sur cette machine.' }),
        el('p', {
          class: 'hint',
          text: 'Celles que vous installez depuis le catalogue Gladys apparaîtront ici, avec leur version et leur état.',
        }),
      ]),
    );
    return;
  }
  board.replaceChildren(renderTable());
}

async function load() {
  state.load = 'loading';
  state.error = '';
  render();
  try {
    const [session, list] = await Promise.all([api('GET', '/api/session'), api('GET', '/api/integrations')]);
    state.session = session;
    state.integrations = list.integrations;
    state.load = 'ready';
    if (state.confirming && !state.integrations.some((item) => item.selector === state.confirming)) {
      state.confirming = null;
    }
  } catch (error) {
    state.load = 'error';
    state.error = error.message;
  }
  render();
}

async function refreshQuiet() {
  if (state.pending || state.confirming || logsDialog.open || document.hidden || state.load !== 'ready') return;
  try {
    const list = await api('GET', '/api/integrations');
    state.integrations = list.integrations;
    render();
  } catch {
    // Le prochain rafraîchissement, ou le bouton Actualiser, affichera l’erreur.
  }
}

async function run(integration, action) {
  state.pending = integration.selector;
  delete state.notices[integration.selector];
  render();
  try {
    const result = await api('POST', `/api/integrations/${encodeURIComponent(integration.selector)}/${action}`);
    const index = state.integrations.findIndex((item) => item.selector === integration.selector);
    if (index >= 0) state.integrations[index] = result.integration;
    if (result.update_result) {
      const version = formatVersion(result.update_result.version) || result.update_result.version;
      state.notices[integration.selector] = result.update_result.up_to_date
        ? {
            kind: 'info',
            text: `L'intégration est déjà à jour (version ${version}) : l'image Docker a été re-téléchargée et le conteneur recréé.`,
          }
        : { kind: 'success', text: `Intégration mise à jour en version ${version}.` };
    }
  } catch (error) {
    state.notices[integration.selector] = {
      kind: 'danger',
      text: `Une erreur s’est produite lors de l’exécution de cette action. ${error.message}`,
    };
  } finally {
    state.pending = null;
    render();
  }
}

async function uninstall(integration) {
  state.pending = integration.selector;
  render();
  try {
    await api('DELETE', `/api/integrations/${encodeURIComponent(integration.selector)}`);
    state.integrations = state.integrations.filter((item) => item.selector !== integration.selector);
    state.confirming = null;
    delete state.notices[integration.selector];
  } catch (error) {
    state.notices[integration.selector] = {
      kind: 'danger',
      text: `Une erreur s’est produite lors de la désinstallation de cette intégration. ${error.message}`,
    };
  } finally {
    state.pending = null;
    render();
  }
}

function renderLogs(status, text) {
  logsBody.replaceChildren();
  if (status === 'loading') {
    logsBody.append(el('p', { class: 'loading-label', text: 'Chargement des journaux…' }));
    return;
  }
  if (status === 'error') {
    logsBody.append(el('div', { class: 'alert danger', role: 'alert' }, [el('p', { text: text })]));
    return;
  }
  if (!text) {
    logsBody.append(el('p', { class: 'hint', text: 'Aucun journal disponible.' }));
    return;
  }
  logsBody.append(el('pre', { text }));
}

async function fetchLogs() {
  const integration = currentIntegration();
  if (!integration) return;
  const container = state.logs.container;
  renderLogs('loading');
  const query = new URLSearchParams({ lines: '200' });
  if (container && container !== 'main') query.set('container', container);
  try {
    const body = await api(
      'GET',
      `/api/integrations/${encodeURIComponent(integration.selector)}/logs?${query.toString()}`,
    );
    if (state.logs.selector !== integration.selector || state.logs.container !== container) return;
    renderLogs('ready', body.logs || '');
  } catch (error) {
    renderLogs('error', `Une erreur s’est produite lors du chargement des journaux. ${error.message}`);
  }
}

function fillContainerSelect(integration) {
  const names = integration.containers || [];
  logsContainer.replaceChildren(el('option', { value: 'main', text: 'Conteneur principal' }));
  for (const name of names) logsContainer.append(el('option', { value: name, text: name }));
  logsContainer.value = 'main';
  logsContainerLabel.hidden = names.length === 0;
}

async function openLogs(integration) {
  state.logs = { selector: integration.selector, container: 'main' };
  logsName.textContent = integration.name;
  fillContainerSelect(integration);
  if (!logsDialog.open) logsDialog.showModal();
  await fetchLogs();
}

document.querySelector('#refresh').addEventListener('click', () => load());
document.querySelector('#logs-refresh').addEventListener('click', () => fetchLogs());
logsContainer.addEventListener('change', () => {
  state.logs.container = logsContainer.value;
  fetchLogs();
});
document.querySelector('#disconnect').addEventListener('click', async () => {
  state.session = await api('DELETE', '/api/session');
  state.notices = {};
  state.confirming = null;
  await load();
});
document.querySelector('#connect-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorNode = document.querySelector('#connect-error');
  const submit = document.querySelector('#connect-submit');
  errorNode.hidden = true;
  submit.disabled = true;
  try {
    state.session = await api('PUT', '/api/session', {
      gladys_url: document.querySelector('#gladys-url').value,
      api_key: document.querySelector('#api-key').value,
    });
    document.querySelector('#api-key').value = '';
    state.notices = {};
    await load();
  } catch (error) {
    errorNode.hidden = false;
    errorNode.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

load();
setInterval(refreshQuiet, 8000);
