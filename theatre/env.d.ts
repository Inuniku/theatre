declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: $IntentionalAny
    __IS_VISUAL_REGRESSION_TESTING?: boolean
  }

  interface NodeModule {
    hot?: {
      accept(path: string, callback: () => void): void
    }
  }

  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test'
    // The version of the package, as defined in package.json
    THEATRE_VERSION: string
    // This is set to 'true' when building the playground
    BUILT_FOR_PLAYGROUND: 'true' | 'false'
  }
}
export {}
