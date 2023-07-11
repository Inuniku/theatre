import * as path from 'path'
import {context} from 'esbuild'
import type {Plugin} from 'esbuild'

const externalPlugin = (patterns: RegExp[]): Plugin => {
  return {
    name: `external`,

    setup(build) {
      build.onResolve({filter: /.*/}, (args) => {
        const external = patterns.some((p) => {
          return p.test(args.path)
        })

        if (external) {
          return {path: args.path, external}
        }
      })
    },
  }
}

const definedGlobals = {
  global: 'window',
}

async function createBundles(watch: boolean) {
  const pathToPackage = path.join(__dirname, '../')
  const pkgJson = require(path.join(pathToPackage, 'package.json'))
  const listOfDependencies = Object.keys(pkgJson.dependencies || {})
  const listOfPeerDependencies = Object.keys(pkgJson.peerDependencies || {})
  const listOfAllDependencies = [
    ...listOfDependencies,
    ...listOfPeerDependencies,
  ]

  const esbuildConfig: Parameters<typeof context>[0] = {
    entryPoints: [path.join(pathToPackage, 'src/index.ts')],
    bundle: true,
    sourcemap: true,
    define: definedGlobals,
    platform: 'neutral',
    mainFields: ['browser', 'module', 'main'],
    target: ['firefox57', 'chrome58'],
    conditions: ['browser', 'node'],
    plugins: [
      externalPlugin([
        // if a dependency is listed in the package.json, it should be external
        ...listOfAllDependencies.map((d) => new RegExp(`^${d}`)),
      ]),
    ],
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
