/**
 * Stub for non-JS assets imported for their side effects.
 *
 * Jest has no loader for CSS or static files, so a bare `import "pkg/style.css"`
 * (e.g. `@xyflow/react/dist/style.css` in IngestFlowAnimation) is handed to
 * ts-jest and parsed as TypeScript — failing with `SyntaxError: Unexpected
 * token '.'` and taking down every suite that transitively imports the module.
 * `moduleNameMapper` in jest.config.ts points those requests here instead.
 */
export default {};
