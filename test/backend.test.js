import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { TokenVerifier } from 'livekit-server-sdk';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLiveKit, TOKEN_TTL_SECONDS } from '../src/livekit.js';
import { createInvitation } from '../src/invitations.js';

const env = {
  BACKEND_API_KEY: 'test-backend-key-with-at-least-32-characters',
  INVITE_SIGNING_SECRET: 'test-invitation-secret-with-at-least-32-characters',
  INVITE_CREATOR_KEY: 'test-host-creator-key-with-at-least-32-characters',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'secret',
  LIVEKIT_URL: 'http://127.0.0.1:7880',
  LIVEKIT_WS_URL: 'ws://127.0.0.1:7880',
};
const config = loadConfig(env);
const authorization = `Bearer ${config.backendApiKey}`;
const hostAuthorization = `Bearer ${config.inviteCreatorKey}`;

async function serve(t, service = createLiveKit(config)) {
  const server = createApp(config, service, { error() {} });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  });
  return async (path, { body, rawBody, headers, ...options } = {}) => fetch(
    `http://127.0.0.1:${server.address().port}${path}`,
    {
      ...options,
      headers: { authorization, 'Content-Type': 'application/json', ...headers },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    },
  );
}

test('configuration rejects missing credentials, invalid ports and malformed URLs', () => {
  for (const name of ['BACKEND_API_KEY', 'INVITE_SIGNING_SECRET', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL', 'LIVEKIT_WS_URL']) {
    assert.throws(() => loadConfig({ ...env, [name]: '' }), new RegExp(name));
  }
  for (const port of ['0', '-1', '65536', '3.5', 'hello']) {
    assert.throws(() => loadConfig({ ...env, PORT: port }), /PORT/);
  }
  for (const url of ['ws://localhost:7880', 'http://user:password@localhost', 'http://localhost/path', 'http://localhost?secret=1']) {
    assert.throws(() => loadConfig({ ...env, LIVEKIT_URL: url }), /LIVEKIT_URL/);
  }
  assert.throws(() => loadConfig({ ...env, BACKEND_API_KEY: 'short' }), /BACKEND_API_KEY/);
  assert.throws(() => loadConfig({ ...env, INVITE_CREATOR_KEY: 'short' }), /INVITE_CREATOR_KEY/);
  assert.throws(() => loadConfig({ ...env, LIVEKIT_WS_URL: 'https://localhost' }), /LIVEKIT_WS_URL/);
});

test('host key generates room-specific invitations that guests can redeem', async (t) => {
  const request = await serve(t);
  const response = await request('/api/invitations', {
    method: 'POST', headers: { authorization: hostAuthorization },
    body: { room: 'host-room', identity: 'bob', name: 'Bob', role: 'viewer', ttl: 3600 },
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.identity, 'bob');
  assert.equal(result.role, 'viewer');
  assert.ok(result.expiresAt > Date.now() / 1000 + 3590);
  const joined = await request('/api/join', { method: 'POST', headers: { authorization: '' }, body: { invitation: result.invitation } });
  assert.equal(joined.status, 200);
  const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify((await joined.json()).token);
  assert.equal(claims.video.room, 'host-room');
  assert.equal(claims.video.canPublish, false);
  assert.equal(claims.sub, 'bob');
});

test('creator key cannot administer rooms and guest/admin keys cannot create invitations', async (t) => {
  const request = await serve(t);
  for (const authorization of ['', 'Bearer wrong', `Bearer ${config.backendApiKey}`]) {
    assert.equal((await request('/api/invitations', { method: 'POST', headers: { authorization }, body: { room: 'demo', identity: 'alice' } })).status, 401);
  }
  for (const path of ['/api/rooms', '/api/token', '/api/ready']) {
    assert.equal((await request(path, { headers: { authorization: hostAuthorization } })).status, 401);
  }
  for (const body of [{ room: 'demo', identity: 'alice', role: 'admin' }, { room: 'demo', identity: 'alice', ttl: 86401 }, { room: 'demo', identity: 'alice', roomAdmin: true }]) {
    assert.equal((await request('/api/invitations', { method: 'POST', headers: { authorization: hostAuthorization }, body })).status, 400);
  }
});

test('browser invitation creation is disabled without its own configured host key', async (t) => {
  const server = createApp({ ...config, inviteCreatorKey: undefined }, createLiveKit(config));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/invitations`, { method: 'POST' });
  assert.equal(response.status, 503);
});

test('invitation exchange uses signed identity, room and role without a backend key', async (t) => {
  const request = await serve(t);
  const invitation = createInvitation(config.inviteSigningSecret, { room: 'private-room', identity: 'alice', role: 'viewer', ttl: 60 });
  const response = await request('/api/join', { method: 'POST', body: { invitation }, headers: { authorization: '' } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.room, 'private-room');
  assert.equal(result.identity, 'alice');
  assert.equal(result.canPublish, false);
  assert.ok(result.expiresIn > 0 && result.expiresIn <= 60);
  const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(result.token);
  assert.equal(claims.sub, 'alice');
  assert.equal(claims.video.room, 'private-room');
  assert.equal(claims.video.canPublish, false);
  assert.equal(claims.video.canPublishData, false);
  assert.equal(claims.video.canSubscribe, true);
  assert.equal(claims.video.roomAdmin, undefined);
  for (const field of ['room', 'identity', 'canPublish', 'ttl']) {
    assert.equal((await request('/api/join', { method: 'POST', body: { invitation, [field]: 'override' } })).status, 400);
  }
});

test('invitation exchange rejects expired and modified codes even with an admin bearer key', async (t) => {
  const request = await serve(t);
  const expired = createInvitation(config.inviteSigningSecret, { room: 'demo', identity: 'alice', ttl: 1 }, Date.now() - 5000);
  const foreign = createInvitation('another-secret', { room: 'demo', identity: 'alice' });
  for (const invitation of ['invalid', expired, foreign]) {
    const response = await request('/api/join', { method: 'POST', body: { invitation } });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Invalid or expired invitation.' });
  }
});

test('production refuses development credentials and insecure participant URLs', () => {
  assert.throws(() => loadConfig({ ...env, NODE_ENV: 'production' }), /Production/);
  const production = { ...env, NODE_ENV: 'production', LIVEKIT_API_KEY: 'production-key', LIVEKIT_API_SECRET: 's'.repeat(32) };
  assert.throws(() => loadConfig(production), /wss:/);
  assert.equal(loadConfig({ ...production, LIVEKIT_WS_URL: 'wss://livekit.example.com' }).websocketUrl, 'wss://livekit.example.com');
});

test('signed join tokens have the correct issuer, identity, room, expiry and limited grants', async () => {
  const result = await createLiveKit(config).createToken({ room: 'demo', identity: 'alice', name: 'Alice', canPublish: false });
  const verifier = new TokenVerifier(config.apiKey, config.apiSecret);
  const claims = await verifier.verify(result.token);
  assert.equal(claims.iss, config.apiKey);
  assert.equal(claims.sub, 'alice');
  assert.equal(claims.name, 'Alice');
  assert.deepEqual(claims.video, {
    roomJoin: true, room: 'demo', canPublish: false, canSubscribe: true, canPublishData: false,
  });
  assert.equal(result.serverUrl, config.websocketUrl);
  assert.equal(result.expiresIn, TOKEN_TTL_SECONDS);
  assert.ok(Math.abs(claims.exp - Math.floor(Date.now() / 1000) - TOKEN_TTL_SECONDS) <= 2);
  await assert.rejects(new TokenVerifier(config.apiKey, 'wrong-secret').verify(result.token));
});

test('liveness stays public; every SDK endpoint requires backend authentication', async (t) => {
  const request = await serve(t);
  assert.equal((await request('/health', { headers: { authorization: '' } })).status, 200);
  const head = await request('/health', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const path of ['/api/token', '/api/rooms', '/api/ready']) {
    for (const value of ['', 'Bearer wrong', `Basic ${config.backendApiKey}`]) {
      const response = await request(path, { headers: { authorization: value } });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    }
  }
});

test('token endpoint validates inputs and never grants requested admin permissions', async (t) => {
  const request = await serve(t);
  for (const body of [null, [], {}, { room: 'demo' }, { room: ' ', identity: 'alice' },
    { room: 'demo', identity: 'alice', canPublish: 'false' },
    { room: 'demo', identity: 'alice', roomAdmin: true },
    { room: 'demo', identity: 'a'.repeat(129) }]) {
    assert.equal((await request('/api/token', { method: 'POST', body })).status, 400);
  }
  const response = await request('/api/token', { method: 'POST', body: { room: 'demo', identity: 'alice' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { token } = await response.json();
  const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(token);
  assert.equal(claims.video.room, 'demo');
  assert.equal(claims.video.canPublish, true);
  assert.equal(claims.video.roomAdmin, undefined);
});

test('HTTP parsing rejects invalid JSON, oversized bodies, content types and methods', async (t) => {
  const request = await serve(t);
  assert.equal((await request('/api/token', { method: 'POST', body: {}, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request('/api/token', { method: 'POST', body: { room: 'a'.repeat(17000) } })).status, 413);
  const response = await request('/api/token');
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
  assert.equal((await request('/missing')).status, 404);
  assert.equal((await request('/api/token', { method: 'POST', rawBody: '{broken' })).status, 400);
  assert.equal((await request('/api/token', { method: 'POST', body: undefined })).status, 400);
});

test('room endpoints validate options and readiness checks the upstream service', async (t) => {
  let created;
  const request = await serve(t, {
    async listRooms() { return [{ name: 'demo' }]; },
    async createRoom(input) { created = input; return { name: input.name }; },
  });
  const options = { name: 'demo', maxParticipants: 5, emptyTimeout: 300 };
  const response = await request('/api/rooms', { method: 'POST', body: options });
  assert.equal(response.status, 201);
  assert.deepEqual(created, options);
  assert.deepEqual(await response.json(), { room: { name: 'demo' } });
  assert.deepEqual(await (await request('/api/rooms')).json(), { rooms: [{ name: 'demo' }] });
  assert.deepEqual(await (await request('/api/ready')).json(), { status: 'ok', livekit: 'connected' });
  for (const body of [{ name: '' }, { name: 'demo', maxParticipants: 0 }, { name: 'demo', emptyTimeout: 1.5 }]) {
    assert.equal((await request('/api/rooms', { method: 'POST', body })).status, 400);
  }
});

test('upstream failures return safe errors while liveness remains healthy', async (t) => {
  const request = await serve(t, {
    async listRooms() { throw new Error('sensitive upstream details'); },
    async createRoom() { throw new Error('sensitive upstream details'); },
  });
  for (const [path, status] of [['/api/rooms', 502], ['/api/ready', 503]]) {
    const response = await request(path);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: 'LiveKit operation failed.' });
  }
  assert.equal((await request('/health')).status, 200);
});
