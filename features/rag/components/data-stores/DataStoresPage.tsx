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
import { ActiveContextButton } from "@/features/scopes/components/active-context/ActiveContextButton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { RagHubHeader } from "@/features/rag/components/shell/RagHubHeader";
import {
  AlertCircle,
  CloudUpload,
  Database,
  FilePlus,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
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
import {
  MOBILE_TABLE,
  MOBILE_TABLE_CELL,
  MOBILE_TABLE_FROZEN_CELL,
  MOBILE_TABLE_FROZEN_HEAD,
} from "@/components/official/mobile-table/mobileTable";
import dynamic from "next/dynamic";
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
import { fileHandler } from "@/features/files/handler/handler";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { DataStorePublishPanel } from "@/features/rag/components/data-stores/DataStorePublishPanel";
import { AccessSummaryPanel } from "@/features/sharing/components/AccessSummaryPanel";
import { useStoreProvenance } from "@/features/rag/hooks/useLibraryProvenance";
import {
  SurfaceRuntimeProvider,
  useSurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { MobilePanelShell, useMobilePanelClose } from "@/features/shell/components/header/templates/MobilePanelShell";
import { buildRagDataStoresContextData } from "@/features/rag/agent-context/buildRagDataStoresContextData";

/** Canonical `ui_surface.name` this page emits. */
const RAG_DATA_STORES_SURFACE = "matrx-user/rag-data-stores";

// THE one canonical file picker. Lazy — WindowPanel must never be parsed in
// a route/boot bundle (features/window-panels FEATURE.md → Bundle invariant).
const FilePickerWindow = dynamic(
  () =>
    import("@/features/resource-manager/resource-picker/FilePickerWindow").then(
      (m) => ({ default: m.FilePickerWindow }),
    ),
  { ssr: false, loading: () => null },
);


export function DataStoresPage() {
  const router = useRouter();
  const search = useSearchParams();
  const storeId = search?.get("store_id") ?? null;

  const list = useDataStores();
  const detail = useDataStoreDetail(storeId);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  // WHY the caller can read a 'granted' store — "via <industry>", "Available
  // to everyone", or "Subscribed" (org-audience grant). Hoisted from the
  // detail panel so the surface emitter and the panel share ONE fetch; the
  // hook no-ops (null id) for stores that aren't grant-conveyed.
  const grantedStoreId =
    detail.store?.access === "granted" ? (detail.store?.id ?? null) : null;
  const { label: grantProvenanceLabel } = useStoreProvenance(grantedStoreId);

  // Live surface scope for the header Agents chrome. Built at Run time from
  // refs the hooks already hold — never on mount.
  const getScope = useCallback(
    () =>
      buildRagDataStoresContextData({
        stores: list.stores,
        listLoading: list.loading,
        listError: list.error,
        store: detail.store,
        selectedStoreId: storeId,
        members: detail.members,
        provenanceLabel: grantProvenanceLabel,
        isSuperAdmin,
        selectionText:
          typeof window !== "undefined"
            ? (window.getSelection()?.toString() ?? "")
            : "",
      }),
    [
      list.stores,
      list.loading,
      list.error,
      detail.store,
      detail.members,
      storeId,
      grantProvenanceLabel,
      isSuperAdmin,
    ],
  );

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

  const storesList = (
    <>
      {/* Working context — what scoped retrieval acts within. */}
      <div className="border-b px-3 py-1.5">
        <ActiveContextButton size="sm" triggerClassName="max-w-full" />
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
    </>
  );

  const detailContent = !storeId ? (
    <div className="m-6 rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground max-w-2xl">
      <p className="font-medium text-foreground mb-2">What is a data store?</p>
      <p className="mb-2">
        A named, curated bucket of documents. Agents can search inside one with{" "}
        <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">
          knowledge_search(query, data_store_id)
        </code>
        . Bind any indexed PDF, note, code file, or library doc; the agent then
        sees only that bucket when it retrieves.
      </p>
      <p>Pick or create a store in the Stores panel to get started.</p>
    </div>
  ) : (
    <StoreDetailPanel
      storeId={storeId}
      detail={detail}
      grantProvenanceLabel={grantProvenanceLabel}
      onDeleted={() => {
        select(null);
        list.refresh();
      }}
    />
  );

  const desktopLayout = (
    <div className="flex h-full overflow-hidden bg-background">
      <aside className="w-80 border-r flex flex-col overflow-hidden shrink-0 pt-[var(--shell-header-h)]">
        {storesList}
      </aside>
      <section className="flex-1 overflow-hidden pt-[var(--shell-header-h)]">
        {detailContent}
      </section>
    </div>
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={RAG_DATA_STORES_SURFACE}
      getScope={getScope}
      isEditable={false}
    >
      <RagHubHeader
        right={
          <span className="text-xs text-muted-foreground tabular-nums px-2">
            {list.stores.length} stores
          </span>
        }
      />
      {/* Mobile: the two-column split cannot fit a phone (the w-80 list left a
          ~55px detail sliver bleeding off a 375px viewport) — the list becomes
          a bottom drawer and the detail owns the screen. Store selection is a
          search-param change, so rows close the drawer via useMobilePanelClose. */}
      <MobilePanelShell
        desktop={desktopLayout}
        main={
          <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background pt-[var(--shell-header-h)]">
            {detailContent}
          </section>
        }
        panels={[
          {
            id: "stores",
            label: "Stores",
            icon: Database,
            content: <div className="flex flex-col">{storesList}</div>,
          },
        ]}
      />
    </SurfaceRuntimeProvider>
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
  // Selecting a store is a search-param change (no route change), so the
  // mobile Stores drawer must dismiss itself — no-op in the desktop aside.
  const closeMobilePanel = useMobilePanelClose();
  return (
    <button
      onClick={() => {
        onSelect();
        closeMobilePanel();
      }}
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
  const closeMobilePanel = useMobilePanelClose();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] =
    useState<(typeof DATA_STORE_KINDS)[number]>("general");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /**
   * Write half — `new_store_draft` (see the manifest). This component owns the
   * create-form state, so it registers the handler itself rather than the page
   * threading three setters up to the provider.
   *
   * A COLLAPSED form owns no visible state, so a write into it would land
   * nowhere the user can see. Applying therefore OPENS the form first: staging
   * into a visible draft is the whole contract of `mode: "draft"`, and opening
   * a create form is reversible and creates nothing. Registered ABOVE the
   * collapsed early-return so the handler exists in both states.
   */
  useSurfaceWriteHandlers(RAG_DATA_STORES_SURFACE, {
    new_store_draft: (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(
          "new_store_draft expects an object with any of name, kind, description.",
        );
      }
      const patch = value as Record<string, unknown>;
      const applied: Array<() => void> = [];

      if (patch.name !== undefined) {
        if (typeof patch.name !== "string") {
          throw new Error("new_store_draft: name must be a string.");
        }
        const next = patch.name.trim();
        if (next.length > 200) {
          throw new Error(
            "new_store_draft: name must be 200 characters or fewer.",
          );
        }
        applied.push(() => setName(next));
      }

      if (patch.kind !== undefined) {
        // Validated against the SAME constant the <select> renders — a kind
        // outside it is rejected, never coerced to "general".
        if (
          typeof patch.kind !== "string" ||
          !(DATA_STORE_KINDS as readonly string[]).includes(patch.kind)
        ) {
          throw new Error(
            `new_store_draft: kind must be one of ${DATA_STORE_KINDS.join(", ")}.`,
          );
        }
        const nextKind = patch.kind as (typeof DATA_STORE_KINDS)[number];
        applied.push(() => setKind(nextKind));
      }

      if (patch.description !== undefined) {
        if (typeof patch.description !== "string") {
          throw new Error("new_store_draft: description must be a string.");
        }
        const next = patch.description.trim();
        if (next.length > 2000) {
          throw new Error(
            "new_store_draft: description must be 2000 characters or fewer.",
          );
        }
        applied.push(() => setDescription(next));
      }

      if (applied.length === 0) {
        throw new Error(
          "new_store_draft: provide at least one of name, kind, description.",
        );
      }

      setOpen(true);
      setErr(null);
      for (const stage of applied) stage();
    },
  });

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
          closeMobilePanel();
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
  grantProvenanceLabel,
  onDeleted,
}: {
  storeId: string;
  detail: ReturnType<typeof useDataStoreDetail>;
  /** WHY the caller can read a 'granted' store — "via <industry>", "Available
   *  to everyone", or "Subscribed" (org-audience grant). Resolved once by
   *  `DataStoresPage` (which also feeds it to the surface emitter) so the
   *  provenance fetch happens exactly once per store. */
  grantProvenanceLabel: string | null;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dropPending, setDropPending] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

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
          description: `Each file streams its ingestion progress in the file viewer. Refresh to see ${RAG_VOCAB.segmentShort.toLowerCase()} counts.`,
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
              visibility: "personal",
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

  /**
   * Write half — the two entity targets on the SELECTED store (see the
   * manifest). Both land through `detail.updateStore`, the same canonical
   * update the Edit form calls; nothing here touches supabase directly.
   *
   * Registered above the loading/error early-returns (Rules of Hooks), so the
   * guards below are the handler's own job: a store that has not loaded, and a
   * granted shared library the caller may read but not curate, both throw —
   * the writeback seam turns that into the error the agent reads back.
   */
  const requireWritableStore = () => {
    const open = detail.store;
    if (!open) {
      throw new Error(
        "No data store has finished loading in the right pane — there is nothing to write to yet.",
      );
    }
    if (open.readOnly) {
      throw new Error(
        `"${open.name}" is a shared library published to you read-only. Its owning organization curates it; this change would be refused server-side.`,
      );
    }
    return open;
  };

  useSurfaceWriteHandlers(RAG_DATA_STORES_SURFACE, {
    store_name: async (value: unknown) => {
      const open = requireWritableStore();
      if (typeof value !== "string") {
        throw new Error("store_name expects a plain string.");
      }
      const name = value.trim();
      if (!name) {
        throw new Error("store_name must not be empty.");
      }
      if (name.length > 200) {
        throw new Error("store_name must be 200 characters or fewer.");
      }
      const saved = await detail.updateStore({ name });
      if (!saved) {
        throw new Error(
          `Renaming "${open.name}" was refused. Only the store's creator or a member of its organization may change it.`,
        );
      }
    },

    store_description: async (value: unknown) => {
      const open = requireWritableStore();
      if (typeof value !== "string") {
        throw new Error(
          "store_description expects a plain string (pass an empty string to clear it).",
        );
      }
      const description = value.trim();
      if (description.length > 2000) {
        throw new Error(
          "store_description must be 2000 characters or fewer.",
        );
      }
      const saved = await detail.updateStore({
        description: description || null,
      });
      if (!saved) {
        throw new Error(
          `Updating the description of "${open.name}" was refused. Only the store's creator or a member of its organization may change it.`,
        );
      }
    },
  });

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
  // Shared Knowledge Resources: a 'granted' store is a shared library the
  // caller may search but not mutate — writes are gated server-side too.
  const readOnly = !!s.readOnly;
  // The Publish action is for super-admins curating library-owned stores.
  const canPublish = isSuperAdmin && s.kind === "library" && !readOnly;

  return (
    <div
      className="relative flex flex-col h-full overflow-hidden"
      onDragOver={readOnly ? undefined : onPanelDragOver}
      onDragLeave={readOnly ? undefined : onPanelDragLeave}
      onDrop={readOnly ? undefined : (e) => void onPanelDrop(e)}
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
          {readOnly && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-1">
              <Lock className="h-3 w-3" /> Shared library ·{" "}
              {grantProvenanceLabel ?? "read-only"}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {canPublish && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPublishOpen(true)}
              >
                <Share2 className="h-3.5 w-3.5" />
                Publish
              </Button>
            )}
            {!readOnly && (
              <>
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
                    const ok = await confirm({
                      title: "Delete data store",
                      description: `Permanently delete data store "${s.name}"? Members will be removed but the underlying documents are not affected.`,
                      confirmLabel: "Delete",
                      variant: "destructive",
                    });
                    if (!ok) return;
                    const deleted = await detail.deleteStore();
                    if (deleted) onDeleted();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
        {s.description && (
          <p className="text-xs text-muted-foreground">{s.description}</p>
        )}
        <div className="text-[10px] text-muted-foreground font-mono select-all">
          {s.id}
        </div>
        {/*
         * Access truth: replaces the raw org-uuid chip with the real answer —
         * visibility, named organization, direct grants, and every container
         * this store is reachable through.
         */}
        <AccessSummaryPanel
          entityType="data_store"
          entityId={storeId}
          className="px-0 py-0"
        />
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
            {!readOnly && (
              <>
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
              </>
            )}
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
            readOnly={readOnly}
          />
        )}

        {!readOnly && detail.members.length > 0 && (
          <div className="text-[11px] text-muted-foreground/70 pt-1">
            Tip: drag files from your computer onto this panel to upload + bind
            + queue for RAG in one step.
          </div>
        )}
      </div>

      {/* Publish to an audience (Shared Knowledge Resources) — super-admin only */}
      {canPublish && (
        <DataStorePublishPanel
          isOpen={publishOpen}
          onClose={() => setPublishOpen(false)}
          storeId={storeId}
          storeName={s.name}
        />
      )}

      {/* Pick from your files — THE canonical picker in a non-blocking
          window. Each pick binds + queues immediately; the window stays open
          for multi-add. Already-bound files are skipped with a notice. */}
      <FilePickerWindow
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        scopeId={`data-store:${storeId}`}
        title={`Add files to ${s.name}`}
        onPick={(selection) => {
          if (boundCldFileIds.has(selection.fileId)) {
            toast.info("Already bound to this store");
            return;
          }
          void bindAndReprocess(
            [
              {
                cldFileId: selection.fileId,
                fileName: selection.details.filename || "File",
              },
            ],
            `Adding ${selection.details.filename || "file"} to ${s.name}`,
          );
        }}
      />

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
      <table className={cn("text-sm", MOBILE_TABLE)}>
        <thead>
          <tr className="border-b bg-muted/40">
            <th className={cn("px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground", MOBILE_TABLE_CELL)}>
              Kind
            </th>
            <th className={cn("px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground", MOBILE_TABLE_FROZEN_HEAD)}>
              Document
            </th>
            <th className={cn("px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground", MOBILE_TABLE_CELL)}>
              Notes
            </th>
            <th className={cn("px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground", MOBILE_TABLE_CELL)}>
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
              <td className={cn("px-3 py-1.5 text-xs", MOBILE_TABLE_CELL)}>
                {m.sourceKind}
              </td>
              <td className={cn("px-3 py-1.5", MOBILE_TABLE_FROZEN_CELL)}>
                <div className="text-xs">{m.label ?? "—"}</div>
                <div className="font-mono text-[10px] text-muted-foreground select-all truncate">
                  {m.sourceId}
                </div>
              </td>
              <td className={cn("px-3 py-1.5 text-xs text-muted-foreground", MOBILE_TABLE_CELL)}>
                {m.notes ?? "—"}
              </td>
              <td className={cn("px-3 py-1.5 text-[10px] text-muted-foreground tabular-nums", MOBILE_TABLE_CELL)}>
                {new Date(m.addedAt).toLocaleString()}
              </td>
              <td className="px-3 py-1.5 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Remove member",
                      description: `Remove ${m.sourceKind}/${m.sourceId.slice(0, 8)}… from this store?`,
                      confirmLabel: "Remove",
                      variant: "destructive",
                    });
                    if (ok) void onRemove(m);
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
