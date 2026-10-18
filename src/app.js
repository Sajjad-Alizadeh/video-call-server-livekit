import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { createInvitation, verifyInvitation } from './invitations.js';
import { TOKEN_TTL_SECONDS } from './livekit.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const digest = (value) => createHash('sha256').update(value).digest();

function json(res, status, body, head = false) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(head ? undefined : JSON.stringify(body));
}

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
  const chunks = [];
  let bytes = 0;
  // Do not destroy the request on overflow: allow the 413 response to be sent.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > 16_384) throw new HttpError(413, 'Request body must not exceed 16 KiB.');
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  return body;
}

function validate(body, schema) {
  if (Object.keys(body).some((key) => !Object.hasOwn(schema, key))) {
    throw new HttpError(400, 'Request contains unsupported fields.');
  }
  for (const [field, rule] of Object.entries(schema)) {
    const value = body[field];
    if (value === undefined && rule.optional) continue;
    const valid = rule.type === 'string'
      ? typeof value === 'string' && value.trim().length > 0 && value.length <= (rule.maxLength || 128) && !/[\u0000-\u001f\u007f]/u.test(value)
      : rule.type === 'boolean'
        ? typeof value === 'boolean'
        : Number.isInteger(value) && value >= rule.min && value <= rule.max;
    if (!valid) throw new HttpError(400, `Invalid ${field}.`);
  }
  return body;
}

const tokenSchema = {
  room: { type: 'string' },
  identity: { type: 'string' },
  name: { type: 'string', optional: true },
  canPublish: { type: 'boolean', optional: true },
  canSubscribe: { type: 'boolean', optional: true },
};
const roomSchema = {
  name: { type: 'string' },
  maxParticipants: { type: 'number', min: 1, max: 1000, optional: true },
  emptyTimeout: { type: 'number', min: 1, max: 86400, optional: true },
};

export function createApp(config, livekit, logger = console) {
  const expectedAuth = digest(`Bearer ${config.backendApiKey}`);
  const expectedCreatorAuth = config.inviteCreatorKey ? digest(`Bearer ${config.inviteCreatorKey}`) : null;
  const routes = {
    '/': ['GET', 'HEAD'],
    '/health': ['GET', 'HEAD'],
    '/api/ready': ['GET'],
    '/api/token': ['POST'],
    '/api/rooms': ['GET', 'POST'],
    '/api/join': ['POST'],
    '/api/invitations': ['POST'],
  };

  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (req, res) => {
    const path = (req.url || '/').split('?')[0];
    try {
      const methods = Object.hasOwn(routes, path) ? routes[path] : undefined;
      if (!methods) throw new HttpError(404, 'Not found.');
      if (path.startsWith('/api/') && path !== '/api/join') {
        const expected = path === '/api/invitations' ? expectedCreatorAuth : expectedAuth;
        if (!expected) throw new HttpError(503, 'Invitation creation is disabled. Configure INVITE_CREATOR_KEY on the server.');
        if (!timingSafeEqual(digest(req.headers.authorization || ''), expected)) {
          res.setHeader('WWW-Authenticate', 'Bearer');
          throw new HttpError(401, path === '/api/invitations' ? 'Invalid host access key.' : 'Unauthorized.');
        }
      }
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, 'Method not allowed.');
      }
      if (path === '/') return json(res, 200, { message: 'LiveKit Node.js backend' }, req.method === 'HEAD');
      if (path === '/health') return json(res, 200, { status: 'ok' }, req.method === 'HEAD');
      if (path === '/api/invitations') {
        const input = validate(await readJson(req), {
          room: { type: 'string' }, identity: { type: 'string' },
          name: { type: 'string', optional: true }, role: { type: 'string', optional: true },
          ttl: { type: 'number', min: 1, max: 86400, optional: true },
        });
        if (input.role !== undefined && !['publisher', 'viewer'].includes(input.role)) {
          throw new HttpError(400, 'Role must be publisher or viewer.');
        }
        const now = Date.now();
        return json(res, 201, {
          invitation: createInvitation(config.inviteSigningSecret, input, now),
          room: input.room, identity: input.identity, role: input.role || 'publisher',
          expiresAt: Math.floor(now / 1000) + (input.ttl ?? 900),
        });
      }
      if (path === '/api/join') {
        const { invitation } = validate(await readJson(req), { invitation: { type: 'string', maxLength: 4096 } });
        let participant;
        try {
          participant = verifyInvitation(config.inviteSigningSecret, invitation);
        } catch {
          throw new HttpError(401, 'Invalid or expired invitation.');
        }
        const { expiresAt, ...permissions } = participant;
        const ttl = Math.min(TOKEN_TTL_SECONDS, expiresAt - Math.floor(Date.now() / 1000));
        if (ttl < 1) throw new HttpError(401, 'Invalid or expired invitation.');
        return json(res, 200, {
          ...await livekit.createToken({ ...permissions, ttl }),
          room: participant.room,
          identity: participant.identity,
          canPublish: participant.canPublish,
        });
      }
      if (path === '/api/token') {
        const input = validate(await readJson(req), tokenSchema);
        return json(res, 200, await livekit.createToken(input));
      }
      if (path === '/api/rooms' && req.method === 'POST') {
        const input = validate(await readJson(req), roomSchema);
        return json(res, 201, { room: await livekit.createRoom(input) });
      }
      const rooms = await livekit.listRooms();
      return json(res, 200, path === '/api/ready' ? { status: 'ok', livekit: 'connected' } : { rooms });
    } catch (error) {
      if (error instanceof HttpError) {
        // Drain or close rejected requests so oversized/unauthorized bodies cannot accumulate.
        req.resume();
        res.setHeader('Connection', 'close');
        return json(res, error.status, { error: error.message }, req.method === 'HEAD');
      }
      // Avoid logging upstream messages, which may contain credentials or tokens.
      logger.error('LiveKit operation failed. Check the server address, credentials, and connectivity.');
      json(res, path === '/api/ready' ? 503 : 502, { error: 'LiveKit operation failed.' });
    }
  });
}
