import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { RoomServiceClient, TokenVerifier } from 'livekit-server-sdk';
import { createApp } from '../src/app.js';
import { createLiveKit } from '../src/livekit.js';
import { createInvitation } from '../src/invitations.js';

test('real self-hosted LiveKit: backend readiness, room creation/listing and token signing', {
  skip: !process.env.LIVEKIT_INTEGRATION_URL,
}, async (t) => {
  const config = {
    livekitUrl: process.env.LIVEKIT_INTEGRATION_URL,
    websocketUrl: 'ws://127.0.0.1:7880',
    apiKey: process.env.LIVEKIT_API_KEY || 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET || 'secret',
    backendApiKey: 'integration-backend-key-32-characters-minimum',
    inviteSigningSecret: 'integration-invitation-secret-32-characters-minimum',
  };
  const service = createLiveKit(config);
  const server = createApp(config, service);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  });
  const request = (path, body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${config.backendApiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const name = `sdk-verification-${crypto.randomUUID()}`;
  try {
    assert.equal((await request('/api/ready')).status, 200);
    const response = await request('/api/rooms', { name, maxParticipants: 3, emptyTimeout: 60 });
    assert.equal(response.status, 201);
    const { room } = await response.json();
    assert.equal(room.name, name);
    assert.equal(room.maxParticipants, 3);
    assert.equal(room.emptyTimeout, 60);
    const list = await request('/api/rooms');
    assert.equal(list.status, 200);
    assert.ok((await list.json()).rooms.some(item => item.name === name));
    const signed = await request('/api/token', { room: name, identity: 'integration-user' });
    assert.equal(signed.status, 200);
    const { token } = await signed.json();
    assert.equal((await new TokenVerifier(config.apiKey, config.apiSecret).verify(token)).video.room, name);
    const invitation = createInvitation(config.inviteSigningSecret, { room: name, identity: 'invited-viewer', role: 'viewer' });
    const joined = await request('/api/join', { invitation });
    assert.equal(joined.status, 200);
    const inviteClaims = await new TokenVerifier(config.apiKey, config.apiSecret).verify((await joined.json()).token);
    assert.equal(inviteClaims.video.canPublish, false);
    assert.equal(inviteClaims.sub, 'invited-viewer');
  } finally {
    await new RoomServiceClient(config.livekitUrl, config.apiKey, config.apiSecret, { requestTimeout: 5 }).deleteRoom(name);
  }
});
