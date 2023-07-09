import {defineConfig, loadEnv} from 'vite'
import {fileURLToPath, URL} from 'node:url'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'
import {viteRequire} from 'vite-require'

// https://vitejs.dev/config/
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tsconfigPaths(), viteRequire()],
    define: {
      global: {},
      'process.env': env,
    },
    resolve: {
      alias: {
        '@theatre/core': fileURLToPath(
          new URL('../../theatre/core/src', import.meta.url),
        ),
        '@theatre/studio': fileURLToPath(
          new URL('../../theatre/studio/src', import.meta.url),
        ),
        '@theatre/shared': fileURLToPath(
          new URL('../../theatre/shared/src', import.meta.url),
        ),
        '@theatre/react': fileURLToPath(
          new URL('../../packages/react/src', import.meta.url),
        ),
        '@theatre/dataverse': fileURLToPath(
          new URL('../../packages/dataverse/src', import.meta.url),
        ),
      },
    },
  }
})
