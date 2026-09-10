# Surface authoring — overlay surfaces

Read this when the surface is an overlay/window panel rather than a routed page.

## OVERLAY SURFACES — windows are surfaces too

Overlay/window panels (file preview, quick tasks, markdown editor, …) get their own surfaces: they are among the most interaction-heavy UIs. An overlay surface declares `overlayId` (the id from `features/overlays/catalogue.ts`) INSTEAD of `urlPattern` — the overlay twin of the route. Its emitter is a `<SurfaceRuntimeProvider>` mounted INSIDE the window component: nested providers out-depth the page's provider, so while the window is open ITS scope wins (by design — deepest wins). Values are "available while mounted": a window that always shows a file can promise `file_id` with `alwaysAvailable: true`.

🚨 **Mount the provider AROUND the window's context menu, never BETWEEN the menu and its child.** `EditableContextMenu` / `NonEditableContextMenu` render a Radix `ContextMenuTrigger asChild`, which clones its ONE child and hands it the trigger ref + `onContextMenu`; a non-DOM component (a provider) in that slot swallows both and right-click silently stops opening anything — measured live in `TableViewerWindow` on 2026-08-24. Correct order: `<SurfaceRuntimeProvider><NonEditableContextMenu><div>…` (the pattern `WorkingDocumentEditor` already uses).
