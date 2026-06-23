# Proposal — Parent/Child Surfaces (surface inheritance)

> **Status: PROPOSAL, awaiting Arman's decision.** This is an architecture
> recommendation, not yet built. It answers two questions Arman raised: (1) can
> a surface declare a parent so common things hand down to children? (2) how do
> we intelligently handle a context menu for the notes left-column (sidebar
> items: notes / folders), distinct from the in-note editor menu?

## The question

A feature like **transcripts** has ~6 routes (`/transcripts`, `/cleanup`,
`/scribe`, `/studio`, `/processor`, `/new`) and each page has parts. **Notes**
has an editor region AND a left sidebar (note rows, folder rows). Today every
one of these is wired independently. Arman's instinct: declare a **parent
surface** once, and have children inherit the common pieces.

## Current reality (verified against live code)

The surface system is **flat — there is no parent/child today.** Verified:

- `SurfaceManifest` (`features/surfaces/types.ts:114-133`) carries
  `surfaceName`, `values[]`, `agentRoles?`, `configNamespaces?`,
  `skipBaselineValues?` — **no `inheritsFrom`/parent field.**
- The `/` in `surfaceName` (`matrx-user/transcripts`) is **cosmetic namespace**,
  not a hierarchy — routes map to surfaces 1:1 via a hardcoded table
  (`features/surfaces/utils/route-to-surface.ts`), never by prefix.
- Multi-page features are modeled as **siblings**: `matrx-user/transcripts`,
  `matrx-user/transcripts-cleanup`, `matrx-user/transcript-scribe`,
  `matrx-user/transcript-studio` are four independent manifests; they re-declare
  overlapping values and share nothing but the 5 auto-injected baselines.
- The binding resolver `fetchSurfaceBindingLayers(agentId, surfaceName)`
  (`features/surfaces/services/agent-surface-bindings.service.ts:66-76`) fetches
  bindings for **exactly one** `surface_name` — there is no parent lookup, so an
  agent bound to a "parent" would not apply to children.

The platform already has the two merge engines inheritance needs: **values**
merge in `registry.ts::withInjectedBaselines` (baselines + manifest values), and
**bindings** layer weakest→strongest in
`utils/merge-value-mappings.ts::mergeValueMappingLayers` (global → org → user,
child wins per key). Inheritance is "add one more layer at the bottom," not a
new engine.

## Recommendation — hierarchical `inheritsFrom`, resolved in the two existing merges

Add ONE optional field and teach the two existing merges to walk the parent
chain. A child inherits the parent's **values, agent bindings, agent roles, and
config**, and overrides any of them per-key. This matches Arman's mental model
(parent → child) and the route reality (a feature is a tree).

What hands down, and where it's resolved:

| Inherited | Resolved in | Rule |
|---|---|---|
| Surface **values** (bindable declarations) | `registry.ts` baseline injection | parent values first → child values override by `name`; baselines still floored last |
| Agent **bindings** (value_mappings) | `fetchSurfaceBindingLayers` + the layer merge | parent layers are weaker than child layers: `parent:global → parent:org → parent:user → child:global → child:org → child:user`; child wins per key |
| Agent **roles** / **config namespaces** | registry merge | union, child overrides by key |

**Why hierarchy (not free-form mixins):** the features ARE trees (transcripts ⊃
cleanup/scribe; notes ⊃ editor/sidebar), the `/` namespace already reads as a
path, and a single `inheritsFrom` string is the smallest change that the
existing merge machinery can absorb. If we later need multiple inheritance, a
`includes: string[]` mixin field is an additive follow-up — don't build it now.

### How it answers the two cases

**Transcripts family** — declare a thin parent `matrx-user/transcripts` holding
the values + bindings common to every transcript surface (the transcript text,
active segment, the org's "Summarize/Clean/Translate" agents). Each page surface
sets `inheritsFrom: "matrx-user/transcripts"` and adds only its page-specific
values. Bind the org's transcript agents ONCE to the parent; they light up on
cleanup, scribe, studio automatically.

**Notes editor + sidebar (Arman's part 2)** — model notes as a parent
`matrx-user/notes` with two children: the **editor** (`isEditable` textarea —
already migrated to the canonical menu) and a **sidebar-item** surface for the
left column. The sidebar note/folder rows mount the SAME canonical
`UnifiedAgentContextMenu` in **presentational mode** (`isEditable={false}` — the
menu already supports this; see `MarkdownContextMenuProvider`), with a per-row
scope (`noteId`/`folder`) and `extraSections` for the row's real actions (note:
open / rename / duplicate / move / delete / share; folder: new note / rename /
delete). Today those sidebar menus are **ad-hoc hand-rolled HTML**
(`features/notes/components/NoteSidebar.tsx:1079-1127` folder menu, `:1129-1229`
note-row menu) — exactly the bespoke-fork pattern the canonical menu exists to
kill. Inheritance lets the sidebar child reuse the notes agents/values while
declaring its row-scoped actions.

## Implementation seams (verified anchors)

1. **Manifest** — add `inheritsFrom?: string` to `SurfaceManifest`
   (`features/surfaces/types.ts:114-133`).
2. **Value merge** — in `registry.ts::withInjectedBaselines`, before flooring
   baselines, recursively pull `getManifest(inheritsFrom).values` and merge
   parent-first. Add a **cycle guard + depth cap (≤2-3)**.
3. **Binding cascade (the real work — this is the current blocker)** —
   `fetchSurfaceBindingLayers` must resolve the parent chain and prepend the
   parent's binding layers as weaker. Either query `WHERE surface_name IN
   (child, ...ancestors)` or call itself up the chain; keep the
   weakest→strongest order so child still wins per key.
4. **DB mirror (optional but recommended for the admin UI + RLS)** — add a
   nullable `parent_surface_name` to `ui_surface` (self-FK,
   `ON DELETE SET NULL`) so the admin map can show the tree and RLS can grant
   read of ancestors. Code-first `inheritsFrom` stays the source of truth,
   mirrored on sync like values are.

## Risks / blockers

- **Binding resolver only fetches the child today** (verified) — cascading
  bindings is the one genuinely new piece of logic; everything else is "merge
  one more layer."
- **`createXxxScope()` helpers are hand-maintained** — if a child inherits
  values, its helper's required/optional keys must reflect the merged set. Keep
  helpers honest or generate them.
- **Cycles / depth** — `inheritsFrom` must reject cycles and cap depth, or both
  merges can infinite-loop.
- **Don't over-reach** — resist multiple-inheritance/mixins and deep trees in v1;
  one parent level covers transcripts + notes.

## Suggested phasing

1. **v1 (values + roles/config inheritance):** the manifest field + the registry
   merge + cycle/depth guard. Ship transcripts parent + notes parent as the first
   consumers. No binding cascade yet (bindings stay per-surface). Low risk,
   immediate de-duplication.
2. **v2 (binding cascade):** extend `fetchSurfaceBindingLayers` to walk the
   parent chain. This is the "bind once on the parent" payoff.
3. **v3 (DB mirror + admin tree):** `parent_surface_name` column, admin map shows
   the hierarchy, RLS ancestor reads.

## Decision needed from Arman

- **Go / no-go** on hierarchical `inheritsFrom` (vs. leaving surfaces flat).
- If go: **v1-only first** (values), or **v1+v2** (values + binding cascade) in
  one push?
- Confirm the **notes = parent + {editor, sidebar} children** modeling, since it
  drives the sidebar-menu rollout.

I recommend **go, v1 first**, with the notes parent/child as the proving ground
(it also unblocks the canonical sidebar menu). I have not built any of this —
say the word and I'll either implement v1 or hand a sub-agent a precise spec.
