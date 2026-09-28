// Preview visual dos Desafios (Duelo da Roleta). Ver preview/README.md.
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'preview'),
  publicDir: path.resolve(__dirname, 'public'),
  server: { port: 3100, host: '0.0.0.0' },
  resolve: { alias: [
    { find: /^(.*)\/services\/api$/, replacement: path.resolve(__dirname, 'preview/apiMock.ts') },
    { find: /^\.\/firebase$/, replacement: path.resolve(__dirname, 'preview/duelFirebaseMock.ts') },
    { find: /^(.*)\/services\/firebase$/, replacement: path.resolve(__dirname, 'preview/duelFirebaseMock.ts') },
  ] },
});
