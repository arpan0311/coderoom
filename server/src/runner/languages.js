// Languages shown in the editor. "monaco" = the editor's syntax-highlighting id.
// The commands that compile/run each language live in sandbox-runner/runner.mjs.

export const LANGUAGES = [
  {
    id: 'javascript',
    name: 'JavaScript',
    monaco: 'javascript',
    template: `const lines = require('fs').readFileSync(0, 'utf8').trim().split('\\n');

// write your code here
console.log(lines[0]);
`,
  },
  {
    id: 'python',
    name: 'Python 3',
    monaco: 'python',
    template: `import sys

lines = sys.stdin.read().strip().split("\\n")

# write your code here
print(lines[0])
`,
  },
  {
    id: 'cpp',
    name: 'C++17',
    monaco: 'cpp',
    template: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string line;
    getline(cin, line);

    // write your code here
    cout << line << "\\n";
    return 0;
}
`,
  },
  {
    id: 'java',
    name: 'Java',
    monaco: 'java',
    template: `import java.io.*;
import java.util.*;

// The class must be called Main
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line = in.readLine();

        // write your code here
        System.out.println(line);
    }
}
`,
  },
];

export const LANGUAGE_IDS = new Set(LANGUAGES.map((l) => l.id));
export const DEFAULT_LANGUAGE = 'python';
export const templateFor = (id) => LANGUAGES.find((l) => l.id === id)?.template ?? '';

// Filled in at startup by asking the sandbox which compilers it has.
let available = {};
export const setAvailable = (map) => {
  available = map || {};
};
export const isAvailable = (id) => Boolean(available[id]);
export const languageList = () => LANGUAGES.map((l) => ({ ...l, available: isAvailable(l.id) }));
