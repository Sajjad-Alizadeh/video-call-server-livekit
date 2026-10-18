import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { loadConfig } from '../src/config.js';

const script = fileURLToPath(new URL('../scripts/setup.js', import.meta.url));

test('setup generates matching private credentials and never overwrites them', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'livekit-setup-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const content = await readFile(join(cwd, '.env'), 'utf8');
  const env = parseEnv(content);
  const config = loadConfig(env);
  assert.equal(config.apiSecret.length, 64);
  assert.equal(config.inviteSigningSecret.length, 64);
  assert.equal(config.inviteCreatorKey.length, 64);
  assert.notEqual(config.inviteCreatorKey, config.backendApiKey);
  assert.notEqual(config.inviteSigningSecret, config.backendApiKey);
  const yaml = await readFile(join(cwd, 'config/livekit.yaml'), 'utf8');
  assert.ok(yaml.includes(JSON.stringify(config.apiKey)));
  assert.ok(yaml.includes(JSON.stringify(config.apiSecret)));
  assert.ok(yaml.includes('use_external_ip: false'));
  assert.equal((await stat(join(cwd, '.env'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(cwd, 'config/livekit.yaml'))).mode & 0o777, 0o600);
  assert.equal(spawnSync(process.execPath, [script], { cwd }).status, 1);
  assert.equal(await readFile(join(cwd, '.env'), 'utf8'), content);
});

test('production setup requires a domain and produces a valid production environment', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'livekit-production-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  assert.equal(spawnSync(process.execPath, [script, '--production'], { cwd }).status, 1);
  const result = spawnSync(process.execPath, [script, '--production', '--domain', 'livekit.example.com'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const env = parseEnv(await readFile(join(cwd, '.env'), 'utf8'));
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(loadConfig(env).websocketUrl, 'wss://livekit.example.com');
  assert.ok((await readFile(join(cwd, 'config/livekit.yaml'), 'utf8')).includes('use_external_ip: true'));
});
