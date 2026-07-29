// features/scopes/components/associations/AttachedItemsSheet.tsx
//
// "What is actually attached here?" — the drill-in every AssociationCard was
// missing. The card showed "2 attached" and then swallowed the click, so there
// was no way to find out WHICH two.
//
// Titles are resolved LIVE via `entity_titles` rather than read off the
// association edge's stored label: the edge label is a snapshot from attach
// time and goes stale the moment the target is renamed (and many existing edges
// have no label at all). Ids the viewer cannot read are omitted by the RPC, so
// they surface here as "No longer available" instead of leaking a name.
//
// Adaptive per project rule: a NON-BLOCKING draggable `WindowPanel` on
// desktop (the page behind stays interactive), bottom Drawer on mobile.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ExternalLink, Loader2, Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { fetchEntityTitles } from "@/features/sharing/service/accessSummary";
import type { ContainerLink } from "@/features/scopes/hooks/useContainerLinks";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { cn } from "@/utils/cn";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

// Lazy — WindowPanel must never be parsed in a route/boot bundle
// (features/window-panels FEATURE.md → Bundle invariant).
const AssociationWindow = dynamic(
  () =>
    import(
      "@/features/scopes/components/associations/AssociationWindow"
    ).then((m) => ({ default: m.AssociationWindow })),
  { ssr: false, loading: () => null },
);

export interface AttachedItemsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: EntityTypeToken;
  containerLabel?: string;
  links: ContainerLink[];
  /** Opens the attach picker. Omitted when the token cannot list candidates. */
  onAdd?: () => void;
  onDetach: (resourceId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function AttachedItemsSheet(props: AttachedItemsSheetProps) {
  const isMobile = useIsMobile();
  const info = getEntityInfo(props.token);

  const title = info.labelPlural;
  const subtitle = props.containerLabel
    ? `Attached to ${props.containerLabel}`
    : "Attached items";

  const body = (
    <AttachedItemsBody
      token={props.token}
      enabled={props.open}
      links={props.links}
      onAdd={props.onAdd}
      onDetach={props.onDetach}
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
      scopeId={`attached:${props.token}`}
      title={title}
      icon={<info.Icon className="size-3.5 text-primary" />}
      subtitle={subtitle}
    >
      {body}
    </AssociationWindow>
  );
}

function AttachedItemsBody({
  token,
  enabled,
  links,
  onAdd,
  onDetach,
}: {
  token: EntityTypeToken;
  enabled: boolean;
  links: ContainerLink[];
  onAdd?: () => void;
  onDetach: (resourceId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const info = getEntityInfo(token);
  const [titles, setTitles] = useState<Map<string, string | null> | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const idKey = links
    .map((l) => l.resourceId)
    .sort()
    .join(",");

  useEffect(() => {
    if (!enabled) return;
    const ids = idKey ? idKey.split(",") : [];
    if (ids.length === 0) {
      setTitles(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const resolved = await fetchEntityTitles(token, ids);
        if (!cancelled) {
          setTitles(resolved);
          setTitleError(null);
        }
      } catch (cause) {
        if (cancelled) return;
        // Loud, not silent: falling back to stored edge labels is a degraded
        // mode and the user should know the names may be stale.
        console.error("[AttachedItemsSheet] title resolution failed", cause);
        setTitles(new Map());
        setTitleError(
          cause instanceof Error ? cause.message : "Could not resolve names",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, idKey, enabled]);

  const detach = async (resourceId: string) => {
    if (busyId) return;
    setBusyId(resourceId);
    try {
      const res = await onDetach(resourceId);
      // A silent no-op detach reads as "removed" — scream instead.
      if (!res.ok) {
        toast.error(`Couldn't detach${res.error ? `: ${res.error}` : ""}`);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {titleError ? (
        <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          Showing names recorded at attach time — they may be out of date.{" "}
          {titleError}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {links.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-[13px] text-muted-foreground">
            Nothing attached yet.
          </div>
        ) : titles === null ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <ul className="space-y-0.5">
            {links.map((link) => {
              const resolved = titles.get(link.resourceId);
              const missing = !titles.has(link.resourceId);
              const name =
                resolved ?? link.label ?? (missing ? null : "Untitled");
              const href = info.hrefFor?.(link.resourceId) ?? null;
              const busy = busyId === link.resourceId;

              return (
                <li
                  key={link.edgeId}
                  className="group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <info.Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 min-w-0 truncate">
                    {name === null ? (
                      <span className="text-muted-foreground italic">
                        No longer available
                      </span>
                    ) : href ? (
                      <Link
                        href={href}
                        className="text-foreground hover:underline"
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="text-foreground">{name}</span>
                    )}
                  </span>
                  {href ? (
                    <Link
                      href={href}
                      title="Open"
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void detach(link.resourceId)}
                    title="Detach"
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
                      "hover:bg-destructive/10 hover:text-destructive disabled:opacity-50",
                    )}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Attach {info.labelPlural.toLowerCase()}
        </button>
      ) : null}
    </>
  );
}

export default AttachedItemsSheet;
