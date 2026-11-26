import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/interview_platform',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  sandbox: {
    driver: process.env.SANDBOX_DRIVER || 'process',
    dockerImage: process.env.DOCKER_IMAGE || 'coderoom-runner',
    // Time for ONE test (Java gets 2x because the JVM starts slowly).
    runTimeoutMs: Number(process.env.RUN_TIMEOUT_MS) || 2000,
    compileTimeoutMs: Number(process.env.COMPILE_TIMEOUT_MS) || 15000,
    memoryMb: Number(process.env.RUN_MEMORY_MB) || 512,
    maxOutputBytes: 64 * 1024,
  },
  queue: {
    redisUrl: process.env.REDIS_URL || '',
    concurrency: Number(process.env.RUN_CONCURRENCY) || 2,
    maxWaiting: 20,
    inlineWorker: process.env.INLINE_WORKER !== 'false',
  },
};

if (isProd && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
if (isProd && config.sandbox.driver !== 'docker') {
  const hardened = process.env.RUN_AS_UID && process.env.SANDBOX_LIMITS === '1';
  console.warn(
    hardened
      ? 'Sandbox: process mode with an unprivileged user + resource limits (no network isolation).'
      : 'WARNING: SANDBOX_DRIVER is not "docker" and hosted-mode limits are off. Candidate code is NOT isolated.',
  );
}
