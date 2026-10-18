# Run everything with Docker

For a numbered walkthrough from opening your terminal to joining a call, read **[START_HERE.md](../START_HERE.md)** first. This document provides additional configuration and Ubuntu deployment details.

Only Docker Engine / Docker Desktop with Docker Compose v2+ is required. You do not need to install Node.js, npm, nginx, or the LiveKit binary on the host.

## Start locally

The current workspace already contains matching `.env` and `config/livekit.yaml` files. Start from the repository root:

```bash
docker compose up --build --detach --wait
```

Open **http://127.0.0.1:5173**. The frontend is a built React app served by nginx; no host Vite process is needed.

Generate an invitation inside the backend container:

```bash
docker compose exec -T backend node scripts/invite.js --room demo --identity alice --name Alice
```

Paste the output into the join form. Generate another invitation with `--identity bob --name Bob` for a second participant. Both invitations must use the same room. Add `--role viewer` to allow watching/listening without publication.

Camera and microphone start off. Enable them in the form or meeting controls. Use different participant identities and headphones when testing multiple tabs.

## Fresh checkout: generate credentials using Docker

Run this once before the first Compose startup on a fresh checkout without `.env` or `config/livekit.yaml`:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --volume "$PWD:/workspace" \
  --workdir /workspace \
  node:24-alpine node scripts/setup.js
```

Run from the repository root in a Linux/macOS shell. The command preserves your host file ownership. Setup generates private matching files and refuses to overwrite either existing file. On Docker Desktop, allow file sharing for the project directory if requested. There is no LiveKit install script and no global Node installation.

## Services and ports

| Service | Host address | Container responsibility |
| --- | --- | --- |
| `web` | `http://127.0.0.1:5173` | React static assets; proxy only `/api/join` to backend |
| `backend` | `http://127.0.0.1:3000` | Invitations, token signing, room APIs |
| `livekit` | `ws://127.0.0.1:7880` | Participant signaling and media |
| LiveKit TCP media | `127.0.0.1:7881` | TCP fallback |
| LiveKit UDP media | `127.0.0.1:7882` | UDP mux |

The local Compose file uses a bridge network and advertises loopback for media. It is for browsers on **this machine**, not phones, remote computers, or production. All published local ports bind to loopback.

Inside Compose, Node uses `http://livekit:7880`. React receives `LIVEKIT_WS_URL` from `.env`, normally `ws://127.0.0.1:7880`. Do not use `ws://livekit:7880` in a browser; that service name only exists inside Docker.

The generated LiveKit YAML may bind signaling to loopback for native execution. Local Compose overrides its bind address inside the container so other services can reach it, while keeping published host ports on loopback. The Ubuntu file uses the production YAML as generated, without the local loopback media override.

## Daily commands

```bash
# Health/status
docker compose ps

# Follow application logs
docker compose logs --follow backend web livekit

# Generate a viewer invitation valid for an hour
docker compose exec -T backend node scripts/invite.js \
  --room demo --identity viewer-1 --role viewer --ttl 3600

# Apply source changes or changed .env settings
docker compose up --build --detach --wait

# Stop and remove this stack's containers/network; config files remain
docker compose down
```

Changes to `.env` are read when containers are created. Use `up --detach --force-recreate --wait` if you change only credentials or environment values and need to ensure recreation. A plain restart does not reload Compose environment configuration.

The Node image runs as the `node` user with a read-only root filesystem. `.env` and LiveKit config are excluded from build contexts. The backend gets its configuration at runtime; the media config is mounted read-only. Never publish an image with credentials copied into it.

The backend's container healthcheck verifies real LiveKit connectivity and credentials. The frontend starts after that check passes. A healthy status verifies the APIs, not a browser media call.

## Future Ubuntu deployment

`compose.ubuntu.yaml` is a **standalone** configuration using host networking for LiveKit, Node, and the web container. It is intended for a native Ubuntu Docker Engine. This follows [LiveKit's recommendation to use host networking](https://docs.livekit.io/transport/self-hosting/deployment/) for Docker deployments.

On a clean production checkout, generate production credentials using your actual media domain:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --volume "$PWD:/workspace" \
  --workdir /workspace \
  node:24-alpine node scripts/setup.js \
  --production --domain livekit.your-domain.com

docker compose -f compose.ubuntu.yaml up --build --detach --wait
```

Then complete these host-specific steps:

1. Point your app and media hostnames at the Ubuntu server.
2. Obtain trusted TLS certificates for both hostnames.
3. Adapt `config/nginx.example.conf` for a TLS reverse proxy on the host. It forwards the app to the web container on loopback port 5173, invitation exchange to Node on 3000, and WSS signaling to LiveKit on 7880.
4. Permit public TCP 80/443, media TCP 7881 and UDP 7882. Keep 3000, 5173, and 7880 inaccessible directly from the internet using host/cloud firewalls. Host networking does not isolate these ports automatically.
5. Verify advertised public IP/NAT settings and configure TURN if your users' networks require it, as described in [the full guide](GUIDE.md#8-prepare-ubuntu-later).

Use `-f compose.ubuntu.yaml` consistently with `exec`, `logs`, `ps`, and `down`. Do not run local and Ubuntu stacks concurrently: they intentionally use the same project name and service ports.

The Ubuntu web container listens only on `127.0.0.1:5173`; Node listens on loopback 3000. LiveKit binds as specified by the production YAML. Production generation does not automatically create DNS records, install certificates, or configure TURN.

## Troubleshooting

- **Port already allocated:** stop earlier native Node/Vite/LiveKit processes or another stack using 3000/5173/7880/7881/7882.
- **Missing config file:** run the Docker setup command on a fresh checkout. Compose will not create an empty config directory in place of the required file.
- **Backend unhealthy:** check the matching API key/secret, the LiveKit process, and `docker compose logs backend`. Do not print or share `.env`.
- **Invitation rejected:** check expiry and that the CLI/backend use the same environment. Existing invitation codes stop working if the invitation signing secret changes.
- **WebSocket works but media fails:** verify media ports, Docker Desktop UDP forwarding, local firewall, and the advertised IP. For remote clients use the Ubuntu/public configuration and valid HTTPS/WSS.
- **Browser camera/microphone unavailable:** use loopback locally or trusted HTTPS remotely and allow device permissions.

The [full guide](GUIDE.md) explains React integration, roles, invitation reuse/expiry, and administrative APIs. Native startup instructions there are optional alternatives; Docker users do not need the LiveKit binary.

## React invitation generation

The join page includes **Create an invitation · Host**. It uses the dedicated `INVITE_CREATOR_KEY`, entered manually and kept only in browser memory. Signing secrets remain server-side. Follow [INVITATIONS.md](INVITATIONS.md) for the complete flow.
