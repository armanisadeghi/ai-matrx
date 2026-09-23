"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, BookA, Loader2, Plus, Save } from "lucide-react";
import {
  Button,
  Input,
  Skeleton,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from "@ai-matrx/design-system";
import { TapTargetButtonSolid } from "@ai-matrx/tap-target";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import {
  archiveTermList,
  createTermList,
  getTermList,
  listTermLists,
  saveTermList,
  type TermListDraft,
} from "../service";
import {
  MODALITIES,
  MODALITY_LABELS,
  isModality,
  validateEntries,
  type EntryKind,
  type TermList,
} from "../types";
import { TermEntriesTable } from "./TermEntriesTable";

function draftOf(list: TermList): TermListDraft {
  return {
    name: list.name,
    description: list.description,
    modalities: list.modalities,
    context: list.context,
    source_language: list.source_language,
    entries: list.entries,
  };
}

function defaultKindFor(draft: TermListDraft): EntryKind {
  if (draft.modalities.includes("pronunciation") && draft.modalities.length === 1) {
    return "pronounce";
  }
  if (draft.modalities.includes("transcription") && draft.modalities.length === 1) {
    return "boost";
  }
  return draft.modalities.includes("translation") ? "translate" : "spell_as";
}

/** /resources/term-lists — the org's term lists and the one editor. */
export function TermListsWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const [lists, setLists] = useState<TermList[] | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    try {
      const orgId = await ensureOrgId(null);
      setLists(await listTermLists(orgId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load term lists");
      setLists([]);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const select = (id: string) => router.replace(`/resources/term-lists?id=${id}`);

  const createNew = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await createTermList({
        name: "Untitled term list",
        modalities: ["house_terms"],
        entries: [],
      });
      await reload();
      select(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the term list");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden pt-[var(--shell-header-h)]">
      <RouteHeader
        left={<span className="text-sm font-medium">Term lists</span>}
        right={
          <TapTargetButtonSolid
            ariaLabel="New term list"
            tooltip="New term list"
            onClick={() => void createNew()}
            icon={creating ? <Loader2 className="animate-spin" /> : <Plus />}
          />
        }
      />
      <aside className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5" data-testid="term-list-rail">
          {lists === null ? (
            <div className="flex flex-col gap-1.5 p-1">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : lists.length === 0 ? (
            <button
              type="button"
              onClick={() => void createNew()}
              className="w-full rounded-md px-2 py-3 text-left text-sm text-muted-foreground hover:bg-muted"
            >
              No term lists yet. Create one.
            </button>
          ) : (
            lists.map((list) => (
              <button
                key={list.id}
                type="button"
                onClick={() => select(list.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  list.id === selectedId && "bg-muted font-medium",
                )}
              >
                <BookA className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{list.name}</span>
                <span className="text-xs text-muted-foreground">{list.entries.length}</span>
              </button>
            ))
          )}
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {selectedId ? (
          <TermListEditor
            key={selectedId}
            id={selectedId}
            onSaved={() => void reload()}
            onArchived={() => {
              void reload();
              router.replace("/resources/term-lists");
            }}
          />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            Pick a term list, or create one. A term list is shared by the whole
            organization and attaches to any agent from its builder.
          </p>
        )}
      </main>
    </div>
  );
}

export function TermListEditor({
  id,
  onSaved,
  onArchived,
}: {
  id: string;
  onSaved?: (list: TermList) => void;
  onArchived?: () => void;
}) {
  const [base, setBase] = useState<TermList | null>(null);
  const [draft, setDraft] = useState<TermListDraft | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getTermList(id)
      .then((list) => {
        if (!active) return;
        if (!list) {
          setMissing(true);
          return;
        }
        setBase(list);
        setDraft(draftOf(list));
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Couldn't load the term list");
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (missing) {
    return <p className="p-6 text-sm text-muted-foreground">This term list was archived or does not exist.</p>;
  }
  if (!base || !draft) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const problems = validateEntries(draft.entries);
  const dirty = JSON.stringify(draftOf(base)) !== JSON.stringify(draft);
  const set = (patch: Partial<TermListDraft>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    if (saving || !draft.name.trim() || problems.length) return;
    setSaving(true);
    try {
      const result = await saveTermList(base, draft);
      if (result.status === "saved") {
        setBase(result.list);
        setDraft(draftOf(result.list));
        onSaved?.(result.list);
        toast.success("Saved");
      } else if (result.status === "conflict") {
        const reload = await confirm({
          title: "Someone else changed this list",
          description:
            "Another edit was saved while you were working. Load their version? Your unsaved changes here will be discarded.",
          confirmLabel: "Load their version",
          variant: "destructive",
        });
        if (reload) {
          setBase(result.current);
          setDraft(draftOf(result.current));
        }
      } else {
        toast.error("This term list no longer exists");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    const ok = await confirm({
      title: `Archive "${base.name}"?`,
      description:
        "Every agent using it stops receiving these terms on its next run. You can restore it from the archive.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await archiveTermList(base.id);
      onArchived?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't archive");
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4" data-testid="term-list-editor">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Name"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          className="max-w-md text-base font-medium"
        />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => void archive()}>
            <Archive className="mr-1 h-3.5 w-3.5" />
            Archive
          </Button>
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!dirty || saving || !draft.name.trim() || problems.length > 0}
          >
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="multiple"
          aria-label="Used for"
          value={draft.modalities}
          onValueChange={(values: string[]) => set({ modalities: values.filter(isModality) })}
          className="justify-start"
        >
          {MODALITIES.map((m) => (
            <ToggleGroupItem key={m} value={m} size="sm" aria-label={MODALITY_LABELS[m]}>
              {MODALITY_LABELS[m]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Source language
          <Input
            aria-label="Source language"
            value={draft.source_language ?? ""}
            onChange={(e) => set({ source_language: e.target.value || null })}
            className="h-8 w-20"
            placeholder="en"
          />
        </label>
      </div>

      <Textarea
        aria-label="Context"
        value={draft.context ?? ""}
        onChange={(e) => set({ context: e.target.value || null })}
        rows={2}
        placeholder="Context that travels with these terms (who the audience is, what the brand is). It is never translated or spoken."
      />

      <TermEntriesTable
        entries={draft.entries}
        onChange={(entries) => set({ entries })}
        defaultKind={defaultKindFor(draft)}
        problemRows={new Set(problems.map((p) => p.row))}
      />
      {problems.length ? (
        <ul className="px-1 text-xs text-destructive" data-testid="term-list-problems">
          {problems.slice(0, 5).map((p) => (
            <li key={`${p.row}-${p.message}`}>
              Row {p.row}: {p.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
