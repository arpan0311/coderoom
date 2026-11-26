import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const emptyTest = (hidden = false) => ({ input: '', expected: '', hidden });

export default function NewQuestion() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: 'Sum of numbers',
    difficulty: 'easy',
    description: 'Print the sum of all the numbers.\n\n**Input:** one line with numbers separated by spaces.\n\n**Output:** one number.',
  });
  const [tests, setTests] = useState([
    { input: '1 2 3', expected: '6', hidden: false },
    { input: '-5 5', expected: '0', hidden: true },
  ]);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setTest = (i, k, v) => setTests((list) => list.map((t, j) => (j === i ? { ...t, [k]: v } : t)));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/questions', { method: 'POST', body: { ...form, testCases: tests } });
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="page">
      <form className="card" onSubmit={save}>
        <h2>New question</h2>
        <div className="row">
          <label className="grow">
            Title
            <input required value={form.title} onChange={set('title')} />
          </label>
          <label>
            Difficulty
            <select value={form.difficulty} onChange={set('difficulty')}>
              <option>easy</option>
              <option>medium</option>
              <option>hard</option>
            </select>
          </label>
        </div>
        <label>
          Description — explain the input and output format. Use `backticks` for code and **stars** for bold.
          <textarea rows={6} required value={form.description} onChange={set('description')} />
        </label>

        <p className="label">Test cases (the program reads "input" and must print "expected output")</p>
        {tests.map((t, i) => (
          <div key={i} className="test-edit">
            <label className="grow">
              Input #{i + 1}
              <textarea className="mono" rows={3} value={t.input} onChange={(e) => setTest(i, 'input', e.target.value)} />
            </label>
            <label className="grow">
              Expected output
              <textarea className="mono" rows={3} value={t.expected} onChange={(e) => setTest(i, 'expected', e.target.value)} />
            </label>
            <div className="test-edit-side">
              <label className="check">
                <input type="checkbox" checked={t.hidden} onChange={(e) => setTest(i, 'hidden', e.target.checked)} />
                Hidden
              </label>
              <button type="button" className="btn btn-ghost small" disabled={tests.length === 1} onClick={() => setTests(tests.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <div className="row">
          <button type="button" className="btn btn-ghost small" onClick={() => setTests([...tests, emptyTest()])}>+ Example test</button>
          <button type="button" className="btn btn-ghost small" onClick={() => setTests([...tests, emptyTest(true)])}>+ Hidden test</button>
        </div>
        {error && <p className="error">{error}</p>}
        <p />
        <button className="btn btn-primary">Save question</button>
      </form>
    </main>
  );
}
