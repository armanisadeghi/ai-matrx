// features/scopes/components/associations/AssociationList.tsx
//
// THE row-mode face of the container-contents system — the sibling of
// `AssociationCardGrid` (count cards). Drop it under a `PrimaryEntityProvider`
// (or pass `container`) and it renders EVERYTHING attached to the container as
// grouped rows — content-role sections → token groups → title rows with open +
// detach — plus a universal search-attach header and a per-token "+" picker.
//
// Fully registry-driven (icons, labels, grouping, routes come from
// `getEntityInfo`; new tokens appear with zero changes here) and
// ADAPTER-PLUGGABLE: reads/writes default to `useContainerLinks` (org/scope/
// project pages), but a container with its own write semantics (war-room
// threads: single-active demotion, position, Redux bucket) supplies a
// `ContainerResourcesAdapter` and the UI stays identical.
//
// Titles are never UUIDs: edge label → batched title fetch → "Untitled <type>".

"use client";

import { useState, type ReactNode } from "react";
import {
  ExternalLink,
  Link2,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import {
  getContentRoleMeta,
  curatedTokens,
  tryGetEntityInfo,
  type ContentRole,
  type EntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { usePrimaryEntity, type PrimaryEntity } from "./PrimaryEntityContext";
import { AssociationPicker } from "./AssociationPicker";
import {
  UniversalAssociationPicker,
  attachedKey,
} from "./UniversalAssociationPicker";
import { CONTENT_ROLES } from "@/features/scopes/registry/entityRegistry";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

// ─── Adapter contract ────────────────────────────────────────────────────────

/** One attached resource, as the list renders it. Tokens are CANONICAL. */
export interface ContainerResourceRow {
  /** Stable row key (edge id or `${token}:${id}`). */
  key: string;
  token: string;
  resourceId: string;
  label: string | null;
  /** Pinned rows sort first inside their token group. */
  pinned?: boolean;
  /** False for inherited rows (e.g. via a thread's anchor) — no detach. */
  removable: boolean;
  /** Small annotation for non-removable rows ("via anchor"). */
  originNote?: string | null;
}

export interface ContainerResourcesAdapter {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  reload: () => void | Promise<void>;
  rows: ContainerResourceRow[];
  attach: (
    token: EntityTypeToken,
    resourceId: string,
    title?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  detach: (
    token: EntityTypeToken,
    resourceId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Optional pin capability (edge `metadata.pinned`) — pinned resources stay
   * inline in agent context at every tier. Rows show a pin toggle when set.
   */
  setPinned?: (
    token: EntityTypeToken,
    resourceId: string,
    pinned: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
}

/** Default adapter — wraps `useContainerLinks` (org/scope/project pages). */
export function useContainerLinksAdapter(
  container: PrimaryEntity | null,
): ContainerResourcesAdapter {
  const links = useContainerLinks({
    containerType: container?.type ?? "organization",
    containerId: container?.id ?? null,
    orgId: container?.orgId ?? null,
  });
  const rows: ContainerResourceRow[] = container
    ? curatedTokens().flatMap((token) =>
        links.linksFor(token).map((l) => ({
          key: l.edgeId,
          token: l.token,
          resourceId: l.resourceId,
          label: l.label,
          removable: true,
        })),
      )
    : [];
  return {
    status: links.status,
    error: links.error,
    reload: links.reload,
    rows,
    attach: async (token, id, title) => links.attach(token, id, title),
    detach: async (token, id) => links.detach(token, id),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface AssociationListProps {
  /** Container override; defaults to the surrounding PrimaryEntityProvider. */
  container?: PrimaryEntity;
  /** Write/read override (war-room threads etc.). Default: useContainerLinks. */
  adapter?: ContainerResourcesAdapter;
  /** Restrict display + attach to these tokens (e.g. one dynamic tab). */
  tokens?: EntityTypeToken[];
  /** `full` = role sections + universal search; `compact` = flat token groups. */
  variant?: "full" | "compact";
  /** Extra per-token actions (e.g. war-room Upload / New document). */
  renderSectionActions?: (token: EntityTypeToken) => ReactNode;
  /** Open a resource. Default: registry `hrefFor` in a new tab. */
  openEntity?: (token: string, id: string) => void;
  /**
   * Per-token row override (return null/undefined to keep the default row) —
   * for rows that need richer rendering than icon+title (e.g. war-room file
   * rows keep their media thumbnails). The override owns the whole row; use
   * `ctx` for the resolved title and the busy/detach/open wiring.
   */
  renderRow?: (
    row: ContainerResourceRow,
    ctx: {
      title: string;
      busy: boolean;
      onDetach: () => void;
      onOpen: () => void;
    },
  ) => ReactNode | null | undefined;
  className?: string;
}

export function AssociationList(props: AssociationListProps) {
  const ctxEntity = usePrimaryEntity();
  const container = props.container ?? ctxEntity ?? null;
  const defaultAdapter = useContainerLinksAdapter(
    props.adapter ? null : container,
  );
  const adapter = props.adapter ?? defaultAdapter;
  const variant = props.variant ?? "full";
  const tokenFilter = props.tokens ?? null;

  const [pickerToken, setPickerToken] = useState<EntityTypeToken | null>(null);
  const [showUniversal, setShowUniversal] = useState(false);
  const [removingKeys, setRemovingKeys] = useState<Set<string>>(new Set());

  const rows = tokenFilter
    ? adapter.rows.filter((r) =>
        (tokenFilter as string[]).includes(r.token),
      )
    : adapter.rows;
  const visibleRows = rows.filter((r) => !removingKeys.has(r.key));

  const { titleFor } = useEntityTitles(
    visibleRows.map((r) => ({ token: r.token, id: r.resourceId, label: r.label })),
  );

  const attachedKeys = new Set(
    rows.map((r) => attachedKey(r.token, r.resourceId)),
  );

  const handleDetach = async (row: ContainerResourceRow) => {
    setRemovingKeys((prev) => new Set(prev).add(row.key));
    const info = tryGetEntityInfo(row.token);
    const res = info
      ? await adapter.detach(info.token, row.resourceId)
      : { ok: false };
    setRemovingKeys((prev) => {
      const next = new Set(prev);
      next.delete(row.key);
      return next;
    });
    return res;
  };

  const openRow = (row: ContainerResourceRow) => {
    if (props.openEntity) {
      props.openEntity(row.token, row.resourceId);
      return;
    }
    const info = tryGetEntityInfo(row.token);
    const href = info?.hrefFor?.(row.resourceId);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  };

  // role → token → rows, in registry role order.
  const grouped = groupRows(visibleRows);
  const isLoading = adapter.status === "loading" || adapter.status === "idle";
  const attachableTokens = tokenFilter ?? curatedTokens();

  return (
    <div className={cn("flex flex-col gap-2 text-foreground", props.className)}>
      {/* ── header: count + universal attach ─────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          Resources
          {visibleRows.length > 0 && (
            <span className="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
              {visibleRows.length}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowUniversal((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] transition-colors",
              showUniversal
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
          <button
            type="button"
            onClick={() => void adapter.reload()}
            title="Refresh"
            className="text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <RefreshCw
              className={cn(
                "h-3 w-3",
                adapter.status === "loading" && "animate-spin",
              )}
            />
          </button>
        </div>
      </div>

      {/* ── universal search-attach ──────────────────────────────────── */}
      {showUniversal && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-2 max-h-80 flex flex-col">
          <UniversalAssociationPicker
            tokens={attachableTokens}
            attachedKeys={attachedKeys}
            onAttach={(token, id, title) => adapter.attach(token, id, title)}
            onDetach={(token, id) => adapter.detach(token, id)}
          />
        </div>
      )}

      {/* ── error / loading / empty ──────────────────────────────────── */}
      {adapter.status === "error" && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2">
          <span className="truncate text-[11px] text-destructive">
            {adapter.error || "Failed to load resources"}
          </span>
          <button
            type="button"
            onClick={() => void adapter.reload()}
            className="text-[11px] font-medium text-destructive underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
      {adapter.status !== "error" && isLoading && visibleRows.length === 0 && (
        <div className="space-y-1.5 px-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-3/4 rounded-md" />
        </div>
      )}
      {adapter.status === "ready" && visibleRows.length === 0 && (
        <p className="px-1 py-1 text-[11px] text-muted-foreground">
          Nothing attached yet — use Add to link anything.
        </p>
      )}

      {/* ── grouped rows ─────────────────────────────────────────────── */}
      {visibleRows.length > 0 && (
        <div className="space-y-2.5">
          {grouped.map(({ role, tokens: tokenGroups }) => {
            const roleMeta = getContentRoleMeta(role);
            return (
              <div key={role} className="space-y-1.5">
                {variant === "full" && (
                  <div className="flex items-center gap-1.5 px-1">
                    <span
                      className={cn("h-3 w-0.5 rounded-full", roleMeta.accentBar)}
                    />
                    <p
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider",
                        roleMeta.accentText,
                      )}
                    >
                      {roleMeta.title}
                    </p>
                  </div>
                )}
                {tokenGroups.map(({ info, token, rows: tokenRows }) => (
                  <div key={token} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-1 px-1">
                      <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80">
                        {info ? (
                          <info.Icon className="h-3 w-3" />
                        ) : null}
                        {info?.labelPlural ?? titleize(token)}
                        <span className="text-muted-foreground/50">
                          {tokenRows.length}
                        </span>
                      </p>
                      <div className="flex items-center gap-1">
                        {props.renderSectionActions && info
                          ? props.renderSectionActions(info.token)
                          : null}
                        {info?.canListCandidates && (
                          <button
                            type="button"
                            onClick={() => setPickerToken(info.token)}
                            title={`Add ${info.labelPlural}`}
                            className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <ul className="space-y-0.5">
                      {tokenRows.map((row) => {
                        const busy = removingKeys.has(row.key);
                        const Icon = info?.Icon;
                        const custom = props.renderRow?.(row, {
                          title: titleFor({
                            token: row.token,
                            id: row.resourceId,
                            label: row.label,
                          }),
                          busy,
                          onDetach: () => void handleDetach(row),
                          onOpen: () => openRow(row),
                        });
                        if (custom != null) {
                          return <li key={row.key}>{custom}</li>;
                        }
                        return (
                          <li key={row.key}>
                            <div
                              className={cn(
                                "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                                busy && "opacity-50",
                              )}
                            >
                              {Icon && (
                                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <button
                                type="button"
                                onClick={() => openRow(row)}
                                className="min-w-0 flex-1 truncate text-left text-foreground hover:underline"
                                title={titleFor({
                                  token: row.token,
                                  id: row.resourceId,
                                  label: row.label,
                                })}
                              >
                                {titleFor({
                                  token: row.token,
                                  id: row.resourceId,
                                  label: row.label,
                                })}
                              </button>
                              {row.originNote && (
                                <span className="shrink-0 text-[10px] text-muted-foreground/60">
                                  {row.originNote}
                                </span>
                              )}
                              {adapter.setPinned && info && row.removable && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void adapter.setPinned?.(
                                      info.token,
                                      row.resourceId,
                                      !(row.pinned ?? false),
                                    )
                                  }
                                  title={
                                    row.pinned
                                      ? "Unpin (stops staying in agent context)"
                                      : "Pin — always in agent context"
                                  }
                                  aria-label={row.pinned ? "Unpin" : "Pin"}
                                  className={cn(
                                    "shrink-0 rounded p-0.5 transition-colors hover:!text-foreground",
                                    row.pinned
                                      ? "text-primary"
                                      : "text-muted-foreground/0 group-hover:text-muted-foreground",
                                  )}
                                >
                                  <Pin
                                    className={cn(
                                      "h-3 w-3",
                                      row.pinned && "fill-primary/20",
                                    )}
                                  />
                                </button>
                              )}
                              {(props.openEntity || info?.hrefFor) && (
                                <button
                                  type="button"
                                  onClick={() => openRow(row)}
                                  title="Open"
                                  className="shrink-0 rounded p-0.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:!text-foreground"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </button>
                              )}
                              {row.removable && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleDetach(row)}
                                  title="Detach"
                                  aria-label="Detach"
                                  className="shrink-0 rounded p-0.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:!text-destructive disabled:opacity-50"
                                >
                                  {busy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── per-token picker sheet ───────────────────────────────────── */}
      {pickerToken && (
        <AssociationPicker
          open
          onOpenChange={(open) => {
            if (!open) setPickerToken(null);
          }}
          token={pickerToken}
          containerLabel={container?.label}
          attachedIds={
            new Set(
              rows
                .filter((r) => r.token === pickerToken)
                .map((r) => r.resourceId),
            )
          }
          onAttach={(id, title) => adapter.attach(pickerToken, id, title)}
          onDetach={(id) => adapter.detach(pickerToken, id)}
        />
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

interface TokenGroup {
  token: string;
  info: EntityInfo | null;
  rows: ContainerResourceRow[];
}
interface RoleGroup {
  role: ContentRole;
  tokens: TokenGroup[];
}

/** role → token → rows; pinned rows first inside a token group. */
function groupRows(rows: ContainerResourceRow[]): RoleGroup[] {
  const byToken = new Map<string, ContainerResourceRow[]>();
  for (const r of rows) {
    const list = byToken.get(r.token) ?? [];
    list.push(r);
    byToken.set(r.token, list);
  }
  const roleBuckets = new Map<ContentRole, TokenGroup[]>();
  for (const [token, tokenRows] of byToken) {
    const info = tryGetEntityInfo(token);
    const role: ContentRole = info?.contentRole ?? "destination";
    tokenRows.sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false));
    const groups = roleBuckets.get(role) ?? [];
    groups.push({ token, info, rows: tokenRows });
    roleBuckets.set(role, groups);
  }
  const out: RoleGroup[] = [];
  for (const meta of CONTENT_ROLES) {
    const tokens = roleBuckets.get(meta.id);
    if (tokens && tokens.length > 0) {
      tokens.sort((a, b) =>
        (a.info?.labelPlural ?? a.token).localeCompare(
          b.info?.labelPlural ?? b.token,
        ),
      );
      out.push({ role: meta.id, tokens });
    }
  }
  return out;
}

function titleize(token: string): string {
  return token
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export default AssociationList;
