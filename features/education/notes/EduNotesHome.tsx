// features/education/notes/EduNotesHome.tsx
//
// The list-first "savior" home for Smart Notes (/education/notes) — never a
// forced editor. Lists the student's notes (recent-first, searchable, filterable),
// New → creates a real platform note and opens it. Notes ARE platform notes
// (workbench-backed via NotesAPI); "education" is the conversion + capture layer
// on top, so anything you jot can become study material.

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Plus, Search, Clock, AlertCircle, NotebookPen, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { NotesAPI } from "@/features/notes/service/notesApi";
import type { NoteListItem } from "@/features/notes/types";

type VisibilityFilter = "all" | "mine" | "shared" | "public";
const VISIBILITY_FILTERS: { id: VisibilityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "shared", label: "Shared" },
  { id: "public", label: "Public" },
];

const VISIBILITY_LABEL: Record<string, string> = {
  personal: "Personal",
  internal: "Org",
  link: "Link",
  public: "Public",
};

function matchesVisibility(filter: VisibilityFilter, v: string | null): boolean {
  switch (filter) {
    case "mine":
      return v === "personal" || v === "internal" || v == null;
    case "shared":
      return v === "link";
    case "public":
      return v === "public";
    default:
      return true;
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function matchesQuery(n: NoteListItem, q: string): boolean {
  if (!q) return true;
  return [n.label, n.folder_name, ...(n.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function EduNotesHome() {
  const router = useRouter();
  const [rows, setRows] = useState<NoteListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [isPending, startTransition] = useTransition();
  const [navId, setNavId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const items = await NotesAPI.listItems();
        if (cancelled) return;
        setError(null);
        setRows(items);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load notes");
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = (id: string) => {
    if (isPending) return;
    setNavId(id);
    startTransition(() => router.push(`/education/notes/${id}`));
  };

  const createNote = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const note = await NotesAPI.create({ label: "Untitled note", content: "" });
      startTransition(() => router.push(`/education/notes/${note.id}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the note");
      setCreating(false);
    }
  };

  const q = query.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (r) => matchesVisibility(visibility, r.visibility) && matchesQuery(r, q),
  );

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-5 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <NotebookPen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Smart Notes
              </h1>
              <p className="text-xs text-muted-foreground">
                Notes, live lecture capture, and one-click conversion to any study tool.
              </p>
            </div>
          </div>
          <Button onClick={createNote} disabled={creating || isPending}>
            <Plus className="mr-1.5 h-4 w-4" />
            New note
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes by title, folder, or tag"
              className="pl-9"
              aria-label="Search notes"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {VISIBILITY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setVisibility(f.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  visibility === f.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {loading || rows === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Couldn&apos;t load your notes</p>
              <p className="max-w-md text-xs text-muted-foreground">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <NotebookPen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No notes yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Start a note, capture a lecture live, then turn it into flashcards, a
                quiz, a summary, or a mind map in one click.
              </p>
              <Button onClick={createNote} className="mt-2" disabled={creating}>
                <Plus className="mr-1.5 h-4 w-4" />
                New note
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <Search className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Nothing matches your filters</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((n) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(n.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      open(n.id);
                    }
                  }}
                  className={cn(
                    "group flex min-h-[44px] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 cursor-pointer",
                    isPending && navId === n.id && "pointer-events-none opacity-60",
                  )}
                  aria-label={`Open note ${n.label}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <NotebookPen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {n.label || "Untitled note"}
                      </h3>
                      {n.visibility && n.visibility !== "personal" && (
                        <span className="shrink-0 inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider leading-4 text-muted-foreground">
                          {VISIBILITY_LABEL[n.visibility] ?? n.visibility}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                      {n.folder_name && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Folder className="h-3 w-3" />
                          {n.folder_name}
                        </span>
                      )}
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {relativeTime(n.updated_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
