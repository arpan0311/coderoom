import { useEffect, useState } from 'react';

export default function Timer({ deadline, onExpire }) {
  const [now, setNow] = useState(() => Date.now());
  const end = new Date(deadline).getTime();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, end - now);
  useEffect(() => {
    if (left === 0) onExpire?.();
  }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className={`timer ${left < 5 * 60000 ? 'timer-low' : ''}`}>
      ⏱ {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}
