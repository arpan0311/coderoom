import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const monacoApi = fileURLToPath(new URL('./node_modules/monaco-editor/esm/vs/editor/editor.api.js', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // y-monaco imports an old Monaco path; point it at the real file so there is only one Monaco.
    alias: [{ find: 'monaco-editor/esm/vs/editor/editor.api.js', replacement: monacoApi }],
  },
  build: { chunkSizeWarningLimit: 5000 }, // Monaco is large but only loads on the room page
  server: {
    // In dev, the React app (5173) forwards API + socket calls to the Node server (5000).
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
