# agent-copy — frontend adapters for Matrx Alchemy

Matrx Alchemy is the shared content-transfer toolkit. **Alchemy Menu** is its package-owned control. This directory contains only the frontend boundary: identity and live-run wiring, declared surface handles, Sheet delivery, and compatibility exports. Cross-repo status and acceptance live in `/Users/armanisadeghi/code/common-docs/systems/platform/ui-shell/projects/matrx-alchemy/PLAN.md`.

## Use the menu

`CopyButtons` is a thin wrapper over the design-system `MatrxCopyMenu`. Supply the menu's typed source/configuration; function-valued sources are resolved on the user action, so capture is current. When `export.sheetRows` is present, the wrapper supplies the frontend's Sheet delivery outcome.

```tsx
import { CopyButtons } from "@/components/agent-copy/CopyButtons";

<CopyButtons
  label="Sandbox instances"
  human={() => formatInstances(rows)}
  json={() => rows}
  agent={() => ({
    kind: "sandbox-instances",
    location: "AI Matrx Admin — Sandbox Management",
    description: "The sandbox instances in the current view.",
    data: rows,
  })}
/>
```

The menu owns structured copy, exports, preparation, and destinations. Do not add a sibling JSON, AI, or export control. `CopyForAiIcon`, `AiCopyMenu`, and `ExportMenu` remain compatibility adapters for existing callers; new work uses the typed package menu through `CopyButtons`.

## Host and declared surfaces

Mount `AlchemyHost` once at the application boundary. It provides the authenticated organization, the Matrx transfer adapter, and the existing live run window. It fences AI preparation when identity changes; it does not own preparation algorithms or menu rendering.

Use `AlchemySurfaceBridge` only around a declared surface. Its handle is local to that React mount and rejects an undeclared surface rather than looking up a same-named global registration.

## Tables

`MatrxDataTable` has a built-in Alchemy Menu when no `copy` configuration is provided. Its default source is a single typed snapshot of the visible declared columns. `copy={false}` is the explicit opt-out. Table exports use the menu's canonical built-in XLSX action when `export.items` is empty; `sheetColumns` carry the declared metadata. A remote or append view describes only its loaded current view—it never implies all matching or unfetched rows.

Pass a `copy` configuration only to customize a table source or menu. The configuration does not require a second row-control implementation, and no per-row two-icon control contract exists.

## Verification boundary

Source/package evidence does not establish deployed behavior. The current release, live browser, and independent-review gates are recorded in the shared register; do not describe this adapter as complete until those gates close.

## Change log

- 2026-10-06 — A write returns what it produced (alchemy 0.12.3): `saveNotesThroughDoor` reads the created notes from `receipt.result`, for the Notes page's live `create_notes` handler and the headless one alike (the signal-keyed WeakMap is gone). `saveNote` with no reported id no longer throws after the note was saved: Scratch gets a link to the Notes list; attach (which needs the real id) says the note exists and not to save again. Guard: `alchemy-door.test.ts` "Notes page open".
- 2026-10-06 — ALC-17 app side: the host binds `door` (`alchemy-door.ts`, the one write door shared with the surface writeback seam), `approvals` (the seam's own inline approval card) and `serverActions` (`alchemy-server-actions.ts`, aidream `POST /actions/run` over `callApi`). "Save to Notes" is a headless handler on `matrx-user/notes · create_notes`; documents, workbooks and the openers (task, code, chat, attach) are not door writes yet.
- 2026-10-06 — The door keeps a mounted page's handlers live for as long as the page is mounted, so an Action or a destination writing to an open page (e.g. Save to Notes with Notes open) reaches the page's own handler; closed, it falls back to the headless handler or `unapplicable`. An agent write's approval is matched to that write (its run id), never to an equal value.
- 2026-09-20 — `sendRowsToSheetOutcome` returns kit 0.16.0's first-class `queued` outcome (sentence + remedy + the approval row as target) for a write the organization reviews first; the `success` + `delivered: "action"` workaround from F-99 is gone, and so is the one-line sentence helper only it read.
- 2026-09-12 — Reconciled the adapter contract with the package menu and the approved table defaults; removed retired two-icon and all-rows claims.

## Export rows carry unique ids (2026-09-18)

`jsonExportItem` / `csvExportItem` derive their `id` from the row LABEL — `csv` for
the default label, `csv:changed-fields` for a custom one. They used to hardcode
`id: "csv"` / `"json"`, so a menu offering two rows of one format registered two
content transfers under one id; the registry refuses duplicates by throwing during
render, which killed the whole route behind "Something went wrong — Transfer id
"export:csv" is empty or registered more than once". Every agent version-diff page
was dead that way on production, with eleven more surfaces in the same class.
Guard: `export-item-ids.test.ts`. Two rows sharing one label still throw — a menu
with two identical rows is its own defect.
