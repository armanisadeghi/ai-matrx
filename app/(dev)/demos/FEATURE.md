# Demos route — auto-discovery nav

**Status:** `active` · **Route:** `/demos` · **Source:** `app/(dev)/demos/`

See: app/(dev)/demos/demo-status.md (Arman's Vision for this route)

## How menus stay in sync

Filesystem scan at request time — no manual link lists.

| Layer | Primitive | File |
|---|---|---|
| Folder index (menu page) | `RouteIndexPage` + `scanRoutes()` | `page.dev.tsx` or `page.tsx` |
| Child-page nav strip | `RouteHeaderData` | `layout.dev.tsx` |
| Root `/demos` | `RouteIndexPage` (recursive) | `page.dev.tsx` |
| Full demo-tree header | `RouteTreeBreadcrumbHeader` + `scanRoutes()` | `layout.tsx` |

```tsx
// index
<RouteIndexPage directory={join(process.cwd(), "app", "(dev)", "demos", "my-folder")} basePath="/demos/my-folder" title="…" />

// layout
<RouteHeaderData directory={…same…} moduleHome="/demos/my-folder" moduleName="…">{children}</RouteHeaderData>
```

Scanner: `@/utils/route-discovery` — finds `page.tsx` / `page.dev.tsx`, skips `_` dirs and `[dynamic]` segments.

`layout.tsx` passes that same recursive scan to `DemosRouteHeader`. It derives
the active trail from the pathname and offers every sibling route segment at
each breadcrumb level; adding or moving a demo therefore updates the landing
index and the shell-header navigation together.

Legacy nested `RouteHeaderData` layouts under this tree intentionally become
pass-through wrappers. This prevents their retired in-body module bars from
competing with the one persistent shell header.

**Hand-maintained (do not auto-wire):** `context-menu/`, `local-tools/`, `scraper/`, `upgrade/`, `lists-junk/`.

## Change log

- 2026-07-16 — Added one scope-style, shell-injected breadcrumb header for the complete `/demos/**` tree. Every breadcrumb level exposes filesystem-derived sibling routes.
- 2026-07-15 — Root `/demos` uses recursive `RouteIndexPage`; removed legacy section and `/demo` redirects; `general` basePath → `/demos/general`.
- 2026-07-03 — Doc added; route-discovery wired for agents, blocks, scopes, sync-demo, and nested test layouts.
