// features/scopes/components/associations/AssociationPickerSheet.tsx
//
// The generic, token-driven "pick a record to associate" surface. Adaptive:
// a right-side Sheet on desktop, a bottom Drawer on mobile (project rule —
// never a Dialog on mobile). All data comes from the entity registry +
// candidate reader; the component holds NO per-entity knowledge.
//
// It lists every candidate of `token` the user may attach, marks the ones
// already linked to the container, and toggles the edge on click.

"use client";

import { useState, type ReactNode } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssociationCandidates } from "@/features/scopes/hooks/useAssociationCandidates";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
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

export interface AssociationPickerSheetProps {
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

export function AssociationPickerSheet(props: AssociationPickerSheetProps) {
  const isMobile = useIsMobile();
  const body = <PickerBody {...props} />;
  const info = getEntityInfo(props.token);
  const title = `Add ${info.labelPlural}`;
  const subtitle = props.containerLabel
    ? `Attach to ${props.containerLabel}`
    : "Click an item to attach or detach it";

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
          <div className="flex-1 min-h-0 px-4 pb-4 flex flex-col">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col gap-3"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <info.Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 flex flex-col">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

function PickerBody({
  open,
  token,
  attachedIds,
  onAttach,
  onDetach,
}: AssociationPickerSheetProps) {
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { candidates, loading, error, reload } = useAssociationCandidates({
    token,
    enabled: open,
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
          placeholder="Search…"
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
