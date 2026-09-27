"use client";

/**
 * The hub sidebar (KNOWLEDGE-HUB §5.2): Inbox · Everything · Favorites ·
 * Saved views · containers as a tree · Kinds. Choosing anything sets the query
 * in the URL (Linear: a view is its filters). Every group states its own
 * loading, empty and failed condition in words.
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Inbox,
  Layers,
  Bookmark,
  Star,
  RotateCw,
} from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/utils/cn";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  HUB_KINDS,
  sameView,
  type HubView,
} from "@/features/knowledge/hub/hubState";
import {
  HUB_CONTAINER_LABEL,
  HUB_CONTAINER_TOKENS,
  type HubSidebarData,
  type Loadable,
} from "@/features/knowledge/hub/hooks/useHubSidebarData";

interface HubSidebarProps {
  view: HubView;
  data: HubSidebarData;
  sample: boolean;
  onSelect: (view: HubView) => void;
}

const ROW =
  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground/90 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Row({
  active,
  icon: Icon,
  label,
  count,
  onClick,
  indent = false,
}: {
  active: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number | null;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(ROW, indent && "pl-7", active && "bg-accent font-medium text-foreground")}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </button>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function LoadState<T>({
  loadable,
  what,
  empty,
  indent = false,
}: {
  loadable: Loadable<T>;
  what: string;
  empty: string;
  indent?: boolean;
}) {
  if (loadable.status === "loading")
    return (
      <div className={cn("space-y-1.5 px-2 py-1", indent && "pl-7")} aria-label={`Loading ${what}`}>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  if (loadable.status === "error")
    return (
      <div className={cn("px-2 py-1 text-xs text-destructive", indent && "pl-7")}>
        <p>{loadable.error ?? `Could not read ${what}.`}</p>
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
          onClick={loadable.retry}
        >
          <RotateCw className="h-3 w-3" /> Try again
        </button>
      </div>
    );
  if (loadable.items.length === 0)
    return <p className={cn("px-2 py-1 text-xs text-muted-foreground", indent && "pl-7")}>{empty}</p>;
  return null;
}

const CONTAINER_PREVIEW = 8;

function ContainerGroup({
  token,
  loadable,
  view,
  onSelect,
}: {
  token: (typeof HUB_CONTAINER_TOKENS)[number];
  loadable: HubSidebarData["containers"][typeof token];
  view: HubView;
  onSelect: (v: HubView) => void;
}) {
  const hasActive = view.kind === "container" && view.type === token;
  const [open, setOpen] = useState(token === "project" || hasActive);
  const [all, setAll] = useState(false);
  const Icon = tryGetEntityInfo(token)?.Icon ?? Layers;
  const label = HUB_CONTAINER_LABEL[token];
  const rows = all ? loadable.items : loadable.items.slice(0, CONTAINER_PREVIEW);
  return (
    <div>
      <button
        type="button"
        className={ROW}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {loadable.status === "ready" ? (
          <span className="text-xs tabular-nums text-muted-foreground">{loadable.items.length}</span>
        ) : null}
      </button>
      {open ? (
        <div>
          <LoadState
            loadable={loadable}
            what={label.toLowerCase()}
            empty={`No ${label.toLowerCase()} you can open yet.`}
            indent
          />
          {rows.map((r) => {
            const v: HubView = { kind: "container", type: token, id: r.id };
            return (
              <Row
                key={r.id}
                indent
                label={r.title}
                active={sameView(view, v)}
                onClick={() => onSelect(v)}
              />
            );
          })}
          {!all && loadable.items.length > CONTAINER_PREVIEW ? (
            <button
              type="button"
              className="px-2 py-1 pl-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setAll(true)}
            >
              Show all {loadable.items.length}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function HubSidebar({ view, data, sample, onSelect }: HubSidebarProps) {
  return (
    <nav aria-label="Knowledge views" className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-6 pt-2">
        <Row
          icon={Inbox}
          label="Inbox"
          active={view.kind === "inbox"}
          onClick={() => onSelect({ kind: "inbox" })}
        />
        <Row
          icon={Layers}
          label="Everything"
          active={view.kind === "everything"}
          onClick={() => onSelect({ kind: "everything" })}
        />
        <Row
          icon={Star}
          label="Favorites"
          count={data.favorites.status === "ready" ? data.favorites.items.length : null}
          active={view.kind === "favorites"}
          onClick={() => onSelect({ kind: "favorites" })}
        />
        {data.favorites.status === "error" ? (
          <LoadState loadable={data.favorites} what="favorites" empty="" indent />
        ) : null}

        <GroupHeading>Saved views</GroupHeading>
        <LoadState
          loadable={data.savedViews}
          what="saved views"
          empty="No saved views for the hub yet."
        />
        {data.savedViews.items.map((v) => {
          const hv: HubView = { kind: "saved", id: v.id };
          return (
            <Row
              key={v.id}
              icon={Bookmark}
              label={v.definition ? v.name : `${v.name} (unreadable definition)`}
              active={sameView(view, hv)}
              onClick={() => onSelect(hv)}
            />
          );
        })}

        <GroupHeading>Filed under{sample ? " (sample)" : ""}</GroupHeading>
        {HUB_CONTAINER_TOKENS.map((token) => (
          <ContainerGroup
            key={token}
            token={token}
            loadable={data.containers[token]}
            view={view}
            onSelect={onSelect}
          />
        ))}

        <GroupHeading>Kinds</GroupHeading>
        {HUB_KINDS.map((k) => {
          const kv: HubView = { kind: "kind", key: k.key };
          return (
            <Row key={k.key} label={k.label} active={sameView(view, kv)} onClick={() => onSelect(kv)} indent />
          );
        })}
      </div>
    </nav>
  );
}
