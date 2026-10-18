# Generate invitations in React

Start the local Docker stack:

```bash
docker compose up --build --detach --wait
```

Open **http://127.0.0.1:5173** and expand **Create an invitation · Host**.

## Get your host access key

Use `INVITE_CREATOR_KEY` from your private `.env`, or display just that value from the running backend:

```bash
docker compose exec -T backend node -p 'process.env.INVITE_CREATOR_KEY'
```

This command intentionally displays the host credential in your own terminal. Keep it private; meeting guests only need their invitation codes.

Fresh setup generates this key automatically. If it is absent in an older environment, configure a separate random key of at least 32 characters and recreate the backend. Do not reuse the full backend API key. Invitation creation is disabled when this key is unset.

## Create a code

1. Enter the host access key.
2. Choose a room, such as `demo`.
3. Enter a unique participant identity, such as `alice`.
4. Optionally enter a display name.
5. Choose Publisher or Viewer and an invitation lifetime.
6. Click **Generate invitation**.
7. Click **Copy code** to send it to that participant, or **Use this code** to fill your own join form.
8. Click **Join room**.

Create another code with the same room and a different identity for each additional participant. Publishers can publish media/data and subscribe; viewers can only subscribe. Invitations are reusable until expiry; there is no individual revocation database.

The form stores the host key only in memory. **Forget host key** clears the input; reloading or leaving the form also clears it. The app does not save it in local storage, URLs, or frontend build settings.

## How it works

React calls `POST /api/invitations` with the dedicated host key as a bearer credential. The backend validates the participant fields and signs the invitation. The host key cannot call administrative room/token APIs.

Guests call `POST /api/join` with their invitation, without the host key. The backend verifies its signature and expiry, then returns a room-scoped LiveKit participant token. Signing secrets remain on the server.

Use HTTPS when deploying on a real server. Localhost works for local browser testing. The Ubuntu deployment setup is described in [DOCKER.md](DOCKER.md#future-ubuntu-deployment).
