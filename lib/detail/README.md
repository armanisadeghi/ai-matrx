# `lib/detail` — the Detail primitive (package-shaped)

> Arman, 2026-09-17: *"a core component that then shows up as a Page, a flexible drawer, and a
> window panel. The default is the window. … you just make a core component with some core
> rules, then wrap it in this reusable thing from the package, which then instantly gives you
> all 3 for free."*

ONE registration per record type → three presentations for free:

| Presentation | What it is | Host shell (matrx-frontend) |
|---|---|---|
| `window` (**default**) | Floating, draggable, minimizable to the tray, pop-out; a bottom sheet on phones | `WindowPanel` via the `detailWindow` overlay |
| `docked` | A resizable side panel docked to the right edge, no backdrop; a bottom sheet on phones | `SidePanelSurface` (react-resizable-panels v4) via the `detailDocked` overlay |
| `page` | A full route body under the shell header — the only presentation that changes the URL; offers the window back | `/detail/[type]/[id]` with `RouteHeader` |

Champions: Notion (side peek / center peek / full page, per-database "open pages in") and Linear
(peek, keyboard-first). Bones matched, skin ours.

## Why this directory is a package with a different address

npm publishing is not possible from the environment this was built in (no `NPM_TOKEN` /
`NODE_AUTH_TOKEN`, no auth in `~/.npmrc`), so the module lives here with a **clean package
boundary** and becomes `@ai-matrx/detail` (`aidream/apps/shared/detail`) by a `mv`, not a
rewrite:

- **No imports from `features/**` or `@/…` app modules.** Allowed: `react`, `lucide-react`,
  `@ai-matrx/design-system` (`cn`, `Skeleton`), `@ai-matrx/associations` (+ `/react`).
- **Everything app-specific is a port** (`host.tsx` → `DetailHostPorts`): the record-type map,
  the presentation setting, open/close, navigation, the three shells, doors, associations
  policy, history, notifications, clipboard. The host binds them once
  (`features/window-panels/detail/DetailHost.tsx`, mounted in `app/Providers.tsx`); each
  presentation's entry adds its own shell and the type map right above the presentation, so
  the window shell never reaches a boot bundle.
- A missing port **throws naming itself** — never a blank surface.

At extraction time the ports type, the core, the presentations and the keyboard hook move
verbatim; the host binding stays in this repo and imports from the package instead.

## The contract

```ts
// One registration (see types.ts → DetailRecordType)
{
  type, label, icon, accent,
  entityToken,               // doors · associations · history key off this; null = none
  load(id, signal),          // null = no single source → renders from the seed, and says so
  title(row, seed), fields(row),
  health?(row),              // the source health strip (synced records): source, refreshed,
                             // grant state, reconnect, refresh, open-at-source
  associationTokens?,        // null hides the section; omitted → host default minus self
  history?,                  // default: when entityToken is set (public.version_list)
  extraSections?, Frame?     // Frame wraps the body: surface runtime, right-click menu, …
}
```

Fixed sections, in order: **source health strip** (synced records only) · about · **fields** ·
**associations** (`AssociationCardGrid` under a `PrimaryEntityProvider`) · **history** (row
versions) · extras. A section that does not apply is absent, never an empty box.

**The one opener:** `useOpenDetail()({ type, id, presentation?, seed?, list? })`. Without
`presentation` it resolves `ui.detail.default_presentation` (default `window`; overridable by
organization and user; seeded by `migrations/detail_presentation_knob.sql`) through the
platform's ladder read. The resolver RAISES for an unregistered key; the opener then announces
it (toast naming the key and the remedy) and opens the window. Nothing navigates away except
`page`.

**Keyboard** (`useDetailKeyboard`): Escape closes · `[` / `]` previous / next record when the
opener passed a `list` · Cmd/Ctrl+Enter saves when a section registered a save handler.

**Deep links** ride the host's ONE panel-URL mechanism (`?panels=` in matrx-frontend), key
`detail`, instance `type.id`, arg `as`: `?panels=detail:task.<uuid>:as-window` /
`:as-docked`. The page is `/detail/<type>/<id>` (`?l=type.id,…&i=<n>` carries the list). The
extension and desktop clients already open `?panels=` links, so they reach every presentation
with no new code.

**Every reference is a door.** `<token>_id` columns holding a real uuid render through the
host's `RefCell` (`MatrxUuidCell` → open / new tab / peek); the record's own doors sit beside
its title (`EntityDoorControls`). A bare uuid never prints as text when it can open.

## Files

| File | Role |
|---|---|
| `types.ts` | The contract: presentations, `DetailRecordType`, fields, health, list context, the knob key |
| `host.tsx` | `DetailHostPorts`, `DetailHostProvider` (nested providers merge), `useDetailHost`, `requireShell`, `requireResolveType` |
| `core/useDetailCore.ts` | Resolve type → load → title/fields/health; list navigation; presentation switching; keyboard |
| `core/DetailHeader.tsx` | `DetailTitle` (icon · name · chip · doors) and `DetailActions` (prev/next · open-as · copy id) |
| `core/DetailBody.tsx` | The fixed sections |
| `presentations.tsx` | `DetailWindowPresentation` · `DetailDockedPresentation` · `DetailPagePresentation` |
| `useOpenDetail.ts` | The one opener |
| `useDetailKeyboard.ts` · `useDetailRecord.ts` · `format.ts` · `presentation.ts` | Keyboard model · loader · row→fields · deep-link spelling |

## Host binding (matrx-frontend)

`features/window-panels/detail/` — `DetailHost.tsx` (ports, boot-light) · `shells/` (window /
docked / page) · `detailTypeBinding.ts` (`resolveType` = the item-presentation registry, THE
type map) · `detailOverlayData.ts` (overlay payload + page query) · `DetailPageRoute.tsx`.
Overlay entries: `features/window-panels/windows/detail/DetailWindow.tsx` / `DetailDocked.tsx`;
openers `features/overlays/openers/detailWindow.tsx` / `detailDocked.tsx`; metadata in
`registry/windowRegistryMetadata.ts`; hydrator `detail` in `url-sync/initUrlHydration.ts`.

## Follow-up census — bespoke detail panels to converge onto this primitive

Not touched in this build (deliberately: one migration end to end, `ItemDetailWindow`, proved
the contract). Each becomes one `DetailRecordType` registration; the panel body's
type-specific parts move into `extraSections` / `Frame`, the chrome is deleted.

1. `features/ai-models/components/AiModelDetailPanel.tsx` (+ `audit/ModelDetailSheet.tsx`)
2. `features/hindsight/components/EnrollmentDetailPanel.tsx`
3. `features/podcasts/components/admin/PodcastDetailPanel.tsx`
4. `features/rag/components/library-catalog/PackDetailPanel.tsx`
5. `features/rag/components/library-catalog/RulebookDetailPanel.tsx`
6. `features/surfaces/components/SurfaceDetailPanel.tsx`
7. `features/tool-registry/executor-surfaces/components/ExecutorSurfaceDetailPanel.tsx`

(Census: `grep -rl "DetailPanel" features` on 2026-09-17, component files only; `MandateWindow`
already wraps its canonical views and is not on this list.)

## Not done (honest)

- Per-record-type override of the presentation. The platform rung for it is `table` (keyed by
  a `platform.entity_types` row id) and the client cannot address it yet — the published entity
  metadata carries no row id. The knob names organization and user only, so nothing on a
  settings screen promises what the reader cannot honour. Add `table` in the same change that
  teaches the reader the id.
- The source health strip is a rendered slot with a full contract; no registration feeds it
  yet (the synced-record primitive, U-P3, is the first).
- An editor inside a detail (Cmd/Ctrl+Enter saves) — the hook and registration point exist;
  the item-presentation registration is read-only.
