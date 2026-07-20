// features/scopes/components/associations/AssociationPicker.tsx
//
// The token-driven "pick a record to associate" surface. Adaptive: a right
// Sheet on desktop, a bottom Drawer on mobile (project rule — never a Dialog
// on mobile).
//
// Files are NOT listed with the generic candidate list — the `file` token
// always mounts the canonical stored-files browser (`FilesResourcePicker`:
// search, filters, recents, folder tree, thumbnails), the same picker as
// Smart Agent Input's "Stored Files". The generic list is only for non-file
// tokens, whose candidates come from the registry-driven
// `useAssociationCandidates` reader.

"use client";

import { useState, type ReactNode } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssociationCandidates } from "@/features/scopes/hooks/useAssociationCandidates";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  FilesResourcePicker,
  type FileSelection,
} from "@/features/resource-manager/resource-picker/FilesResourcePicker";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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

export interface AssociationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: EntityTypeToken;
  /** Container display label, for the header ("…to Titanium Marketing"). */
  containerLabel?: string;
  /** Resource ids already attached to the container. */
  attachedIds: Set<string>;
  /** Attach a resource (returns ok/err so the row can surface failures). */
  onAttach: (resourceId: string, title: string) => Promise<{ ok: boolean }>;
  /** Detach a resource. */
  onDetach: (resourceId: string) => Promise<{ ok: boolean }>;
}

export function AssociationPicker(props: AssociationPickerProps) {
  const isMobile = useIsMobile();
  const info = getEntityInfo(props.token);
  const title = `Add ${info.labelPlural}`;
  const subtitle = props.containerLabel
    ? `Attach to ${props.containerLabel}`
    : props.token === "file"
      ? "Pick from your stored files"
      : "Click an item to attach or detach it";

  const body = (
    <AssociationCandidateBody
      token={props.token}
      enabled={props.open}
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

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-full flex flex-col gap-3",
          props.token === "file" ? "sm:max-w-lg" : "sm:max-w-md",
        )}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <info.Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          {body}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export interface AssociationCandidateBodyProps {
  token: EntityTypeToken;
  /** Load candidates only while true (mirror of the sheet's `open`). */
  enabled: boolean;
  attachedIds: Set<string>;
  onAttach: (resourceId: string, title: string) => Promise<{ ok: boolean }>;
  onDetach: (resourceId: string) => Promise<{ ok: boolean }>;
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
        />
      </div>
    );
  }

  return (
    <EntityCandidateList
      token={token}
      enabled={enabled}
      attachedIds={attachedIds}
      onAttach={onAttach}
      onDetach={onDetach}
    />
  );
}

function EntityCandidateList({
  token,
  enabled,
  attachedIds,
  onAttach,
  onDetach,
}: {
  token: EntityTypeToken;
  enabled: boolean;
  attachedIds: Set<string>;
  onAttach: (resourceId: string, title: string) => Promise<{ ok: boolean }>;
  onDetach: (resourceId: string) => Promise<{ ok: boolean }>;
}) {
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const info = getEntityInfo(token);
  const { candidates, loading, error, reload } = useAssociationCandidates({
    token,
    enabled,
    search: search.trim() || undefined,
  });

  const toggle = async (id: string, title: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const attached = attachedIds.has(id);
      const res = attached ? await onDetach(id) : await onAttach(id, title);
      // The container cache reload (in the thunk) flips `attachedIds` for us.
      if (!res.ok) return;
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
          <ListMessage>Nothing to attach.</ListMessage>
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
    </>
  );
}

function ListMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}
