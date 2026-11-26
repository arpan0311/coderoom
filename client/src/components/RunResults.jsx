const STATUS = {
  ok: null,
  timeout: 'Time limit',
  error: 'Error',
  compile_error: 'Compile error',
};

export default function RunResults({ result, running }) {
  if (running) {
    return (
      <div className="results">
        <p className="muted">
          ⏳ {running.by} is {running.mode === 'submit' ? 'submitting' : 'running'} the code in the sandbox…
        </p>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="results">
        <p className="muted small">
          Your program reads the test input from <b>standard input</b> and prints the answer to <b>standard output</b>.{' '}
          <b>Run</b> checks the examples. <b>Submit</b> also checks the hidden tests and saves the attempt.
        </p>
      </div>
    );
  }

  const allPassed = result.passed === result.total;
  return (
    <div className="results">
      <div className="results-head">
        <span className={`pill ${allPassed ? 'pill-pass' : 'pill-fail'}`}>
          {STATUS[result.status] || (allPassed ? 'All passed' : 'Some failed')}
        </span>
        <b>
          {result.passed}/{result.total} tests
        </b>
        <span className="muted small">
          {result.mode === 'submit' ? 'Submitted' : 'Ran'} by {result.by?.name} · {result.language} · {result.durationMs} ms
        </span>
      </div>
      {result.message && <p className="error small">{result.message}</p>}
      {result.compileOutput && <pre className="console error">{result.compileOutput}</pre>}

      {result.status !== 'compile_error' && (
        <div className="tests">
          {result.results.map((r, i) =>
            r.hidden ? (
              <div key={i} className={`test ${r.passed ? 'pass' : 'fail'}`}>
                {r.passed ? '✅' : '❌'} Hidden test #{i + 1}
                {!r.passed && r.error && <span className="muted small"> · {r.error}</span>}
              </div>
            ) : (
              <div key={i} className={`test ${r.passed ? 'pass' : 'fail'}`}>
                <div>
                  {r.passed ? '✅' : '❌'} Test #{i + 1}
                  {r.timeMs !== undefined && <span className="muted small"> · {Math.round(r.timeMs)} ms</span>}
                  {!r.passed && r.error && <span className="error small"> · {r.error}</span>}
                </div>
                <div className="io-grid">
                  <IoBox label="Input" text={r.input} />
                  <IoBox label="Expected" text={r.expected} />
                  <IoBox label="Your output" text={r.actual ?? ''} bad={!r.passed} />
                </div>
                {r.stderr && <IoBox label="Errors (stderr)" text={r.stderr} bad />}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function IoBox({ label, text, bad }) {
  return (
    <div>
      <p className="io-label">{label}</p>
      <pre className={`io ${bad ? 'io-bad' : ''}`}>{text === '' ? ' ' : text}</pre>
    </div>
  );
}
