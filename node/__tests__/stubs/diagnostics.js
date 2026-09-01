/**
 * Test stub for @vtex/diagnostics-nodejs.
 *
 * The real package is loaded transitively by @vtex/api's logger and addresses
 * its own dependencies through package `exports` subpaths, which jest 26's
 * resolver (pinned by TypeScript 3.9 -> ts-jest 26) cannot resolve. Tests never
 * exercise the platform log exporter, so the whole package is replaced by
 * no-ops with the shape @vtex/api touches.
 */
const noop = () => undefined

module.exports = {
  Exporters: {
    CreateExporter: noop,
    CreateLogsExporterConfig: noop,
    CreateMetricsExporterConfig: noop,
    CreateTracesExporterConfig: noop,
  },
}
