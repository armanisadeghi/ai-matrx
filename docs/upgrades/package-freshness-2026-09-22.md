# Package compatibility review — 2026-09-22

## Adopted

- CodeMirror state 6.7.6 and view 6.43.13 (patches).
- Mermaid 12.0.0 and its matching ELK layout 1.0.0.
- React PDF 11.0.0; the local PDF worker copy builds from its resolved pdfjs dependency.
- React Day Picker 10.0.1. Its removed `initialFocus` prop is now `autoFocus` in both date pickers; the calendar's deprecated `table` class key is now `month_grid`.

## Retained compatibility versions

These are concrete migration constraints, not a claim that the newer versions were accepted.

| Dependency | Retained | Evidence and required follow-up |
| --- | --- | --- |
| `@univerjs/core` | 0.25.1 | Registry metadata for latest `@univerjs/presets` (0.25.1) hard-depends on core 0.25.1, as do its presets. Upgrade the family together to avoid duplicate core identities. |
| `@types/node` | 24.13.6 | `package.json` declares Node `24.x`. Types 26 would advertise APIs beyond the deployed runtime contract. |
| `@babel/core`, `@babel/types` | 7.29.7, 7.29.8 | `check-registry-repaint.ts` uses syntax JSX/TypeScript plugins whose installed peer requirement is `@babel/core: ^7.0.0-0`; the viewport migration consumes `@babel/parser` 7 ASTs (7.29.9 is still registry latest). Migrate the compiler/plugin/AST family together. |
| `@cartesia/cartesia-js` | 2.2.9 | Version 4.2.0's export map removes `wrapper/source`, `wrapper/Websocket`, and the deep `api/resources/tts` type path used by `hooks/tts`, the TTS tester, and `lib/cartesia/connection.ts`. Requires an audio-streaming migration and provider verification. |
| `mcp-handler` | 1.1.0 | Version 2.2.0 peers on `@modelcontextprotocol/server ^2.0.0`; current MCP route and lockfile use `@modelcontextprotocol/sdk` 1.30.0. Migrate the handler and protocol server together. |
| `unsplash-js` | 7.0.20 | Version 8.0.1 exports only its package root; current gallery/client callers import photo, collection, topic, and search request types from `dist/methods/*`. Migrate all those callers to supported root exports. |
| `@tsparticles/engine`, `react`, `slim` | 3.9.1, 3.0.0, 3.9.1 | Trial installation of 4.4.0 produced real type failures in `components/ui/sparkles.tsx`: removed `initParticlesEngine`, `effect.fill`, `move.attract`, and `shape.fill`. Restored the whole family to 3; a provider/animation-options migration needs its own visual proof. |

## Verification

- `pnpm install --ignore-scripts`: completed; lockfile contains the six adopted dependency changes and their transitives.
- `pnpm type-check`: clean before and after the final change. The intermediate run caught Day Picker's removed APIs and the particle incompatibilities described above.
- `pnpm exec jest components/mermaid --runInBand --no-coverage`: 4 suites, 51 tests passed. Runtime tests mock the vendor renderer; this is not browser rendering evidence.
- `pnpm build:pdfjs-worker`: passed, 1.2 MB worker copied.
- `pnpm build:kind-sandbox`: passed, browser JS/CSS bundles generated.
- `pnpm check:parse`: all 17,622 tracked TypeScript files parse.
- `pnpm check:registry-deps:strict`: passed.
- Isolated in-app browser, `http://package-freshness.localhost:3001`, authenticated as the authorized test admin against this checkout: Tasks loaded live records; a task due-date Calendar opened with focus on today; next-month navigation changed September to October 2026; screenshot confirmed aligned seven-column layout; Escape closed it without modifying task data. Temporary tab closed.

No full Next production build, actual Mermaid/ELK browser rendering, or PDF browser rendering was performed in this bounded pass. Independent acceptance review belongs to the owning session; these limitations must remain visible during that review.
