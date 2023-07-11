import * as path from 'path'
import {context} from 'esbuild'

const definedGlobals = {}

async function createBundles(watch: boolean) {
  const pathToPackage = path.join(__dirname, '../')
  const esbuildConfig: Parameters<typeof context>[0] = {
    entryPoints: [path.join(pathToPackage, 'src/index.ts')],
    bundle: true,
    sourcemap: true,
    define: definedGlobals,
    platform: 'neutral',
    mainFields: ['browser', 'module', 'main'],
    target: ['firefox57', 'chrome58'],
    conditions: ['browser', 'node'],
  }

  const ctx = await context({
    ...esbuildConfig,
    outfile: path.join(pathToPackage, 'dist/index.js'),
    format: 'cjs',
  })

  await ctx[watch ? 'watch' : 'rebuild']()

  await ctx.dispose()
  // build({
  //   ...esbuildConfig,
  //   outfile: path.join(pathToPackage, 'dist/index.mjs'),
  //   format: 'esm',
  // })
}

createBundles(false)
