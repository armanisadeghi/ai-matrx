"use client";

/**
 * Data Stores management page (per-user surface).
 *
 * Two columns:
 *   left  — list of stores the caller can see (own + same-org), with a
 *           "+ New" form at the top
 *   right — detail of the selected store: header chips, member table
 *           with add/remove, edit + delete actions
 *
 * Auth: Supabase RLS gates everything. Reads return only stores the
 * caller can see; writes succeed only when auth.uid() matches the
 * row's created_by (or the caller's organization_id matches).
 *
 * Selection state is held in URL search params (?store_id=<uuid>) so
 * deep links work and a refresh keeps the right pane open.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CloudUpload,
  Database,
  FilePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CldFilePicker } from "@/features/rag/components/data-stores/CldFilePicker";
import { RichMemberTable } from "@/features/rag/components/data-stores/RichMemberTable";
import {
  useDataStoreDetail,
  useDataStores,
  type EnrichedMember,
  useDataStoreMembersRich,
} from "@/features/rag/hooks/useDataStores";
import {
  DATA_STORE_KINDS,
  SOURCE_KINDS,
} from "@/features/rag/types/data-stores-ext";
import type { DataStoreWithMemberCount } from "@/features/rag/types/data-stores";
import { fileHandler } from "@/features/files";

export function DataStoresPage() {
  const router = useRouter();
  const search = useSearchParams();
  const storeId = search?.get("store_id") ?? null;

  const list = useDataStores();
  const detail = useDataStoreDetail(storeId);

  const select = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(search?.toString() ?? "");
      if (id) params.set("store_id", id);
      else params.delete("store_id");
      const qs = params.toString();
      router.replace(`/rag/data-stores${qs ? `?${qs}` : ""}`);
    },
    [router, search],
  );

  return (
    <div className="flex h-[calc(100dvh-3rem)] bg-background">
      <aside className="w-80 border-r flex flex-col overflow-hidden shrink-0">
        <div className="px-3 py-2 border-b flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold flex-1">Data stores</h1>
          <span className="text-xs text-muted-foreground tabular-nums">
            {list.stores.length}
          </span>
        </div>
        <CreateStoreInline onCreated={(id) => select(id)} />
        <div className="flex-1 overflow-auto">
          {list.loading && list.stores.length === 0 && (
            <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          )}
          {list.error && (
            <div className="px-3 py-2 flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" /> {list.error}
            </div>
          )}
          {!list.loading && list.stores.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No data stores yet. Create your first one above.
            </div>
          )}
          {list.stores.map((s) => (
            <StoreListRow
              key={s.id}
              store={s}
              selected={s.id === storeId}
              onSelect={() => select(s.id)}
            />
          ))}
        </div>
      </aside>

      <section className="flex-1 overflow-hidden">
        {!storeId ? (
          <div className="m-6 rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground max-w-2xl">
            <p className="font-medium text-foreground mb-2">
              What is a data store?
            </p>
            <p className="mb-2">
              A named, curated bucket of documents. Agents can search inside one
              with{" "}
              <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">
                rag_search_data_store(data_store_id, query)
              </code>
              . Bind any indexed PDF, note, code file, or library doc; the agent
              then sees only that bucket when it retrieves.
            </p>
            <p>Pick or create a store on the left to get started.</p>
          </div>
        ) : (
          <StoreDetailPanel
            storeId={storeId}
            detail={detail}
            onDeleted={() => {
              select(null);
              list.refresh();
            }}
          />
        )}
      </section>
    </div>
  );
}

function StoreListRow({
  store,
  selected,
  onSelect,
}: {
  store: DataStoreWithMemberCount;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2 border-b border-border/50 hover:bg-muted/40",
        selected && "bg-muted/60",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium truncate flex-1">
          {store.name}
        </span>
        {!store.isActive && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
            archived
          </span>
        )}
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {store.memberCount}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground truncate">
        {(store.kind ?? "general") +
          (store.shortCode ? ` · ${store.shortCode}` : "")}
      </div>
      {store.description && (
        <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
          {store.description}
        </div>
      )}
    </button>
  );
}

function CreateStoreInline({ onCreated }: { onCreated: (id: string) => void }) {
  const list = useDataStores();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] =
    useState<(typeof DATA_STORE_KINDS)[number]>("general");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="justify-start gap-2 text-xs h-9 rounded-none border-b w-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" /> New data store
      </Button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        setPending(true);
        setErr(null);
        const made = await list.createStore({
          name: trimmed,
          kind,
          description: description.trim() || undefined,
        });
        setPending(false);
        if (made) {
          setName("");
          setDescription("");
          setOpen(false);
          onCreated(made.id);
        } else {
          setErr(list.error ?? "Could not create data store");
        }
      }}
      className="border-b p-3 space-y-2 bg-muted/10"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Smith case)"
        className="h-8 text-xs"
        autoFocus
      />
      <select
        value={kind}
        onChange={(e) =>
          setKind(e.target.value as (typeof DATA_STORE_KINDS)[number])
        }
        className="w-full h-8 px-2 rounded border bg-background text-xs"
      >
        {DATA_STORE_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="h-8 text-xs"
      />
      <div className="flex items-center gap-1.5">
        <Button
          type="submit"
          size="sm"
          className="flex-1"
          disabled={!name.trim() || pending}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Create"
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {err && <div className="text-[10px] text-destructive">{err}</div>}
    </form>
  );
}

function StoreDetailPanel({
  storeId,
  detail,
  onDeleted,
}: {
  storeId: string;
  detail: ReturnType<typeof useDataStoreDetail>;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dropPending, setDropPending] = useState(false);

  // Rich members — server-enriched view of what's actually in the store
  // (file name, size, processing status, page/chunk counts). Replaces
  // the opaque kind/source_id list.
  const richMembers = useDataStoreMembersRich(storeId);
  // Keep the rich list in sync with the underlying detail.members count
  // so adding via picker / drag-drop refreshes both panels.
  useEffect(() => {
    richMembers.refresh();
    // We only want to fire when the membership count or store changes,
    // not on every richMembers identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, detail.members.length]);

  // ─── Bind + auto-ingest helpers ──────────────────────────────────
  // When a user adds a cld_file member to a data store, we ALSO
  // dispatch the existing "cloud-files:reprocess-document" event so
  // the file gets queued for RAG ingestion if it wasn't already.
  // That collapses two manual steps into one click.

  const bindAndReprocess = useCallback(
    async (picks: { cldFileId: string; fileName: string }[], label: string) => {
      if (!picks.length) return;
      const tid = toast.loading(`${label}: 0 / ${picks.length}`, {
        description: "Binding to store + queuing for RAG ingestion.",
      });
      let bound = 0;
      let reprocessed = 0;
      for (const p of picks) {
        try {
          const ok = await detail.addMember({
            sourceKind: "cld_file",
            sourceId: p.cldFileId,
          });
          if (ok) bound += 1;
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("cloud-files:reprocess-document", {
                detail: { fileId: p.cldFileId, force: false, silent: true },
              }),
            );
            reprocessed += 1;
          }
          await new Promise<void>((r) => setTimeout(r, 150));
          toast.loading(`${label}: ${bound} / ${picks.length}`, { id: tid });
        } catch (err) {
          toast.error(
            `Failed to bind ${p.fileName}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      toast.success(
        `${bound} of ${picks.length} bound · ${reprocessed} queued for RAG`,
        {
          id: tid,
          description:
            "Each file streams its ingestion progress in the file viewer. Refresh to see chunk counts.",
        },
      );
    },
    [detail],
  );

  // ─── Drag-and-drop: upload then bind ─────────────────────────────
  // Files dropped on the panel are uploaded into the user's cloud
  // root (file_path = "/<filename>"), then bound + queued for RAG.

  const onPanelDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only react when actual files are being dragged (not text or
    // internal moves). DataTransfer.types contains "Files" only for
    // OS-level file drags.
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onPanelDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear when leaving the outer container, not inner children.
    if (e.currentTarget === e.target) setDragActive(false);
  }, []);

  const onPanelDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length === 0) return;

      setDropPending(true);
      const tid = toast.loading(
        `Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`,
      );
      const picks: { cldFileId: string; fileName: string }[] = [];
      for (const file of files) {
        try {
          // file_path lands in the user's root. The user can move it
          // later from the files page if they want a different folder.
          const normalized = await fileHandler.upload(
            { kind: "file", file },
            {
              visibility: "private",
              metadata: { uploaded_via: "data-store-drop" },
            },
          );
          if (normalized.fileId) {
            picks.push({ cldFileId: normalized.fileId, fileName: file.name });
          }
        } catch (err) {
          toast.error(`Upload failed for ${file.name}`, {
            description: err instanceof Error ? err.message : String(err),
          });
        }
      }
      toast.dismiss(tid);
      setDropPending(false);
      if (picks.length > 0) {
        await bindAndReprocess(picks, `Uploaded ${picks.length}`);
      }
    },
    [bindAndReprocess],
  );

  // Hoisted ABOVE any conditional returns to satisfy Rules of Hooks.
  // detail.members is always an array (the hook initializes it to []).
  const boundCldFileIds = useMemo<Set<string>>(
    () =>
      new Set(
        detail.members
          .filter((m) => m.sourceKind === "cld_file")
          .map((m) => m.sourceId),
      ),
    [detail.members],
  );

  if (detail.loading && !detail.store) {
    return (
      <div className="m-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (detail.error || !detail.store) {
    return (
      <div className="m-6 flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" />{" "}
        {detail.error ?? "Data store not found"}
      </div>
    );
  }
  const s = detail.store;

  return (
    <div
      className="relative flex flex-col h-full overflow-hidden"
      onDragOver={onPanelDragOver}
      onDragLeave={onPanelDragLeave}
      onDrop={(e) => void onPanelDrop(e)}
    >
      {dragActive && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none rounded-md border-2 border-dashed border-primary bg-primary/10">
          <div className="text-sm font-medium text-primary flex items-center gap-2">
            <CloudUpload className="h-5 w-5" />
            Drop files to upload + bind to {s.name}
          </div>
        </div>
      )}
      {dropPending && (
        <div className="absolute top-2 right-2 z-30 rounded-md bg-card border px-2 py-1 text-xs flex items-center gap-1.5 shadow">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
        </div>
      )}

      <header className="border-b px-4 py-3 space-y-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Database className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">{s.name}</h1>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground uppercase tracking-wide">
            {s.kind ?? "general"}
          </span>
          {!s.isActive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
              archived
            </span>
          )}
          {s.organizationId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">
              org {s.organizationId.slice(0, 8)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing((e) => !e)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (
                  !confirm(
                    `Permanently delete data store "${s.name}"? Members will be removed but the underlying documents are not affected.`,
                  )
                )
                  return;
                const ok = await detail.deleteStore();
                if (ok) onDeleted();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
        {s.description && (
          <p className="text-xs text-muted-foreground">{s.description}</p>
        )}
        <div className="text-[10px] text-muted-foreground font-mono select-all">
          {s.id}
        </div>
        {editing && (
          <EditStoreForm
            initial={{
              name: s.name,
              description: s.description ?? "",
              shortCode: s.shortCode ?? "",
              kind: (s.kind ?? "general") as (typeof DATA_STORE_KINDS)[number],
              isActive: s.isActive,
            }}
            onSave={async (patch) => {
              const ok = await detail.updateStore(patch);
              if (ok) setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        )}
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Members ({detail.members.length})
          </h2>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickerOpen(true)}
            >
              <FilePlus className="h-3.5 w-3.5" /> Pick from your files
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setAdvancedOpen(true)}
              title="Bind a non-cld_file source by id"
            >
              <Plus className="h-3.5 w-3.5" /> Advanced
            </Button>
          </div>
        </div>

        {/* Hint about drag-drop */}
        {detail.members.length === 0 && (
          <div className="rounded-md border-2 border-dashed border-border bg-muted/20 p-6 text-xs text-muted-foreground text-center">
            <CloudUpload className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
            <p className="font-medium text-foreground/80 mb-1">
              No members yet
            </p>
            <p>
              Drop files here to upload, bind to <strong>{s.name}</strong>, and
              queue them for RAG ingestion in one step. Or use{" "}
              <strong>Pick from your files</strong> to add already-uploaded
              documents.
            </p>
          </div>
        )}

        {detail.members.length > 0 && (
          <RichMemberTable
            members={richMembers.members}
            loading={richMembers.loading}
            error={richMembers.error}
            onRefresh={() => {
              richMembers.refresh();
              detail.refresh();
            }}
            onRemove={async (sourceKind, sourceId) => {
              await detail.removeMember(sourceKind, sourceId);
              richMembers.refresh();
            }}
          />
        )}

        {detail.members.length > 0 && (
          <div className="text-[11px] text-muted-foreground/70 pt-1">
            Tip: drag files from your computer onto this panel to upload + bind
            + queue for RAG in one step.
          </div>
        )}
      </div>

      {/* Pick-from-your-files dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b">
            <DialogTitle className="text-sm flex items-center gap-2">
              <FilePlus className="h-4 w-4" />
              Add files to {s.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Pick existing cloud files. Selected files will be bound to this
              store and queued for RAG ingestion if not already indexed.
            </DialogDescription>
          </DialogHeader>
          <CldFilePicker
            mimePrefixes={["application/pdf", "text/", "image/"]}
            excludeIds={boundCldFileIds}
            onConfirm={async (picks) => {
              setPickerOpen(false);
              await bindAndReprocess(
                picks,
                `Adding ${picks.length} to ${s.name}`,
              );
            }}
            onCancel={() => setPickerOpen(false)}
            confirmLabel="Add + queue"
          />
        </DialogContent>
      </Dialog>

      {/* Advanced: bind by raw source_kind/UUID */}
      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Bind by source_kind + UUID (advanced)
            </DialogTitle>
            <DialogDescription className="text-xs">
              For non-cld_file sources (notes, code files, library docs,
              processed documents). The cld_file picker handles the common case.
            </DialogDescription>
          </DialogHeader>
          <AddMemberForm
            onAdd={async (input) => {
              const ok = await detail.addMember(input);
              if (ok) {
                toast.success("Member bound", {
                  description: `${input.sourceKind}/${input.sourceId.slice(0, 8)}…`,
                });
                setAdvancedOpen(false);
              }
            }}
            onCancel={() => setAdvancedOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberTable({
  members,
  onRemove,
}: {
  members: EnrichedMember[];
  onRemove: (m: EnrichedMember) => unknown;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Kind
            </th>
            <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Document
            </th>
            <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </th>
            <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Added
            </th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {members.map((m) => (
            <tr
              key={`${m.sourceKind}/${m.sourceId}`}
              className="hover:bg-muted/20"
            >
              <td className="px-3 py-1.5 text-xs">{m.sourceKind}</td>
              <td className="px-3 py-1.5">
                <div className="text-xs">{m.label ?? "—"}</div>
                <div className="font-mono text-[10px] text-muted-foreground select-all truncate">
                  {m.sourceId}
                </div>
              </td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground">
                {m.notes ?? "—"}
              </td>
              <td className="px-3 py-1.5 text-[10px] text-muted-foreground tabular-nums">
                {new Date(m.addedAt).toLocaleString()}
              </td>
              <td className="px-3 py-1.5 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={() => {
                    if (
                      confirm(
                        `Remove ${m.sourceKind}/${m.sourceId.slice(0, 8)}… from this store?`,
                      )
                    ) {
                      void onRemove(m);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddMemberForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: {
    sourceKind: string;
    sourceId: string;
    notes?: string;
  }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<(typeof SOURCE_KINDS)[number]>("cld_file");
  const [sourceId, setSourceId] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const id = sourceId.trim();
        if (!id) return;
        setPending(true);
        await onAdd({
          sourceKind: kind,
          sourceId: id,
          notes: notes.trim() || undefined,
        });
        setPending(false);
        setSourceId("");
        setNotes("");
      }}
      className="rounded-md border bg-muted/20 p-3 flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">source_kind</span>
        <select
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as (typeof SOURCE_KINDS)[number])
          }
          className="h-8 px-2 rounded border bg-background text-xs"
        >
          {SOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className="flex-1 flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">source_id (UUID)</span>
        <Input
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          placeholder="e.g. 7bf8b4f1-…"
          className="h-8 text-xs font-mono"
        />
      </label>
      <label className="flex-1 flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">notes (optional)</span>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="why?"
          className="h-8 text-xs"
        />
      </label>
      <div className="flex items-center gap-1.5">
        <Button type="submit" size="sm" disabled={!sourceId.trim() || pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
}

function EditStoreForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: {
    name: string;
    description: string;
    shortCode: string;
    kind: (typeof DATA_STORE_KINDS)[number];
    isActive: boolean;
  };
  onSave: (patch: {
    name?: string;
    description?: string | null;
    shortCode?: string | null;
    kind?: string | null;
    isActive?: boolean;
  }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const dirty = useMemo(() => {
    return (
      draft.name !== initial.name ||
      draft.description !== initial.description ||
      draft.shortCode !== initial.shortCode ||
      draft.kind !== initial.kind ||
      draft.isActive !== initial.isActive
    );
  }, [draft, initial]);

  return (
    <div className="rounded-md border bg-muted/20 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">name</span>
        <Input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="h-8 text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">kind</span>
        <select
          value={draft.kind}
          onChange={(e) =>
            setDraft({
              ...draft,
              kind: e.target.value as (typeof DATA_STORE_KINDS)[number],
            })
          }
          className="h-8 px-2 rounded border bg-background text-xs"
        >
          {DATA_STORE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">
        <span className="text-muted-foreground">description</span>
        <Input
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className="h-8 text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">short_code</span>
        <Input
          value={draft.shortCode}
          onChange={(e) => setDraft({ ...draft, shortCode: e.target.value })}
          className="h-8 text-xs font-mono"
        />
      </label>
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <Checkbox
          checked={draft.isActive}
          onCheckedChange={(v) => setDraft({ ...draft, isActive: v === true })}
          className="shrink-0"
        />
        <span>active</span>
      </label>
      <div className="sm:col-span-2 flex items-center gap-1.5 justify-end">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || pending}
          onClick={async () => {
            setPending(true);
            await onSave({
              name: draft.name !== initial.name ? draft.name : undefined,
              description:
                draft.description !== initial.description
                  ? draft.description || null
                  : undefined,
              shortCode:
                draft.shortCode !== initial.shortCode
                  ? draft.shortCode || null
                  : undefined,
              kind: draft.kind !== initial.kind ? draft.kind : undefined,
              isActive:
                draft.isActive !== initial.isActive
                  ? draft.isActive
                  : undefined,
            });
            setPending(false);
          }}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}
