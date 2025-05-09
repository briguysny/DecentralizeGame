import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isProd = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';

export default defineConfig({
  plugins: [react()],
  base: isProd && !isVercel ? '/DecentralizeGame/' : '/',
});
