import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { startHttpServer } from './src/server.js';
import { createRuntime } from './src/runtime.js';
import { buildWidgetContent } from './src/widget.js';

const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || '0.0.0.0';
const role = process.env.INTEGRATIONS_MANAGER_ROLE || 'main';
const runtime = createRuntime({ env: process.env });

await runtime.applyEnvironment();

const server = startHttpServer(runtime, { port, host });
server.on('listening', () => {
  const shown = host === '0.0.0.0' ? '127.0.0.1' : host;
  console.log(`Gestionnaire d'intégrations : http://${shown}:${port}`);
});
server.on('error', (error) => {
  logger.error(`Serveur HTTP arrêté : ${error.message}`);
  process.exit(1);
});

function closeServer() {
  return new Promise((resolve) => server.close(resolve));
}

async function syncFromConfig(gladys, config) {
  const apiKey = config && typeof config.api_key === 'string' ? config.api_key : '';
  const gladysUrl = process.env.GLADYS_HOST_API_URL || '';
  if (apiKey && gladysUrl) {
    try {
      await runtime.useCredentials(gladysUrl, apiKey);
    } catch (error) {
      logger.warn(`Clé API refusée par Gladys : ${error.message}`);
    }
    try {
      await gladys.requestWidgetRefresh('installed');
    } catch (error) {
      logger.warn(`Rafraîchissement du widget ignoré : ${error.message}`);
    }
  }
  try {
    await gladys.startContainer('ui', {
      env: {
        INTEGRATIONS_MANAGER_ROLE: 'ui',
        GLADYS_URL: gladysUrl,
        GLADYS_API_KEY: apiKey,
        PORT: String(port),
      },
    });
  } catch (error) {
    logger.warn(`Sous-conteneur ui non démarré : ${error.message}`);
  }
}

const insideGladys = role !== 'ui' && process.env.GLADYS_HOST_API_URL && process.env.GLADYS_INTEGRATION_TOKEN;

if (insideGladys) {
  const gladys = new GladysIntegration();
  gladys.onConfigUpdated(async (config) => {
    await syncFromConfig(gladys, config);
  });
  gladys.onWidgetGet('installed', async () => buildWidgetContent(await runtime.list(), runtime.session()));
  gladys.handleShutdown(closeServer);
  try {
    await gladys.connect();
    await syncFromConfig(gladys, await gladys.getConfig());
  } catch (error) {
    logger.error(`Connexion à Gladys impossible : ${error.message}`);
  }
} else {
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
