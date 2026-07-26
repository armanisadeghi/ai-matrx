---
name: surface-authoring
description: Authoritative workflow for adding a new UI surface to the matrx-admin Surface Values system. Covers the code-first SurfaceManifest declaration (required canonical label, value groups, baseline-vs-specific values), THE NAMING LAW and THE COMPLETENESS LAW, the `<client>/<surface>` naming contract, ui_client / ui_surface DB rows, the type-safe `createXxxScope` helper that enforces "a UI cannot lie", the runtime scope-builder module pattern, manifest sync, the runtime `surfaceName` handoff to `launchAgentExecution`, and the manifest drift check. Use whenever the task touches `features/surfaces/manifests/**`, creates a new manifest file, adds a row to `ui_surface` / `ui_client`, wires a page or overlay to launch agents through `runtime.surfaceName`, or whenever the user mentions "surface", "SurfaceValue", "SurfaceManifest", "surface label", "surface groups", "ui_surface", "surface manifest", "register a new surface", or "expose surface runtime values". ALSO the end-to-end layered registration recipe (absorbed the former `surface-registration` skill) — agent roles, config namespaces, registry + check:surface-drift, DB sync (ui_surface / ui_surface_value / ui_surface_agent_role), runtime buildScope emitter, and live verification including the Matrx-vs-matrix context test; use for "register a surface", "bind agents to this page", or "add an agent role / config namespace to a surface". NOT for the binding services / merge engine / inheritance internals — those are features/surfaces/FEATURE.md territory.
---

# Surface authoring

This is the ONE surface skill (it absorbed `surface-registration` in the Wave 4 consolidation): it owns the manifest itself — fields, values, groups, labels, scope builders — AND the end-to-end layered registration process (roles, config namespaces, DB sync, emitter, live verification), in the "End-to-end layered registration" section near the bottom. Reference consumer for every registration layer: **`features/transcription-cleanup/`** (`/transcripts/cleanup`).

Adding a surface is **code-first, DB-mirror**. Code is the single source of truth — the DB is a synced reflection. Get the manifest right and everything downstream (binding UIs, chrome labels, drift report, RLS-gated agent + tool bindings, the runtime resolver) just works.

## What a surface is — and the recursion that trips people up

A **surface** exists to bind **highly custom agents to a specific place** and hand them **highly specific context**. That's the whole job. So the test for "should this be its own surface?" is never "does it render its own UI" — it's **"would different custom agents, with different context, act here?"** If yes, it's a surface.

**A context item in one surface can itself BE a surface — and then its context is its own parts, not itself.** This is the model that confuses people:

- In the **chat** surface, the working document and the scratchpad are **context items** — whole values handed to the conversation's agent.
- **Step inside** one and it stops being a context item. It becomes its **own surface**, and its context items are its **parts**: the body text, the selection, the id, the title. You would never attach the whole document as its own surface's context — that's circular. The parts are the context.
- **Zoom back out from inside:** the conversation the document hangs off is **not** its context either — it's a **reference** (`conversation_id`) plus whatever the host chooses to pass through the link (`conversation_context`). A reference, not an embed.

**Purpose flips when you step inside.** Outside, the scratchpad is "the user's private notes the cloud agent only reads." Inside, it is **just text** — a context-menu agent there can absolutely edit it (bullet it, tabulate it, clean it up). The read-only-ness was a fact of the *outer* surface, not an intrinsic property of the text.

**Boundaries are a perspective you choose, then commit to.** The chat sidebar (list of chats + agents) and the open chat (one `conversation_id`) can be modeled as **two surfaces** (a list surface + a single-conversation surface) **or one** (a chat surface with an active conversation *and* a list of the others). Both are valid. Pick the framing that matches how agents will be bound, then design to it.

**Same shape ≠ same surface.** Two surfaces can share an identical value set and still be two surfaces when the *purpose* — and therefore the bound agents — differ. `matrx-user/working-document` and `matrx-user/scratchpad` share one value set (`_conversation-document.manifest.ts`) but stay separate because a co-author agent belongs on one and not the other. Conversely, only merge kinds into one surface when the values AND the relevant agents are ~identical.

## THE NAMING LAW — one canonical label, everywhere

**`SurfaceManifest.label` is REQUIRED.** It is the ONE canonical human display name for the surface — unique per client (case-insensitive; `pnpm check:surface-drift` fails on a missing or clashing label). Every value's `label` and every group's `label` is equally canonical.

- **No chrome may hand-type, override, or re-derive a surface/value/group label.** The `surfaceLabel` runtime override prop was DELETED; ESLint bans it (`surfaceLabelOverrideBan` in `eslint.config.mjs`).
- Chrome derives the surface name via **`getSurfaceDisplayLabel(surfaceName)`** from `features/surfaces/utils/surface-display.ts` (static + synchronous; safe in server and client components). `labelFromName` slug fallback is for manifest-less DB surfaces ONLY.
- **On-page section titles and field labels for declared values render via `surfaceValueLabels(manifest)` / `surfaceGroupLabels(manifest)`** (same file) — byte-identical to the manifest. A page that hand-writes "Page intent" next to values grouped under `page_intent` is a defect; render `G.page_intent`.
- `label` is mirrored to `ui_surface.label` by manifest sync (ALWAYS written); DB drift shows in the drift report as `surfaceLabelDrifts`.
- **Labels never enter agent feeds.** aidream's manifest feed carries machine names + `group_key` only — agents see `name`, humans see `label`.

## THE COMPLETENESS LAW — declare everything the page loads

**Every piece of data/state a page loads MUST be declared as a surface value.** Individual fields AND their natural composite/group values are both mandatory — e.g. `marketing-page` declares the composite `page_intent` object alongside its four constituent fields. Optional convenience packs are the only discretionary part.

Undeclared runtime keys show loudly in the Surface Context window under **"Undeclared (runtime only)"** — every entry there is a defect: either declare the value or stop emitting it. Use `autoContext: false` to keep declared-but-rarely-needed values out of automatic agent context; never use non-declaration for that.

## READINESS TRACKING — the campaign field

Every manifest declares `readiness: "verified" | "partial" | "stub"` (REQUIRED — the compiler enforces it) plus `readinessNote` saying what's missing whenever it isn't `verified`. This is the platform's tracker for "which surfaces are verified correct and complete". Rules:

- `verified` is EARNED: full completeness audit against the live page, curated groups, emitter wired, checklist green. Never stamp it aspirationally.
- Any change that adds page data without declaring it, or declares without emitting, demotes the surface — update `readiness` in the same edit.
- Mirrored to `ui_surface.readiness`; the admin board at `/administration/ui/surfaces` rolls up Verified / Partial / Stub / Unregistered (DB rows with no manifest). Readiness is code-owned — never edited in the DB.

## OVERLAY SURFACES — windows are surfaces too

Overlay/window panels (file preview, quick tasks, markdown editor, …) get their own surfaces: they are among the most interaction-heavy UIs. An overlay surface declares `overlayId` (the id from `features/window-panels/registry/overlay-ids.ts`) INSTEAD of `urlPattern` — the overlay twin of the route. Its emitter is a `<SurfaceRuntimeProvider>` mounted INSIDE the window component: nested providers out-depth the page's provider, so while the window is open ITS scope wins (by design — deepest wins). Values are "available while mounted": a window that always shows a file can promise `file_id` with `alwaysAvailable: true`.

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
| `SurfaceManifest.label` | REQUIRED. Canonical display name, unique per client (case-insensitive). | Drift check + sync mirror |
| `SurfaceValue.name` | `^[a-z][a-z0-9_]*$` — lower snake_case, must be unique within the surface. Becomes the key in `ApplicationScope`. | DB CHECK constraint + drift check |
| `SurfaceValueGroup.key` | `^[a-z][a-z0-9_]*$`; `general` / `baseline` / `inherited:*` are RESERVED (registry-synthesized). | Registry throws + drift check |
| Manifest filename | `<local-slug>.manifest.ts` (the part after the slash). Same kebab as the surface. | Convention |
| Exported manifest const | `<localSlug>Manifest` (camelCase from kebab). | Convention |

If the user asks for a surface name that doesn't match `^[a-z][a-z0-9-]*\/[a-z0-9-/]+$`, push back before writing anything — the drift script will fail otherwise.

## Required reading before editing manifests

These are short — read them when the task is non-trivial:

- `features/surfaces/types.ts` — `SurfaceValue`, `SurfaceValueGroup`, `SurfaceManifest`, `ValueMapping`, `SurfaceScopePayload`
- `features/surfaces/manifests/_baseline.manifest.ts` — `BASELINE_VALUES`, `pickBaseline`, `mergeBaselineValues`
- `features/surfaces/manifests/registry.ts` — register your manifest in **`RAW_MANIFESTS`**; `ALL_MANIFESTS` is derived from it (inheritance resolved, baselines injected, provenance + groupKey stamped) and is what everything consumes
- `features/surfaces/manifests/marketing-page.manifest.ts` — **THE reference implementation**: 40+ values, 7 curated groups, full contract, `inheritsFrom` chain (marketing-site → marketing-brand), scope builder in a separate runtime module (`features/marketing/lib/marketing-page-scope.ts`), emitter in `PageWorkspace.tsx`
- `features/surfaces/manifests/notes-editor.manifest.ts` — the simple case (baseline + specific + in-file scope helper)

**`intro` — the surface's self-introduction.** A single XML-ish block (`<surface_intro>…`) telling the agent what this surface IS, what the user does here, and how to read its values. Written from a close understanding of the surface's PURPOSE — this is the first surface-context item the agent sees. Mirrored to `ui_surface.intro`. Every Tier-1 surface should have one.

For `agentRoles`, `configNamespaces`, `evidenceSources`, and `skipBaselineValues` — **invoke the `surface-registration` skill**.

## Value groups — canonical sections

`SurfaceManifest.groups` declares `SurfaceValueGroup { key, label, sortOrder, description? }`:

- **Curated groups author `sortOrder` 0–899.** Everything above is reserved for registry-synthesized groups.
- Every `SurfaceValue.group` must reference a declared group key. Ungrouped own values land in the synthesized `general` group.
- **Reserved keys `general`, `baseline`, `inherited:*` may NOT be declared** — the registry synthesizes them (throws at module init if you try).
- The registry stamps every resolved value with **provenance** (own / inherited / baseline) and a `groupKey`, synthesizes `inherited:<parent>` groups ("Inherited from <parent label>") and the `baseline` group ("Generic baselines"), and **sorts values by (group sortOrder, value sortOrder): curated groups first, inherited next, baselines LAST.**
- Groups mirror to `ui_surface.value_groups` (JSONB) and per-value `ui_surface_value.group_key` on sync; DB drift shows as `valueGroupsDrifts`.
- Group like the page reads: identity, intent, evidence, content — see `marketing-page.manifest.ts`'s 7 groups.

## The `SurfaceValue` shape — every field matters

```ts
interface SurfaceValue {
  name: string;              // snake_case, unique in surface, regex-checked
  label: string;             // canonical human label — THE NAMING LAW applies
  description: string;       // 1-2 sentences. WHEN it's populated AND what it represents
  valueType: "string" | "number" | "boolean" | "object" | "array" | "document";
  alwaysAvailable: boolean;  // true ONLY if the surface guarantees it on every launch
  typicalCharCount: number;  // avg stringified size — drives context-window warnings
  autoContext?: boolean;     // default true — auto-added to agent context; false = bindable-only
  group?: string;            // key of a declared SurfaceValueGroup; omitted = general
  sortOrder?: number;        // optional, defaults to 1000 in DB; orders within the group
}
```

Each field has rules. Don't half-fill the manifest — binding UIs, on-page chrome, and the LLM all consume this.

### `name`

- Lower snake_case. The regex is `^[a-z][a-z0-9_]*$`.
- Becomes the key the surface emits in `ApplicationScope`. **Match what the surface actually puts in the bag.**
- Prefer reuse from `BASELINE_VALUES` (`selection`, `content`, `context`, `text_before`, `text_after`) — that's how the v3 context menu and existing agent shortcuts keep working without remapping.

### `label`

- 2-4 words, sentence case. THE canonical name — the mapping editor, the Surface Context window, and on-page section/field chrome (via `surfaceValueLabels`) all render exactly this string.
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
- `object` for free-form bags and for composite group values (like `page_intent`) — prefer named values over an unstructured `object`.

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

### `autoContext` — signal vs noise

Declaring many values is MANDATORY (THE COMPLETENESS LAW); auto-shipping them all to the agent is NOT. Ask: *what does an agent on this surface truly need?* (a note surface: id, content, cursor, open tabs — not everything you could enumerate). Those keep `autoContext: true` (default); everything an agent could **look up from an id** is "inconvenient but resolvable" → `autoContext: false` (bindable-only). Mirrored to `ui_surface_value.auto_context`.

### `alwaysAvailable` is earned by ROUTING

A value can only be *guaranteed* when the surface's identity lives in the URL. `notes/[id]` can promise `id`, `content`, `cursor_position`, `selection` on every launch (even when empty) — a surface whose active record is component state cannot. **Tab test:** tab-as-route → surface values are guaranteed and precise; tab-as-state → they're useless. The ideal shape is list page → `[id]` page → per-tab routes → URL params. When authoring a manifest for a surface without solid dynamic routing, flag the routing gap to the user — moving the surface toward routed identity is often worth more than more values.

### `typicalCharCount`

- Estimate after stringification (numbers → `"42"`, objects → `JSON.stringify`).
- Used by binding UIs to warn agent engineers when they bind a variable to something big enough to blow LLM context.
- Don't be precise. Reasonable bands:
  - IDs / short labels: 36 (UUID), 60–120 (titles)
  - Selections / snippets: 200–500
  - Lists of IDs: `(36 + 2) * typical_count`
  - Full document bodies: 5000–20000

### `sortOrder`

- Optional. Defaults to 1000 in the DB. Orders values **within their group**.
- The baseline values are 100/110/120/200/9999 — leave headroom around them and increment by 10 within your own values (300, 310, 320…).

## The manifest file (full-contract template)

```ts
/**
 * Surface manifest — <Human surface name> (`<client>/<local>`).
 *
 * 1-2 sentence summary of what this surface is and when it emits values.
 */

import type {
  SurfaceManifest,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  { key: "thing_identity", label: "Thing identity", sortOrder: 100 },
  { key: "thing_content", label: "Thing content", sortOrder: 200 },
  // curated band is 0–899; general/baseline/inherited:* are reserved
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "current_thing_id",
    label: "Active thing",
    description:
      "UUID of the thing the user has focused. Empty when none is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "thing_identity",
    sortOrder: 300,
  },
  // ... EVERY field the page loads (THE COMPLETENESS LAW), plus natural
  // composite values (e.g. a `thing_summary` object alongside its fields)
];

export const <localSlug>Manifest: SurfaceManifest = {
  surfaceName: "<client>/<local>",
  label: "<Canonical Display Name>",          // REQUIRED — THE NAMING LAW
  urlPattern: "/things/[thingId]",
  inheritsFrom: "<client>/<parent>",          // omit when standalone
  intro: `<surface_intro>
What this surface IS, what the user does here, how to read its values.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [ /* see surface-registration skill */ ],
};
```

### The scope builder — where it lives

**Simple surface** (few values, trivially assembled): export `create<LocalSlug>Scope(values): SurfaceScopePayload` from the manifest file itself — see `notes-editor.manifest.ts`. Required keys (every `alwaysAvailable: true` value) get no `?`; optional keys get `?`. THIS is the "a UI cannot lie" enforcement.

**Complex surface** (raw workspace data needs parsing/derivation): put a **runtime builder module** beside the feature, not in the manifest — see `features/marketing/lib/marketing-page-scope.ts` (`buildMarketingPageScope`). The pattern:

1. The module takes the page's RAW loaded data (records, snapshots, memberships) and derives the typed values (parse stored JSON, compute availability, map rows).
2. When inheriting, it builds the parent scope first and spreads it: **`...base` first, child keys after — child wins.**
3. It returns through the manifest's `create<LocalSlug>Scope(...)` so TS still enforces the declaration.
4. The page's emitter (e.g. `PageWorkspace.tsx`) calls the builder at **trigger time** with live refs, never stale state.

## INHERITANCE WORKED EXAMPLE — marketing-page → marketing-site

`marketing-page` declares `inheritsFrom: "matrx-user/marketing-site"` (which itself inherits `marketing-brand`). What that means for the child's scope helper:

- **Inherited `alwaysAvailable: true` keys become REQUIRED params in the child's builder.** `site_id` / `brand_id` are guaranteed by the parent, so `buildMarketingPageScope` takes them as non-optional inputs and `createMarketingPageScope` requires them — the child can never launch without its ancestry's identity.
- **Inherited optionals become `?` params** — `site_context` / `brand_context` flow down when the host loaded them.
- The child's builder composes: build/receive the parent's scope, `return createMarketingPageScope({ ...base, page_id, page_url, ... })` — spread `...base` FIRST so child keys win on collision.
- In the resolved registry, inherited values land in synthesized `inherited:matrx-user/marketing-site` / `inherited:matrx-user/marketing-brand` groups, sorted after the child's curated groups and before baselines.
- Inherit only when the parent's vocabulary is TRUE on the child. A sibling that doesn't emit the parent's values must NOT inherit.

### Baselines are auto-injected — opting out

The registry **injects the full baseline set into every manifest** (`withInjectedBaselines` in `registry.ts`) so agent authors can bind generic values on any surface. A same-named value you declare wins over the injected one; baseline-named values always land in the synthesized `baseline` group. Passing `[]` to `mergeBaselineValues` does NOT skip baselines — the registry re-adds them. A surface with genuinely no text/content concept (e.g. a metadata-only widget) opts out with **`skipBaselineValues: true`** on the manifest.

## Wiring it up

1. **Create the file** at `features/surfaces/manifests/<local-slug>.manifest.ts`.
2. **Register** in `features/surfaces/manifests/registry.ts`:
   ```ts
   import { <localSlug>Manifest } from "./<local-slug>.manifest";
   // ...
   const RAW_MANIFESTS: readonly SurfaceManifest[] = [
     // ...existing
     <localSlug>Manifest,
   ];
   ```
   `ALL_MANIFESTS` is derived from `RAW_MANIFESTS` (inheritance + baseline injection + provenance/group resolution) — never edit it directly.
3. **Run the drift check locally** before pushing:
   ```bash
   pnpm check:surface-drift
   ```
   It validates manifest invariants (unique names, regex, valueType, surface-name shape, **label presence + per-client uniqueness, group key/band/label rules**) and reports drift before the DB ever sees the change. Fix any issues immediately.
4. **Sync the DB**:
   - From the Surfaces admin page (`/administration/ui/surfaces`) → "Sync Manifests" button.
   - Or via API: `POST /api/admin/surfaces/sync-manifests` (super-admin gated).
   - The endpoint diffs `ALL_MANIFESTS` against the mirror and upserts — including `ui_surface.label` + `value_groups` (ALWAYS written) and per-value `group_key`. If a `ui_surface` row is missing for the surface, it's reported as `skippedMissingSurface` — you must seed the `ui_surface` row first.

### Seeding the `ui_surface` row

If you're adding a brand-new surface (not just adding values to an existing one), the `ui_surface` row must exist before the sync will accept SurfaceValues:

- Easiest path: open `/administration/ui/surfaces` → "New Surface" → pick the client + enter the name.
- Or via SQL (admin only, ON CASCADE on the FKs):
  ```sql
  INSERT INTO ui.ui_surface (name, client_name, description, sort_order, is_active)
  VALUES ('<client>/<local>', '<client>', '<1-sentence description>', 300, true);
  ```
- If the surface is in the curated candidates list (`features/surfaces/data/surface-candidates.ts`), the admin "Add from candidates" dialog seeds it in one click.

### Seeding a new `ui_client` row

Rare. Only when the user explicitly asks for a new client domain (e.g. a new mobile app). Confirm first; then:

```sql
INSERT INTO ui.ui_client (name, description, sort_order, is_active)
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

The thunk at `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts` reads `runtime.surfaceName`, fetches the agent's binding layers via `fetchSurfaceBindingLayers` (bindings are `platform.associations` edges read through the `agent.menu_surface` view — written ONLY via `features/surfaces/services/bind-agent-to-surface.service.ts`), merges layers weakest→strongest, applies `value_mappings` via the resolver, and falls back to legacy auto-name-matching for unmapped keys. If you skip `surfaceName`, you get the legacy auto-name-match path only — explicit mappings won't apply.

### Highlight-on-page (Locate)

Pages tag the DOM element that renders a value with **`data-surface-value="<value_name>"`**. The Surface Context window's **Locate** button scrolls to and flashes it (`features/surfaces/utils/locate-on-page.ts`). `SectionCard` / `MetricCell` in `features/marketing/components/shared/MarketingUi.tsx` take an `anchor` prop for this. Tag anchors as you build the page — a value with no anchor can't be located.

### Hierarchy chrome

Chrome reads ancestry/children from the REGISTRY — `getSurfaceAncestry` / `getSurfaceChildren` via `getRelatedSurfaces` (`features/surfaces/runtime/fetchRelatedSurfaces.ts`, synchronous). The Agents popover renders the full breadcrumb from it. `ui_surface.parent_surface_name` is a mirror only — never read it for hierarchy in chrome.

## Updating an existing manifest

- **Adding a value**: append to `surfaceSpecific` (with its `group`), update the scope-builder signature, re-sync. Existing bindings keep working — the new value just becomes available to bind against.
- **Removing a value**: delete from the manifest. Sync will mark its DB row as `dbValuesNotInManifest` in the drift report. Any existing `surface_value` bindings whose `target` matches will show up as `brokenAgentMappings` / `brokenToolMappings` — admin uses the drift dialog's "Remap to…" / "Remove" / "Keep & notify" actions. **Never silently delete** DB rows that have bindings against them.
- **Changing a field on an existing value** (description, label, alwaysAvailable, typicalCharCount, group): edit in place. Sync upserts. The drift report's `diffs` list will show the field-level diff until the sync is applied. If `alwaysAvailable` flipped from `false` → `true`, also update the scope-builder signature so the type system catches missing keys in surface code.

## Removing a manifest entirely

1. Delete the manifest file.
2. Remove the import + reference in `registry.ts`.
3. Run `pnpm check:surface-drift` (should pass).
4. Run the DB sync — drift report will show every value as `dbValuesNotInManifest`. Admin decides whether to purge or keep them while existing bindings migrate off.
5. Eventually drop the `ui_surface` row when no bindings remain. **Do not delete the row first** — it cascades.

## Things to avoid

- **Stuffing everything into `context`.** It's escape-valve only. Each named field is queryable in binding UIs; `context` is opaque to the LLM in mapping previews. If the surface emits 5 obvious things, declare 5 SurfaceValues.
- **Hand-typing a label anywhere.** THE NAMING LAW: chrome and on-page section/field text render through `getSurfaceDisplayLabel` / `surfaceValueLabels` / `surfaceGroupLabels` — never a string literal that duplicates a manifest label.
- **Leaving loaded data undeclared.** THE COMPLETENESS LAW: an "Undeclared (runtime only)" entry in the Surface Context window is a defect.
- **Lying about `alwaysAvailable`.** This breaks the scope-builder type guarantee. If the surface code has any `if` branch that skips writing a key, that key is `false`.
- **Generic descriptions.** "The user's note" tells the LLM nothing. "Markdown body of the note the user has open. Empty when no note is open." is correct.
- **Declaring a reserved group key.** `general` / `baseline` / `inherited:*` are registry-synthesized; declaring one throws at module init.
- **Mismatched `surfaceName`.** `ui_surface.name`, the manifest's `surfaceName`, and the runtime `runtime.surfaceName` must be byte-identical. Binding edges reference the surface by uuid (`platform.associations.target_id`), so a name mismatch doesn't break stored bindings — it silently resolves NO bindings at launch.
- **Skipping the scope helper.** `dispatch(launchAgentExecution({ runtime: { applicationScope: { selecton: "..." } } }))` — typo, no TS error, silent miss at runtime. Always go through the scope builder.
- **Inventing a baseline-style key.** If you find yourself adding `selection` or `content` to `surfaceSpecific` instead of spreading from baseline, stop — you'll fork the description and confuse mappings. Spread from `BASELINE_VALUES` and override only when the surface's semantics genuinely differ.
- **Forgetting to update the helper signature when `alwaysAvailable` changes.** The signature is hand-maintained; the drift script doesn't verify it.

## Quick reference — file map

| What | Where |
|---|---|
| `SurfaceManifest` / `SurfaceValue` / `SurfaceValueGroup` / `ValueMapping` types | `features/surfaces/types.ts` |
| Canonical label helpers (`getSurfaceDisplayLabel`, `surfaceValueLabels`, `surfaceGroupLabels`) | `features/surfaces/utils/surface-display.ts` |
| Locate-on-page (`data-surface-value` flash) | `features/surfaces/utils/locate-on-page.ts` |
| Hierarchy (registry-backed, synchronous) | `features/surfaces/runtime/fetchRelatedSurfaces.ts` + `registry.ts` `getSurfaceAncestry`/`getSurfaceChildren` |
| Baseline values + helpers | `features/surfaces/manifests/_baseline.manifest.ts` |
| Central registry (`RAW_MANIFESTS` → derived `ALL_MANIFESTS`) | `features/surfaces/manifests/registry.ts` |
| **Reference implementation (full contract)** | `features/surfaces/manifests/marketing-page.manifest.ts` + `features/marketing/lib/marketing-page-scope.ts` |
| Simple-case reference | `features/surfaces/manifests/notes-editor.manifest.ts` |
| Binding service (associations edges) | `features/surfaces/services/bind-agent-to-surface.service.ts` |
| Per-manifest README | `features/surfaces/manifests/README.md` |
| Sync service (diff + upsert; mirrors label/value_groups/group_key) | `features/surfaces/services/manifest-sync.service.ts` |
| Sync SQL emitter (agent-shell path) | `scripts/emit-surface-sync-sql.ts` |
| Sync API (admin-gated) | `app/api/admin/surfaces/sync-manifests/route.ts` |
| Drift API (admin-gated) | `app/api/admin/surfaces/drift-report/route.ts` |
| Runtime resolver | `features/surfaces/utils/value-mapping-resolver.ts` |
| Launch thunk integration | `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts` |
| Admin UI | `app/(authenticated)/(admin-auth)/administration/ui/surfaces/` |
| Agent-side binding UI | `app/(a)/agents/[id]/surfaces/page.tsx` + `features/surfaces/components/AgentSurfacesPanel.tsx` |
| Drift check (manual — in `pnpm check:release-gates`, NOT commit/CI-run) | `scripts/check-surface-drift.ts` (`pnpm check:surface-drift`) |
| Candidate catalog (for the admin "add" dialog) | `features/surfaces/data/surface-candidates.ts` |

## Pre-flight checklist

Before you say a surface is added:

- [ ] `ui_client` row exists for the client
- [ ] `ui_surface` row exists with the exact `<client>/<local>` name
- [ ] `<local-slug>.manifest.ts` created in `features/surfaces/manifests/`
- [ ] Manifest imported + included in `RAW_MANIFESTS` in `registry.ts`
- [ ] Full contract present: `label` (canonical, unique per client), `urlPattern`, `intro`, `groups` (curated band 0–899), `inheritsFrom` where true
- [ ] **Completeness sweep**: every piece of data the page loads is declared — fields AND natural composites; no "Undeclared (runtime only)" entries in the Surface Context window
- [ ] Every `SurfaceValue` has: a snake_case `name`, a canonical `label`, a 1-2 sentence `description` covering the empty case, a correct `valueType`, an honest `alwaysAvailable`, a sensible `typicalCharCount`, and a `group`
- [ ] Scope builder exists (in-file for simple surfaces, runtime module for complex ones); required (no `?`) keys match every `alwaysAvailable: true` value INCLUDING inherited ones
- [ ] On-page section/field chrome renders via `surfaceValueLabels` / `surfaceGroupLabels` — no hand-typed label strings
- [ ] Page elements tagged `data-surface-value` anchors for Locate
- [ ] `pnpm check:surface-drift` passes
- [ ] DB sync applied (admin UI or `POST /api/admin/surfaces/sync-manifests`)
- [ ] Surface code launches agents via `runtime.surfaceName` + `applicationScope: create<LocalSlug>Scope(...)`

If anything in the checklist is unclear, re-read the relevant section above instead of guessing — the resolver is unforgiving when the contract drifts.

---

# End-to-end layered registration (absorbed from `surface-registration`)

Registering a surface is a LAYERED recipe — each layer is independently shippable, and a manifest with no emitter is still useful (bindings work; live values land later). Layer 1 (the manifest) is everything above. **Read first:** `features/surfaces/FEATURE.md` (binding model, inheritance, roles/config) · `features/surfaces/manifests/README.md`.

## Layer 2 — Agent roles + config namespaces

- **Agent role** = a named position the surface PLUGS an agent into (`agentRoles`; cleanup's `clean` + `custom_slot`, scribe's `assistant`). `defaultAgentId` = platform default; users/orgs override in `ui_surface_agent_pref`, resolved `manifest → global → org-by-membership → user` by `services/surface-config.service.ts`. Pages read via `hooks/useSurfaceConfig.ts` / `useSurfaceAgentRoles`. **Never store a per-surface agent choice in `userPreferences` / `useSetting`** — that's the exact legacy this system deleted (`scribeAssistantAgentId`).
- **Config namespace** = a typed JSONB bucket in `ui_surface_config` (`dictionary`, `session_defaults`). Adding one = a PURE handler (validate/merge/empty) in `config/namespace-registry.ts` + a manifest `configNamespaces` line. Zero SQL.
- Surfaces with ≥1 role or namespace automatically appear in the user hub at **`/surfaces`**.

## Layer 3 — Registry + drift gate

- Import + add to `RAW_MANIFESTS` in `manifests/registry.ts`, then **`pnpm check:surface-drift`** must pass before anything ships.

## Layer 4 — DB sync (a manifest not synced is not registered)

- A `ui_surface` row must EXIST first (surfaces admin `/administration/ui/surfaces`, or SQL insert with client + sort_order tier).
- Canonical sync: **`POST /api/admin/surfaces/sync-manifests`** (surfaces admin button). From an agent shell: `pnpm tsx scripts/emit-surface-sync-sql.ts` → run the upsert via Supabase MCP (mirrors `manifest-sync.service.ts`).
- Sync mirrors **`ui_surface.label` + `value_groups` (ALWAYS written)**, per-value `group_key` + `auto_context`, `url_pattern`, `intro`, `parent_surface_name`, `ui_surface_agent_role`.
- **Verify live** — count `ui_surface_value` / `ui_surface_agent_role` rows for the surface; then `pnpm check:surface-drift` again (the live count is the real DB check).

## Layer 5 — Runtime emitter (`buildScope`)

- The page assembles its scope with the manifest's `createXScope(...)` at **trigger time** (read live refs, not stale state) and launches with `runtime.surfaceName` set — via the v3 context menu (`EditableContextMenu` / `NonEditableContextMenu`) `surfaceName=` + `getApplicationScope`, `useAgentLauncher().launchAgent`, or `useAiPostProcess`. Cleanup's emitter: `CleanupPad.tsx` `buildScope()`.
- Mount `<SurfaceRuntimeProvider>` (`runtime/SurfaceRuntimeContext.tsx`) so the header Agents chrome gets live Run scope.
- Baseline `selection`/`text_before`/`text_after` are captured by the menu itself — don't duplicate.

## Layer 6 — Bindings + verification

Bindings are **`platform.associations` edges** (agent → surface, tier-encoded `role`, `value_mappings` in edge metadata), written ONLY through `services/bind-agent-to-surface.service.ts` — UI paths: `SurfaceAgentBindPanel`, the 5-panel `/agents/[id]/surfaces` shell, or the batch editor. Never write an edge by hand.

Verify like the owner does:

1. Bind a test agent with **deliberately non-matching names** (cleanup's template: agent `Cleanup Surface Demo Reporter` 42971fe0, `working_text` ← `raw_transcript_text`) so name-heuristics can't mask a broken mapping.
2. Launch from the surface; confirm the mapped variables arrived: `cx_conversation.variables` is the DB forensics.
3. **The Matrx-vs-matrix test** (Arman's standard): put "Matrx is the product name (not matrix)" in a bound context value, feed input containing "matrix", check the output spells **Matrx**. If it doesn't, the context never reached the agent — a silently-skipped binding, the exact bug class this system exists to kill.
4. Recovery layers must be **LOUD** (console.warn/error + toast) — a silent skip is how the org-tier bug survived.

## Registration ship checklist

- [ ] `readiness` stamped honestly (verified only after the full checklist; note required otherwise); overlay surfaces carry `overlayId`
- [ ] Manifest + scope builder; required `label`; groups declared + every value grouped; completeness sweep clean; honest values; baselines not duplicated
- [ ] Roles/namespaces declared where the surface plugs in agents/config
- [ ] Registered in `registry.ts`; `pnpm check:surface-drift` green
- [ ] DB synced AND live row counts verified
- [ ] Route prefix in `utils/route-to-surface.ts` (more-specific prefixes ABOVE their parent)
- [ ] Emitter wired (or explicitly deferred in the manifest header comment)
- [ ] Non-matching-name binding + Matrx-vs-matrix test passed live
