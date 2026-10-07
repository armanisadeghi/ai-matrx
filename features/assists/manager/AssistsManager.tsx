"use client";

/**
 * AssistsManager — the triage surface for EVERY assist, in every state.
 *
 * Why it exists: the dock and the page strips only ever show live pending
 * work, which is correct for a chip and useless for triage — a dismissed
 * assist, a snoozed one, or the receipt of one you accepted last week had no
 * door anywhere in the app. kg-suggestions solved exactly this with
 * `/suggestions`; this is that capability, generalised onto the one ledger.
 *
 * ONE decision UX: every row's title is the canonical `AssistChip`, so reading
 * and acting here go through the same card, the same runner, and the same
 * INTENTIONAL-ACTION LAW as everywhere else. Nothing about the decision is
 * re-implemented here — the manager adds reach (history, filters, bulk
 * triage, restore), never a second way to act.
 */

import { UntrustedCount } from "@/components/official/stale-data/UntrustedCount";
import { readOf } from "@/components/read-state/ReadGate";
import { useMemo, useState } from "react";
import {
  Clock,
  Copy,
  RefreshCw,
  RotateCcw,
  Star,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { useTableUrlState } from "@ai-matrx/design-system/data-table/url-state";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuExtraSection,
  type ResolvedContextMenuContext,
} from "@/features/context-menu-v3/types";
import { AssistChip } from "../components/AssistChip";
import { SNOOZE_WINDOWS, isLowConfidence } from "../constants";
import { useAssistsQuery } from "./useAssistsQuery";
import {
  isSourceSuppressedUntil,
  SOURCE_SUPPRESSED_UNTIL,
} from "../source-suppression";
import { formatQuietRemaining } from "../quiet";
import { useAssistsPrefs } from "../hooks/useAssistsPrefs";
import { ASSIST_URGENCY_ICON } from "../components/urgency-icon";
import {
  ASSIST_URGENCIES,
  ASSIST_URGENCY_META,
  urgencyFromPriority,
} from "../types";
import type { Assist, AssistStatus, AssistUrgency } from "../types";
import {
  ASSIST_SOURCE_KIND_OPTIONS,
  formatAssistDate,
  humanAssistRow,
  projectAssistRow,
} from "../format";
import { createAssistsScope } from "@/features/surfaces/manifests/assists.manifest";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { copyToClipboard } from "@/lib/clipboard/copy";

/** The registered `matrx-user/assists` surface — this IS its manager. */
const ASSISTS_SURFACE_NAME = "matrx-user/assists";

const STATUS_TABS: Array<{
  value: string;
  label: string;
  statuses: AssistStatus[];
}> = [
  { value: "pending", label: "Open", statuses: ["pending"] },
  { value: "accepted", label: "Accepted", statuses: ["accepted"] },
  { value: "dismissed", label: "Dismissed", statuses: ["dismissed"] },
  // "Went away" is not a decision — the condition stopped reproducing and the
  // chip closed itself (web.finding's analyzer-owned resolve, generalised).
  { value: "resolved", label: "Went away", statuses: ["resolved"] },
  {
    value: "all",
    label: "Everything",
    statuses: [
      "pending",
      "accepted",
      "dismissed",
      "expired",
      "superseded",
      "resolved",
    ],
  },
];

const STATUS_TONE: Record<AssistStatus, string> = {
  pending: "bg-primary/10 text-primary-ink border-primary/20",
  accepted:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  dismissed: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
  superseded: "bg-muted text-muted-foreground border-border",
  resolved: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
};

export function AssistsManager() {
  // The only way back on while quiet: the dock renders nothing then.
  const {
    quiet: assistsQuiet,
    quietUntil: assistsQuietUntil,
    resume: resumeAssists,
  } = useAssistsPrefs();
  const assistsQuietRemaining = formatQuietRemaining(assistsQuietUntil);
  const [tab, setTab] = useState<string>("pending");
  const [includeSnoozed, setIncludeSnoozed] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [showSilenced, setShowSilenced] = useState(false);
  const [urgency, setUrgency] = useState<AssistUrgency | null>(null);
  const [confirmDismissAll, setConfirmDismissAll] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const table = useTableUrlState({
    tableId: "assists",
    defaultSort: { id: "created_at", direction: "desc" },
    defaultPageSize: 25,
  });

  const statuses = useMemo<AssistStatus[]>(
    () => STATUS_TABS.find((t) => t.value === tab)?.statuses ?? ["pending"],
    [tab],
  );

  const {
    rows,
    total,
    stats,
    sourceSuppressions,
    loading,
    loaded,
    error,
    refresh,
    restore,
    dismissAll,
    snoozeAll,
    setStarred,
    unsuppressSource,
  } = useAssistsQuery(table.queryState, {
    statuses,
    includeSnoozed,
    starredOnly,
    unseenOnly,
    urgency,
  });

  const shownIds = rows.filter((r) => r.status === "pending").map((r) => r.id);
  const everythingCount = Object.values(stats).reduce(
    (sum, count) => sum + count,
    0,
  );

  /**
   * The registered `matrx-user/assists` scope — every `alwaysAvailable`
   * value the manifest declares, so a menu-launched agent doesn't hit v3's
   * VALUE MAPPING GAP scream.
   */
  const getScope = () => {
    const flags = {
      include_snoozed: includeSnoozed,
      starred_only: starredOnly,
      unseen_only: unseenOnly,
      show_silenced: showSilenced,
    };
    return createAssistsScope({
      assist_status_tab: tab,
      assist_view_flags: flags,
      assist_urgency_filter: urgency ?? undefined,
      assist_table_query: table.queryState,
      assist_load_state: error ? "failed" : loaded ? "ready" : "loading",
      assist_load_error: error ?? undefined,
      assist_quiet: assistsQuiet,
      assist_quiet_until: assistsQuietUntil ?? undefined,
      assist_bulk_busy: bulkBusy,
      assist_dismiss_dialog_open: confirmDismissAll,
      assist_view: { tab, urgency, ...flags, query: table.queryState, quiet: assistsQuiet, quiet_until: assistsQuietUntil },
      ...(loaded ? {
        assist_total_count: total,
        visible_assists_summary: rows.map((row) => ({ id: row.id, title: row.title, urgency: urgencyFromPriority(row.priority), status: row.status, source: row.sourceKey })),
        loaded_assists: rows,
        assist_status_counts: stats,
        source_suppressions: sourceSuppressions,
        silenced_sources: sourceSuppressions.map((source) => source.sourceKey),
        content: rows.map(humanAssistRow).join("\n\n"),
      } : {}),
    });
  };

  const columns: MatrxColumnDef<Assist>[] = useMemo(
    () => [
      {
        id: "star",
        header: "",
        sortable: false,
        filter: false,
        cell: (row) => (
          <Button
            icon={<Star
              className={
                row.isStarred
                  ? "h-3.5 w-3.5 fill-amber-400 text-amber-500"
                  : "h-3.5 w-3.5 text-muted-foreground"
              }
            />}
            variant="quiet"
            aria-label={
              row.isStarred ? "Unflag this assist" : "Flag this assist"
            }
            onClick={() => {
              void setStarred(row.id, !row.isStarred).catch(() =>
                toast.error("Could not update the flag — try again"),
              );
            }}
          />
        ),
      },
      {
        id: "title",
        header: "Assist",
        accessorFn: (row) => row.title,
        sortable: false,
        filter: false,
        // The canonical chip — hover/click expands the ONE decision card.
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-2 py-0.5">
            {!row.viewedAt && (
              <span
                aria-label="Not yet seen"
                title="Not yet seen"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              />
            )}
            <AssistChip assist={row} inlineOnMobile={false} />
            {isLowConfidence(row.confidence) && (
              <span className="shrink-0 text-[11px] text-amber-600 dark:text-amber-500">
                low confidence
              </span>
            )}
          </div>
        ),
      },
      {
        id: "sourceKey",
        header: "Producer",
        accessorFn: (row) => row.sourceKey,
        filter: "text",
        cell: (row) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            {row.sourceKey}
          </span>
        ),
      },
      {
        id: "sourceKind",
        header: "Origin",
        accessorFn: (row) => row.sourceKind,
        filter: "select",
        filterOptions: ASSIST_SOURCE_KIND_OPTIONS,
        cell: (row) =>
          ASSIST_SOURCE_KIND_OPTIONS.find((o) => o.value === row.sourceKind)
            ?.label ?? row.sourceKind,
      },
      {
        id: "surfaceName",
        header: "Surface",
        accessorFn: (row) => row.surfaceName ?? "",
        filter: "text",
        cell: (row) => row.surfaceName ?? "Global",
      },
      {
        id: "priority",
        header: "Urgency",
        accessorFn: (row) => row.priority,
        // Filtering happens in the header band buttons, which filter the whole
        // result set server-side — a per-page column filter would silently
        // disagree with the count beside it.
        filter: false,
        cell: (row) => {
          const band = urgencyFromPriority(row.priority);
          const meta = ASSIST_URGENCY_META[band];
          const Icon = ASSIST_URGENCY_ICON[band];
          return (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Icon className={`h-3 w-3 ${meta.iconClass}`} />
              {meta.label}
            </span>
          );
        },
      },
      {
        id: "confidence",
        header: "Confidence",
        accessorFn: (row) => row.confidence ?? -1,
        filter: false,
        cell: (row) =>
          typeof row.confidence === "number"
            ? `${Math.round(row.confidence * 100)}%`
            : "—",
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        filter: false,
        cell: (row) => (
          <Badge
            variant="outline"
            className={`text-[10px] ${STATUS_TONE[row.status]}`}
          >
            {row.status}
            {row.status === "pending" &&
            isSourceSuppressedUntil(row.suppressedUntil)
              ? " · source silenced"
              : row.status === "pending" &&
                  row.suppressedUntil &&
                  new Date(row.suppressedUntil) > new Date()
                ? " · snoozed"
                : ""}
          </Badge>
        ),
      },
      {
        id: "first_seen_at",
        header: "First noticed",
        accessorFn: (row) => row.firstSeenAt ?? row.createdAt,
        filter: false,
        cell: (row) => formatAssistDate(row.firstSeenAt ?? row.createdAt),
      },
      {
        id: "occurrences",
        header: "Seen",
        accessorFn: (row) => row.occurrences,
        filter: false,
        cell: (row) => (row.occurrences > 1 ? `${row.occurrences}×` : "once"),
      },
      {
        id: "decided_at",
        header: "Decided",
        accessorFn: (row) => row.decidedAt ?? "",
        filter: false,
        cell: (row) => formatAssistDate(row.decidedAt),
      },
      {
        id: "actions",
        header: "",
        sortable: false,
        filter: false,
        cell: (row) =>
          row.status === "pending" ? null : (
            <Button
              icon={<RotateCcw />}
              variant="quiet"
              onClick={() => {
                void restore(row.id)
                  .then(() => toast.success("Back in your assists"))
                  .catch(() => toast.error("Could not restore — try again"));
              }}
            >
              Restore
            </Button>
          ),
      },
    ],
    [restore, setStarred],
  );

  const runBulk = async (fn: () => Promise<number>, verb: string) => {
    setBulkBusy(true);
    try {
      const count = await fn();
      toast.success(`${count} assist${count === 1 ? "" : "s"} ${verb}`);
    } catch {
      toast.error(
        `Could not ${verb === "dismissed" ? "dismiss" : "snooze"} — try again`,
      );
    } finally {
      setBulkBusy(false);
    }
  };

  // ── The ONE right-click menu for the whole manager ──────────────────────
  //
  // `MatrxDataTable` stamps `data-row-id` from `getRowId` (the assist id), so
  // the pane's single menu resolves the right-clicked row from the DOM, same
  // delegation shape as the Mandates/Kind-Catalog reference wirings. The
  // decision itself is never re-implemented here — every action below calls
  // the SAME hooks (`restore`/`dismissAll`/`snoozeAll`/`setStarred`) the
  // toolbar and `AssistChip` already use.
  const [menuRow, setMenuRow] = useState<Assist | null>(null);

  const resolveAssistMenuTarget = (
    target: HTMLElement | null,
  ): ResolvedContextMenuContext | null => {
    const id = target?.closest?.("[data-row-id]")?.getAttribute("data-row-id");
    const row = id ? (rows.find((r) => r.id === id) ?? null) : null;
    setMenuRow(row);
    if (!row) return null;
    return {
      content: humanAssistRow(row),
      [CONTEXT_MENU_ENTITY_KEY]: null,
    };
  };

  const assistMenuSections: ContextMenuExtraSection[] = (() => {
    const row = menuRow;
    if (!row) return [];
    const items: ContextMenuExtraSection["items"] = [
      {
        kind: "item",
        id: "assist-flag",
        label: row.isStarred ? "Unflag" : "Flag",
        icon: Star,
        onSelect: () => {
          void setStarred(row.id, !row.isStarred).catch(() =>
            toast.error("Could not update the flag — try again"),
          );
        },
      },
      {
        kind: "item",
        id: "assist-copy-config",
        label: "Copy config for AI",
        icon: Copy,
        onSelect: () => {
          void copyToClipboard(humanAssistRow(row), "Copied assist config");
        },
      },
    ];
    if (row.status === "pending") {
      items.push({
        kind: "submenu",
        id: "assist-snooze",
        label: "Snooze",
        icon: Clock,
        children: SNOOZE_WINDOWS.map((window) => ({
          kind: "item" as const,
          id: `assist-snooze-${window.key}`,
          label: window.label,
          onSelect: () => {
            void runBulk(() => snoozeAll([row.id], window.key), "snoozed");
          },
        })),
      });
      items.push({
        kind: "item",
        id: "assist-dismiss",
        label: "Dismiss",
        icon: XCircle,
        destructive: true,
        onSelect: () => {
          void runBulk(() => dismissAll([row.id]), "dismissed");
        },
      });
    } else {
      items.push({
        kind: "item",
        id: "assist-restore",
        label: "Restore",
        icon: RotateCcw,
        onSelect: () => {
          void restore(row.id)
            .then(() => toast.success("Back in your assists"))
            .catch(() => toast.error("Could not restore — try again"));
        },
      });
    }
    return [
      {
        id: "assist-actions",
        label: "Assist",
        anchor: "after-clipboard",
        items,
      },
    ];
  })();

  return (
    <SurfaceRuntimeProvider surfaceName={ASSISTS_SURFACE_NAME} getScope={getScope}>
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {STATUS_TABS.map((entry) => {
          const count = entry.statuses.reduce(
            (sum, status) => sum + stats[status],
            0,
          );
          return (
            <Button
              key={entry.value}
              variant={tab === entry.value ? "outline" : "quiet"}
              onClick={() => setTab(entry.value)}
            >
              {entry.label}
              <UntrustedCount
                className="text-[11px] text-muted-foreground"
                value={count}
                read={readOf({ loading, error })}
                label={entry.label}
              />
            </Button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {ASSIST_URGENCIES.map((band) => {
          const meta = ASSIST_URGENCY_META[band];
          const Icon = ASSIST_URGENCY_ICON[band];
          const active = urgency === band;
          return (
            <Button
              icon={<Icon className={`h-3 w-3 ${meta.iconClass}`} />}
              key={band}
              variant={active ? "outline" : "quiet"}
              // Clicking the active band clears it — the filter is a toggle,
              // so "everything" never needs a fourth button.
              onClick={() => setUrgency(active ? null : band)}
              aria-pressed={active}
            >
              {meta.label}
            </Button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Button
          variant={includeSnoozed ? "outline" : "quiet"}
          onClick={() => setIncludeSnoozed((v) => !v)}
        >
          {includeSnoozed ? "Including snoozed" : "Show snoozed"}
        </Button>
        <Button
          icon={<Star />}
          variant={starredOnly ? "outline" : "quiet"}
          onClick={() => setStarredOnly((v) => !v)}
        >
          Flagged
        </Button>
        <Button
          variant={unseenOnly ? "outline" : "quiet"}
          onClick={() => setUnseenOnly((v) => !v)}
        >
          Unseen
        </Button>
        <Button
          icon={<VolumeX />}
          variant={showSilenced ? "outline" : "quiet"}
          onClick={() => setShowSilenced((value) => !value)}
        >
          Silenced
          <UntrustedCount
            className="text-[11px] text-muted-foreground"
            value={sourceSuppressions.length}
            read={readOf({ loading, error })}
            label="Silenced sources"
          />
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          {shownIds.length > 0 && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={bulkBusy}
                  >
                    Snooze these {shownIds.length}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SNOOZE_WINDOWS.map((window) => (
                    <DropdownMenuItem
                      key={window.key}
                      className="text-xs"
                      onSelect={() =>
                        void runBulk(
                          () => snoozeAll(shownIds, window.key),
                          "snoozed",
                        )
                      }
                    >
                      {window.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                disabled={bulkBusy}
                onClick={() => setConfirmDismissAll(true)}
              >
                Dismiss these {shownIds.length}
              </Button>
            </>
          )}
          {assistsQuiet && (
            <Button
              icon={<VolumeX />}
              variant="outline"
              onClick={() => {
                resumeAssists();
                toast.success("Assists are back on");
              }}
            >
              Quiet{assistsQuietRemaining ? ` · ${assistsQuietRemaining}` : ""} — turn on
            </Button>
          )}
          <Button
            icon={<RefreshCw
              className={loading ? "h-3 w-3 animate-spin" : "h-3 w-3"}
            />}
            variant="quiet"
            onClick={refresh}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {showSilenced && (
        <div className="border-b border-border bg-muted/20 px-3 py-2">
          <div className="mb-1.5 flex items-center gap-2">
            <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-foreground">
              Quieted assist kinds
            </h2>
            <span className="text-[11px] text-muted-foreground">
              A timed quiet ends on its own; the rest stay off until you turn
              them back on.
            </span>
          </div>
          {sourceSuppressions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing is quieted.</p>
          ) : (
            <div className="grid gap-1.5 lg:grid-cols-2">
              {sourceSuppressions.map((suppression) => (
                <div
                  key={suppression.sourceKey}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">
                      {suppression.label}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {/* A window says when it comes back; a permanent mute
                          says what the user typed. Never a bare timestamp. */}
                      {suppression.until === SOURCE_SUPPRESSED_UNTIL
                        ? suppression.reason
                        : (formatQuietRemaining(suppression.until) ??
                          "ending now")}{" "}
                      · {suppression.affectedRows} record
                      {suppression.affectedRows === 1 ? "" : "s"} covered
                    </div>
                  </div>
                  <Button
                    icon={<Volume2 />}
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      void unsuppressSource(
                        suppression.sourceKey,
                        suppression.until,
                      )
                        .then((count) =>
                          toast.success(
                            `${suppression.label} is back on for ${count} assist${count === 1 ? "" : "s"}`,
                          ),
                        )
                        .catch(() =>
                          toast.error(
                            "Could not turn this kind back on — try again",
                          ),
                        );
                    }}
                  >
                    Turn back on
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-ink">
          {error}
          <ErrorAlchemyMenu error={error} />
        </p>
      )}

      <div className="min-h-0 flex-1 p-2 sm:p-3">
        <NonEditableContextMenu
          sourceFeature="admin"
          menuVersion={2}
          surfaceName={ASSISTS_SURFACE_NAME}
          contentSource={{ type: "raw" }}
          contextData={{ content: "Assists manager" }}
          getApplicationScope={getScope}
          resolveContextOnOpen={resolveAssistMenuTarget}
          extraSections={assistMenuSections}
        >
        <MatrxDataTable<Assist>
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={loading}
          query={{
            mode: "controlled",
            state: table.state,
            totalItems: total,
            onStateChange: table.onStateChange,
          }}
          toolbar={{
            searchPlaceholder: "Search title, body, or producer…",
          }}
          copy={{
            label: "Assist",
            listLabel: "Assists (this view)",
            location: "AI Matrx — Assists manager (/assists)",
            rowKind: "assist",
            listKind: "assists",
            humanRow: humanAssistRow,
            agentRow: (row) => ({
              ...projectAssistRow(row),
              page_context: {
                status_view: tab,
                urgency_filter: urgency,
                include_snoozed: includeSnoozed,
                flagged_only: starredOnly,
                unseen_only: unseenOnly,
                quieted_kinds: sourceSuppressions.length,
                load_error: error,
                everything_count: everythingCount,
                status_counts: stats,
              },
            }),
            rowAttributes: (row) => ({
              assist_id: row.id,
              status: row.status,
              source_kind: row.sourceKind,
              priority: row.priority,
              open: stats.pending,
              accepted: stats.accepted,
              dismissed: stats.dismissed,
              went_away: stats.resolved,
              expired: stats.expired,
              superseded: stats.superseded,
              everything: everythingCount,
            }),
            listAttributes: (visible) => ({
              visible_count: visible.length,
              total_count: total,
              open: stats.pending,
              accepted: stats.accepted,
              dismissed: stats.dismissed,
              went_away: stats.resolved,
              expired: stats.expired,
              superseded: stats.superseded,
              everything: everythingCount,
              status_view: tab,
              urgency_filter: urgency,
              include_snoozed: includeSnoozed,
              flagged_only: starredOnly,
              unseen_only: unseenOnly,
              quieted_kinds: sourceSuppressions.length,
              load_error: error,
            }),
            listContext: () => ({
              status_view: tab,
              urgency_filter: urgency,
              include_snoozed: includeSnoozed,
              flagged_only: starredOnly,
              unseen_only: unseenOnly,
              quieted_kinds: sourceSuppressions.length,
              load_error: error,
              open: stats.pending,
              accepted: stats.accepted,
              dismissed: stats.dismissed,
              went_away: stats.resolved,
              expired: stats.expired,
              superseded: stats.superseded,
              everything_count: everythingCount,
            }),
          }}
        />
        </NonEditableContextMenu>
      </div>

      <ConfirmDialog
        open={confirmDismissAll}
        onOpenChange={setConfirmDismissAll}
        // read-gate-exempt: the dialog opens only from a button over rows already on screen, so this counts shown rows
        title={`Dismiss ${shownIds.length} assist${shownIds.length === 1 ? "" : "s"}?`}
        description="Dismissing is durable — these will not come back on their own. Snooze instead if you only want them out of the way for now."
        confirmLabel="Dismiss them"
        variant="destructive"
        onConfirm={async () => {
          await runBulk(() => dismissAll(shownIds), "dismissed");
        }}
      />
    </div>
    </SurfaceRuntimeProvider>
  );
}
