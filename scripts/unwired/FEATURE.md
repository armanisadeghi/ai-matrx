# Built-and-unwired detector — `pnpm check:unwired`

**Status:** Live (2026-08-13) · **Scoreboard:** `/administration/reporting/unwired`
**Governing law:** `/Users/armanisadeghi/code/common-docs/policies/unfinished-work-alarm.md`

Purpose-built code with no runtime consumer is **unfinished work a previous builder was interrupted before wiring**. That is the only permitted reading. This detector makes the work visible, ranks the largest buried investment first, and tells the next builder what remains to connect. It never produces a disposal list and never recommends discarding a finding.

## Contract

| Part | Location | Responsibility |
|---|---|---|
| TypeScript scanner | `scripts/unwired/scan.ts` | Finds unwired React components plus exported hooks, services, producers, and host installers. |
| Python scanner | `aidream/scripts/check_unwired.py` | Canonical FastAPI router, service reachability, host-seam, and scheduler-registration analysis. The frontend checker invokes and normalizes it; it does not fork those rules. |
| CLI + snapshot | `scripts/unwired/check-unwired.ts` | Merges both repos, applies reason-required suppressions, ranks by size, prints the alarm, and writes `report.json` / `history.json`. |
| Scoreboard | `/administration/reporting/unwired` | Opens every source line and copies a finish-the-wiring brief that carries the intent-hunt checklist. |

The committed snapshot is deliberate. A cross-repo AST + live scheduler scan is not a page load, and static JSON imports resolve reliably in the production build. Refresh it after wiring work and commit both snapshot files.

## Commands

```bash
pnpm check:unwired             # loud advisory scan; always exits 0 on findings
pnpm check:unwired:write       # scan + refresh report.json and history.json
pnpm check:unwired --limit=15  # cap terminal detail; totals stay complete
pnpm check:unwired --limit=0   # show every finding
pnpm check:unwired --json      # machine-readable report contract
pnpm check:unwired:strict      # explicit human/CI hard-fail
```

Bad arguments and checker crashes exit non-zero. Findings do not, unless `--strict` is explicit.

## LOUD, NEVER BLOCKING

`scripts/run-release-gates.sh` runs the advisory command in **both** advisory and strict gate modes. The repository carries unfinished work; blocking unrelated releases on that standing inventory would make the guard unusable. The alarm stays loud, names the scoreboard, and exits 0.

The terminal and scoreboard use the same vocabulary:

- **appears unfinished** — never “dead,” “unused,” or unwanted;
- **built on purpose** — the evidence of intent;
- **WHAT REMAINS** — the runtime seam to finish;
- **finish the wiring** — the only recommendation the detector makes.

## Detectors

### `react-component-unmounted`

An exported PascalCase TypeScript declaration contains JSX, but no runtime JSX tag resolves to it. Relative imports, `@/` imports, aliases, and re-export barrels resolve back to the original declaration. A barrel is not a mounter. App Router entry files (`page`, `layout`, `loading`, `error`, `not-found`, `template`, `default`, `route`) are framework-mounted and excluded.

Four consumer shapes count as mounting, because each is a real runtime path a tag search misses:

1. **A JSX tag** resolving to the export.
2. **A direct call** — `GalleryWindow` calls `GalleryFloatingWorkspace()` to own its state.
3. **An object-property value** — `OverlayComponent: UserListsOverlay`, `component: Foo`. A registry that stores a component and renders it dynamically is the mounter.
4. **A dynamic import** of the owning module.

A **SCREAMING_SNAKE** export is a constant, never a component, even when its members contain JSX.

### `export-unimported`

An exported hook (`useX`), service, or producer has no runtime importer. Tests, stories, fixtures, generated code, and type-only imports do not count. Re-exporting without a runtime importer does not count. A dynamic import of the owning module counts conservatively.

**Intra-module edges propagate.** A wired export carries what it consumes beside it: `getMessagingService` is imported, so the `MessagingService` class it constructs in the same module is wired too. Only candidate-to-candidate references inside one file count, resolved by AST, so a mention in a docblock is not a consumer.

### `router-unmounted`

Delegated to aidream’s canonical scanner: every `APIRouter` under `aidream/api/routers/` must be reachable from a `FastAPI` app through an `include_router` chain, including router-to-router mounting and aliases.

### `host-installer-unset`

Frontend exports matching the required seam shapes (`set*Runner`, `install*Resolver`) need a runtime call outside their declaration module; an import alone does not wire them. Python package seams use aidream’s narrower canonical rule: the package’s own runtime error text must demand the installer and no host may call it.

### `scheduler-handler-unregistered`

Delegated to aidream’s scheduler detector. Registered system handlers are matched against live `scheduler.sch_task` rows; live tasks whose handler vanished are reported in the opposite direction. If the database is unavailable, the report is **partial** and says so—never green.

### `python-module-unreached`

Delegated to aidream’s import-graph detector. A whole `aidream/services` module is reported when no import chain from a real server entry point reaches it.

## Size ranking

Findings sort by implicated physical lines, descending. The rule is intentionally blunt: a 3,000-line unreachable module is a larger alarm than a 30-line component.

- TypeScript symbol size is the declaration’s start-to-end span.
- Python size is the owning file’s physical line count because aidream’s JSON contract reports the artifact and source location, not an AST span.
- Bucket totals sum findings. Two findings in one file can count the file twice; the scoreboard labels this **implicated lines**, not unique repository lines.

## Suppressions

`scripts/unwired/allowlist.json` is committed and reason-required. An entry means only: **this artifact is wired through a static shape the detector cannot see**. It never records that an artifact is unwanted. Suppressed findings remain counted in `totals.suppressed`; unmatched entries are reported as stale.

## Finish brief

Every scoreboard row copies a brief that requires the full intent hunt before code changes:

1. `common-docs/`, especially `VISION.md` and `FEATURE.md`;
2. every repository’s feature directories and routes;
3. `db/matrx_orm.yaml` and generated models;
4. `docs/handoffs/`, `.matrx/` task lists, and `FOUND_DEFECTS.md`;
5. end-to-end proof through the real host, page, or scheduler after wiring.

A one-repository symbol search is not the hunt.

## Known limits

**A clean report is never proof that all work is wired.** The static pass deliberately favors precision and can under-report.

- React component detection requires an exported PascalCase declaration containing JSX. Components returned indirectly, created by factories, or exported through shapes the TypeScript syntax pass does not recognize can be invisible.
- A component handed to an object property now counts as mounted. That deliberately trades precision for it: a component parked in a registry **nothing iterates** is hidden rather than reported. The same trade already applied to dynamic imports.
- Directory names are no longer used to exclude code. Only `__tests__` and `node_modules` are skipped wholesale; everything else is filtered by filename (`*.test.*`, `*.spec.*`, `*.stories.*`, `test_*`). Excluding bare `test` / `tests` directories hid 159 real demo route files and two live `(core)` product routes, both as artifacts and — the damaging half — as mounters.
- Reference/sample source (`features/agent-apps/sample-code/apps/`) has no runtime mounter by design: the runtime compiles the equivalent source from the database. Those live in the allowlist with that reason.
- **Both** aidream reachability detectors now count an operator script as a consumer. That fix landed for `module-unreached` on 2026-08-14 and for `service-unreached` — the one this scanner normalizes into `export-unimported` — only on 2026-08-15. In between, this bullet was **half-true, and the report showed it**: `module-unreached` had already cleared `aidream/services/runtime/workflow_ab.py`, while `service-unreached` re-reported that same module as 13 findings, one per public function, with two committed driver scripts naming them six times. `service-unreached` was **258 of the 268 aidream findings** here; it is now 36. Two false classes were removed — `scripts/` treated as non-runtime (21 symbols), and a file's own internal callers dropped along with the defining file (201 symbols).
  - What reaches: **server** entry points, every top-level `aidream/scripts/*.py`, every module with its own `__main__` block, and — for functions — any top-level def that a reached def in the same file names.
  - Reached **only** by an operator entry point is not a finding and is not erased: aidream's `--json` carries `cli_only` (modules) and `cli_only_symbols` (functions), each naming its driver. This scanner reads only `findings`, so those artifacts stop appearing here.
  - **The rule lives in aidream; never re-derive it on this side.** The distinction it encodes is real and unmeasured by this report: a server-reachable artifact loads on every request, a CLI-only one runs when somebody remembers to run it.
- Runtime import detection is syntactic. String registries, plugin discovery, code generation, framework conventions beyond the named App Router entries, and imports assembled at runtime can be invisible.
- A dynamic import marks every tracked export of that module as conservatively consumed. This can hide a sibling export that remains unwired.
- Service/producer classification is name- and path-based. Purpose-built exported functions with generic names outside a `service` or `producer` path are not detected.
- Python router and import reachability inherit aidream’s documented limits: importlib, entry points, and string-built registries need a reasoned allowlist entry.
- Scheduler registration needs the live database. A failed or unavailable DB check makes the report partial; it cannot establish scheduler coverage.
- Python findings use owning-file size, which can overstate a small symbol in a large module. Size is triage priority, not an exact ownership measurement.
- Static reachability proves only that a path exists in code. It does not prove the path executes successfully in production; each fix still needs an end-to-end runtime proof.
- The scan covers the configured frontend runtime roots plus `aidream` / `packages`. Satellites are outside this report unless their canonical checker is added explicitly.

## Change Log

- **2026-08-15** — claude: **aidream entry points widened; the `python-module-unreached` false-positive class closed.** The detector walked imports from the FastAPI/server boot files only, so every operator CLI harness in that repo read as unwired — including `aidream/services/runtime/workflow_ab.py` (598 lines), the single largest finding in this whole report, which has two documented driver scripts, two test modules, and a `FEATURE.md` row naming it "the ONE reusable code-vs-workflow evidence harness". Entry points now also include every top-level `scripts/*.py` and every module with its own `__main__`; such modules return **labelled** in a new `cli_only` array rather than silently dropped. Four of aidream's eleven `module-unreached` findings were retractions, not work: `workflow_ab.py`, `rag/pdf_pipeline.py`, `app_config/schema.py`, `catalogs/seeds/load_credential_definitions.py`. The fix and its test (`aidream/tests/test_check_unwired_entry_points.py`, which pins `workflow_ab.py` by name) live in aidream — `scan.ts` normalizes the contract and was deliberately not forked.

- **2026-08-14** — claude: **Four category-level false-positive classes fixed; 1,270 → 981 findings (−289, −23%) with no artifact reclassified as unwanted.** (1) Directory-name exclusions cut to `__tests__` / `node_modules` — `app/(dev)/demos/tests/` (159 files), `app/(core)/shapes/[kind]/test/` and `app/(core)/education/flashcards/[setId]/test/` were invisible as mounters, so components they render read as unfinished. (2) Intra-module edges: a wired export carries the siblings it consumes (`getMessagingService` → `MessagingService`). (3) A direct call and an object-property value both count as mounting a component (`GalleryWindow` calls `GalleryFloatingWorkspace()`; `registry.tsx` stores `OverlayComponent: UserListsOverlay` — 43 tool-call renderers alone). (4) SCREAMING_SNAKE exports are constants, never components (13 imported column registries). Four new fixture tests cover each. **Wired in the same pass:** `AgentExecutionDebugPanel` (777 lines, ten sections, built and never mounted) now renders from `DebugIndicatorManager` in place of its 589-line predecessor `PromptExecutionDebugPanel` — same selectors, same close contract, `instanceId` is the value the slice stores as `runId`. `features/code/SYSTEM_STATE.md` corrected: it claimed `TerminalTab` was "always mounted" when `SimpleTerminal` had deliberately replaced it.

- **2026-08-13** — Shipped the cross-repo detector, reason-required suppressions, size-ranked committed snapshot, advisory release gate, and `/administration/reporting/unwired` finish-the-wiring scoreboard.
