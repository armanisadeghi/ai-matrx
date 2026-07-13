---
name: surface-registration
description: The layered recipe for registering a UI surface end-to-end in the Surface Values System — manifest (values, agent roles, config namespaces, inheritsFrom), registry + check:surface-drift, DB sync (ui_surface / ui_surface_value / ui_surface_agent_role), runtime buildScope emitter, and live verification including the Matrx-vs-matrix context test. Use whenever a task says "register a surface", "add a surface manifest", "expose page values to agents", "bind agents to this page", "add an agent role / config namespace to a surface", or touches features/surfaces/manifests/**. NOT for the binding services / merge engine / inheritance internals — those are features/surfaces/FEATURE.md territory.
---

# Surface Registration

A **surface** is one UI the platform knows by name (`ui_surface.name`, e.g. `matrx-user/transcripts-cleanup`). Registering one is a LAYERED recipe — each layer is independently shippable, and a manifest with no emitter is still useful (bindings work; live values land later). Reference consumer for every layer: **`features/transcription-cleanup/`** (`/transcripts/cleanup`).

**Read first:** `features/surfaces/FEATURE.md` (binding model, inheritance, roles/config) · `features/surfaces/manifests/README.md`.

## Layer 1 — Manifest (values)

- Create `features/surfaces/manifests/<slug>.manifest.ts` exporting a `SurfaceManifest` (`features/surfaces/types.ts`).
- `surfaceName` = `<client>/<local>` and MUST match `ui_surface.name`. `label` = pretty chrome name. `urlPattern` = canonical route (or add to `utils/surface-url-pattern.ts`).
- Values are **lower_snake_case**, honest (`alwaysAvailable` only when GUARANTEED), with real `typicalCharCount` — mapping UIs warn on context-blowers.
- **Never declare a value nothing emits.** No speculative vocabulary; declare it when the emitter lands (worked example: cleanup shipped 8 values, expanded to 36 WITH `buildScope`).
- Baselines (`selection`/`text_before`/`text_after`/`content`/`context`) are **auto-injected** by the registry — don't re-declare unless customizing (use `pickBaseline`/`mergeBaselineValues` from `_baseline.manifest.ts`). Opt out only via `skipBaselineValues` (metadata-only widgets).
- Export a **type-safe scope builder** (`createXScope(values): SurfaceScopePayload`) so the emitter can't drift from the declarations.

### Inheritance (`inheritsFrom`)

- A child inherits parent **values + agent roles + config namespaces** (child wins per key) AND **agent bindings** (parent layers merge WEAKER at launch). Bind once on the parent → applies on every child.
- Inherit only when the parent's vocabulary is TRUE on the child (`transcripts ⊃ transcripts-cleanup`; `pdf-extractor ⊃ scanner`). A sibling page that doesn't emit the parent's values must NOT inherit — inherited declarations are promises (transcript-scribe deliberately does not inherit from transcripts).
- Unknown parent / cycle / depth > 3 **throws at module init** — loud by design.

## Layer 2 — Agent roles + config namespaces

- **Agent role** = a named position the surface PLUGS an agent into (`agentRoles`; cleanup's `clean` + `custom_slot`, scribe's `assistant`). `defaultAgentId` = platform default; users/orgs override in `ui_surface_agent_pref`, resolved `manifest → global → org-by-membership → user` by `services/surface-config.service.ts`. Pages read via `hooks/useSurfaceConfig.ts` / `useSurfaceAgentRoles`. **Never store a per-surface agent choice in `userPreferences` / `useSetting`** — that's the exact legacy this system deleted (`scribeAssistantAgentId`).
- **Config namespace** = a typed JSONB bucket in `ui_surface_config` (`dictionary`, `session_defaults`). Adding one = a PURE handler (validate/merge/empty) in `config/namespace-registry.ts` + a manifest `configNamespaces` line. Zero SQL.
- Surfaces with ≥1 role or namespace automatically appear in the user hub at **`/surfaces`**.

## Layer 3 — Registry + drift gate

- Import + add to `RAW_MANIFESTS` in `manifests/registry.ts`.
- Run **`pnpm check:surface-drift`** — must pass before anything ships.

## Layer 4 — DB sync

The manifest is code; the DB mirror is what binding UIs and launch resolution read. A manifest **not synced is not registered**.

- A `ui_surface` row must EXIST first (surfaces admin `/administration/surfaces`, or SQL insert with client + sort_order tier).
- Canonical sync: **`POST /api/admin/surfaces/sync-manifests`** (surfaces admin button). From an agent shell: `pnpm tsx scripts/emit-surface-sync-sql.ts` → run the upsert via Supabase MCP, plus manual upserts for `ui_surface_agent_role`, `url_pattern`, and `parent_surface_name` (mirror what `manifest-sync.service.ts` writes).
- **Verify live** — count `ui_surface_value` / `ui_surface_agent_role` rows for the surface; then `pnpm check:surface-drift` again (it reads code only, so the live count is the real check).

## Layer 5 — Runtime emitter (`buildScope`)

- The page assembles its scope with the manifest's `createXScope(...)` at **trigger time** (read live refs, not stale state) and launches with `runtime.surfaceName` set — via `UnifiedAgentContextMenu` `surfaceName=` + `getApplicationScope`, `useAgentLauncher().launchAgent`, or `useAiPostProcess`. Cleanup's emitter: `CleanupPad.tsx` `buildScope()`.
- Mount `<SurfaceRuntimeProvider>` (`runtime/SurfaceRuntimeContext.tsx`) so the header Agents chrome gets live Run scope.
- Baseline `selection`/`text_before`/`text_after` are captured by the menu itself — don't duplicate.

## Layer 6 — Bindings + verification

Bindings are **`platform.associations` edges** (agent → surface, tier-encoded `role`, `value_mappings` in edge metadata), written ONLY through `services/bind-agent-to-surface.service.ts` — the UI paths are `SurfaceAgentBindPanel`, the 5-panel `/agents/[id]/surfaces` shell, or the batch editor. Never write an edge by hand.

Verify like the owner does:

1. Bind a test agent with **deliberately non-matching names** (cleanup's template: agent `Cleanup Surface Demo Reporter` 42971fe0, `working_text` ← `raw_transcript_text`) so name-heuristics can't mask a broken mapping.
2. Launch from the surface; confirm the mapped variables arrived: `cx_conversation.variables` is the DB forensics.
3. **The Matrx-vs-matrix test** (Arman's standard): put "Matrx is the product name (not matrix)" in a bound context value, feed input containing "matrix", check the output spells **Matrx**. If it doesn't, the context never reached the agent — a silently-skipped binding, the exact bug class this system exists to kill.
4. Recovery layers must be **LOUD** (console.warn/error + toast) — a silent skip is how the org-tier bug survived.

## Ship checklist

- [ ] Manifest + scope builder; honest values; baselines not duplicated
- [ ] Roles/namespaces declared where the surface plugs in agents/config
- [ ] Registered in `registry.ts`; `pnpm check:surface-drift` green
- [ ] DB synced AND live row counts verified
- [ ] Route prefix in `utils/route-to-surface.ts` (more-specific prefixes ABOVE their parent)
- [ ] Emitter wired (or explicitly deferred in the manifest header comment)
- [ ] Non-matching-name binding + Matrx-vs-matrix test passed live
