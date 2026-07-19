# Route Architecture Reference

Full composition patterns and anti-patterns for `app/(a)/` routes.

## Complete File Tree (notes as reference)

```
app/(a)/notes/
├── layout.tsx                    # Static metadata
├── loading.tsx                   # Full-shell skeleton
├── error.tsx                     # Route-level error boundary
├── page.tsx                      # Index: seed fetch + hydrators + shell
└── [id]/
    ├── layout.tsx                # Parallel fetch + generateMetadata + both hydrators
    ├── loading.tsx               # Content-area skeleton only
    ├── error.tsx                 # Item-level error boundary
    ├── not-found.tsx             # notFound() trigger
    ├── page.tsx                  # redirect → default view
    ├── edit/page.tsx             # { title: "Edit" } + NoteViewShell
    ├── split/page.tsx            # { title: "Split" } + NoteViewShell (both panels)
    ├── rich/page.tsx
    ├── md/page.tsx
    ├── preview/page.tsx
    └── diff/page.tsx

features/notes/
├── types.ts                      # DB-derived types + compat check
├── route/
│   ├── NoteListHydrator.tsx      # List seed → Redux (useRef, not useEffect)
│   └── NoteHydrator.tsx          # Full entity → Redux (useRef, not useEffect)
└── components/
    └── shell/
        ├── NotesShell.tsx        # Server — outermost layout frame
        ├── NotesSidebar.tsx      # Server — 280px frame
        ├── NotesSidebarClient.tsx # Client — interactive sidebar content
        ├── NotesMainArea.tsx     # Server — flex-1 frame + children slot
        ├── NotesTabBar.tsx       # Client — tab state + navigation
        ├── NoteViewShell.tsx     # Server — single/split layout decision
        └── NoteEditorPlaceholder.tsx # Client stub — replace per view mode

lib/notes/
└── data.ts                       # server-only, cache()-wrapped fetchers
```

## Data Flow

```
Server (Next.js)
│
├─ getNoteListSeed()  ─────────────────────────────────────────────────┐
│   cache() → one DB hit even if called from layout + metadata + page  │
│                                                                       │
├─ getNote(id)  ────────────────────────────────────────────────────── │ ──┐
│   cache() deduplicates generateMetadata + layout calls               │   │
│                                                                       ▼   ▼
│                                                              NoteListHydrator  NoteHydrator
│                                                                (render pass, not useEffect)
│                                                                       │
│                                                                       ▼
│                                                               Redux Store
│                                                             (available to all client islands)
│
└─ NotesShell (Server) ──────────────────────────────────────────────────
    ├─ NotesSidebar (Server frame)
    │   └─ NotesSidebarClient (Client — reads selectAllNotesList)
    └─ NotesMainArea (Server frame)
        ├─ NotesTabBar (Client — reads selectOpenTabNotes)
        └─ NoteViewShell (Server — left/right panels)
            ├─ NoteEditorPlaceholder (Client — reads selectNoteContent)
            └─ NoteEditorPlaceholder (Client — right panel, split only)
```

## Why Each Decision Was Made

### `cache()` on data functions, not `Promise.all` everywhere
`generateMetadata` and the layout body both call `getNote(id)`. With `cache()`, React deduplicates them to a single DB round trip. `Promise.all` only helps when you have *different* fetches.

### `preloadNote` before `Promise.all`
```typescript
preloadNote(id);  // starts getNote(id) immediately — void, no await
const [seeds, note] = await Promise.all([getNoteListSeed(), getNote(id)]);
// Both fetches run in parallel even though seeds may resolve first
```

### Hydrators render `null` with `useRef`, not `useEffect`
`useEffect` fires after paint. Children reading Redux would see empty state for one frame → flash. `useRef` dispatches during the render pass, before any child reads.

### `loading.tsx` at `[id]/` covers only the content area
The `[id]/layout.tsx` persists across sub-page navigation (edit → preview → split). Only the page content area changes. So `[id]/loading.tsx` only needs to mirror the content area skeleton, not the full shell.

### Sub-pages return `{ title }` only from `generateMetadata`
The `[id]/layout.tsx` already provides `generateMetadata` with full favicon, OG, and Twitter card via `createDynamicRouteMetadata`. Sub-pages just set the `<title>` tab text.

---

## Common Anti-Patterns (from agents route audit)

These were found in `app/(a)/agents` — avoid them in all new routes:

| Anti-pattern | Why wrong | Fix |
|---|---|---|
| Sub-pages calling `getAgent(id)` in `generateMetadata` | Extra DB hit; layout already fetched it | Return `{ title: "View Name" }` only |
| No `<Suspense>` boundaries inside pages | User sees nothing until everything resolves | Wrap each async component in its own `<Suspense>` |
| `loading.tsx` skeletons not matching real content dimensions | Layout shift (CLS) | Explicit `h-` and `w-` on every skeleton element |
| Inline `style={{ paddingTop: "var(...)" }}` | Violates Tailwind-only rule | Use Tailwind arbitrary value class |
| Layout blocking on DB fetch before rendering stable header | Header delays with data | Render stable header immediately; stream hydrator via Suspense |
| Multiple `.md` files in route directory | Violates one-README rule | One `README.md` only, after code is tested |

---

## Metadata Quick Reference

```typescript
// Root layout — static
export const metadata = createRouteMetadata("/notes", {
    title: "Notes",
    description: "...",
});

// [id] layout — dynamic, from fetched data
export async function generateMetadata({ params }) {
    const { id } = await params;
    const note = await getNote(id); // cache() deduplicates
    return createDynamicRouteMetadata("/notes", {
        title: note.label,
        description: note.content?.slice(0, 120),
    });
}

// Sub-page — title only
export function generateMetadata() { return { title: "Edit" }; }
```

## Mobile Considerations

- **Sidebar:** On mobile, the 280px sidebar becomes a bottom sheet (Drawer). Use `useIsMobile()` in `NotesSidebarClient` to switch. Ask Arman before implementing.
- **Tab bar:** On mobile, tabs may need to scroll horizontally or collapse to a dropdown. Ask Arman.
- **View modes:** Split view is desktop-only. On mobile, only the primary panel renders. `NoteViewShell` can detect `useIsMobile()` if needed.
- **Dialogs → Drawers:** All dialogs (delete confirm, rename, share) use `useIsMobile()` + conditional `<Drawer>` vs `<AlertDialog>`.

## Questions to Always Ask Arman

- What is the default redirect target for `[id]/page.tsx`?
- Which Lucide icon goes in the navigation?
- What favicon color (hex) and letter initial?
- Is the sidebar width 280px or different?
- Are there more or fewer view modes than notes?
- Does this feature have a pre-existing Redux slice that needs extending vs. a new slice?
- Are there any M2M relationship tables that need their own sidebar grouping?
- Is there a version/history table? If so, does the diff view use it?
- Are there any glass-mode or experimental CSS overrides Arman has pre-approved?
