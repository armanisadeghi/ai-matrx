// features/education/notes/EduNotesHome.tsx
//
// The list-first "savior" home for Smart Notes (/education/notes) — never a
// forced editor. Lists the student's notes (recent-first, searchable, filterable),
// New → creates a real platform note and opens it. Notes ARE platform notes
// (workbench-backed via NotesAPI), but this list shows ONLY the notes marked for
// Education (`listEducationNotes`) — a plain note lives in the Notes app until
// the person moves it into Study Notes.

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Plus,
  Search,
  Clock,
  AlertCircle,
  NotebookPen,
  Folder,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Skeleton } from "@ai-matrx/design-system";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { cn } from "@/lib/utils";
import { NotesAPI } from "@/features/notes/service/notesApi";
import {
  EDUCATION_NOTE_CREATE_FIELDS,
  listEducationNotes,
} from "@/features/education/notes/education-notes";
import type { NoteListItem } from "@/features/notes/types";
import { formatRelativeTime } from "@/utils/datetime";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import {
  createEducationNotesScope,
  EDUCATION_NOTES_SURFACE_NAME,
  type OwnedEducationNoteScopeEntry,
} from "@/features/surfaces/manifests/education-notes.manifest";
import {
  parseCreateEducationNotes,
  parseDeleteEducationNotes,
  parseUpdateEducationNotes,
} from "./educationNoteAgentWrites";

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

function matchesVisibility(
  filter: VisibilityFilter,
  v: string | null,
): boolean {
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

/** Past this age the list shows a calendar date instead of an age. */
const RELATIVE_CUTOFF_MS = 30 * 24 * 60 * 60 * 1000;

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  if (Date.now() - then >= RELATIVE_CUTOFF_MS) {
    return new Date(iso).toLocaleDateString();
  }
  return formatRelativeTime(iso, { style: "short", fallback: "" });
}

function matchesQuery(n: NoteListItem, q: string): boolean {
  if (!q) return true;
  return [n.label, n.folder_name, ...(n.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function ownedEducationNotes(
  notes: readonly NoteListItem[],
  userId: string | null,
): OwnedEducationNoteScopeEntry[] {
  return notes.flatMap((note) =>
    note.created_by === userId && note.organization_id
      ? [
          {
            id: note.id,
            title: note.label,
            tags: note.tags ?? [],
            organization_id: note.organization_id,
            version: note.version,
          },
        ]
      : [],
  );
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
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);
  const organizationId = useAppSelector(selectOrganizationId);
  const userId = useAppSelector(selectUserId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const items = await listEducationNotes();
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
      const capturedOrganizationId = await ensureOrganizationContext({
        organizationId,
      });
      const note = await NotesAPI.create({
        label: "Untitled note",
        content: "",
        ...EDUCATION_NOTE_CREATE_FIELDS,
        organization_id: capturedOrganizationId,
      });
      startTransition(() => router.push(`/education/notes/${note.id}`));
    } catch (e) {
      if (isOrganizationSelectionCancelled(e)) {
        setCreating(false);
        return;
      }
      toast.error(e instanceof Error ? e.message : "Could not create the note");
      setCreating(false);
    }
  };

  const copyNote = async (note: NoteListItem) => {
    if (busyNoteId) return;
    setBusyNoteId(note.id);
    try {
      const copied = await NotesAPI.copy(note.id);
      toast.success("Note copied");
      router.push(`/education/notes/${copied.id}`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not copy the note",
      );
    } finally {
      setBusyNoteId(null);
    }
  };

  const deleteNote = async (note: NoteListItem) => {
    if (busyNoteId) return;
    const accepted = await confirm({
      title: `Move “${note.label || "Untitled note"}” to Trash?`,
      description:
        "This note leaves your study library and can be restored from Trash.",
      confirmLabel: "Move to Trash",
      variant: "destructive",
    });
    if (!accepted) return;
    setBusyNoteId(note.id);
    try {
      await NotesAPI.remove(note.id);
      setRows(
        (current) => current?.filter((row) => row.id !== note.id) ?? null,
      );
      toast.success("Note moved to Trash");
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not move the note to Trash",
      );
    } finally {
      setBusyNoteId(null);
    }
  };

  const getScope = () => {
    const loaded = !loading && !error && rows !== null;
    const owned = ownedEducationNotes(rows ?? [], userId);
    return createEducationNotesScope({
      notes_loaded: loaded,
      ...(loaded
        ? {
            education_notes: (rows ?? []).map((note) => ({
              id: note.id,
              title: note.label,
              tags: note.tags ?? [],
              updated_at: note.updated_at,
              version: note.version,
              owned: note.created_by === userId,
            })),
            owned_education_notes: owned,
          }
        : {}),
      ...(error ? { load_error: error } : {}),
    });
  };

  const getWriteHandlers = (): SurfaceWriteHandlers => {
    if (!userId)
      refuseSurfaceWrite("Sign in before an agent can change Education notes.");
    const owned = ownedEducationNotes(rows ?? [], userId);
    return collectionWriteHandlers(
      {
        plural: "education_notes",
        singular: "Education note",
        create: {
          parse: parseCreateEducationNotes,
          run: async (plan) => {
            const capturedOrganizationId = await ensureOrganizationContext({
              organizationId,
            });
            const note = await NotesAPI.create({
              label: plan.title,
              content: plan.content,
              tags: plan.tags,
              ...EDUCATION_NOTE_CREATE_FIELDS,
              organization_id: capturedOrganizationId,
            });
            const items = await listEducationNotes();
            setRows(items);
            return { id: note.id, name: note.label };
          },
          nameOf: (plan) => plan.title,
          refusalFor: (cause) =>
            isOrganizationSelectionCancelled(cause)
              ? "The learner closed the organization picker, so no note was created."
              : undefined,
        },
        update: {
          parse: (value) => parseUpdateEducationNotes(value, owned),
          run: async (plan) => {
            const latest = await listEducationNotes({ owner: "mine" });
            const current = latest.find(
              (note) =>
                note.id === plan.id &&
                note.created_by === userId &&
                note.organization_id === plan.organizationId,
            );
            if (!current || current.version !== plan.expectedVersion) {
              throw new Error(
                "This note changed or is no longer owned by the learner. Reload the list and try again.",
              );
            }
            const note = await NotesAPI.update(
              plan.id,
              {
                ...(plan.changed.includes("title")
                  ? { label: plan.title }
                  : {}),
                ...(plan.tags !== undefined ? { tags: plan.tags } : {}),
              },
              {
                expectedVersion: plan.expectedVersion,
                expectedOrganizationId: plan.organizationId,
                expectedActorId: userId,
              },
            );
            setRows(await listEducationNotes());
            return { id: note.id, name: note.label };
          },
          nameOf: (plan) => plan.title,
          changedOf: (plan) => plan.changed,
        },
        delete: {
          parse: (value) => parseDeleteEducationNotes(value, owned),
          run: async (plan) => {
            const latest = await listEducationNotes({ owner: "mine" });
            const current = latest.find(
              (note) =>
                note.id === plan.id &&
                note.created_by === userId &&
                note.organization_id === plan.organizationId,
            );
            if (!current || current.version !== plan.expectedVersion) {
              throw new Error(
                "This note changed or is no longer owned by the learner. Reload the list and try again.",
              );
            }
            await NotesAPI.remove(plan.id, {
              expectedVersion: plan.expectedVersion,
              expectedOrganizationId: plan.organizationId,
              expectedActorId: userId,
            });
            setRows(await listEducationNotes());
            return { id: plan.id, name: plan.title };
          },
          nameOf: (plan) => plan.title,
        },
      },
      refuseSurfaceWrite,
    );
  };

  const q = query.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (r) => matchesVisibility(visibility, r.visibility) && matchesQuery(r, q),
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_NOTES_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      <div className="h-full w-full overflow-y-auto bg-textured">
        <EducationToolHeader title="Smart Notes" />
        <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-center justify-end">
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
              <div
                role="alert"
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center"
              >
                <AlertCircle className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Couldn&apos;t load your notes
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {error}
                </p>
                <ErrorAlchemyMenu />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <NotebookPen className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  No notes yet
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Start a note, capture a lecture live, then turn it into
                  flashcards, a quiz, a summary, or a mind map in one click.
                </p>
                <Button
                  onClick={createNote}
                  className="mt-2"
                  disabled={creating}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  New note
                </Button>
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
                <Search className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Nothing matches your filters
                </p>
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
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(n.id);
                      }
                    }}
                    className={cn(
                      "group flex min-h-[44px] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 cursor-pointer",
                      isPending &&
                        navId === n.id &&
                        "pointer-events-none opacity-60",
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
                    {n.created_by === userId && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label={`Edit ${n.label || "Untitled note"}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            open(n.id);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label={`Copy ${n.label || "Untitled note"}`}
                          disabled={busyNoteId === n.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyNote(n);
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label={`Move ${n.label || "Untitled note"} to Trash`}
                          disabled={busyNoteId === n.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteNote(n);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
