import { createHmac, timingSafeEqual } from 'node:crypto';

function signature(payload, secret) {
  return createHmac('sha256', secret).update(`livekit-invite-v1.${payload}`).digest();
}

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128 &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

export function createInvitation(secret, { room, identity, name = identity, role = 'publisher', ttl = 900 }, now = Date.now()) {
  if (!validText(room) || !validText(identity) || !validText(name)) {
    throw new Error('Room, identity and name must be nonblank strings of at most 128 characters without control characters.');
  }
  if (!['publisher', 'viewer'].includes(role)) throw new Error('Role must be publisher or viewer.');
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 86400) throw new Error('Invitation ttl must be 1–86400 seconds.');
  const claims = { room, identity, name, role, exp: Math.floor(now / 1000) + ttl };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

export function verifyInvitation(secret, code, now = Date.now()) {
  if (typeof code !== 'string' || code.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(code)) {
    throw new Error('Invalid invitation.');
  }
  const [payload, supplied] = code.split('.');
  const actual = Buffer.from(supplied, 'base64url');
  const expected = signature(payload, secret);
  if (actual.toString('base64url') !== supplied || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid invitation.');
  }
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!validText(claims.room) || !validText(claims.identity) || !validText(claims.name) ||
      !['publisher', 'viewer'].includes(claims.role) || !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Math.floor(now / 1000)) {
    throw new Error('Invalid or expired invitation.');
  }
  return {
    room: claims.room,
    identity: claims.identity,
    name: claims.name,
    canPublish: claims.role === 'publisher',
    canSubscribe: true,
    expiresAt: claims.exp,
  };
}
