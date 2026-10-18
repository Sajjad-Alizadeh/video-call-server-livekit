import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLiveKit } from './livekit.js';

const config = loadConfig();
const server = createApp(config, createLiveKit(config));

server.on('error', (error) => {
  console.error(`Server error: ${error.message}`);
  process.exitCode = 1;
});

server.listen(config.port, config.host, () => {
  console.log(`Server running at http://${config.host}:${config.port}`);
});

function shutdown() {
  const timer = setTimeout(() => process.exit(1), 10_000).unref();
  server.close((error) => {
    clearTimeout(timer);
    if (error) {
      console.error(`Shutdown error: ${error.message}`);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
