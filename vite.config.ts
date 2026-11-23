import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const geminiKey = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';

  return {
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      entries: ['index.html', 'src/**/*.{ts,tsx,js,jsx}'],
      include: ['react', 'react-dom'],
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 2500,
    },
    server: {
      hmr: false,
    },
  };
});
