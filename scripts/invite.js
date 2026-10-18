import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { createInvitation } from '../src/invitations.js';

try {
  const { values } = parseArgs({ options: {
    room: { type: 'string' }, identity: { type: 'string' }, name: { type: 'string' },
    role: { type: 'string', default: 'publisher' }, ttl: { type: 'string', default: '900' },
  } });
  const config = loadConfig();
  console.log(createInvitation(config.inviteSigningSecret, { ...values, ttl: Number(values.ttl) }));
} catch (error) {
  console.error(error.message);
  console.error('Usage: npm run invite -- --room demo --identity alice --name Alice --role publisher --ttl 900');
  process.exitCode = 1;
}
