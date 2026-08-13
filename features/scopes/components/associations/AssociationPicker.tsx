// features/scopes/components/associations/AssociationPicker.tsx
//
// The token-driven "pick a record to associate" surface. Adaptive: a
// NON-BLOCKING draggable/resizable `WindowPanel` on desktop (the page behind
// stays interactive — never a blocking Sheet), a bottom Drawer on mobile
// (project rule — never a Dialog on mobile).
//
// Two jobs, both ALWAYS available (the create-then-associate contract in the
// association-entity-select skill):
//   1. Associate existing — the registry-driven candidate list.
//   2. Add new + associate — the "+ New <Entity>" footer creates the row
//      first (durable, via `createEntityRow`), writes the edge second, and
//      every terminal outcome is loud.
//
// Files are NOT listed with the generic candidate list — the `file` token
// always mounts the canonical stored-files browser (`FilesResourcePicker`:
// search, filters, recents, folder tree, thumbnails), the same picker as
// Smart Agent Input's "Stored Files". The generic list is only for non-file
// tokens, whose candidates come from the registry-driven
// `useAssociationCandidates` reader.

"use client";

import { useState, type ReactNode } from "react";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssociationCandidates } from "@/features/scopes/hooks/useAssociationCandidates";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { createEntityRow } from "@/features/scopes/service/entityRows";
import {
  FilesResourcePicker,
  type FileSelection,
} from "@/features/resource-manager/resource-picker/FilesResourcePicker";
import dynamic from "next/dynamic";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

// THE one canonical file picker. Lazy — WindowPanel must never be parsed in
// a route/boot bundle (features/window-panels FEATURE.md → Bundle invariant).
const FilePickerWindow = dynamic(
  () =>
    import("@/features/resource-manager/resource-picker/FilePickerWindow").then(
      (m) => ({ default: m.FilePickerWindow }),
    ),
  { ssr: false, loading: () => null },
);

// Same lazy rule for the association window shell (it parses WindowPanel).
const AssociationWindow = dynamic(
  () =>
    import("@/features/scopes/components/associations/AssociationWindow").then(
      (m) => ({ default: m.AssociationWindow }),
    ),
  { ssr: false, loading: () => null },
);

export interface AssociationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: EntityTypeToken;
  /** Container display label, for the header ("…to Titanium Marketing"). */
  containerLabel?: string;
  /** Org stamped onto rows created by the "+ New" footer. */
  orgId?: string | null;
  /** Resource ids already attached to the container. */
  attachedIds: Set<string>;
  /** Attach a resource (returns ok/err so the row can surface failures). */
  onAttach: (
    resourceId: string,
    title: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Detach a resource. */
  onDetach: (resourceId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function AssociationPicker(props: AssociationPickerProps) {
  const isMobile = useIsMobile();
  const info = getEntityInfo(props.token);

  // Files never open a blocking sheet — the ONE canonical picker in a
  // non-blocking draggable window. Picking toggles attach/detach.
  if (props.token === "file") {
    return (
      <FilePickerWindow
        open={props.open}
        onClose={() => props.onOpenChange(false)}
        scopeId={`association:${props.containerLabel ?? "container"}`}
        title={
          props.containerLabel ? `Add to ${props.containerLabel}` : "Add files"
        }
        onUpload={async (files) => {
          const failures: string[] = [];
          for (const file of files) {
            try {
              const result = await props.onAttach(file.fileId, file.name);
              if (!result.ok) failures.push(file.name);
            } catch (error: unknown) {
              console.error(
                "[AssociationPicker] uploaded file association failed",
                { fileId: file.fileId, error },
              );
              failures.push(file.name);
            }
          }
          if (failures.length > 0) {
            toast.error(
              `${failures.length} uploaded ${failures.length === 1 ? "file was" : "files were"} not added`,
              {
                description:
                  "The upload is safe in Files. You can retry the association here.",
                action: {
                  label: "Open Files",
                  onClick: () =>
                    window.open("/files", "_blank", "noopener,noreferrer"),
                },
              },
            );
          }
        }}
        onPick={async (selection) => {
          if (props.attachedIds.has(selection.fileId)) {
            await props.onDetach(selection.fileId);
          } else {
            await props.onAttach(
              selection.fileId,
              selection.details.filename || "File",
            );
          }
        }}
      />
    );
  }
  const title = `Add ${info.labelPlural}`;
  const subtitle = props.containerLabel
    ? `Attach to ${props.containerLabel}`
    : "Click an item to attach or detach it";

  const body = (
    <AssociationCandidateBody
      token={props.token}
      enabled={props.open}
      orgId={props.orgId}
      attachedIds={props.attachedIds}
      onAttach={props.onAttach}
      onDetach={props.onDetach}
      onClose={() => props.onOpenChange(false)}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={props.open} onOpenChange={props.onOpenChange}>
        <DrawerContent className="max-h-[85dvh] flex flex-col pb-safe">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <info.Icon className="h-4 w-4 text-muted-foreground" />
              {title}
            </DrawerTitle>
            <DrawerDescription>{subtitle}</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 min-h-0 px-4 pb-4 flex flex-col overflow-y-auto">
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: non-blocking draggable window. Gated on `open` so the window
  // chunk only loads on first use.
  if (!props.open) return null;
  return (
    <AssociationWindow
      open={props.open}
      onClose={() => props.onOpenChange(false)}
      scopeId={`picker:${props.token}`}
      title={title}
      icon={<info.Icon className="size-3.5 text-primary" />}
      subtitle={subtitle}
    >
      {body}
    </AssociationWindow>
  );
}

export interface AssociationCandidateBodyProps {
  token: EntityTypeToken;
  /** Load candidates only while true (mirror of the surface's `open`). */
  enabled: boolean;
  /** Org stamped onto rows created by the "+ New" footer. */
  orgId?: string | null;
  attachedIds: Set<string>;
  onAttach: (
    resourceId: string,
    title: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onDetach: (resourceId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Wired to the canonical file browser's back affordance. */
  onClose?: () => void;
}

/**
 * The attach/detach body for ONE token — reused by the picker sheet and by
 * `UniversalAssociationPicker`'s per-token browse mode. Routes `file` to the
 * canonical `FilesResourcePicker`; every other token gets the registry-driven
 * candidate list. Do NOT add a plain file list here — file enumeration only
 * happens through the canonical picker's listing-gated data paths.
 */
export function AssociationCandidateBody({
  token,
  enabled,
  orgId,
  attachedIds,
  onAttach,
  onDetach,
  onClose,
}: AssociationCandidateBodyProps) {
  const [fileBusy, setFileBusy] = useState(false);

  if (token === "file") {
    const handleFilePick = async (selection: FileSelection) => {
      if (fileBusy) return;
      setFileBusy(true);
      try {
        if (attachedIds.has(selection.fileId)) {
          await onDetach(selection.fileId);
        } else {
          await onAttach(
            selection.fileId,
            selection.details.filename || "File",
          );
        }
      } finally {
        setFileBusy(false);
      }
    };
    return (
      <div
        className={cn("flex min-h-0 flex-1 flex-col", fileBusy && "opacity-70")}
      >
        <FilesResourcePicker
          onBack={() => onClose?.()}
          onSelect={(selection) => void handleFilePick(selection)}
          fillHost
        />
      </div>
    );
  }

  return (
    <EntityCandidateList
      token={token}
      enabled={enabled}
      orgId={orgId}
      attachedIds={attachedIds}
      onAttach={onAttach}
      onDetach={onDetach}
    />
  );
}

function EntityCandidateList({
  token,
  enabled,
  orgId,
  attachedIds,
  onAttach,
  onDetach,
}: {
  token: EntityTypeToken;
  enabled: boolean;
  orgId?: string | null;
  attachedIds: Set<string>;
  onAttach: (
    resourceId: string,
    title: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onDetach: (resourceId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const info = getEntityInfo(token);
  const { candidates, loading, error, reload } = useAssociationCandidates({
    token,
    enabled,
    search: search.trim() || undefined,
  });

  // Creatable = the generic registry write path works: a title column and no
  // bespoke candidate source (a `listCandidates` override signals the table
  // is not PostgREST-writable, e.g. rag data stores).
  const canCreate = info.titleColumn !== null && info.listCandidates === null;

  const toggle = async (id: string, title: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const attached = attachedIds.has(id);
      const res = attached ? await onDetach(id) : await onAttach(id, title);
      // The container cache reload (in the thunk) flips `attachedIds` for us.
      // A silent no-op attach is the bug class this toast kills.
      if (!res.ok) {
        toast.error(
          `Couldn't ${attached ? "detach" : "attach"} "${title}"` +
            (res.error ? `: ${res.error}` : ""),
        );
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${info.labelPlural.toLowerCase()}…`}
          className="pl-8 text-base"
          style={{ fontSize: 16 }}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {loading && candidates.length === 0 ? (
          <ListMessage>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </ListMessage>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            <p className="font-medium">Couldn’t load items</p>
            <p className="opacity-80">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-1 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        ) : candidates.length === 0 ? (
          <ListMessage>
            {canCreate
              ? `Nothing to attach yet — create a new ${info.label.toLowerCase()} below.`
              : "Nothing to attach."}
          </ListMessage>
        ) : (
          <ul className="space-y-0.5">
            {candidates.map((c) => {
              const attached = attachedIds.has(c.id);
              const busy = busyId === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(c.id, c.title)}
                    className={cn(
                      "group w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      "hover:bg-accent disabled:opacity-50",
                      attached && "bg-accent/40",
                    )}
                  >
                    <info.Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 min-w-0 truncate text-foreground">
                      {c.title}
                    </span>
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full shrink-0",
                        attached
                          ? "bg-primary text-primary-foreground"
                          : "border border-border text-muted-foreground group-hover:border-primary/60",
                      )}
                    >
                      {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : attached ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {canCreate && (
        <CreateAndAttachFooter
          token={token}
          orgId={orgId}
          seed={search.trim()}
          onAttach={onAttach}
          onCreated={reload}
        />
      )}
    </>
  );
}

/**
 * The "+ New <Entity>" footer — the create-then-associate contract: create the
 * durable row FIRST (`createEntityRow`), write the idempotent edge SECOND
 * (retry once), and every terminal outcome is loud. A created-but-unlinked
 * row is reported WITH its location, never silently orphaned.
 */
function CreateAndAttachFooter({
  token,
  orgId,
  seed,
  onAttach,
  onCreated,
}: {
  token: EntityTypeToken;
  orgId?: string | null;
  /** Current search text — doubles as the new row's default name. */
  seed: string;
  onAttach: (resourceId: string, title: string) => Promise<{ ok: boolean }>;
  onCreated: () => void;
}) {
  const info = getEntityInfo(token);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const created = await createEntityRow(token, {
        title,
        orgId: orgId ?? null,
      });
      if (!created.ok) {
        toast.error(
          `Couldn't create ${info.label.toLowerCase()}: ${created.error}`,
        );
        return;
      }
      let attached = await onAttach(created.data.id, created.data.title);
      if (!attached.ok) {
        // The edge write is idempotent — one retry is safe.
        attached = await onAttach(created.data.id, created.data.title);
      }
      if (attached.ok) {
        toast.success(`"${title}" created and attached`);
      } else {
        toast.error(
          `Created "${title}" but couldn't attach it — it's saved in your ` +
            `${info.labelPlural.toLowerCase()}; pick it from the list to retry.`,
        );
      }
      setEditing(false);
      setName("");
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(seed);
          setEditing(true);
        }}
        className="mt-2 flex w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        New {info.label}
        {seed ? (
          <span className="max-w-40 truncate text-muted-foreground/70">
            “{seed}”
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="mt-2 flex shrink-0 items-center gap-1.5">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") {
            setEditing(false);
            setName("");
          }
        }}
        placeholder={`New ${info.label.toLowerCase()} name…`}
        disabled={busy}
        className="h-8 flex-1 text-base"
        style={{ fontSize: 16 }}
      />
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={() => void submit()}
        className="flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setEditing(false);
          setName("");
        }}
        title="Cancel"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ListMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}
