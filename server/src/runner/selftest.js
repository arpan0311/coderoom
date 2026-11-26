// Checks that every installed language works and that bad code is stopped.  Run:  npm run test:runner
import { buildJob, parseOutput } from './harness.js';
import { execute, jobTimeout } from './sandbox.js';
import { probeLanguages } from './queue.js';
import { isAvailable, LANGUAGES } from './languages.js';
import { config } from '../config.js';

// Each program reads two numbers and prints their sum.
const tests = [
  { input: '2 3\n', expected: '5' },
  { input: '10 -4\n', expected: '6', hidden: true },
];

const programs = {
  javascript: {
    correct: `const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number); console.log(a + b);`,
    infinite: `while (true) {}`,
    blocked: `require('fs').writeFileSync('hack.txt', 'x');`,
  },
  python: {
    correct: `a, b = map(int, input().split())\nprint(a + b)`,
    infinite: `while True: pass`,
    crash: `print(1 // 0)`,
  },
  cpp: {
    correct: `#include <iostream>\nint main(){ long a,b; std::cin>>a>>b; std::cout<<a+b<<"\\n"; }`,
    infinite: `int main(){ volatile int x=0; while(true){ x++; } }`,
    compileError: `int main(){ return x; }`,
  },
  java: {
    correct: `import java.util.*;\npublic class Main { public static void main(String[] a){ Scanner s=new Scanner(System.in); System.out.println(s.nextLong()+s.nextLong()); } }`,
    infinite: `public class Main { public static void main(String[] a){ while(true){} } }`,
    compileError: `public class Main { public static void main(String[] a){ int x = "no"; } }`,
  },
};

console.log(`Sandbox driver: ${config.sandbox.driver}`);
await probeLanguages();
console.log('');

for (const lang of LANGUAGES) {
  if (!isAvailable(lang.id)) {
    console.log(`${lang.name.padEnd(12)} skipped (not installed here)`);
    continue;
  }
  for (const [name, code] of Object.entries(programs[lang.id] || {})) {
    const { job, marker } = buildJob({ language: lang.id, code, tests });
    const r = parseOutput(await execute(job, jobTimeout(job)), marker, tests);
    const detail = r.message || r.results.find((x) => x.error)?.error || '';
    console.log(`${lang.name.padEnd(12)} ${name.padEnd(13)} status=${r.status.padEnd(13)} passed=${r.passed}/${r.total}  ${String(r.durationMs).padStart(5)}ms  ${detail}`);
  }
}
