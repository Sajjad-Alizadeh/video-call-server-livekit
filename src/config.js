function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required. See .env.example.`);
  return value;
}

function endpoint(value, name, protocols) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (!protocols.includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be a ${protocols.join(' or ')} URL without credentials, path, query, or fragment.`);
  }
  return url.origin;
}

export function loadConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const backendApiKey = required(env, 'BACKEND_API_KEY');
  if (backendApiKey.length < 32) throw new Error('BACKEND_API_KEY must contain at least 32 characters.');
  const inviteSigningSecret = required(env, 'INVITE_SIGNING_SECRET');
  if (inviteSigningSecret.length < 32) throw new Error('INVITE_SIGNING_SECRET must contain at least 32 characters.');
  const inviteCreatorKey = env.INVITE_CREATOR_KEY?.trim();
  if (inviteCreatorKey && inviteCreatorKey.length < 32) throw new Error('INVITE_CREATOR_KEY must contain at least 32 characters.');
  const apiKey = required(env, 'LIVEKIT_API_KEY');
  const apiSecret = required(env, 'LIVEKIT_API_SECRET');
  const livekitUrl = endpoint(required(env, 'LIVEKIT_URL'), 'LIVEKIT_URL', ['http:', 'https:']);
  const websocketUrl = endpoint(required(env, 'LIVEKIT_WS_URL'), 'LIVEKIT_WS_URL', ['ws:', 'wss:']);
  if (env.NODE_ENV === 'production') {
    if (apiKey === 'devkey' || apiSecret.length < 32) {
      throw new Error('Production requires a non-development LiveKit key and a secret of at least 32 characters.');
    }
    if (!websocketUrl.startsWith('wss:')) throw new Error('Production requires a wss: LIVEKIT_WS_URL.');
  }
  return { host: env.HOST || '127.0.0.1', port, backendApiKey, inviteSigningSecret, inviteCreatorKey, apiKey, apiSecret, livekitUrl, websocketUrl };
}
