import { useEffect, useRef, useState } from 'react';

export default function Chat({ socket, initial, myId }) {
  const [messages, setMessages] = useState(initial || []);
  const [text, setText] = useState('');
  const bottom = useRef(null);

  useEffect(() => {
    if (!socket) return;
    const onChat = (m) => setMessages((list) => [...list, m]);
    socket.on('chat', onChat);
    return () => socket.off('chat', onChat);
  }, [socket]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = (e) => {
    e.preventDefault();
    if (!text.trim() || !socket) return;
    socket.emit('chat', text);
    setText('');
  };

  return (
    <div className="chat">
      <div className="chat-list">
        {messages.length === 0 && <p className="muted small">No messages yet.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${String(m.userId) === myId ? 'mine' : ''}`}>
            <span className="chat-name">{m.name}</span>
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form className="chat-form" onSubmit={send}>
        <input placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        <button className="btn btn-ghost small">Send</button>
      </form>
    </div>
  );
}
