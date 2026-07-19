"use client";

// features/war-room/components/resources/WarRoomResourcesList.tsx
//
// War-room resources list — org-style role colors, flat token headers (icon +
// type + count in one row), individual resource rows underneath (title, id
// prefix + copy, ⋯ menu). Association actions (detach / pin) are separated
// from entity actions (open / delete) in the menu.

import { useState, type ReactNode } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Trash2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { deleteDocument } from "@/features/data-tables/document-service";
import { deleteFile } from "@/features/files/redux/thunks";
import { deleteNote } from "@/features/notes/redux/thunks";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { AssociationPickerSheet } from "@/features/scopes/components/associations/AssociationPickerSheet";
import { ConversationPickerWindow } from "@/features/agents/components/conversation-history/ConversationPickerWindow";
import {
  UniversalAssociationPicker,
  attachedKey,
} from "@/features/scopes/components/associations/UniversalAssociationPicker";
import type {
  ContainerResourceRow,
  ContainerResourcesAdapter,
} from "@/features/scopes/components/associations/AssociationList";
import {
  CONTENT_ROLES,
  getContentRoleMeta,
  curatedTokens,
  tryGetEntityInfo,
  type ContentRole,
  type EntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { cn } from "@/lib/utils";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

const DELETABLE_TOKENS = new Set<string>(["file", "udt_document", "note"]);

/** Legacy generic label the thread agent panel stamped on every conversation
 *  edge (now removed) — treated as non-authoritative so real titles show. */
const CONV_PLACEHOLDER_LABEL = "Thread agent conversation";

export interface WarRoomResourcesListProps {
  adapter: ContainerResourcesAdapter;
  tokens?: EntityTypeToken[];
  variant?: "full" | "compact";
  /** Wording for detach — thread vs room container. */
  containerKind?: "thread" | "room";
  /**
   * Stable id of the container (threadId / roomId) — scopes the conversation
   * picker's fetch + window state so two open surfaces don't collide. Falls
   * back to `containerKind` when omitted.
   */
  scopeKey?: string;
  renderSectionActions?: (token: EntityTypeToken) => ReactNode;
  renderRow?: (
    row: ContainerResourceRow,
    ctx: ResourceRowContext,
  ) => ReactNode | null | undefined;
  className?: string;
}

export interface ResourceRowContext {
  title: string;
  busy: boolean;
  onDetach: () => void;
  onOpen: () => void;
  menu: ReactNode;
  idPrefix: ReactNode;
  /** Wrap row content in the shared bordered card shell. */
  card: (content: ReactNode) => ReactNode;
}

export function WarRoomResourcesList({
  adapter,
  tokens: tokenFilter,
  variant = "full",
  containerKind = "thread",
  scopeKey,
  renderSectionActions,
  renderRow,
  className,
}: WarRoomResourcesListProps) {
  const dispatch = useAppDispatch();
  const [pickerToken, setPickerToken] = useState<EntityTypeToken | null>(null);
  const [showUniversal, setShowUniversal] = useState(false);
  const [removingKeys, setRemovingKeys] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<
    | { kind: "detach"; row: ContainerResourceRow }
    | { kind: "delete"; row: ContainerResourceRow; title: string }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Live conversation titles from the chat-list store. Conversation edges are
  // attached without a label (the chat has no title when it's minted), so
  // without this a row would fall through to the cold DB read and render as
  // "Untitled Conversation" + a bare id. Feeding the live title in as the edge
  // `label` makes the real name win immediately (and it stays fresh when the
  // server auto-labels the chat). See FEATURE.md § label-at-attach-time.
  const conversationTitles = useAppSelector(
    (s) => s.conversationList.byConversationId,
  );
  const labelFor = (r: {
    token: string;
    resourceId: string;
    label?: string | null;
  }): string | null => {
    if (r.token === "conversation") {
      // Live chat title wins (freshest). Legacy edges carry the generic
      // "Thread agent conversation" placeholder — treat it as non-authoritative
      // so the resolver reads the real chat.conversation.title instead of
      // masking it; a real attach-time label still wins.
      const live = conversationTitles[r.resourceId]?.title;
      if (live && live.trim()) return live;
      const edge = r.label?.trim();
      if (edge && edge !== CONV_PLACEHOLDER_LABEL) return edge;
      return null;
    }
    if (r.label && r.label.trim()) return r.label;
    return r.label ?? null;
  };

  const rows = tokenFilter
    ? adapter.rows.filter((r) => (tokenFilter as string[]).includes(r.token))
    : adapter.rows;
  const visibleRows = rows.filter((r) => !removingKeys.has(r.key));

  const { titleFor } = useEntityTitles(
    visibleRows.map((r) => ({
      token: r.token,
      id: r.resourceId,
      label: labelFor(r),
    })),
  );

  const attachedKeys = new Set(
    rows.map((r) => attachedKey(r.token, r.resourceId)),
  );
  const attachableTokens = tokenFilter ?? curatedTokens();
  const grouped = groupRows(visibleRows);
  const isLoading = adapter.status === "loading" || adapter.status === "idle";
  const detachLabel =
    containerKind === "room" ? "Remove from room" : "Remove from thread";

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
    if (res.ok) {
      toast.success(
        containerKind === "room" ? "Removed from room" : "Removed from thread",
      );
    } else {
      toast.error("Could not remove");
    }
    return res;
  };

  const openRow = (row: ContainerResourceRow) => {
    const info = tryGetEntityInfo(row.token);
    const href = info?.hrefFor?.(row.resourceId);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  };

  const deleteEntity = async (row: ContainerResourceRow) => {
    const info = tryGetEntityInfo(row.token);
    if (!info || !DELETABLE_TOKENS.has(row.token)) {
      return { ok: false as const, error: "Delete not supported" };
    }
    try {
      switch (row.token) {
        case "file":
          await dispatch(deleteFile({ fileId: row.resourceId })).unwrap();
          break;
        case "udt_document": {
          const res = await deleteDocument(row.resourceId);
          if (!res.success) return { ok: false as const, error: res.error };
          break;
        }
        case "note":
          await dispatch(deleteNote(row.resourceId)).unwrap();
          break;
      }
      await adapter.reload();
      toast.success(`${info.label} deleted`);
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      toast.error(msg);
      return { ok: false as const, error: msg };
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === "detach") {
        await handleDetach(confirm.row);
      } else {
        await deleteEntity(confirm.row);
      }
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2 text-foreground", className)}>
      <div className="flex items-center justify-between gap-2 px-0.5">
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

      {showUniversal && (
        <div className="flex max-h-80 flex-col rounded-md border border-border/60 bg-muted/30 p-2">
          <UniversalAssociationPicker
            tokens={attachableTokens}
            attachedKeys={attachedKeys}
            onAttach={(token, id, title) => adapter.attach(token, id, title)}
            onDetach={(token, id) => adapter.detach(token, id)}
          />
        </div>
      )}

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
        <div className="space-y-1.5 px-0.5">
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-3/4 rounded-md" />
        </div>
      )}

      {adapter.status === "ready" && visibleRows.length === 0 && (
        <p className="px-0.5 py-1 text-[11px] text-muted-foreground">
          Nothing attached yet — use Add to link anything.
        </p>
      )}

      {visibleRows.length > 0 && (
        <div className="space-y-4">
          {grouped.map(({ role, tokens: tokenGroups }) => {
            const roleMeta = getContentRoleMeta(role);
            return (
              <section key={role} className="space-y-3">
                {variant === "full" && (
                  <div className="flex items-center gap-2">
                    <span
                      className={cn("h-2 w-2 rounded-full", roleMeta.accentBar)}
                    />
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        roleMeta.accentText,
                      )}
                    >
                      {roleMeta.title}
                    </p>
                  </div>
                )}

                {tokenGroups.map(({ info, token, rows: tokenRows }) => {
                  const roleForToken = info?.contentRole ?? role;
                  const tokenRoleMeta = getContentRoleMeta(roleForToken);
                  const Icon = info?.Icon;
                  return (
                    <div key={token} className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        {Icon ? (
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              tokenRoleMeta.accentBg,
                              tokenRoleMeta.accentText,
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {info?.labelPlural ?? titleize(token)}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {tokenRows.length}
                        </span>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {renderSectionActions && info
                            ? renderSectionActions(info.token)
                            : null}
                          {info?.canListCandidates ? (
                            <button
                              type="button"
                              onClick={() => setPickerToken(info.token)}
                              title={`Add ${info.labelPlural}`}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <ul className="flex flex-col gap-2">
                        {tokenRows.map((row) => {
                          const busy = removingKeys.has(row.key);
                          const title = titleFor({
                            token: row.token,
                            id: row.resourceId,
                            label: labelFor(row),
                          });
                          const idPrefix = (
                            <ResourceIdCopy id={row.resourceId} />
                          );
                          const menu = (
                            <ResourceRowMenu
                              row={row}
                              info={info}
                              detachLabel={detachLabel}
                              canOpen={!!info?.hrefFor}
                              canDelete={DELETABLE_TOKENS.has(row.token)}
                              canPin={!!adapter.setPinned && row.removable}
                              pinned={row.pinned ?? false}
                              onDetach={() =>
                                setConfirm({ kind: "detach", row })
                              }
                              onOpen={() => openRow(row)}
                              onDelete={() =>
                                setConfirm({
                                  kind: "delete",
                                  row,
                                  title,
                                })
                              }
                              onTogglePin={() => {
                                if (!info || !adapter.setPinned) return;
                                void adapter.setPinned(
                                  info.token,
                                  row.resourceId,
                                  !(row.pinned ?? false),
                                );
                              }}
                            />
                          );
                          const card = (content: ReactNode) => (
                            <ResourceItemCard
                              accentBar={tokenRoleMeta.accentBar}
                            >
                              {content}
                            </ResourceItemCard>
                          );
                          const ctx: ResourceRowContext = {
                            title,
                            busy,
                            onDetach: () => setConfirm({ kind: "detach", row }),
                            onOpen: () => openRow(row),
                            menu,
                            idPrefix,
                            card,
                          };
                          const custom = renderRow?.(row, ctx);
                          if (custom != null) {
                            return <li key={row.key}>{custom}</li>;
                          }
                          return (
                            <li key={row.key}>
                              {card(
                                <DefaultResourceRow
                                  title={title}
                                  originNote={row.originNote}
                                  idPrefix={idPrefix}
                                  menu={menu}
                                  busy={busy}
                                />,
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {/* Conversations get the proper /chat-style picker window (NOT the
          token-generic right-side drawer) — browsing/searching chats to attach
          feels identical to the Chat sidebar. Every other token keeps the
          shared AssociationPickerSheet. */}
      {pickerToken === "conversation" ? (
        <ConversationPickerWindow
          open
          onClose={() => setPickerToken(null)}
          scopeId={`war-room-resources-chat:${scopeKey ?? containerKind}`}
          title={
            containerKind === "room"
              ? "Add a chat to this room"
              : "Add a chat to this thread"
          }
          onSelect={(conv) =>
            void adapter.attach(
              "conversation",
              conv.conversationId,
              conv.title ?? undefined,
            )
          }
        />
      ) : pickerToken ? (
        <AssociationPickerSheet
          open
          onOpenChange={(open) => {
            if (!open) setPickerToken(null);
          }}
          token={pickerToken}
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
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !confirmBusy) setConfirm(null);
        }}
        title={
          confirm?.kind === "detach"
            ? detachLabel
            : `Delete ${tryGetEntityInfo(confirm?.row.token ?? "")?.label ?? "item"}`
        }
        description={
          confirm?.kind === "detach" ? (
            <>
              Remove{" "}
              <b>
                {confirm
                  ? titleFor({
                      token: confirm.row.token,
                      id: confirm.row.resourceId,
                      label: labelFor(confirm.row),
                    })
                  : ""}
              </b>{" "}
              from this {containerKind}. The item itself stays in your library.
            </>
          ) : (
            <>
              Permanently delete <b>{confirm?.title}</b>. This cannot be undone
              and is separate from removing the association.
            </>
          )
        }
        confirmLabel={confirm?.kind === "detach" ? "Remove" : "Delete"}
        variant={confirm?.kind === "delete" ? "destructive" : "default"}
        busy={confirmBusy}
        onConfirm={runConfirm}
      />
    </div>
  );
}

export function ResourceItemCard({
  accentBar,
  children,
  className,
}: {
  accentBar?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/25",
        className,
      )}
    >
      {accentBar ? (
        <span
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-60",
            accentBar,
          )}
        />
      ) : null}
      {children}
    </div>
  );
}

function DefaultResourceRow({
  title,
  originNote,
  idPrefix,
  menu,
  busy,
}: {
  title: string;
  originNote?: string | null;
  idPrefix: ReactNode;
  menu: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className={cn("flex items-start gap-2", busy && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {idPrefix}
          {originNote ? (
            <span className="text-[10px] text-muted-foreground">
              {originNote}
            </span>
          ) : null}
        </div>
      </div>
      {menu}
    </div>
  );
}

function ResourceIdCopy({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast.success("ID copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy ID");
    }
  };

  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
      <span>{id.slice(0, 8)}</span>
      <button
        type="button"
        onClick={() => void handleCopy()}
        title="Copy full ID"
        aria-label="Copy full ID"
        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </span>
  );
}

function ResourceRowMenu({
  row,
  info,
  detachLabel,
  canOpen,
  canDelete,
  canPin,
  pinned,
  onDetach,
  onOpen,
  onDelete,
  onTogglePin,
}: {
  row: ContainerResourceRow;
  info: EntityInfo | null;
  detachLabel: string;
  canOpen: boolean;
  canDelete: boolean;
  canPin: boolean;
  pinned: boolean;
  onDetach: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const entityLabel = info?.label ?? "Item";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Resource options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
          Association
        </DropdownMenuLabel>
        {row.removable ? (
          <DropdownMenuItem onSelect={onDetach} className="gap-2">
            <Unlink className="h-4 w-4" />
            {detachLabel}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled className="gap-2">
            <Unlink className="h-4 w-4" />
            Inherited — cannot detach
          </DropdownMenuItem>
        )}
        {canPin ? (
          <DropdownMenuItem onSelect={onTogglePin} className="gap-2">
            {pinned ? (
              <>
                <PinOff className="h-4 w-4" />
                Unpin from context
              </>
            ) : (
              <>
                <Pin className="h-4 w-4" />
                Pin to context
              </>
            )}
          </DropdownMenuItem>
        ) : null}

        {(canOpen || canDelete) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
              {entityLabel}
            </DropdownMenuLabel>
            {canOpen ? (
              <DropdownMenuItem onSelect={onOpen} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Open {entityLabel.toLowerCase()}
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem
                onSelect={onDelete}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete {entityLabel.toLowerCase()}
              </DropdownMenuItem>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TokenGroup {
  token: string;
  info: EntityInfo | null;
  rows: ContainerResourceRow[];
}
interface RoleGroup {
  role: ContentRole;
  tokens: TokenGroup[];
}

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
    tokenRows.sort(
      (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false),
    );
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
