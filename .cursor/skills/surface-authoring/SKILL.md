---
name: surface-authoring
description: Authoritative workflow for adding a new UI surface to the matrx-admin Surface Values system. Covers the code-first SurfaceManifest declaration, baseline-vs-specific values, the `<client>/<surface>` naming contract, ui_client / ui_surface DB rows, the type-safe `createXxxScope` helper that enforces "a UI cannot lie", manifest sync, the runtime `surfaceName` handoff to `launchAgentExecution`, and the CI drift check. Use whenever the task touches `features/surfaces/manifests/**`, creates a new manifest file, adds a row to `ui_surface` / `ui_client`, wires a page or overlay to launch agents through `runtime.surfaceName`, or whenever the user mentions "surface", "SurfaceValue", "SurfaceManifest", "ui_surface", "surface manifest", "register a new surface", or "expose surface runtime values".
---

# Surface authoring

Adding a surface to the matrx Surface Values system is **code-first, DB-mirror**. Code is the single source of truth — the DB is a synced reflection. Get the manifest right and everything downstream (binding UIs, drift report, RLS-gated agent + tool bindings, the runtime resolver) just works.

## What a surface is — and the recursion that trips people up

A **surface** exists to bind **highly custom agents to a specific place** and hand them **highly specific context**. That's the whole job. So the test for "should this be its own surface?" is never "does it render its own UI" — it's **"would different custom agents, with different context, act here?"** If yes, it's a surface.

**A context item in one surface can itself BE a surface — and then its context is its own parts, not itself.** This is the model that confuses people:

- In the **chat** surface, the working document and the scratchpad are **context items** — whole values handed to the conversation's agent.
- **Step inside** one and it stops being a context item. It becomes its **own surface**, and its context items are its **parts**: the body text, the selection, the id, the title. You would never attach the whole document as its own surface's context — that's circular. The parts are the context.
- **Zoom back out from inside:** the conversation the document hangs off is **not** its context either — it's a **reference** (`conversation_id`) plus whatever the host chooses to pass through the link (`conversation_context`). A reference, not an embed.

**Purpose flips when you step inside.** Outside, the scratchpad is "the user's private notes the cloud agent only reads." Inside, it is **just text** — a context-menu agent there can absolutely edit it (bullet it, tabulate it, clean it up). The read-only-ness was a fact of the *outer* surface, not an intrinsic property of the text.

**Boundaries are a perspective you choose, then commit to.** The chat sidebar (list of chats + agents) and the open chat (one `conversation_id`) can be modeled as **two surfaces** (a list surface + a single-conversation surface) **or one** (a chat surface with an active conversation *and* a list of the others). Both are valid. Pick the framing that matches how agents will be bound, then design to it.

**Same shape ≠ same surface.** Two surfaces can share an identical value set and still be two surfaces when the *purpose* — and therefore the bound agents — differ. `matrx-user/working-document` and `matrx-user/scratchpad` share one value set (`_conversation-document.manifest.ts`) but stay separate because a co-author agent belongs on one and not the other. Conversely, only merge kinds into one surface when the values AND the relevant agents are ~identical.

## The 4-step add (canonical)

```
1. Make sure ui_client row exists       (matrx-user / matrx-admin / matrx-public / chrome-extension)
2. Make sure ui_surface row exists      (name = "<client>/<local-slug>", FK → ui_client)
3. Add the manifest file + register     (features/surfaces/manifests/...)
4. Sync the DB                          (POST /api/admin/surfaces/sync-manifests)
```

Then in the surface's code: emit an `ApplicationScope` via `createXxxScope(...)` and pass `runtime: { surfaceName: "<client>/<local>" }` to `launchAgentExecution`.

## Naming contract

| Thing | Rule | Enforced by |
|---|---|---|
| `ui_client.name` | Lowercase kebab. One of `matrx-user`, `matrx-admin`, `matrx-public`, `chrome-extension` (current set). New clients are rare — confirm with the user. | DB |
| `ui_surface.name` | `"<client>/<local>"` — single slash, kebab-case both halves. e.g. `matrx-user/notes`, `matrx-admin/system-agents/agents`. | DB FK + `scripts/check-surface-drift.ts` |
| `SurfaceValue.name` | `^[a-z][a-z0-9_]*$` — lower snake_case, must be unique within the surface. Becomes the key in `ApplicationScope`. | DB CHECK constraint + drift check |
| Manifest filename | `<local-slug>.manifest.ts` (the part after the slash). Same kebab as the surface. | Convention |
| Exported manifest const | `<localSlug>Manifest` (camelCase from kebab). | Convention |

If the user asks for a surface name that doesn't match `^[a-z][a-z0-9-]*\/[a-z0-9-/]+$`, push back before writing anything — the drift script will fail otherwise.

## Required reading before editing manifests

These are short — read them when the task is non-trivial:

- `features/surfaces/types.ts` — `SurfaceValue`, `SurfaceManifest`, `ValueMapping`, `SurfaceScopePayload`
- `features/surfaces/manifests/_baseline.manifest.ts` — `BASELINE_VALUES`, `pickBaseline`, `mergeBaselineValues`
- `features/surfaces/manifests/registry.ts` — central `ALL_MANIFESTS` list (where you wire your new manifest)
- `features/surfaces/manifests/notes-editor.manifest.ts` — canonical full example (mix of baseline + specific + scope helper)

## The `SurfaceValue` shape — every field matters

```ts
interface SurfaceValue {
  name: string;              // snake_case, unique in surface, regex-checked
  label: string;             // short human label, used in binding UI dropdowns
  description: string;       // 1-2 sentences. WHEN it's populated AND what it represents
  valueType: "string" | "number" | "boolean" | "object" | "array";
  alwaysAvailable: boolean;  // true ONLY if the surface guarantees it on every launch
  typicalCharCount: number;  // avg stringified size — drives context-window warnings
  sortOrder?: number;        // optional, defaults to 1000 in DB
}
```

Each field has rules. Don't half-fill the manifest — binding UIs and the LLM both consume this.

### `name`

- Lower snake_case. The regex is `^[a-z][a-z0-9_]*$`.
- Becomes the key the surface emits in `ApplicationScope`. **Match what the surface actually puts in the bag.**
- Prefer reuse from `BASELINE_VALUES` (`selection`, `content`, `context`, `text_before`, `text_after`) — that's how legacy `UnifiedAgentContextMenu` and existing agent shortcuts keep working without remapping.

### `label`

- 2-4 words, sentence case. Shows up next to the name in the mapping editor's surface-value picker.
- Examples: "Current selection", "Active note id", "Open file path".

### `description`

- 1-2 sentences. Must cover **WHEN** it's populated and **WHAT** it represents.
- Mention the empty case explicitly. The mapping UI shows this on hover; the LLM uses it when the binding goes through.
- Good: `"UUID of the note the user has open. Empty when no note is open (e.g. on the notes list)."`
- Bad: `"The current note."`

### `valueType`

- Drives the mapping editor's input affordance and validation.
- Almost everything stringifies for LLMs at runtime — pick what reflects the JS shape the surface emits, not what the LLM "sees."
- `array` for ID lists, tab lists, file lists.
- `object` for free-form bags (and **only** when there's no better structure). Prefer named values over `object`.

### `alwaysAvailable` — get this right

This is the most-abused field. Only set `true` when the surface code **literally always** writes this key on every single launch, regardless of UI state.

| Case | Verdict |
|---|---|
| `open_tab_ids` in an editor (could be empty array but always an array) | `true` |
| `current_file_id` in an editor that requires a file open | `true` |
| `current_file_id` in an editor where the user might be on an empty workspace | `false` |
| `selection` anywhere | `false` |
| `content` (full file body) | `false` (only `true` if you guarantee non-null) |

The `createXxxScope` TS helper uses this to mark keys as required (no `?`) vs optional (`?`). Lying here defeats the "a UI cannot lie" enforcement.

### `typicalCharCount`

- Estimate after stringification (numbers → `"42"`, objects → `JSON.stringify`).
- Used by binding UIs to warn agent engineers when they bind a variable to something big enough to blow LLM context.
- Don't be precise. Reasonable bands:
  - IDs / short labels: 36 (UUID), 60–120 (titles)
  - Selections / snippets: 200–500
  - Lists of IDs: `(36 + 2) * typical_count`
  - Full document bodies: 5000–20000

### `sortOrder`

- Optional. Defaults to 1000 in the DB.
- Use to group related values together in the mapping editor. The baseline values are 100/110/120/200/9999 — leave headroom around them and increment by 10 within your own values (300, 310, 320…).

## The manifest file (copy-paste template)

```ts
/**
 * Surface manifest — <Human surface name> (`<client>/<local>`).
 *
 * 1-2 sentence summary of what this surface is and when it emits values.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "current_thing_id",
    label: "Active thing",
    description:
      "UUID of the thing the user has focused. Empty when none is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  // ... more
];

export const <localSlug>Manifest: SurfaceManifest = {
  surfaceName: "<client>/<local>",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper. Surface code calls this at runtime so TS catches
 * missing required keys and unknown keys. THIS is the "a UI cannot lie"
 * enforcement.
 *
 * Required keys: every `alwaysAvailable: true` value, no `?`.
 * Optional keys: every `alwaysAvailable: false` value, with `?`.
 */
export function create<LocalSlug>Scope(values: {
  // alwaysAvailable: true → required (no `?`)
  // alwaysAvailable: false → optional (with `?`)
  current_thing_id?: string;
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
```

Mirror `notes-editor.manifest.ts` if anything is unclear — it's the reference implementation.

### Skipping the baseline

You can also pass `[]` as the first arg of `mergeBaselineValues` (or just set `values: surfaceSpecific` directly) when a surface doesn't conceptually have a selection / content (e.g. a metadata-only widget). Don't include baseline values "just in case" — every value is a row in the binding UI's dropdown.

## Wiring it up

1. **Create the file** at `features/surfaces/manifests/<local-slug>.manifest.ts`.
2. **Register** in `features/surfaces/manifests/registry.ts`:
   ```ts
   import { <localSlug>Manifest } from "./<local-slug>.manifest";
   // ...
   export const ALL_MANIFESTS: readonly SurfaceManifest[] = [
     // ...existing
     <localSlug>Manifest,
   ];
   ```
3. **Run the drift check locally** before pushing:
   ```bash
   pnpm check:surface-drift
   ```
   It validates manifest invariants (unique names, regex, valueType, surface-name shape) and reports drift before the DB ever sees the change. Fix any issues immediately.
4. **Sync the DB**:
   - From the Surfaces admin page (`/administration/surfaces`) → "Sync Manifests" button.
   - Or via API: `POST /api/admin/surfaces/sync-manifests` (super-admin gated).
   - The endpoint diffs `ALL_MANIFESTS` against `ui_surface_value` and applies upserts. If a `ui_surface` row is missing for the surface, it's reported as `skippedMissingSurface` — you must seed the `ui_surface` row first.

### Seeding the `ui_surface` row

If you're adding a brand-new surface (not just adding values to an existing one), the `ui_surface` row must exist before the sync will accept SurfaceValues:

- Easiest path: open `/administration/surfaces` → "New Surface" → pick the client + enter the name.
- Or via SQL (admin only, ON CASCADE on the FKs):
  ```sql
  INSERT INTO public.ui_surface (name, client_name, description, sort_order, is_active)
  VALUES ('<client>/<local>', '<client>', '<1-sentence description>', 300, true);
  ```
- If the surface is in the curated candidates list (`features/surfaces/data/surface-candidates.ts`), the admin "Add from candidates" dialog seeds it in one click.

### Seeding a new `ui_client` row

Rare. Only when the user explicitly asks for a new client domain (e.g. a new mobile app). Confirm first; then:

```sql
INSERT INTO public.ui_client (name, description, sort_order, is_active)
VALUES ('<new-client>', '<description>', 200, true);
```

## Runtime side — making the surface actually emit values

In the surface's launching code (button, context menu, AgentGenerator, etc.):

```ts
import { create<LocalSlug>Scope } from "@/features/surfaces/manifests/<local-slug>.manifest";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";

dispatch(
  launchAgentExecution({
    agentId,
    runtime: {
      surfaceName: "<client>/<local>",        // ← MUST match ui_surface.name
      applicationScope: create<LocalSlug>Scope({
        current_thing_id: currentId,
        selection: selected ?? undefined,
        content: bodyText ?? undefined,
        // ... never pass keys not declared in the manifest
      }),
    },
  }),
);
```

The thunk at `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts` reads `runtime.surfaceName`, looks up the agent's `agx_agent_surface` binding for the current caller scope, applies its `value_mappings` JSONB via the resolver, and falls back to legacy auto-name-matching for unmapped keys. If you skip `surfaceName`, you get the legacy auto-name-match path only — explicit mappings won't apply.

## Updating an existing manifest

- **Adding a value**: append to `surfaceSpecific`, update the `createXxxScope` helper signature, re-sync. Existing bindings keep working — the new value just becomes available to bind against.
- **Removing a value**: delete from the manifest. Sync will mark its DB row as `dbValuesNotInManifest` in the drift report. Any existing `surface_value` bindings whose `target` matches will show up as `brokenAgentMappings` / `brokenToolMappings` — admin uses the drift dialog's "Remap to…" / "Remove" / "Keep & notify" actions. **Never silently delete** DB rows that have bindings against them.
- **Changing a field on an existing value** (description, label, alwaysAvailable, typicalCharCount): edit in place. Sync upserts. The drift report's `diffs` list will show the field-level diff until the sync is applied. If `alwaysAvailable` flipped from `false` → `true`, also update the `createXxxScope` helper signature so the type system catches missing keys in surface code.

## Removing a manifest entirely

1. Delete the manifest file.
2. Remove the import + reference in `registry.ts`.
3. Run `pnpm check:surface-drift` (should pass).
4. Run the DB sync — drift report will show every value as `dbValuesNotInManifest`. Admin decides whether to purge or keep them while existing bindings migrate off.
5. Eventually drop the `ui_surface` row when no bindings remain. **Do not delete the row first** — it cascades.

## Things to avoid

- **Stuffing everything into `context`.** It's escape-valve only. Each named field is queryable in binding UIs; `context` is opaque to the LLM in mapping previews. If the surface emits 5 obvious things, declare 5 SurfaceValues.
- **Lying about `alwaysAvailable`.** This breaks the `createXxxScope` type guarantee. If the surface code has any `if` branch that skips writing a key, that key is `false`.
- **Generic descriptions.** "The user's note" tells the LLM nothing. "Markdown body of the note the user has open. Empty when no note is open." is correct.
- **Mismatched `surfaceName`.** `ui_surface.name`, the manifest's `surfaceName`, the runtime `runtime.surfaceName`, and the `agx_agent_surface.surface_name` foreign key must be byte-identical. The DB enforces this via FK + ON UPDATE CASCADE.
- **Skipping the scope helper.** `dispatch(launchAgentExecution({ runtime: { applicationScope: { selecton: "..." } } }))` — typo, no TS error, silent miss at runtime. Always go through `createXxxScope`.
- **Inventing a baseline-style key.** If you find yourself adding `selection` or `content` to `surfaceSpecific` instead of spreading from baseline, stop — you'll fork the description and confuse mappings. Spread from `BASELINE_VALUES` and override only when the surface's semantics genuinely differ.
- **Forgetting to update the helper signature when `alwaysAvailable` changes.** The signature is hand-maintained; the drift script doesn't verify it.

## Quick reference — file map

| What | Where |
|---|---|
| `SurfaceManifest` / `SurfaceValue` / `ValueMapping` types | `features/surfaces/types.ts` |
| Baseline values + helpers | `features/surfaces/manifests/_baseline.manifest.ts` |
| Central registry (`ALL_MANIFESTS`) | `features/surfaces/manifests/registry.ts` |
| Per-manifest README | `features/surfaces/manifests/README.md` |
| Sync service (diff + upsert) | `features/surfaces/services/manifest-sync.service.ts` |
| Sync API (admin-gated) | `app/api/admin/surfaces/sync-manifests/route.ts` |
| Drift API (admin-gated) | `app/api/admin/surfaces/drift-report/route.ts` |
| Runtime resolver | `features/surfaces/utils/value-mapping-resolver.ts` |
| Launch thunk integration | `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts` |
| Admin UI | `app/(authenticated)/(admin-auth)/administration/surfaces/` |
| Agent-side binding UI | `app/(a)/agents/[id]/surfaces/page.tsx` + `features/surfaces/components/AgentSurfacesPanel.tsx` |
| CI drift check | `scripts/check-surface-drift.ts` (`pnpm check:surface-drift`) |
| Candidate catalog (for the admin "add" dialog) | `features/surfaces/data/surface-candidates.ts` |

## Pre-flight checklist

Before you say a surface is added:

- [ ] `ui_client` row exists for the client
- [ ] `ui_surface` row exists with the exact `<client>/<local>` name
- [ ] `<local-slug>.manifest.ts` created in `features/surfaces/manifests/`
- [ ] Manifest imported + included in `ALL_MANIFESTS` in `registry.ts`
- [ ] Every `SurfaceValue` has: a snake_case `name`, a 2-4 word `label`, a 1-2 sentence `description` covering the empty case, a correct `valueType`, an honest `alwaysAvailable`, and a sensible `typicalCharCount`
- [ ] `createXxxScope` helper exists and its required (no `?`) keys match every `alwaysAvailable: true` value
- [ ] `pnpm check:surface-drift` passes
- [ ] DB sync applied (admin UI or `POST /api/admin/surfaces/sync-manifests`)
- [ ] Surface code launches agents via `runtime.surfaceName` + `applicationScope: create<LocalSlug>Scope(...)`

If anything in the checklist is unclear, re-read the relevant section above instead of guessing — the resolver is unforgiving when the contract drifts.
