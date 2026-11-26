import { randomBytes } from 'node:crypto';
import { config } from '../config.js';

/**
 * Test protocol (works for every language):
 *   each test case = text given on standard input  +  the exact text we expect on standard output.
 *
 * buildJob() makes the job sent into the sandbox. It contains ONLY the inputs,
 * never the expected outputs. The random marker changes on every run, so the
 * candidate cannot fake the runner's result line.
 */
export function buildJob({ language, code, tests }) {
  const marker = `__RESULT_${randomBytes(12).toString('hex')}__`;
  const job = {
    marker,
    language,
    code,
    tests: tests.map((t) => t.input),
    compileTimeoutMs: config.sandbox.compileTimeoutMs,
    runTimeoutMs: config.sandbox.runTimeoutMs,
    maxOutputBytes: config.sandbox.maxOutputBytes,
  };
  return { job, marker };
}

/** Line endings and trailing spaces don't matter; everything else must match exactly. */
export function normalize(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trimEnd();
}

const clip = (s, n = 2000) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

function verdictFor(t) {
  if (!t) return 'Sandbox error';
  if (t.skipped) return 'Not run (an earlier test hit the time limit)';
  if (t.notInstalled) return 'This language is not installed in the sandbox';
  if (t.timedOut) return 'Time limit exceeded';
  if (t.outputTooLarge) return 'Output limit exceeded';
  if (t.exitCode !== 0) return `Runtime error (exit code ${t.exitCode ?? t.signal})`;
  return null;
}

/** Turns the raw sandbox output into a clean result object. */
export function parseOutput(exec, marker, tests) {
  const at = exec.stdout.lastIndexOf(marker);
  let raw = null;
  if (at !== -1) {
    try {
      raw = JSON.parse(exec.stdout.slice(at + marker.length).trim());
    } catch {
      raw = null;
    }
  }

  const base = { durationMs: exec.durationMs };

  // The runner itself failed (crashed, killed, or Docker missing).
  if (!raw || raw.error) {
    const message = exec.timedOut
      ? 'Time limit exceeded'
      : raw?.error || `The sandbox failed. ${clip(exec.stderr, 500) || ''}`.trim();
    return {
      ...base,
      status: exec.timedOut ? 'timeout' : 'error',
      message,
      passed: 0,
      total: tests.length,
      results: tests.map((t) => ({ passed: false, hidden: Boolean(t.hidden), input: t.input, expected: t.expected, error: message })),
    };
  }

  // Did not compile.
  if (raw.compile && !raw.compile.ok) {
    return {
      ...base,
      status: 'compile_error',
      message: raw.compile.timedOut ? 'Compilation took too long' : 'Compilation failed',
      compileOutput: clip(raw.compile.output, 8000),
      passed: 0,
      total: tests.length,
      results: tests.map((t) => ({ passed: false, hidden: Boolean(t.hidden), input: t.input, expected: t.expected, error: 'Compilation failed' })),
    };
  }

  const results = tests.map((t, i) => {
    const r = raw.tests[i];
    const error = verdictFor(r);
    const passed = !error && normalize(r.stdout) === normalize(t.expected);
    return {
      passed,
      hidden: Boolean(t.hidden),
      input: t.input,
      expected: t.expected,
      actual: r && !r.skipped ? clip(r.stdout) : undefined,
      stderr: r?.stderr ? clip(r.stderr) : undefined,
      error: error || (passed ? undefined : 'Wrong answer'),
      timeMs: r?.timeMs,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  const anyTimeout = raw.tests.some((t) => t?.timedOut);
  return {
    ...base,
    status: anyTimeout ? 'timeout' : 'ok',
    message: anyTimeout ? 'Time limit exceeded (is there an infinite loop?)' : null,
    passed,
    total: results.length,
    results,
  };
}

/** Removes hidden test details so the candidate only learns pass/fail and the verdict. */
export function hideHiddenDetails(result) {
  return {
    ...result,
    results: result.results.map((r) => (r.hidden ? { passed: r.passed, hidden: true, error: r.error, timeMs: r.timeMs } : r)),
  };
}
