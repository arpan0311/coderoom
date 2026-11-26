// Shows plain text with `inline code` and **bold** support. Safe: React escapes all text.
function inline(text) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, j) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return <code key={j}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 3) return <b key={j}>{part.slice(2, -2)}</b>;
    return part;
  });
}

export default function RichText({ text }) {
  return (
    <div className="rich">
      {text.split('\n\n').map((para, i) => (
        <p key={i}>{inline(para)}</p>
      ))}
    </div>
  );
}
