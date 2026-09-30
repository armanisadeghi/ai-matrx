"use client";

/**
 * The hub sidebar (KNOWLEDGE-HUB §5.2): Inbox · Everything · Favorites ·
 * Saved views · containers as a tree · Kinds. Choosing anything sets the query
 * in the URL (Linear: a view is its filters). Every group states its own
 * loading, empty and failed condition in words.
 */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Inbox,
  Archive,
  CheckCircle2,
  Layers,
  Bookmark,
  BookmarkPlus,
  MoreHorizontal,
  Pin,
  Star,
  RotateCw,
  Users,
  Trash2,
  Library,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { countLabel, type ViewCount } from "@/features/knowledge/hub/hubSavedViews";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/utils/cn";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  HUB_KINDS,
  isHubGroupToken,
  sameView,
  type HubView,
} from "@/features/knowledge/hub/hubState";
import {
  HUB_CONTAINER_LABEL,
  HUB_CONTAINER_TOKENS,
  type HubSavedView,
  type HubSidebarData,
  type Loadable,
} from "@/features/knowledge/hub/hooks/useHubSidebarData";

export type SavedViewAction =
  | "open"
  | "rename"
  | "save_changes"
  | "share"
  | "unshare"
  | "notify_on"
  | "notify_off"
  | "pin"
  | "unpin"
  | "duplicate"
  | "delete";

interface HubSidebarProps {
  view: HubView;
  data: HubSidebarData;
  sample: boolean;
  onSelect: (view: HubView) => void;
  /** Live counts by saved-view id. */
  viewCounts?: Record<string, ViewCount | undefined>;
  onSaveView?: () => void;
  onViewAction?: (view: HubSavedView, action: SavedViewAction) => void;
  /** Inbox / Kept / Archived counts ("12", "200+"); null while counting. */
  triageCounts?: { inbox?: string | null; kept?: string | null; archived?: string | null };
  /** The Tags group (features/knowledge/hub/tags), shown under "Filed under". */
  tagsGroup?: React.ReactNode;
}

// The sidebar sits on the page's tinted canvas, so the neutral `accent` wash (2% off the canvas) is
// invisible: hover is a wash of the foreground, the current place is the primary tint with a full-
// strength label and glyph (Linear's sidebar; Notion's page tree), and focus is a real ring.
const ROW =
  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground/85 transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ROW_ACTIVE = "bg-primary/10 font-medium text-foreground hover:bg-primary/15";

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
  count?: number | string | null;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(ROW, indent && "pl-7", active && ROW_ACTIVE)}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {Icon ? <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" || typeof count === "string" ? (
        <span className={cn("shrink-0 text-xs tabular-nums", active ? "text-foreground/70" : "text-muted-foreground")}>{count}</span>
      ) : null}
    </button>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
        <p>
          {loadable.error ?? `Could not read ${what}.`}
          <ErrorAlchemyMenu error={loadable.error ?? `Could not read ${what}.`} size="xs" />
        </p>
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

function SavedViewRow({
  v,
  active,
  count,
  onSelect,
  onAction,
}: {
  v: HubSavedView;
  active: boolean;
  count: ViewCount | undefined;
  onSelect: () => void;
  onAction?: (view: HubSavedView, action: SavedViewAction) => void;
}) {
  const label = v.definition ? v.name : `${v.name} (unreadable definition)`;
  const shown = countLabel(count);
  const countTitle =
    count?.kind === "unsupported" ? count.reason : count?.kind === "error" ? `Count unavailable: ${count.message}` : undefined;
  const shared = v.visibility !== "personal";
  return (
    <div
      className={cn(
        "group flex min-w-0 items-center rounded-md transition-colors hover:bg-foreground/[0.07]",
        active && "bg-primary/10 hover:bg-primary/15",
      )}
      data-saved-view={v.id}
    >
      <button
        type="button"
        className={cn(ROW, "hover:bg-transparent", active && "font-medium text-foreground")}
        aria-current={active ? "page" : undefined}
        onClick={onSelect}
        title={v.builtIn ? `${v.name} — built-in view, installed for everyone the next time a platform admin opens the hub` : v.name}
      >
        {v.pinned ? (
          <Pin className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        ) : (
          <Bookmark className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {shared && !v.preset ? (
          <Users className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Shared with the organization" />
        ) : null}
        {shown !== null ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title={countTitle} data-testid="view-count">
            {shown}
          </span>
        ) : v.definition ? (
          <span className="h-3 w-5 shrink-0 animate-pulse rounded bg-muted" aria-label="Counting" />
        ) : null}
      </button>
      {onAction ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-60 hover:bg-card hover:text-foreground hover:shadow-sm focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`Actions for ${v.name}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onSelect={() => onAction(v, "open")}>Open</DropdownMenuItem>
            {v.mine ? (
              <>
                <DropdownMenuItem onSelect={() => onAction(v, "rename")}>Rename…</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAction(v, "save_changes")}>
                  Save current filters to this view
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAction(v, shared ? "unshare" : "share")}>
                  {shared ? "Make personal (stop sharing)" : "Share with organization"}
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem
                  checked={v.definition?.notifyNewMatches === true}
                  onCheckedChange={(c) => onAction(v, c ? "notify_on" : "notify_off")}
                >
                  Notify me of new matches
                  <span className="ml-auto pl-2 text-[10px] text-muted-foreground">coming soon</span>
                </DropdownMenuCheckboxItem>
              </>
            ) : null}
            {!v.builtIn ? (
              <DropdownMenuItem onSelect={() => onAction(v, v.pinned ? "unpin" : "pin")}>
                {v.pinned ? "Unpin from sidebar" : "Pin to sidebar"}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => onAction(v, "duplicate")}>Duplicate</DropdownMenuItem>
            {v.mine ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onAction(v, "delete")}>
                  Delete…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

const CONTAINER_PREVIEW = 8;

const CATALOG_GROUP: HubView = { kind: "group", token: "library_catalog" };

/** Containers whose whole list is a hub group (`view=group:<token>`, H6b). */
function groupViewFor(token: string): HubView | null {
  return isHubGroupToken(token) ? { kind: "group", token } : null;
}

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
            empty="None"
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
          {groupViewFor(token) ? (
            <button
              type="button"
              className={cn(
                "px-2 py-1 pl-7 text-xs text-muted-foreground hover:text-foreground",
                sameView(view, groupViewFor(token) as HubView) && "font-medium text-foreground",
              )}
              onClick={() => onSelect(groupViewFor(token) as HubView)}
            >
              All {label.toLowerCase()} as a list
            </button>
          ) : null}
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

export function HubSidebar({
  view,
  data,
  sample,
  onSelect,
  viewCounts,
  onSaveView,
  onViewAction,
  triageCounts,
  tagsGroup,
}: HubSidebarProps) {
  const [allOpen, setAllOpen] = useState(false);
  const items = data.savedViews.items;
  const pinnedViews = items.filter((v) => v.pinned);
  const presetViews = items.filter((v) => !v.pinned && v.preset);
  const otherViews = items.filter((v) => !v.pinned && !v.preset);
  const viewRow = (v: HubSavedView) => {
    const hv: HubView = { kind: "saved", id: v.id };
    return (
      <SavedViewRow
        key={v.id}
        v={v}
        active={sameView(view, hv)}
        count={viewCounts?.[v.id]}
        onSelect={() => onSelect(hv)}
        onAction={onViewAction}
      />
    );
  };
  return (
    <nav aria-label="Knowledge views" className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-6 pt-2">
        <Row
          icon={Inbox}
          label="Inbox"
          count={triageCounts?.inbox}
          active={view.kind === "inbox"}
          onClick={() => onSelect({ kind: "inbox" })}
        />
        <Row
          icon={CheckCircle2}
          label="Kept"
          count={triageCounts?.kept}
          active={view.kind === "kept"}
          onClick={() => onSelect({ kind: "kept" })}
        />
        <Row
          icon={Archive}
          label="Archived"
          count={triageCounts?.archived}
          active={view.kind === "archived"}
          onClick={() => onSelect({ kind: "archived" })}
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
        {sample ? null : (
          <Row
            icon={Trash2}
            label="Trash"
            active={view.kind === "trash"}
            onClick={() => onSelect({ kind: "trash" })}
          />
        )}

        {/* Linear hides an empty group: "Saved views" appears once there is one (Save view lives in
            the toolbar, ⌥V). While the list reads, or if it fails, it says so here. */}
        {data.savedViews.status !== "ready" ? (
          <LoadState loadable={data.savedViews} what="saved views" empty="" />
        ) : pinnedViews.length || otherViews.length ? (
          <div className="flex items-center justify-between pr-1">
            <GroupHeading>Saved views</GroupHeading>
            {onSaveView ? (
              <button
                type="button"
                className="mt-3 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground"
                aria-label="Save view (⌥V)"
                title="Save view (⌥V)"
                onClick={onSaveView}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
        {pinnedViews.map(viewRow)}
        {otherViews.length ? (
          <div>
            <button
              type="button"
              className={cn(ROW, "text-muted-foreground")}
              aria-expanded={allOpen}
              onClick={() => setAllOpen((o) => !o)}
            >
              {allOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">All views</span>
              <span className="text-xs tabular-nums">{otherViews.length}</span>
            </button>
            {allOpen ? <div className="pl-3">{otherViews.map(viewRow)}</div> : null}
          </div>
        ) : null}

        {presetViews.length ? (
          <>
            <GroupHeading>Presets</GroupHeading>
            {presetViews.map(viewRow)}
          </>
        ) : null}

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
        {tagsGroup}

        <GroupHeading>Kinds</GroupHeading>
        {HUB_KINDS.map((k) => {
          const kv: HubView = { kind: "kind", key: k.key };
          return (
            <Row key={k.key} label={k.label} active={sameView(view, kv)} onClick={() => onSelect(kv)} indent />
          );
        })}

        <GroupHeading>Shared libraries</GroupHeading>
        <button
          type="button"
          className={cn(ROW, sameView(view, CATALOG_GROUP) && ROW_ACTIVE)}
          aria-current={sameView(view, CATALOG_GROUP) ? "page" : undefined}
          onClick={() => onSelect(CATALOG_GROUP)}
          title="Browse, subscribe to and unsubscribe from shared knowledge libraries"
        >
          <Library className={cn("h-4 w-4 shrink-0", sameView(view, CATALOG_GROUP) ? "text-primary" : "text-muted-foreground")} />
          <span className="min-w-0 flex-1 truncate text-left">Library catalog</span>
        </button>
      </div>
    </nav>
  );
}
