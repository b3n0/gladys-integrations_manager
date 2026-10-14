# Intégrations installées

Intégration externe pour [Gladys Assistant](https://gladysassistant.com/fr/docs/dev/external-integrations/). Elle affiche, sur une seule page, les intégrations externes installées sur la machine et reprend les actions de leur écran de supervision.

Chaque action appelle l’API admin que Gladys expose déjà :

| Action | Route |
| --- | --- |
| Liste, version installée, dernière version publiée, état | `GET /api/v1/external_integration` |
| Démarrer, Arrêter, Redémarrer | `POST /api/v1/external_integration/:selector/start` \| `stop` \| `restart` |
| Mettre à jour et Forcer la mise à jour | `POST /api/v1/external_integration/:selector/update` |
| Journaux | `GET /api/v1/external_integration/:selector/logs?lines=200` |
| Désinstaller | `DELETE /api/v1/external_integration/:selector` |

Le jeton d’intégration (`GLADYS_INTEGRATION_TOKEN`) authentifie le conteneur auprès de `/api/integration/v1`. Il ne donne pas le droit de superviser les autres intégrations. La page utilise une clé API d’administrateur (portée `dashboard:write`), le même type d’identité que le navigateur connecté à Gladys.

## Lancer en local

Node.js 22 ou plus récent.

```bash
npm install
npm start
```

Le serveur écoute sur le port **4317** : [http://127.0.0.1:4317](http://127.0.0.1:4317).

Sans Gladys, la page démarre en **démonstration** : cinq intégrations fictives, et tous les boutons (y compris les journaux et la confirmation de désinstallation) modifient ce jeu en mémoire.

Pour parler à une vraie instance :

```bash
GLADYS_URL=http://192.168.1.10:1443 \
GLADYS_API_KEY="clé-api-administrateur" \
npm start
```

`GLADYS_ACCESS_TOKEN` est accepté à la place de `GLADYS_API_KEY` si vous collez un jeton d’accès JWT. `GLADYS_HOST_API_URL` est accepté à la place de `GLADYS_URL`. On peut aussi saisir l’adresse et la clé dans le panneau « Connexion à une instance Gladys » de la page. Si l’instance ne répond pas, la démonstration reste affichée et le message d’erreur est montré au-dessus du tableau.

```bash
npm test
```

## Dans Gladys

Le manifeste est `gladys-assistant-integration.json` (`type: provider`, catégorie `services`, widget `installed`). Le sous-conteneur `ui` publie le port 4317 ; Gladys choisit le port hôte et l’écran Configuration indique l’adresse. Au démarrage, et quand la clé API de la configuration change, le conteneur principal appelle `startContainer("ui")` avec cette clé.

L’image déclarée est `ghcr.io/gladysassistant/integrations-manager:1.0.0`. Elle n’est pas publiée par ce dépôt : en attendant, lancez le processus Node, ou construisez l’image et installez-la en mode développeur.

```bash
docker build -t ghcr.io/gladysassistant/integrations-manager:1.0.0 .
```

Le développement contre une instance déjà installée en mode développeur reprend les variables du guide Gladys :

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="…" \
GLADYS_INTEGRATION_SELECTOR="ext-…" \
GLADYS_API_KEY="…" \
npm start
```

## Limites

- Les intégrations internes ne sont pas dans le tableau. Leur API (`/api/v1/service/:nom/start|stop`) n’a pas la mise à jour, les journaux ni la désinstallation des intégrations externes.
- Les journaux s’ouvrent dans un panneau de cette page. L’écran Gladys, lui, change d’onglet. La route lue est la même.
- L’écran de supervision français dit encore que les appareils restent après désinstallation. Le code actuel de `externalIntegration.uninstall` les supprime, avec le conteneur, les calendriers, la configuration et la ligne de service. La confirmation de cette page décrit cette suppression.
- Le statut vivant de Gladys passe par le WebSocket `STATUS_CHANGED`. Ici, la liste est relue. Il n’y a pas d’autre commande que celles du tableau.
- Pas de bascule matériel, ni de lien « Ouvrir » vers les ports des sous-conteneurs : ces contrôles restent sur l’écran de supervision de l’intégration concernée.
- Le widget du tableau de bord ne peut pas afficher ce tableau (vocabulaire et budget de contenu Gladys). Il résume les comptes. La page est le sous-conteneur `ui`.
