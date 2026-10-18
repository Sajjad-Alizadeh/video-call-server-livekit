# Start the backend and frontend — step by step

This is the main local startup guide for this project. Follow the numbered steps in order. All commands below run in a terminal on your machine unless stated otherwise.


**Docker runs all three services:**

| Service | What it does | Address on your machine |
| --- | --- | --- |
| `livekit` | Connects participants and forwards their audio/video | `ws://127.0.0.1:7880` |
| `backend` | Checks invitation codes, generates participant tokens, manages rooms | `http://127.0.0.1:3000` |
| `web` | Serves the React meeting interface | `http://127.0.0.1:5173` |

You do not need to install the LiveKit binary, run a LiveKit installation script, or start Node/Vite separately for this Docker workflow. You can use one terminal for every step; services run in the background.

## Step 1 — Open the project directory

```bash
cd /home/sajjad/Desktop/BackEndProjects/live-kit-node-server
```

Run all later commands from this directory. On another computer, use the directory where you copied/cloned the project.

Confirm that you see the Compose file:

```bash
ls compose.yaml
```

Expected output:

```text
compose.yaml
```

## Step 2 — Make sure Docker is running

If you use Docker Desktop, open Docker Desktop and wait until its engine is running.

Check Docker and Compose:

```bash
docker --version
docker compose version
docker info --format '{{.ServerVersion}}'
```

The first two commands should print version information; the third should print the engine version. If Docker reports that it cannot connect to the daemon, start Docker before continuing. For Docker Engine managed by systemd on Ubuntu, use:

```bash
sudo systemctl start docker
```

That systemd command is for Docker Engine, not a replacement for opening Docker Desktop. If Docker is not installed, follow the [official Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/) or [Docker Desktop installation guide](https://docs.docker.com/desktop/).

## Step 3 — Check the configuration files

```bash
ls -l .env config/livekit.yaml
```

**These files were already generated in your current project. If both exist, skip to Step 4.** The command lists file information without displaying your secret values.

On a fresh checkout where **both files are missing**, generate them with this Docker command:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --volume "$PWD:/workspace" \
  --workdir /workspace \
  node:24-alpine node scripts/setup.js
```

This runs a temporary Node container, generates matching credentials, and writes the two files into your project. It does not install Node or LiveKit on the host.

- `.env` contains backend settings and private signing keys.
- `config/livekit.yaml` configures LiveKit with the matching API key and secret.
- Keep both files private and out of git.
- Setup deliberately refuses to overwrite either file. Do not rerun it as a daily startup command.
- If only one file exists, preserve it and restore its matching configuration from your environment/backup. Do not delete an existing working credential file to bypass the protection.

## Step 4 — Start the backend, frontend, and LiveKit

Run this single command:

```bash
docker compose up --build --detach --wait
```

What happens:

1. Docker downloads the required base images when needed.
2. Docker installs the Node and React dependencies inside the images.
3. Docker builds your backend and React application.
4. Docker starts the LiveKit media server.
5. Docker starts the backend and checks that it can communicate with LiveKit.
6. Docker starts the React web container after the backend is healthy.

The first build can take several minutes. Later starts reuse cached images/layers.

`--build` builds your application images, `--detach` leaves services running in the background, and `--wait` waits for running/healthy status. See the [official Compose up reference](https://docs.docker.com/reference/cli/docker/compose/up/).

**You do not need additional `npm start`, `npm run dev`, or `livekit-server` commands for this workflow.** Closing the terminal does not stop the detached containers; Docker itself must remain running.

## Step 5 — Confirm everything started

```bash
docker compose ps
```

You should see these three services:

| Service | Expected state |
| --- | --- |
| `livekit` | Running / Up |
| `backend` | Running / Up, healthy |
| `web` | Running / Up, healthy |

Check backend liveness:

```bash
curl http://127.0.0.1:3000/health
```

Expected response:

```json
{"status":"ok"}
```

This endpoint checks the Node process. The backend container's healthcheck separately verifies its LiveKit API connection.

If startup fails, use the troubleshooting section below before generating invitations.

## Step 6 — Open your React frontend

Open this URL in your browser:

**http://127.0.0.1:5173**

You should see the invitation-code form with camera and microphone choices.

The frontend is already running in Docker. Port 5173 is the address to open in the browser. Port 3000 is the API; it is not the React interface. Port 7880 is LiveKit signaling; it is not the application page.

## Step 7 — Create an invitation for Alice

You can now create invitations in React. Expand **Create an invitation · Host**, enter the dedicated `INVITE_CREATOR_KEY` from `.env`, then choose a room, participant identity, role, and expiry. Click **Generate invitation**, then **Copy code** or **Use this code**. The CLI below remains available. See [the invitation guide](docs/INVITATIONS.md) for details.

In your project terminal, run:

```bash
docker compose exec -T backend node scripts/invite.js \
  --room demo \
  --identity alice \
  --name Alice
```

This executes the invitation script inside the already-running backend container. It prints a long code on one line. Copy that code, without adding quotes, into the frontend's **Invitation code** box.

Choose whether to enable the camera or microphone, then click **Join room**. Allow browser device access when prompted. You can also join with both devices off and enable them later using the meeting controls.

The code is valid for 15 minutes by default. Generate a fresh one if it expires. Sharing it gives its recipient access as Alice, so treat it as private.

## Step 8 — Add another participant

Generate a second invitation:

```bash
docker compose exec -T backend node scripts/invite.js \
  --room demo \
  --identity bob \
  --name Bob
```

Open **http://127.0.0.1:5173** in another browser tab/window and join using Bob's code.

Use the same room (`demo`) and different identities (`alice`, `bob`). Two people using the same identity can disconnect each other. Use headphones and enable only one microphone when testing multiple tabs on the same machine to avoid audio feedback.

For a viewer who can watch/listen but cannot publish media or data:

```bash
docker compose exec -T backend node scripts/invite.js \
  --room demo \
  --identity viewer-1 \
  --name Viewer \
  --role viewer \
  --ttl 3600
```

That invitation lasts one hour. Invitations can be reused until expiry. There is no per-invitation revocation database in this version.

## Step 9 — Understand the connection

The invitation is generated by the backend container using its private signing key. The React app sends the code to `/api/join`. The backend checks its signature, expiry, room, identity, and role, then returns a participant token and the LiveKit WebSocket URL.

React connects directly to LiveKit using that token. Audio/video goes between the browser and LiveKit, not through the Node API. The frontend never receives the backend API key, invitation signing secret, or LiveKit API secret.

The frontend request uses its own origin. Its nginx container forwards `/api/join` to the backend container. You do not need to configure browser CORS for the included frontend.

## Step 10 — View logs when needed

All services, last 100 lines:

```bash
docker compose logs --tail=100
```

Follow new logs:

```bash
docker compose logs --follow backend web livekit
```

Press **Ctrl+C** to stop following the logs. This does not stop the detached application containers.

Only one service:

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 livekit
docker compose logs --tail=100 web
```

Do not share the contents of `.env`, invitation codes, or participant tokens when reporting a problem.

## Step 11 — Apply code or configuration changes

After changing backend or React source code, rebuild and recreate the affected images/containers:

```bash
docker compose up --build --detach --wait
```

Refresh the browser afterward. This Docker setup serves a built frontend; it does not automatically reload source edits.

After changing `.env` or `config/livekit.yaml`, ensure the containers are recreated:

```bash
docker compose up --build --force-recreate --detach --wait
```

Keep LiveKit API credentials synchronized between the two configuration files. A plain `docker compose restart` does not load changed Compose environment variables.

## Step 12 — Stop the project

```bash
docker compose down
```

This stops/removes the project's containers and Compose network. Your source code, `.env`, and `config/livekit.yaml` stay on disk. Active calls disconnect; rooms are runtime state, not a stored meeting database. See the [official Compose down reference](https://docs.docker.com/reference/cli/docker/compose/down/).

To start again later:

```bash
cd /home/sajjad/Desktop/BackEndProjects/live-kit-node-server
docker compose up --detach --wait
```

Use `--build` as well if source code changed since the last build. Setup does not need to run again.

## Optional — Run React with hot reload while Docker runs the backend

The Docker-only workflow above already runs both projects. Use this alternative only if you want to edit React with immediate browser updates and have Node.js 24+ / npm installed locally.

Stop the Docker frontend so it releases port 5173:

```bash
docker compose stop web
```

Ensure the backend and LiveKit are running:

```bash
docker compose up --build --detach --wait backend
```

Install and start the example React development server:

```bash
npm --prefix examples/react-client ci
npm --prefix examples/react-client run dev
```

Keep that terminal open. Open **http://127.0.0.1:5173**. The existing Vite proxy forwards `/api/join` to the Docker backend at port 3000. Generate invitations using the same `docker compose exec` commands as before.

To return to the all-Docker workflow, press Ctrl+C in the Vite terminal, then run:

```bash
docker compose up --build --detach --wait
```

For integration into a separate existing React app, follow [the React integration guide](docs/GUIDE.md#6-add-it-to-an-existing-react-project). Never put server secrets into browser environment variables.

## Common problems

| Problem | Action |
| --- | --- |
| `livekit-server: command not found` | Use Step 4. Docker runs the binary inside its container. |
| `docker: command not found` | Install Docker first; see Step 2. |
| Cannot connect to Docker daemon | Start Docker Desktop or your Docker Engine service, then retry. |
| Permission denied accessing Docker socket | Follow the official Docker installation's user-access setup; do not make the socket world-writable. |
| Missing `.env` or `config/livekit.yaml` | Follow Step 3. |
| Setup refuses to overwrite a file | Expected protection; existing configuration should be kept. |
| Port is already allocated | Stop an earlier Node/Vite process or another container using 3000, 5173, 7880, 7881, or 7882. Do not start a second frontend on 5173. |
| Backend is unhealthy | Read backend and LiveKit logs; confirm the media server is running and its credentials match `.env`. |
| Web page does not open | Check `docker compose ps` and web logs; open port 5173, not 3000 or 7880. |
| Invitation returns 401 | Copy the complete code and check its expiry; generate a new invitation from the running backend. |
| Two participants disconnect each other | Generate codes with different identities for the same room. |
| Camera or microphone is unavailable | Allow browser permissions; use the loopback URL for local testing. |
| Room joins but media fails | Check host firewall, Docker UDP forwarding, and media ports 7881/TCP and 7882/UDP. |

## Local testing versus your future Ubuntu server

The default `compose.yaml` publishes ports only on loopback and advertises loopback for media. It supports browser participants on this computer. Another phone/computer cannot use these loopback URLs to join.

For public Ubuntu deployment, use the separate `compose.ubuntu.yaml` with production-generated credentials, your domain, trusted TLS, reachable media ports, and appropriate public IP/TURN configuration. Follow [the Ubuntu Docker deployment instructions](docs/DOCKER.md#future-ubuntu-deployment). The local commands above do not configure a public deployment.

## Daily command checklist

From the project directory:

```bash
# Start everything
docker compose up --build --detach --wait

# Check status
docker compose ps

# Create a participant invitation
docker compose exec -T backend node scripts/invite.js --room demo --identity alice --name Alice

# Open http://127.0.0.1:5173 and paste the code

# Stop everything when finished
docker compose down
```
