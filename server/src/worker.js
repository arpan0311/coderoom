// Stand-alone code-run worker. Use it when REDIS_URL is set and INLINE_WORKER=false,
// e.g. to run the sandbox on a separate machine from the API.
import { config } from './config.js';
import { startWorker } from './runner/queue.js';

if (!config.queue.redisUrl) {
  console.error('REDIS_URL is not set. The separate worker needs Redis.');
  process.exit(1);
}
await startWorker();
