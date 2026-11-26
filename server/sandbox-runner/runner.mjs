// =====================================================================
// Runs INSIDE the sandbox (Docker container, or a child process in dev).
// It has no dependencies, so it can be copied into the runner image.
//
// Reads one job (JSON) from stdin:
//   { marker, language, code, tests: ["stdin 1", "stdin 2"], compileTimeoutMs, runTimeoutMs, maxOutputBytes }
// Compiles the code once (if the language needs it), runs it once per test
// with that test's stdin, and prints   <marker>{ compile, tests: [...] }
//
// Expected outputs are NEVER sent in here. The server compares them, so even
// code that breaks out of the program cannot learn the hidden answers.
// =====================================================================
import { spawnSync } from 'node:child_process';
import { chownSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WIN = process.platform === 'win32';

// Hosted mode (e.g. Render): the runner starts as root inside the app container and
// runs the candidate's program as a separate, unprivileged user. That user cannot read
// the API's secrets (/proc/<pid>/environ of a root process is root-only).
const RUN_UID = process.env.RUN_AS_UID ? Number(process.env.RUN_AS_UID) : null;
const RUN_GID = process.env.RUN_AS_GID ? Number(process.env.RUN_AS_GID) : RUN_UID;
const DROP_PRIVILEGES = RUN_UID !== null && !WIN && process.getuid?.() === 0;
// Linux resource limits through "prlimit": max processes (stops fork bombs), open files, file size, memory.
const USE_PRLIMIT = process.env.SANDBOX_LIMITS === '1' && !WIN;

function limited(cmd, args, memMb) {
  if (!USE_PRLIMIT) return [cmd, args];
  const limits = ['--nproc=128', '--nofile=128', `--fsize=${16 * 1024 * 1024}`, '--core=0'];
  if (memMb) limits.push(`--as=${memMb * 1024 * 1024}`);
  return ['prlimit', [...limits, '--', cmd, ...args]];
}
const PY = WIN ? 'py' : 'python3';
const NODE = process.execPath;
const bin = (dir) => join(dir, WIN ? 'main.exe' : 'main');

// file: source file name. compile/run return [command, args]. timeFactor: slow-starting runtimes get more time.
const LANGS = {
  javascript: {
    file: 'main.js',
    run: (d) => [NODE, ['--permission', `--allow-fs-read=${join(d, 'main.js')}`, '--max-old-space-size=256', join(d, 'main.js')]],
    probe: [NODE, ['--version']],
  },
  // memMb = address-space limit for the program (not used for Node/Java: they manage memory with flags).
  python: { file: 'main.py', run: () => [PY, ['-I', 'main.py']], probe: [PY, ['--version']], memMb: 512 },
  java: {
    file: 'Main.java',
    compile: () => ['javac', ['-J-Xmx256m', '-encoding', 'UTF-8', 'Main.java']],
    run: () => ['java', ['-Xmx256m', '-Xss64m', '-XX:+UseSerialGC', '-cp', '.', 'Main']],
    probe: ['javac', ['-version']],
    timeFactor: 2,
  },
  cpp: {
    file: 'main.cpp',
    compile: () => ['g++', ['-O2', '-std=c++17', '-o', 'main', 'main.cpp']],
    run: (d) => [bin(d), []],
    probe: ['g++', ['--version']],
    memMb: 512,
  },
  // To add a language later: add an entry here + in src/runner/languages.js + its compiler in the Dockerfile.
};

function exec(rawCmd, rawArgs, { cwd, input = '', timeoutMs, maxBytes, env, memMb }) {
  const [cmd, args] = limited(rawCmd, rawArgs, memMb);
  const started = process.hrtime.bigint();
  const r = spawnSync(cmd, args, {
    cwd,
    input,
    env,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: maxBytes,
    windowsHide: true,
    ...(DROP_PRIVILEGES && { uid: RUN_UID, gid: RUN_GID }),
  });
  const timeMs = Number(process.hrtime.bigint() - started) / 1e6;
  const code = r.error?.code;
  return {
    stdout: (r.stdout || '').toString('utf8').slice(0, maxBytes),
    stderr: (r.stderr || '').toString('utf8').slice(0, 4000),
    exitCode: r.status,
    signal: r.signal,
    timedOut: code === 'ETIMEDOUT',
    outputTooLarge: code === 'ENOBUFS',
    notInstalled: code === 'ENOENT',
    timeMs: Math.round(timeMs * 100) / 100,
  };
}

function main() {
  const job = JSON.parse(readFileSync(0, 'utf8'));
  const print = (obj) => process.stdout.write(job.marker + JSON.stringify(obj) + '\n');

  // "probe" = which languages work in this sandbox?
  if (job.probe) {
    const available = {};
    for (const [id, l] of Object.entries(LANGS)) {
      const r = exec(l.probe[0], l.probe[1], { cwd: tmpdir(), timeoutMs: 10_000, maxBytes: 10_000, env: process.env });
      available[id] = !r.notInstalled && !r.timedOut && r.exitCode === 0;
    }
    return print({ available });
  }

  const lang = LANGS[job.language];
  if (!lang) return print({ error: `Unsupported language: ${job.language}` });

  // When dropping privileges, use /tmp: the folder we were started in belongs to root.
  const dir = mkdtempSync(join(DROP_PRIVILEGES ? '/tmp' : tmpdir(), 'job-'));
  try {
    writeFileSync(join(dir, lang.file), job.code, 'utf8');
    if (DROP_PRIVILEGES) {
      chownSync(dir, RUN_UID, RUN_GID); // the unprivileged user must be able to write the compiled files
      chownSync(join(dir, lang.file), RUN_UID, RUN_GID);
    }
    const { RUN_AS_UID: _u, RUN_AS_GID: _g, SANDBOX_LIMITS: _l, ...cleanEnv } = process.env;
    // Compilers write temp files: keep them inside this job's folder.
    const env = { ...cleanEnv, HOME: dir, TMPDIR: dir, TEMP: dir, TMP: dir };
    const maxBytes = job.maxOutputBytes || 64 * 1024;

    let compile = null;
    if (lang.compile) {
      const [cmd, args] = lang.compile(dir);
      const r = exec(cmd, args, { cwd: dir, timeoutMs: job.compileTimeoutMs || 15_000, maxBytes, env });
      compile = {
        ok: r.exitCode === 0 && !r.timedOut,
        output: r.notInstalled ? `${cmd} is not installed in this sandbox` : (r.stdout + r.stderr).slice(0, 8000),
        timedOut: r.timedOut,
        timeMs: r.timeMs,
      };
      if (!compile.ok) return print({ compile, tests: [] });
    }

    const runTimeout = (job.runTimeoutMs || 2000) * (lang.timeFactor || 1);
    const tests = [];
    let stop = false;
    for (const input of job.tests) {
      if (stop) {
        tests.push({ skipped: true });
        continue;
      }
      const [cmd, args] = lang.run(dir);
      const r = exec(cmd, args, { cwd: dir, input, timeoutMs: runTimeout, maxBytes, env, memMb: lang.memMb });
      tests.push(r);
      if (r.timedOut || r.notInstalled) stop = true; // don't waste time on the rest
    }
    return print({ compile, tests });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
