# Rich content inventory + legacy guard

**What:** the generated switch-over checklist for Rich Content Unification, and the guard that stops new
uses of the legacy pieces. Plan: `../common-docs/projects/rich-content-unification/PLAN.md` §7 (the
cutover list is generated from the import graph, never hand-kept, because agent censuses kept missing surfaces).

## Files

| File | Role |
|---|---|
| `registry.ts` | THE data file: one row per legacy piece — matcher, category, status, canonical replacement |
| `scan.ts` | Engine: TypeScript compiler API parse + `ts.resolveModuleName` over `tsconfig.json` paths (`@/…`), re-export chains (`export *`, `export {x} from`, `import x; export {x}`), JSX heuristics, importer walk to surfaces |
| `inventory.ts` | CLI: generate, `--check`, `--self-test`, `--prune-baseline`, `--init-baseline` |
| `INVENTORY.md` / `inventory.json` | Generated checklist (commit after regenerating) |
| `baseline.json` | Shrink-only census of existing BANNED sites (`<piece id> :: <file>`) |

## Commands

- `pnpm rich-content:inventory` — regenerate `INVENTORY.md` + `inventory.json` from TRACKED files (~10 s). Rerun on switch day.
- `pnpm check:rich-content-legacy` — tracked + untracked files. A NEW banned site fails and prints the
  canonical replacement; a baseline entry whose use is gone fails as STALE until
  `npx tsx scripts/rich-content-inventory/inventory.ts --prune-baseline` removes it. Nothing ever ADDS a
  baseline entry (`--init-baseline` refuses when the file exists).
- `pnpm check:rich-content-legacy:self-test` — over the real tree in a virtual host (no disk writes):
  GREEN vs its own census → RED on five planted offenders (direct package, `@/` alias default import, a
  barrel `export *` and its consumer, a hand-rolled `AutoTextarea`) with the replacement named → RED
  STALE when a baselined file's legacy imports vanish → GREEN again.

Wired as two ADVISORY rows in `scripts/run-release-gates.sh` (non-strict list, the one releases run). Not in CI.

## Model

- **Status:** `banned` (guarded), `tracked` (today's renderer entry points — absorbed by `<RichContent>`, not
  banned yet), `review` (heuristics: `dangerouslySetInnerHTML`; content fields rendered raw inside
  `<p>/<pre>/<span>/<div>/<li>/<td>`; `.split("\n").map(→ JSX)`; `whitespace-pre-wrap|pre-line` on a
  content field). Review rows are questions, never verdicts.
- **Scope:** `app components features lib utils hooks providers actions constants types config`;
  tests, stories, `__tests__`, `__mocks__`, `.d.ts` excluded. Type-only imports count as sites but are not walked.
- **Surfaces:** importers are walked up to `app/**/{page,layout,template,…}` (route/layout),
  `app/**/route.ts` (api), `features/overlays/openers/*` (opener), and the lazy imports inside
  `features/overlays/OverlayController.tsx` (overlay `<overlayId>` + its window-registry label). The walk
  never passes THROUGH OverlayController. A file reached by more than 10 surfaces is listed once under
  "Shared files" instead of under every surface.

## Known limits

- String-keyed registries the graph cannot see (a component looked up by name at runtime) make a file
  look "reached by no surface".
- `@ai-matrx/messaging` and other packages carry their own react-markdown copies; they live outside this
  repo and are not scanned (PLAN §2, §4).
- A namespace/dynamic import of a barrel is attributed to the barrel, not the origin file; the barrel itself
  is still a site.

## Change log

- 2026-09-23 — created: registry, engine, generated checklist, shrink-only guard + self-test, release-gate rows.
