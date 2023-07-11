import * as path from 'path'
import {context} from 'esbuild'
import type {Plugin} from 'esbuild'

const definedGlobals = {
  global: 'window',
  'process.env.THEATRE_VERSION': JSON.stringify(
    require('../package.json').version,
  ),
}

async function createBundles(watch: boolean) {
  const pathToPackage = path.join(__dirname, '../')
  const esbuildConfig: Parameters<typeof context>[0] = {
    bundle: true,
    sourcemap: true,
    define: definedGlobals,
    platform: 'browser',
    loader: {
      '.png': 'dataurl',
      '.glb': 'dataurl',
      '.gltf': 'dataurl',
      '.svg': 'dataurl',
    },
    mainFields: ['browser', 'module', 'main'],
    target: ['firefox57', 'chrome58'],
    conditions: ['browser', 'node'],
  }

  // build({
  //   ...esbuildConfig,
  //   entryPoints: [path.join(pathToPackage, 'src/core-only.ts')],
  //   outfile: path.join(pathToPackage, 'dist/core-only.js'),
  //   format: 'iife',
  // })

  const ctx1Promise = context({
    ...esbuildConfig,
    entryPoints: [path.join(pathToPackage, 'src/core-and-studio.ts')],
    outfile: path.join(pathToPackage, 'dist/core-and-studio.js'),
    format: 'iife',
  })

  const ctx2Promise = context({
    ...esbuildConfig,
    entryPoints: [path.join(pathToPackage, 'src/core-only.ts')],
    outfile: path.join(pathToPackage, 'dist/core-only.min.js'),
    minify: true,
    format: 'iife',
    define: {
      ...definedGlobals,
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  })

  const [ctx1, ctx2] = await Promise.all([ctx1Promise, ctx2Promise])

  await Promise.all([
    ctx1[watch ? 'watch' : 'rebuild'](),
    ctx2[watch ? 'watch' : 'rebuild'](),
  ])

  await Promise.all([ctx1.dispose(), ctx2.dispose()])

  // build({
  //   ...esbuildConfig,
  //   outfile: path.join(pathToPackage, 'dist/index.mjs'),
  //   format: 'esm',
  // })
}

createBundles(false)
