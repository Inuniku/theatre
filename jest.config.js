const esModules = ['nanoid', 'nanoid/non-secure'].join('|')
/** @type {import('jest').Config} */
module.exports = {
  testMatch: [
    '<rootDir>/packages/*/src/**/*.test.ts',
    '<rootDir>/theatre/*/src/**/*.test.ts',
  ],
  transformIgnorePatterns: [`/node_modules/(?!${esModules})`],
  moduleNameMapper: {
    ...require('./devEnv/getAliasesFromTsConfig').getAliasesFromTsConfigForJest(),
    '\\.(css|svg|png)$': 'identity-obj-proxy',
    'lodash-es/(.*)': 'lodash/$1',
    'react-use/esm/(.*)': 'react-use/lib/$1',
    'lodash-es': 'lodash',
    // ES modules that jest can't handle at the moment.
    '^nanoid(/(.*)|$)': 'nanoid$1',
    uuid: '<rootDir>/node_modules/uuid/dist/index.js',
    'react-icons/(.*)': 'identity-obj-proxy',
  },
  setupFiles: ['./theatre/shared/src/setupTestEnv.ts'],
  automock: false,
  transform: {
    '^.+\\.tsx?$': [
      'esbuild-jest',
      {
        sourcemap: true,
      },
    ],
    '^.+\\.js$': [
      'esbuild-jest',
      {
        sourcemap: true,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
}
