# New Route Scaffold — File Templates

Copy-paste code templates for every scaffold file, taken from the original `/notes` route (now `app/(core)/notes`). The rules each file must satisfy stay in SKILL.md under the same phase and heading — read the rule there, copy the code here.

**Pattern, not importable code:** the `@/features/notes/components/shell/*` imports below were deleted 2026-06-24 (`features/notes/FEATURE.md`); `lib/notes/data.ts`, `features/notes/route/` and `features/notes/types.ts` are live — take current table and column names from them and `types/database.types.ts`, never from these snippets.

## Contents

- Phase 1 — `features/[feature]/types.ts`
- Phase 2 — `lib/[feature]/data.ts`
- Phase 3 — route files: `layout.tsx` (route root), `page.tsx` (route root — index), `[id]/layout.tsx`, `[id]/page.tsx`, view sub-layout (`titlePrefix`), view sub-pages
- Phase 4 — Redux hydrators: `NoteListHydrator.tsx`, `NoteHydrator.tsx`

---

## Phase 1 — `features/[feature]/types.ts`

### Step 2 — Compare against the feature type file

```typescript
// features/notes/types.ts
import type { Database, Json } from "@/types/database.types";

// ── Single source of truth aliases ──────────────────────────────────────────
// Schema-qualified: feature tables live in their own schema (notes → "workbench"), not "public".
export type NoteRow    = Database["workbench"]["Tables"]["notes"]["Row"];
export type NoteInsert = Database["workbench"]["Tables"]["notes"]["Insert"];
export type NoteUpdate = Database["workbench"]["Tables"]["notes"]["Update"];

// Also export related table rows (related tables discovered from DB relationships)
export type NoteFolderRow = Database["workbench"]["Tables"]["note_folders"]["Row"];
// note_versions retired -> history.row_versions (use the get_note_versions RPCs) — no generated row to alias.

// ── Working interface (derived from NoteRow) ─────────────────────────────────
// Keep null fields as null — never coerce to empty strings.
export interface Note {
    id: string;
    created_by: string | null;        // owner column — there is no user_id
    updated_by: string | null;
    label: string;
    content: string | null;
    folder_name: string | null;
    folder_id: string | null;         // FK → workbench.note_folders.id
    organization_id: string;          // NOT NULL — every write passes it explicitly
    project_id: string | null;        // platform.associations projection — never a physical FK
    task_id: string | null;           // platform.associations projection — never a physical FK
    tags: string[] | null;
    metadata: Json | null;
    visibility: Database["platform"]["Enums"]["visibility"];
    version: number;
    sync_version: number;
    content_hash: string | null;
    file_path: string | null;
    last_device_id: string | null;
    position: number | null;
    deleted_at: string | null;        // soft delete — null = live; there is no is_deleted
    created_at: string | null;
    updated_at: string | null;
}

// ── Compile-time structural compatibility guard ──────────────────────────────
// This produces a TypeScript error if NoteRow and Note ever diverge
// (a field missing on either side, or a field whose type differs).
// Zero runtime cost. Add this to EVERY feature type file.
type _AllTrue<T extends Record<PropertyKey, true>> = T;
type _NoteCompatCheck = _AllTrue<{
    [K in keyof NoteRow | keyof Note]: K extends keyof NoteRow & keyof Note
        ? NoteRow[K] extends Note[K] ? Note[K] extends NoteRow[K] ? true : false : false
        : false;
}>;

// ── List projection (subset fetched by the sidebar query) ───────────────────
// Only include fields you actually SELECT in getNoteListSeed().
export type NoteListItem = Pick<Note,
    | "id" | "created_by" | "label" | "folder_name" | "folder_id"
    | "tags" | "updated_at" | "position"
    | "organization_id" | "project_id" | "task_id"
    | "visibility" | "version"
>;

// ── Route-level enums (ask Arman for the exact values) ──────────────────────
export type NoteGroupBy  = "folder" | "organization" | "project" | "task" | "scope";
export type NoteViewMode = "edit" | "split" | "rich" | "md" | "preview" | "diff";
```

---

## Phase 2 — `lib/[feature]/data.ts`

```typescript
// lib/notes/data.ts
import "server-only";          // Build fails if imported by a Client Component
import { cache } from "react"; // Deduplicates within one request pass
import { createClient } from "@/utils/supabase/server";
import type { Note, NoteListItem } from "@/features/notes/types";

// ── List seed ────────────────────────────────────────────────────────────────
// SELECT only the fields NoteListItem needs — never SELECT *.
// Scope is explicit: the caller's own rows (created_by), live rows only (deleted_at IS NULL).
export const getNoteListSeed = cache(async (): Promise<NoteListItem[]> => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .schema("workbench").from("notes")
        .select("id, created_by, label, folder_name, folder_id, tags, updated_at, position, organization_id, project_id, task_id, visibility, version")
        .eq("created_by", user.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(100);

    if (error) throw error;
    return (data ?? []) as NoteListItem[];
});

// ── Single entity (full) ─────────────────────────────────────────────────────
// cache() means layout + generateMetadata + page = ONE DB hit total.
// Empty under RLS = deleted | missing | denied | signed out — return null and let the
// route render <AccessGate>. NEVER notFound() here (authInterrupts is ON; CLAUDE.md).
export const getNote = cache(async (id: string): Promise<Note | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .schema("workbench").from("notes")
        .select("*").is("deleted_at", null).eq("id", id).maybeSingle();
    if (error) throw error; // a transport fault is not an empty read → error.tsx
    return data as Note | null;
});

// ── Preload helper ───────────────────────────────────────────────────────────
// Call void getNote(id) before awaiting anything — starts the fetch immediately.
export const preloadNote = (id: string): void => { void getNote(id); };
```

---

## Phase 3 — Route files

### `layout.tsx` (route root)

```typescript
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/notes", {
    title: "Notes",
    description: "Create, organize, and manage your notes and documents",
});

export default function NotesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
```

### `page.tsx` (route root — index, no item selected)

```typescript
import { Suspense } from "react";
import { getNoteListSeed } from "@/lib/notes/data";
import { NoteListHydrator } from "@/features/notes/route/NoteListHydrator";
import { NotesShell } from "@/features/notes/components/shell/NotesShell";
import NotesLoading from "./loading";

export default async function NotesPage() {
    const seeds = await getNoteListSeed();

    return (
        <>
            <NoteListHydrator seeds={seeds} />
            <Suspense fallback={<NotesLoading />}>
                <NotesShell seeds={seeds}>
                    <NotesEmptyState />
                </NotesShell>
            </Suspense>
        </>
    );
}

function NotesEmptyState() {
    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">Select a note or create a new one.</p>
        </div>
    );
}
```

### `[id]/layout.tsx` — the most important file

```typescript
import { Suspense } from "react";
import { getNote, getNoteListSeed, preloadNote } from "@/lib/notes/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { NoteListHydrator } from "@/features/notes/route/NoteListHydrator";
import { NoteHydrator } from "@/features/notes/route/NoteHydrator";
import { NotesShell } from "@/features/notes/components/shell/NotesShell";
import NotesLoading from "../loading";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const note = await getNote(id); // cache() deduplicates this with the layout call below
    // An empty read says nothing about WHY — the title must not pick one.
    if (!note) return createDynamicRouteMetadata("/notes", { title: "Note" });
    return createDynamicRouteMetadata("/notes", {
        title: note.label,
        description: note.content ? note.content.slice(0, 120) : `Edit ${note.label}`,
    });
}

export default async function NoteDetailLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    // Parallel fetch — preloadNote kicks off getNote before getNoteListSeed awaits.
    preloadNote(id);
    const [seeds, note] = await Promise.all([getNoteListSeed(), getNote(id)]);

    // AccessGate resolves denied / deleted / missing / signed-out / ok and offers the next step.
    if (!note) {
        return (
            <div className="h-full overflow-hidden">
                <AccessGate token="note" id={id} fallbackHref="/notes" fallbackLabel="All notes" />
            </div>
        );
    }

    return (
        <>
            <NoteListHydrator seeds={seeds} />
            <NoteHydrator note={note} />
            <Suspense fallback={<NotesLoading />}>
                <NotesShell seeds={seeds}>{children}</NotesShell>
            </Suspense>
        </>
    );
}
```

### `[id]/page.tsx` — redirect to default view

```typescript
import { redirect } from "next/navigation";

export default async function NoteIndexPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/notes/${id}/edit`); // Ask Arman which view is the default
}
```

### View sub-layout (`[id]/edit/layout.tsx`) — only for a view that needs its own tab title

Live model: `app/(core)/agents/[id]/run/layout.tsx`. Tab reads `Edit | My Note — AI Matrx`.

```typescript
import { getNote } from "@/lib/notes/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const note = await getNote(id); // cache() — same DB hit as the [id] layout
    return createDynamicRouteMetadata("/notes", {
        titlePrefix: "Edit",
        title: note?.label ?? "Note",
        description: "Edit this note.",
        letter: "Ne", // unique per view — ask Arman
    });
}

export default function NoteEditLayout({ children }: { children: React.ReactNode }) {
    return children;
}
```

### View sub-pages (`[id]/edit/page.tsx`, etc.)

No metadata export — the sub-layout above (or the `[id]` layout) owns it.

```typescript
import { NoteViewShell } from "@/features/notes/components/shell/NoteViewShell";
import { NoteEditorPlaceholder } from "@/features/notes/components/shell/NoteEditorPlaceholder";

export default async function NoteEditPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <NoteViewShell
            noteId={id}
            mode="edit"
            leftPanel={<NoteEditorPlaceholder noteId={id} mode="edit" />}
        />
    );
}
```

Split view passes both panels:

```typescript
export default async function NoteSplitPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <NoteViewShell
            noteId={id}
            mode="split"
            leftPanel={<NoteEditorPlaceholder noteId={id} mode="edit" />}
            rightPanel={<NoteEditorPlaceholder noteId={id} mode="preview" />}
        />
    );
}
```

---

## Phase 4 — Redux hydrators

```typescript
// features/notes/route/NoteListHydrator.tsx
"use client";
import { useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { upsertNoteFromServer } from "../redux/slice";
import type { NoteListItem } from "../types";

export function NoteListHydrator({ seeds }: { seeds: NoteListItem[] }) {
    const dispatch = useAppDispatch();
    const hydrated = useRef(false);

    if (!hydrated.current) {
        for (const seed of seeds) {
            dispatch(upsertNoteFromServer({ note: seed, fetchStatus: "list" }));
        }
        hydrated.current = true;
    }

    return null;
}
```

```typescript
// features/notes/route/NoteHydrator.tsx
"use client";
import { useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { upsertNoteFromServer } from "../redux/slice";
import type { Note } from "../types";

export function NoteHydrator({ note }: { note: Note }) {
    const dispatch = useAppDispatch();
    const hydrated = useRef(false);

    if (!hydrated.current) {
        dispatch(upsertNoteFromServer({ note, fetchStatus: "full" }));
        hydrated.current = true;
    }

    return null;
}
```
