# Demos route — auto-discovery nav

**Status:** `active` · **Route:** `/demos` · **Source:** `app/(dev)/demos/`

See: app/(dev)/demos/demo-status.md (Arman's Vision for this route)

## How menus stay in sync

Filesystem scan at request time — no manual link lists.

| Layer | Primitive | File |
|---|---|---|
| Folder index (menu page) | `RouteIndexPage` | `page.dev.tsx` or `page.tsx` |
| Child-page nav strip | `RouteHeaderData` | `layout.dev.tsx` |
| Root `/demos` only | `scanRoutesShallow()` | `page.dev.tsx` (custom shell + legacy section) |

```tsx
// index
<RouteIndexPage directory={join(process.cwd(), "app", "(dev)", "demos", "my-folder")} basePath="/demos/my-folder" title="…" />

// layout
<RouteHeaderData directory={…same…} moduleHome="/demos/my-folder" moduleName="…">{children}</RouteHeaderData>
```

Scanner: `@/utils/route-discovery` — finds `page.tsx` / `page.dev.tsx`, skips `_` dirs and `[dynamic]` segments.

**Hand-maintained (do not auto-wire):** `context-menu/`, `local-tools/`, `scraper/`, `upgrade/`, `lists-junk/`.

## Change log

- 2026-07-03 — Doc added; route-discovery wired for agents, blocks, scopes, sync-demo, and nested test layouts.
