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

```tsx
// index
<RouteIndexPage directory={join(process.cwd(), "app", "(dev)", "demos", "my-folder")} basePath="/demos/my-folder" title="…" />

// layout
<RouteHeaderData directory={…same…} moduleHome="/demos/my-folder" moduleName="…">{children}</RouteHeaderData>
```

Scanner: `@/utils/route-discovery` — finds `page.tsx` / `page.dev.tsx`, skips `_` dirs and `[dynamic]` segments.

**Hand-maintained (do not auto-wire):** `context-menu/`, `local-tools/`, `scraper/`, `upgrade/`, `lists-junk/`.

## Change log

- 2026-07-15 — Root `/demos` uses recursive `RouteIndexPage`; removed legacy section and `/demo` redirects; `general` basePath → `/demos/general`.
- 2026-07-03 — Doc added; route-discovery wired for agents, blocks, scopes, sync-demo, and nested test layouts.
