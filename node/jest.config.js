module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // @vtex/api transitively loads the diagnostics/OTLP stack, which relies on
    // package `exports` subpaths that jest 26's resolver (pinned by
    // TypeScript 3.9 -> ts-jest 26) predates. Tests never exercise the log
    // exporter, so the whole package is stubbed.
    '^@vtex/diagnostics-nodejs(/.*)?$': '<rootDir>/__tests__/stubs/diagnostics.js',
  },
  // Keep the stub itself from being collected as a test file.
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/stubs/'],
  globals: {
    'ts-jest': {
      // Transpile-only keeps the suite fast; type safety is enforced by the
      // builder and by `tsc --noEmit` in the lint script.
      isolatedModules: true,
    },
  },
}
