import { useEffect, useRef } from 'react';
import { MonacoBinding } from 'y-monaco';
import monaco from '../monaco.js';

/**
 * Monaco editor bound to a Yjs text. Every key press becomes a small Yjs update that
 * is sent to the other person through Socket.io (see Room.jsx).
 */
export default function CodeEditor({ ydoc, field, language, readOnly, editorRef }) {
  const el = useRef(null);
  const editor = useRef(null);

  useEffect(() => {
    const ed = monaco.editor.create(el.current, {
      model: null,
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      tabSize: 2,
      scrollBeyondLastLine: false,
      padding: { top: 12 },
    });
    editor.current = ed;
    if (editorRef) editorRef.current = ed;
    return () => ed.dispose();
  }, [editorRef]);

  // Switch to the text of the selected question + language.
  useEffect(() => {
    const ed = editor.current;
    const model = monaco.editor.createModel('', language);
    ed.setModel(model);
    const binding = new MonacoBinding(ydoc.getText(field), model, new Set([ed]));
    return () => {
      binding.destroy();
      model.dispose();
    };
  }, [ydoc, field, language]);

  useEffect(() => {
    editor.current?.updateOptions({ readOnly });
  }, [readOnly]);

  return <div className="editor" ref={el} />;
}
