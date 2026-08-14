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

### `export-unimported`

An exported hook (`useX`), service, or producer has no runtime importer. Tests, stories, fixtures, generated code, and type-only imports do not count. Re-exporting without a runtime importer does not count. A dynamic import of the owning module counts conservatively.

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
- A component passed as a value to a registry (`component: Foo`) is not a JSX mounter and can be reported even when the registry renders it dynamically. Record that verified dynamic path in the reason-required allowlist.
- Runtime import detection is syntactic. String registries, plugin discovery, code generation, framework conventions beyond the named App Router entries, and imports assembled at runtime can be invisible.
- A dynamic import marks every tracked export of that module as conservatively consumed. This can hide a sibling export that remains unwired.
- Service/producer classification is name- and path-based. Purpose-built exported functions with generic names outside a `service` or `producer` path are not detected.
- Python router and import reachability inherit aidream’s documented limits: importlib, entry points, and string-built registries need a reasoned allowlist entry.
- Scheduler registration needs the live database. A failed or unavailable DB check makes the report partial; it cannot establish scheduler coverage.
- Python findings use owning-file size, which can overstate a small symbol in a large module. Size is triage priority, not an exact ownership measurement.
- Static reachability proves only that a path exists in code. It does not prove the path executes successfully in production; each fix still needs an end-to-end runtime proof.
- The scan covers the configured frontend runtime roots plus `aidream` / `packages`. Satellites are outside this report unless their canonical checker is added explicitly.

## Change Log

- **2026-08-13** — Shipped the cross-repo detector, reason-required suppressions, size-ranked committed snapshot, advisory release gate, and `/administration/reporting/unwired` finish-the-wiring scoreboard.
