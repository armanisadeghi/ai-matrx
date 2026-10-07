# Proof Runs (admin surface)

**Route:** `/administration/compute/proof-runs` (super-admin). Server contract:
`aidream/aidream/services/proof_runs/FEATURE.md`.

## Runtime rules

- Render check status and attestation through their registered kinds; this page owns controls,
  history, scenario editing and receipts, not parallel kind renderers.
- A replay still executes the step under test. Keep skipped boundary proofs distinct from a pass;
  `auto`, `live` and `replay` select the server's cost/cadence behavior, never a browser substitute.
- Scenario types and API projections consume the generated contracts in `types.ts`. The JSON editor
  preserves invalid text alongside its parse error; its last valid parsed variables are separate.
- `admin-proof-runs.manifest.ts` is the page's value contract. Loaded registries and budget values
  are absent before the combined read succeeds; retained values during refresh are the last
  successful read. `data_loaded`, `loading`, read error and organization requirement distinguish
  these states. Read the latest scope synchronously; do not fetch on a menu gesture.
- History queries and processed rows come from the canonical table. A detail response can replace
  the selected receipt only when its ID still matches the latest request. Closing selection cancels
  that identity; pending/error state belongs to the requested ID, not the old open receipt.
- The canonical viewer menu and ProTextarea editors use the `admin` product attribution for this platform administration page.
  The editor registers its controlled draft, constituents, raw variables text, error, saving flag
  and marker names with the page scope; closing it removes that scope.
- The mandate named by a scenario receives engineered scenario inputs. Surface registration grants
  no ambient inheritance and creates no helper binding or new AI worker.
- Readiness remains partial until browser menu/controlled-edit proof, header source attribution,
  helper isolation and independent certification are verified. Historical billing/provider failures
  are not current verification evidence.

## Receipt doors

The receipt's conversation uses `EntityRef token="conversation"`. Stored kind components cannot
import arbitrary app components: their allowlist is owned by `@ai-matrx/code-runtime` and
`lib/code-runtime/stored-scope.ts`. Do not hand-render a second attestation to bypass that boundary.
