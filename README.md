# Self-hosted LiveKit + React

Run the LiveKit media server, Node.js backend, and React client with **Docker Compose**. No LiveKit or Node.js installation is needed on your machine.

**Start here: [step-by-step backend and frontend startup instructions](START_HERE.md).** It explains each command, first-time setup, invitations, logs, rebuilding, shutdown, and optional React hot reload.


The current workspace already has generated private configuration. Start everything:

```bash
docker compose up --build --detach --wait
```

Open **http://127.0.0.1:5173**, then generate an invitation:

```bash
docker compose exec -T backend node scripts/invite.js --room demo --identity alice --name Alice
```

You can also create codes directly in React: expand **Create an invitation · Host**, enter `INVITE_CREATOR_KEY` from `.env`, and fill the participant details. See [React invitation generation](docs/INVITATIONS.md).

Paste the code and join. Generate another invitation with `--identity bob` for a second participant. Use the same room name. Add `--role viewer` for watching/listening only.

On a **fresh checkout**, first generate matching credentials entirely through Docker:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  --volume "$PWD:/workspace" --workdir /workspace \
  node:24-alpine node scripts/setup.js
```

Setup refuses to overwrite existing `.env` or `config/livekit.yaml` files. Keep these files private. Local Compose binds published ports to loopback and supports participants on this machine.

- **[Docker guide](docs/DOCKER.md):** startup, configuration, daily commands, troubleshooting, and the separate Ubuntu Compose file.
- **[Full application and React guide](docs/GUIDE.md):** architecture, invitations, roles, React integration, APIs, TLS, and networking.
- **[React example](examples/react-client/src/App.jsx):** complete connection UI.

Stop the stack:

```bash
docker compose down
```

The Node backend protects administrative APIs with a backend-only key. React exchanges a room-specific invitation for a participant token; server secrets stay outside the frontend and Docker images. Invitations are reusable until expiry and have no individual revocation database.

For future public Ubuntu hosting, use `compose.ubuntu.yaml` with production credentials, trusted TLS, public media configuration, and matching firewall rules. See the Docker guide before deploying.

Official references: [LiveKit SDK](https://docs.livekit.io/reference/server-sdk-js/), [React components](https://docs.livekit.io/reference/components/react/installation/), [LiveKit deployment](https://docs.livekit.io/transport/self-hosting/deployment/).
