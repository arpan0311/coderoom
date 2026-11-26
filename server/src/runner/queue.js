import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { execute, jobTimeout } from './sandbox.js';
import { LANGUAGES, setAvailable } from './languages.js';

/**
 * Code runs go through a queue so a burst of "Run" clicks cannot overload the server.
 *  - With REDIS_URL: BullMQ queue in Redis. Workers can run on other machines.
 *  - Without it:     a small in-memory queue (fine for one server / local dev).
 */

const QUEUE_NAME = 'code-runs';
let runFn = null;

export class BusyError extends Error {
  constructor() {
    super('The code runner is busy. Please try again in a few seconds.');
    this.status = 503;
    this.expose = true;
  }
}

class LocalQueue {
  constructor(concurrency, maxWaiting) {
    this.concurrency = concurrency;
    this.maxWaiting = maxWaiting;
    this.active = 0;
    this.waiting = [];
  }

  run(task) {
    if (this.waiting.length >= this.maxWaiting) return Promise.reject(new BusyError());
    return new Promise((resolve, reject) => {
      this.waiting.push({ task, resolve, reject });
      this.next();
    });
  }

  next() {
    while (this.active < this.concurrency && this.waiting.length) {
      const job = this.waiting.shift();
      this.active += 1;
      job
        .task()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active -= 1;
          this.next();
        });
    }
  }
}

const runJob = (job) => execute(job, jobTimeout(job));

function redisConnection(IORedis) {
  return new IORedis(config.queue.redisUrl, { maxRetriesPerRequest: null });
}

/** Ask the sandbox which languages it can run (are the compilers there?). */
export async function probeLanguages() {
  const marker = `__PROBE_${randomBytes(8).toString('hex')}__`;
  const exec = await runJob({ probe: true, marker });
  const at = exec.stdout.lastIndexOf(marker);
  let available = {};
  try {
    available = JSON.parse(exec.stdout.slice(at + marker.length)).available;
  } catch {
    console.error('Could not check languages in the sandbox:', exec.stderr.slice(0, 300));
  }
  setAvailable(available);
  const list = LANGUAGES.map((l) => `${l.name}${available[l.id] ? '' : ' (not installed)'}`).join(', ');
  console.log(`Languages: ${list}`);
}

export async function startWorker() {
  const { Worker } = await import('bullmq');
  const { default: IORedis } = await import('ioredis');
  const worker = new Worker(QUEUE_NAME, async (job) => runJob(job.data), {
    connection: redisConnection(IORedis),
    concurrency: config.queue.concurrency,
  });
  worker.on('failed', (job, err) => console.error(`Run ${job?.id} failed:`, err.message));
  console.log(`Code-run worker started (driver: ${config.sandbox.driver}, concurrency: ${config.queue.concurrency})`);
  return worker;
}

export async function initQueue() {
  if (!config.queue.redisUrl) {
    const local = new LocalQueue(config.queue.concurrency, config.queue.maxWaiting);
    runFn = (job) => local.run(() => runJob(job));
    console.log(`Queue: in-memory (driver: ${config.sandbox.driver})`);
  } else {
    const { Queue, QueueEvents } = await import('bullmq');
    const { default: IORedis } = await import('ioredis');
    const queue = new Queue(QUEUE_NAME, { connection: redisConnection(IORedis) });
    const events = new QueueEvents(QUEUE_NAME, { connection: redisConnection(IORedis) });
    await events.waitUntilReady();

    runFn = async (job) => {
      if ((await queue.getWaitingCount()) >= config.queue.maxWaiting * 5) throw new BusyError();
      const added = await queue.add('run', job, { removeOnComplete: 200, removeOnFail: 200 });
      return added.waitUntilFinished(events, jobTimeout(job) + 30_000);
    };
    console.log('Queue: BullMQ (Redis)');
    if (config.queue.inlineWorker) await startWorker();
  }
  await probeLanguages();
}

export function runCode(job) {
  if (!runFn) throw new Error('Queue not initialised');
  return runFn(job);
}
