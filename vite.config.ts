import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const basePath = env.VITE_BASE_PATH || '/'
  const apiPort = env.VITE_API_PORT || '3260'

  return {
    base: basePath,
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      host: true,
      port: 5180,
      proxy: {
        [`${basePath}api`]: {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(new RegExp(`^${basePath.replace(/\//g, '\\/')}`), '/'),
        },
      },
    },
  }
})
