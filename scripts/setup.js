import { randomBytes } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

try {
  const { values } = parseArgs({ options: {
    production: { type: 'boolean', default: false }, domain: { type: 'string' },
  } });
  if (values.production && (!values.domain || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(values.domain))) {
    throw new Error('Production setup requires --domain livekit.your-domain.com (hostname only).');
  }
  if (values.domain && !values.production) throw new Error('Use --production with --domain.');
  for (const path of ['.env', 'config/livekit.yaml']) {
    try {
      await access(path);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`${path} already exists. Setup never overwrites credentials. Use a clean directory for a new environment.`);
  }
  const key = `API${randomBytes(12).toString('hex')}`;
  const secret = randomBytes(32).toString('hex');
  const backendKey = randomBytes(32).toString('hex');
  const inviteSecret = randomBytes(32).toString('hex');
  const creatorKey = randomBytes(32).toString('hex');
  const production = values.production;
  const environment = [
    'HOST=127.0.0.1', 'PORT=3000', `NODE_ENV=${production ? 'production' : 'development'}`,
    `BACKEND_API_KEY=${backendKey}`, `INVITE_SIGNING_SECRET=${inviteSecret}`,
    `INVITE_CREATOR_KEY=${creatorKey}`,
    'LIVEKIT_URL=http://127.0.0.1:7880',
    `LIVEKIT_WS_URL=${production ? `wss://${values.domain}` : 'ws://127.0.0.1:7880'}`,
    `LIVEKIT_API_KEY=${key}`, `LIVEKIT_API_SECRET=${secret}`, '',
  ].join('\n');
  const yaml = [
    '# Generated credentials: keep this file private and out of version control.',
    'port: 7880', `bind_addresses: ["${production ? '0.0.0.0' : '127.0.0.1'}"]`,
    'rtc:', '  tcp_port: 7881', '  udp_port: 7882', `  use_external_ip: ${production}`,
    'keys:', `  ${JSON.stringify(key)}: ${JSON.stringify(secret)}`, '',
  ].join('\n');
  await mkdir('config', { recursive: true, mode: 0o700 });
  await writeFile('config/livekit.yaml', yaml, { flag: 'wx', mode: 0o600 });
  await writeFile('.env', environment, { flag: 'wx', mode: 0o600 });
  console.log('Created .env and config/livekit.yaml with matching random credentials (private files).');
  console.log(`Start all services: docker compose${production ? ' -f compose.ubuntu.yaml' : ''} up --build --detach --wait`);
  console.log('See docs/DOCKER.md for invitations and operating commands.');
  if (production) console.log('Configure DNS, trusted TLS reverse proxy, and media firewall rules before public use. See docs/GUIDE.md.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
