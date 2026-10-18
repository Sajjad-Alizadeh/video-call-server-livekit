import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvitation, verifyInvitation } from '../src/invitations.js';

const secret = 'test-signing-secret-at-least-32-characters';
const now = 1_800_000_000_000;

test('invitations enforce signature, expiry boundary, role and key rotation', () => {
  const code = createInvitation(secret, { room: 'demo', identity: 'alice', role: 'publisher', ttl: 60 }, now);
  const participant = verifyInvitation(secret, code, now);
  assert.equal(participant.canPublish, true);
  assert.equal(participant.identity, 'alice');
  assert.equal(participant.expiresAt, now / 1000 + 60);
  assert.throws(() => verifyInvitation(secret, code, now + 60000));
  assert.throws(() => verifyInvitation('rotated-key', code, now));
  const [payload, signature] = code.split('.');
  const changed = Buffer.from(JSON.stringify({ room: 'other', identity: 'admin', role: 'publisher', exp: now / 1000 + 60 })).toString('base64url');
  assert.throws(() => verifyInvitation(secret, `${changed}.${signature}`, now));
  assert.throws(() => verifyInvitation(secret, `${payload}.invalid`, now));
  for (const options of [{ role: 'admin' }, { ttl: 0 }, { ttl: 86401 }, { room: ' ' }, { identity: 'a\n' }]) {
    assert.throws(() => createInvitation(secret, { room: 'demo', identity: 'alice', ...options }, now));
  }
});
