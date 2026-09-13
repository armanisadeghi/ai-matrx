# agent-copy — frontend adapters for Matrx Alchemy

Matrx Alchemy is the shared content-transfer toolkit. **Alchemy Menu** is its package-owned control. This directory contains only the frontend boundary: identity and live-run wiring, declared surface handles, Sheet delivery, and compatibility exports. Cross-repo status and acceptance live in `/Users/armanisadeghi/code/common-docs/projects/matrx-alchemy/REGISTER.md`.

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

- 2026-09-12 — Reconciled the adapter contract with the package menu and the approved table defaults; removed retired two-icon and all-rows claims.
