# Intégrations installées

Cette intégration externe liste les intégrations externes installées sur l’instance Gladys et permet de les superviser depuis une seule page. Les boutons sont ceux de l’écran de supervision de chaque intégration : Démarrer, Arrêter, Redémarrer, Mettre à jour ou Forcer la mise à jour, Journaux et Désinstaller.

## Prérequis

- Gladys Assistant 5.1.0 ou plus récent (widget de tableau de bord et type `provider`).
- Un compte administrateur.
- Docker, comme pour toute intégration externe, lorsque l’intégration tourne dans Gladys.

## Configuration

1. Installez l’intégration depuis son dépôt, ou en mode développeur depuis l’image Docker locale.
2. Dans l’écran Configuration, copiez l’adresse affichée (`http://{{gladys_host}}:{{port:…}}/`) et ouvrez-la : c’est le gestionnaire.
3. Créez une clé API avec un administrateur (`POST /api/v1/session/api_key`, portée `dashboard:write` par défaut) et collez-la dans le champ « Clé API administrateur ». Ce n’est pas le jeton d’intégration injecté dans le conteneur : ce jeton ne peut pas appeler les routes de supervision.
4. Enregistrez. L’intégration redémarre le sous-conteneur qui publie la page, avec cette clé.

Sans clé, la page s’ouvre quand même et montre un jeu de démonstration. Les boutons modifient alors des données locales, pas l’instance.

Une clé API se transmet telle quelle dans l’en-tête `Authorization`. Un jeton d’accès JWT (trois parties, préfixe `ey`) est envoyé sous la forme `Authorization: Bearer`.

## Ce que fait chaque bouton

La page ne parle pas à Docker. Elle appelle l’API admin déjà utilisée par l’écran de supervision :

- Démarrer, Arrêter, Redémarrer et Mettre à jour : `POST /api/v1/external_integration/:selector/start|stop|restart|update`
- Forcer la mise à jour est le même `POST …/update` lorsque aucune version plus récente n’est connue. Gladys re-télécharge l’image et recrée le conteneur.
- Journaux : `GET /api/v1/external_integration/:selector/logs?lines=200`, avec `container` pour un sous-conteneur. Le texte s’affiche dans un panneau, sans quitter la page.
- Désinstaller : `DELETE /api/v1/external_integration/:selector`, après confirmation. Gladys supprime le conteneur, les sous-conteneurs, le dossier de données, les appareils, les calendriers, la configuration et la ligne de service.

La liste et les versions viennent de `GET /api/v1/external_integration`, qui fournit `version`, `latest_version` (index du store, ou manifeste du dépôt s’il est plus récent) et `update_available`.

## Dépannage

- La page reste en démonstration : la clé est absente, refusée, ou l’adresse de Gladys est injoignable depuis le conteneur. Vérifiez `GLADYS_HOST_API_URL` et qu’un administrateur a créé la clé.
- Une action répond 403 : la clé n’appartient pas à un administrateur, ou sa portée n’est pas `dashboard:write`.
- Une mise à jour dure longtemps : Gladys tire l’image Docker. Le gestionnaire attend cette réponse, il ne lance pas un autre téléchargement.
- Les journaux sont vides : le conteneur n’a encore rien écrit sur sa sortie standard. Gladys ne stocke pas une table de journaux.
- Après une désinstallation de cette intégration elle-même, la page disparaît : son sous-conteneur est arrêté avec elle.

Les intégrations internes (Zigbee, MQTT, etc.) n’apparaissent pas. Leur supervision passe par `/api/v1/service/:nom/start|stop`, sans mise à jour, journaux ni désinstallation de ce type.
