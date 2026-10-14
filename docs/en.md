# Installed integrations

This external integration lists the external integrations installed on a Gladys instance and supervises them from a single page. The buttons are the ones on each integration’s supervision screen: Start, Stop, Restart, Update or Force update, Logs and Uninstall.

## Requirements

- Gladys Assistant 5.1.0 or newer (dashboard widgets and the `provider` type).
- An administrator account.
- Docker, as for any external integration, when the integration runs inside Gladys.

## Setup

1. Install the integration from its repository, or in developer mode from a local Docker image.
2. On the Configuration screen, open the address Gladys shows (`http://{{gladys_host}}:{{port:…}}/`). That is the manager.
3. Create an API key as an administrator (`POST /api/v1/session/api_key`, scope `dashboard:write` by default) and paste it into “Admin API key”. This is not the integration token injected into the container: that token cannot call the supervision routes.
4. Save. The integration restarts the sub-container that publishes the page, with this key.

Without a key, the page still opens and shows a demonstration set. Buttons then change local data, not the instance.

A raw API key is sent as the `Authorization` header value. A JWT access token (three segments, `ey` prefix) is sent as `Authorization: Bearer`.

## What each button does

The page does not talk to Docker. It calls the admin API the supervision screen already uses:

- Start, Stop, Restart and Update: `POST /api/v1/external_integration/:selector/start|stop|restart|update`
- Force update is the same `POST …/update` when no newer version is known. Gladys re-pulls the image and recreates the container.
- Logs: `GET /api/v1/external_integration/:selector/logs?lines=200`, plus `container` for a sub-container. The text stays in a drawer on this page.
- Uninstall: `DELETE /api/v1/external_integration/:selector`, after confirmation. Gladys removes the container, sub-containers, data folder, devices, calendars, configuration and the service row.

The list and versions come from `GET /api/v1/external_integration`, which includes `version`, `latest_version` (store index, or the repo manifest when that one is newer) and `update_available`.

## Troubleshooting

- The page stays in demonstration mode: the key is missing, rejected, or Gladys cannot be reached from the container. Check `GLADYS_HOST_API_URL` and that an administrator created the key.
- An action returns 403: the key does not belong to an administrator, or its scope is not `dashboard:write`.
- An update takes a long time: Gladys is pulling the Docker image. The manager waits for that response; it does not start a second download.
- Logs are empty: the container has not written anything to stdout yet. Gladys does not keep a log table.
- Uninstalling this integration itself closes the page: its sub-container stops with it.

Built-in integrations (Zigbee, MQTT, and so on) are not listed. Their supervision goes through `/api/v1/service/:name/start|stop`, without this update, logs or uninstall flow.
