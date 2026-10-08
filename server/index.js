import { createApp } from './app.js';
import { openRepository } from './repository.js';

const port = Number(process.env.API_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be from 1 to 65535.');
const host = process.env.API_HOST ?? '127.0.0.1';
let repository;
try {
  repository = await openRepository();
  await repository.database.healthy();
} catch (error) {
  repository?.database.close();
  console.error(`API setup failed: ${error.message}`);
  process.exit(1);
}
const { database, provider, authenticate } = repository;
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
const server = createApp(database, { allowedOrigins, authenticate }).listen(port, host, () => {
  console.log(`DairyDash API listening at http://${host}:${port}/api (${provider})`);
});
server.on('error', (error) => {
  database.close();
  console.error(`API failed to start: ${error.message}`);
  process.exitCode = 1;
});
function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
