# `lib/detail` — the Detail primitive (package-shaped)

> Arman, 2026-09-17: *"a core component that then shows up as a Page, a flexible drawer, and a
> window panel. The default is the window. … you just make a core component with some core
> rules, then wrap it in this reusable thing from the package, which then instantly gives you
> all 3 for free."*

ONE registration per record type → three presentations for free (keyboard: Escape closes,
the arrows move between records — `[` / `]` are aliases — and Cmd/Ctrl+Enter saves):

| Presentation | What it is | Host shell (matrx-frontend) |
|---|---|---|
| `window` (**default**) | Floating, draggable, minimizable to the tray, pop-out; a bottom sheet on phones | `WindowPanel` via the `detailWindow` overlay |
| `docked` | A resizable side panel docked to the right edge, no backdrop; a bottom sheet on phones | `SidePanelSurface` (react-resizable-panels v4) via the `detailDocked` overlay |
| `page` | A full route body under the shell header — the only presentation that changes the URL; offers the window back | `/detail/[type]/[id]` with `RouteHeader` |

Champions: Notion (side peek / center peek / full page, per-database "open pages in") and Linear
(peek, keyboard-first). Bones matched, skin ours.

## 🚨 This directory is a COPY of `@ai-matrx/detail`, and a guard keeps it even

**The package exists.** The `mv` was performed: `@ai-matrx/detail` 0.1.0 lives at aidream
`apps/shared/detail`, and its own `pnpm typecheck`, `pnpm test` and `pnpm check:package`
(exports agreement, publint, tarball canary) pass there. **It is not on npm.** The frontend
adopted it (`ec7ce701`) and the adoption was **reverted** (`32ce9170`, ruling R21), because a
`"latest"` spec for a package the registry does not have kills the ONE
`pnpm install --frozen-lockfile` every workspace project shares. Publishing is a human step.

So **this directory is the LIVE code and the package's `src/` is the source of truth for what it
should say.** A fix goes into BOTH, in the same session. What makes that enforceable rather than
a promise is `__tests__/the-in-repo-copy-matches-the-package.test.ts`: it diffs all fifteen
module pairs against the package and fails BY NAME on any difference outside the module-path
header and relative import specifiers — and it fails as **UNMEASURED**, never green, when the
aidream checkout is absent. `core/icons.ts` is the ONE deliberate difference (the package inlines
its glyphs because a package takes no icon-library dependency; this repo is Lucide-only) and its
own header says so.

That guard exists because of what happened without it: in the fifteen days after the cut, the
package fixed a reviewed defect — a health producer answering `onReconnect: null` ("a reconnect
cannot repair this refusal") still got a Reconnect button — and the revert restored the `??` that
caused it here, so a person was shown a button that could not fix their problem while every suite
in both repos stayed green (VERIFY-U-P1-R5, N1 / N2).

The boundary the extraction rode on still holds, and is still worth stating:

- **No imports from `features/**` or `@/…` app modules.** Allowed: `react`, `lucide-react`,
  `@ai-matrx/design-system` (`cn`, `Skeleton`), `@ai-matrx/associations` (+ `/react`).
- **Everything app-specific is a port** (`host.tsx` → `DetailHostPorts`): the record-type map,
  the presentation setting, open/close, navigation, the three shells, doors, associations
  policy, history, notifications, clipboard. The host binds them once
  (`features/window-panels/detail/DetailHost.tsx`, mounted in `app/Providers.tsx`); each
  presentation's entry adds its own shell and the type map right above the presentation, so
  the window shell never reaches a boot bundle.
- A missing port **throws naming itself** — never a blank surface.

When the publish lands, adoption is deleting these files and importing `@ai-matrx/detail` /
`/react` instead; the host binding and the shells stay in this repo. Until then the drift guard
is the adoption's stand-in.

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

- **The npm package.** See above: the boundary holds, the publish is owed.
- **The per-record-type override is DONE, and its knob row is live.** (This paragraph said the
  opposite through rounds 2, 3 and 4 — NEW-16, then NEW-21.) `ui.detail.presentation_by_type`
  (a json map, organization → user, read before the default) is read by `DetailHost`, written by
  `DetailPresentationPane`, covered by tests, and its row was applied through the sanctioned path
  on 2026-09-17 16:15:19Z — read live from `platform.feature_knob` on 2026-09-17 by fix lane F-31.
  Were the row ever missing, `knob_resolve` raises for the key, the host catches it and warns once
  naming the file, and every type opens as `default_presentation` says. (The platform's own `table`
  rung stays unusable from a browser: it is keyed by a `platform.entity_types` row id and that
  table is admin-only by a restrictive policy.)
- **The source health strip HAS a producer now** (F-31, 2026-09-17): the record-spec contract
  carries `health` as a sync-or-async producer the HOST wires, `resolveItemDetailType` attaches
  `sourceHealthProducerFor(type)` to every registration, and that producer derives the strip from
  the connectors' own `productHealth` over the server's recorded `capability_health` — one reader,
  never a second. A row that is not a mirror of a provider answers `null` and the strip stays
  absent. Pinned by `features/item-presentation/__tests__/a-synced-record-shows-its-refusal.test.tsx`,
  which drives the live column shape a refused `gmail.send` leaves behind. **Still unseen on a
  screen**, and no synced TABLE exists yet — U-P3 ships the first one, and it needs no change here.
- **An editable record body.** Cmd/Ctrl+Enter saves — `DetailPresentationPane` registers it —
  but the thing it saves is the detail's own presentation setting, because no record type on
  this branch has an editable body. The first registration that ships an editor registers its
  own save the same way and takes the chord over. Since F-31 the chord never does nothing in
  silence: with no save registered it says there is nothing to save here (NEW-22).
