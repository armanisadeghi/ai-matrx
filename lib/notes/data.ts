import "server-only";
import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import type { Note, NoteListItem } from "@/features/notes/types";

// ── List seed (sidebar) ──────────────────────────────────────────────────────
// Returns only the fields needed to render the sidebar list.
// Deduped within a request via cache().

export const getNoteListSeed = cache(async (): Promise<NoteListItem[]> => {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
        .schema("workbench").from("notes")
        .select(
            "id, created_by, label, folder_name, folder_id, tags, updated_at, position, organization_id, project_id, task_id, visibility, version",
        )
        .eq("created_by", user.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(100);

    if (error) throw error;
    return (data ?? []) as NoteListItem[];
});

// ── Single note (full) ───────────────────────────────────────────────────────
// Calls notFound() on missing/unauthorized — triggers not-found.tsx.
// Deduped: layout + generateMetadata + page all share one DB hit per request.

export const getNote = cache(async (id: string): Promise<Note> => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .schema("workbench").from("notes")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) notFound();
    return data as Note;
});

// ── Preload helper ───────────────────────────────────────────────────────────
// Call this before permission checks to start the fetch immediately.

export const preloadNote = (id: string): void => {
    void getNote(id);
};
