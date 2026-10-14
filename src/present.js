import { HttpError } from './errors.js';

const STATUS_LABELS = {
  UNKNOWN: 'Inconnu',
  ENABLED: 'Activée',
  DISABLED: 'Désactivée',
  LOADING: 'Chargement',
  RUNNING: "En cours d'exécution",
  DEGRADED: 'Dégradée',
  STOPPED: 'Arrêtée',
  ERROR: 'Erreur',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.UNKNOWN;
}

export function containerNames(raw) {
  const declared = raw && raw.manifest && Array.isArray(raw.manifest.containers) ? raw.manifest.containers : [];
  return declared.map((entry) => entry && entry.name).filter((name) => typeof name === 'string' && name.length > 0);
}

function delegatedContracts(manifest) {
  const templates =
    manifest && manifest.energy_contracts && Array.isArray(manifest.energy_contracts.templates)
      ? manifest.energy_contracts.templates
      : [];
  return templates.some((template) => template && template.pricing_mode === 'delegated');
}

export function presentIntegration(raw, selfSelector) {
  const manifest = raw && raw.manifest && typeof raw.manifest === 'object' ? raw.manifest : {};
  const manifestName = typeof manifest.name === 'string' ? manifest.name.trim() : '';
  return {
    selector: raw.selector,
    name: manifestName || raw.name || raw.selector,
    version: raw.version || null,
    latest_version: raw.latest_version ?? null,
    update_available: Boolean(raw.update_available),
    status: raw.status || 'UNKNOWN',
    status_label: statusLabel(raw.status || 'UNKNOWN'),
    docker_image: raw.docker_image || null,
    store_slug: raw.store_slug || null,
    manifest_type: manifest.type || null,
    has_delegated_contracts: delegatedContracts(manifest),
    containers: containerNames(raw),
    self: Boolean(selfSelector && raw.selector === selfSelector),
  };
}

export function normalizeGladysUrl(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new HttpError(400, 'Indiquez l’adresse de l’instance Gladys.');
  }
  const trimmed = input.trim();
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new HttpError(400, 'L’adresse de Gladys est invalide.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'L’adresse de Gladys doit commencer par http:// ou https://.');
  }
  url.pathname = url.pathname.replace(/\/api\/(?:integration\/)?v1\/?$/i, '');
  url.search = '';
  url.hash = '';
  const path = url.pathname.replace(/\/$/, '');
  return `${url.origin}${path}`;
}

export function authorizationHeader(secret) {
  if (typeof secret !== 'string' || secret.trim() === '') {
    throw new HttpError(400, 'Indiquez une clé API administrateur ou un jeton d’accès.');
  }
  const value = secret.trim();
  const bearer = value.match(/^Bearer\s+(.+)$/i);
  const token = bearer ? bearer[1].trim() : value;
  if (token.split('.').length === 3 && token.startsWith('ey')) {
    return `Bearer ${token}`;
  }
  return token;
}
