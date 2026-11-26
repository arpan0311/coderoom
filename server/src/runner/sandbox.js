import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

/**
 * Runs a job with sandbox-runner/runner.mjs and returns what it printed.
 *
 *  - "docker":  a brand new container per run from the "coderoom-runner" image
 *               (it has all the compilers). No network, limited memory/CPU/processes,
 *               read-only disk, non-root user, no Linux capabilities. Use in production.
 *  - "process": runs runner.mjs as a child process on this machine with an empty-ish
 *               environment (no secrets) and timeouts. Uses whatever compilers are
 *               installed locally. For development only: it is NOT fully isolated.
 */
const RUNNER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sandbox-runner', 'runner.mjs');

export async function execute(job, timeoutMs) {
  const { driver } = config.sandbox;
  if (driver === 'docker') return runInDocker(job, timeoutMs);
  if (driver === 'process') return runInProcess(job, timeoutMs);
  throw new Error(`Unknown SANDBOX_DRIVER "${driver}"`);
}

/** Total time allowed for one job: compile + every test + a little extra. */
export function jobTimeout(job) {
  const { compileTimeoutMs, runTimeoutMs } = config.sandbox;
  if (job.probe) return 60_000;
  return compileTimeoutMs + job.tests.length * runTimeoutMs * 2 + 5000;
}

// Only harmless variables. Secrets like JWT_SECRET or MONGO_URI are never passed on.
function safeEnv() {
  const keep = process.platform === 'win32'
    ? ['PATH', 'PATHEXT', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramData']
    : ['PATH', 'LANG', 'RUN_AS_UID', 'RUN_AS_GID', 'SANDBOX_LIMITS']; // the last 3 configure hosted mode
  const env = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  return env;
}

async function runInProcess(job, timeoutMs) {
  const dir = await mkdtemp(join(tmpdir(), 'run-'));
  try {
    const env = { ...safeEnv(), TEMP: dir, TMP: dir, TMPDIR: dir };
    const child = spawn(process.execPath, [RUNNER], { cwd: dir, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(job));
    return await collect(child, { timeoutMs, onTimeout: () => child.kill('SIGKILL') });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function runInDocker(job, timeoutMs) {
  const { memoryMb, dockerImage } = config.sandbox;
  const name = `run-${randomUUID()}`;
  const args = [
    'run', '--rm', '-i',
    '--name', name,
    '--network', 'none', // no internet
    `--memory=${memoryMb}m`, `--memory-swap=${memoryMb}m`,
    '--cpus=1',
    '--pids-limit=128', // stops fork bombs (Java/Go need some threads)
    '--read-only', // cannot change the image's files
    '--tmpfs', '/sandbox:rw,exec,size=128m,uid=1000,gid=1000', // the only writable place
    '-e', 'TMPDIR=/sandbox',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--user', 'node',
    '--ulimit', 'nofile=256:256',
    dockerImage,
    'node', '/runner/runner.mjs',
  ];
  const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(job));
  return collect(child, {
    timeoutMs: timeoutMs + 3000, // starting a container takes ~1s
    onTimeout: () => {
      spawn('docker', ['kill', name], { stdio: 'ignore' }).on('error', () => {});
      child.kill('SIGKILL');
    },
  });
}

function collect(child, { timeoutMs, onTimeout }) {
  // The runner already limits each program's output; this is a safety net for the whole job.
  const maxBytes = config.sandbox.maxOutputBytes * 60;
  const started = Date.now();
  let stdout = '';
  let stderr = '';
  let timedOut = false;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      onTimeout();
    }, timeoutMs);

    const take = (which) => (chunk) => {
      if (stdout.length + stderr.length > maxBytes) return onTimeout();
      if (which === 'out') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };
    child.stdout.on('data', take('out'));
    child.stderr.on('data', take('err'));

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `Sandbox failed to start: ${err.message}`, exitCode: -1, timedOut, durationMs: Date.now() - started });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut, durationMs: Date.now() - started });
    });
  });
}
