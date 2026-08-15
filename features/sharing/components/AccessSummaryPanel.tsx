/**
 * features/sharing/components/AccessSummaryPanel.tsx
 *
 * "Who can see this, and why" — the truthful access explanation for ONE
 * entity. Works for any entity token, not just files: hand it a type + id.
 *
 * It lists every REASON access is granted, because the reason is the part
 * users act on. "Everyone in Titanium (via the Web Development scope)" tells
 * you what to detach; "Only you" told you nothing and was often wrong.
 *
 * Every line it renders is copyable, in all three flavors, at panel and reason
 * granularity — including the failure branch. A user copying this panel is
 * asking an agent "why can't this person see this, and what do I change?", so
 * the rendered sentences (and the rendered error) ARE the payload.
 */

"use client";

import { useEffect, useRef } from "react";
import { Globe, Lock, Loader2, Users, Boxes, AlertTriangle } from "lucide-react";
import { useAccessSummary } from "@/features/sharing/hooks/useAccessSummary";
import { type AccessSummary } from "@/features/sharing/service/accessSummary";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  accessKpis,
  accessReasonRows,
  accessSummaryView,
  humanAccessSummary,
  isPrivateSummary,
  reasonCsvRows,
  sharingLocation,
  visibilityLabel,
  ACCESS_SUMMARY_ERROR_HEADLINE,
  NOTHING_ELSE_GRANTS,
  type AccessReasonRow,
  type SharingCopyContext,
} from "@/features/sharing/format";
import { cn } from "@/utils/cn";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

/** What the panel currently knows, for pages that mirror it in their payload. */
export interface AccessSummaryState {
  summary: AccessSummary | null;
  error: string | null;
  loading: boolean;
}

export interface AccessSummaryPanelProps {
  entityType: EntityTypeToken;
  entityId: string | null;
  /** Load only when the surface is actually visible. */
  enabled?: boolean;
  /**
   * Change this value to force a refetch. Required on surfaces that mutate
   * grants beside the panel (a Share tab) — pass a signature of the grant
   * state so the summary can never contradict the list next to it.
   */
  refreshToken?: unknown;
  className?: string;
  /**
   * Identity + the page's leading KPIs, mirrored verbatim into this panel's
   * payloads. Optional — without it the panel derives what it can from the
   * summary itself.
   */
  copy?: SharingCopyContext;
  /**
   * Lets the page that composes this panel mirror the reachability answer it
   * is rendering, without paying for a second round trip. Pass a stable
   * callback (a `useState` setter is ideal).
   */
  onSummaryChange?: (state: AccessSummaryState) => void;
}

export function AccessSummaryPanel({
  entityType,
  entityId,
  enabled = true,
  refreshToken,
  className,
  copy,
  onSummaryChange,
}: AccessSummaryPanelProps) {
  const { summary, loading, error, reload } = useAccessSummary({
    entityType,
    entityId,
    enabled,
    refreshToken,
  });

  /*
   * Publish upward so a composing page's payload can carry these same numbers
   * instead of recomputing (or double-fetching) what is already on screen.
   *
   * The callback is held in a ref and deliberately kept OUT of the deps: this
   * is a shared component, and a caller passing an inline arrow would
   * otherwise re-fire on every render and cascade forever. It fires when the
   * access answer actually changes, and only then.
   */
  const notifyRef = useRef(onSummaryChange);
  useEffect(() => {
    notifyRef.current = onSummaryChange;
  }, [onSummaryChange]);
  useEffect(() => {
    notifyRef.current?.({ summary, error, loading });
  }, [summary, error, loading]);

  const context: SharingCopyContext = copy ?? {
    resourceType: entityType,
    resourceId: entityId ?? "unknown",
    surface: "Access summary",
    kpis: accessKpis({
      permissions: [],
      isPublic: summary?.isPublic ?? false,
      viewerIsOwner: summary ? summary.viewerIsOwner : null,
      summary,
      entityType,
    }),
  };
  const location = sharingLocation(context.surface);
  const resourceAttributes = {
    resource_type: context.resourceType,
    resource_id: context.resourceId,
    resource_name: context.resourceName ?? null,
  };

  if (loading && !summary) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Working out who can see this…
      </div>
    );
  }

  if (error) {
    /*
     * ERRORS FIRST. A failed access read is the single highest-value thing on
     * this surface — the user is staring at "we don't know who can see this"
     * and wants an agent to tell them why. Copy it verbatim, with the entity
     * identity that produced it, never a paraphrase.
     */
    const errorHuman = () =>
      [
        `${ACCESS_SUMMARY_ERROR_HEADLINE}`,
        error,
        `Entity: ${entityType}:${entityId ?? "(none)"}`,
        `The panel offers a Retry; the reachability answer is UNKNOWN, not "private".`,
      ].join("\n");
    return (
      <div
        className={cn(
          "group rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive",
          className,
        )}
      >
        <p className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-3.5 w-3.5" />
          {ACCESS_SUMMARY_ERROR_HEADLINE}
          <span className="ml-auto opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <CopyButtons
              size="xs"
              label="Access summary error"
              human={errorHuman}
              json={() => ({
                error,
                entity_type: entityType,
                entity_id: entityId,
              })}
              agent={() => ({
                kind: "access-summary-error",
                location,
                description:
                  "The reachability summary failed to load. This is the error the user is looking at, verbatim — the access answer is UNKNOWN, not private.",
                data: {
                  rendered_headline: ACCESS_SUMMARY_ERROR_HEADLINE,
                  rendered_error: error,
                  entity_type: entityType,
                  entity_id: entityId,
                  retry_offered: true,
                  kpis: context.kpis,
                },
                summary: errorHuman(),
                attributes: {
                  ...context.kpis,
                  ...resourceAttributes,
                  state: "error",
                },
              })}
            />
          </span>
        </p>
        <p className="opacity-80">{error}</p>
        <button
          type="button"
          onClick={reload}
          className="mt-1 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!summary) return null;

  const Icon = summary.isPublic ? Globe : isPrivateSummary(summary) ? Lock : Users;

  // ONE extractor feeds both the rendering below and every payload — the copy
  // can never drift from the reasons on screen.
  const reasons = accessReasonRows(summary, entityType);
  const view = () => accessSummaryView(summary, entityType);
  const panelHuman = () => humanAccessSummary(summary, entityType);

  return (
    <div className={cn("group space-y-2 px-3 py-2", className)}>
      {/*
       * Visibility comes from the summary, NOT from the client-side Visibility
       * union — `toVisibility()` collapses `internal` into `personal`, so the
       * client type cannot tell "belongs to one person" from "readable by the
       * whole org". Rendering the collapsed value next to the true reasons
       * produced a visible contradiction ("Personal" above "…is internal in
       * that organization").
       */}
      <div className="flex items-center gap-2">
        <p className="text-[12px] text-muted-foreground">
          Visibility:{" "}
          <span className="text-foreground">
            {visibilityLabel(summary.visibility)}
          </span>
        </p>
        <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <CopyButtons
            size="xs"
            label="Who can see this"
            human={panelHuman}
            json={view}
            agent={() => ({
              kind: "access-summary",
              location,
              description:
                "Every reason this entity is reachable, exactly as rendered: its visibility setting, the one-line headline, and each reason row. This is the complete answer to \"who can see this, and why\" — direct grants are only one of the reasons listed.",
              data: { ...view(), kpis: context.kpis },
              summary: panelHuman(),
              attributes: {
                ...context.kpis,
                ...resourceAttributes,
                reasons: reasons.length,
                is_public: summary.isPublic,
                viewer_is_owner: summary.viewerIsOwner,
                can_manage: summary.canManage,
              },
            })}
          />
          <ExportMenu
            label={`access-summary-${entityType}`}
            items={[
              jsonExportItem(view, "JSON (rendered summary)"),
              csvExportItem(
                () => reasonCsvRows(reasons),
                "CSV (all access reasons)",
              ),
            ]}
          />
        </span>
      </div>

      <p className="flex items-start gap-2 text-[13px] text-foreground">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>{view().headline}</span>
      </p>

      <ul className="space-y-1 text-[12px] text-muted-foreground">
        {reasons.map((reason) => (
          <ReasonRow
            key={reason.id}
            reason={reason}
            location={location}
            attributes={{ ...context.kpis, ...resourceAttributes }}
          />
        ))}
      </ul>

      {isPrivateSummary(summary) ? (
        <p className="text-[12px] text-muted-foreground">
          {NOTHING_ELSE_GRANTS}
        </p>
      ) : null}
    </div>
  );
}

const REASON_ICON: Record<AccessReasonRow["kind"], typeof Users> = {
  organization: Users,
  "direct-grants": Users,
  container: Boxes,
};

function ReasonRow({
  reason,
  location,
  attributes,
}: {
  reason: AccessReasonRow;
  location: string;
  attributes: Record<string, string | number | boolean | null | undefined>;
}) {
  const Icon = REASON_ICON[reason.kind];
  const human = () =>
    `${reason.title}${reason.detail ? ` — ${reason.detail}` : ""}`;
  return (
    <li className="group/reason flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">
        <span className="text-foreground">{reason.title}</span>
        {reason.detail ? (
          <span className="opacity-80"> — {reason.detail}</span>
        ) : null}
      </span>
      {/* A reason is the unit the user ACTS on ("detach that scope") — so it is
          the unit they hand an agent. */}
      <span className="ml-auto shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/reason:opacity-100">
        <CopyButtons
          size="xs"
          label={`Access reason — ${reason.title}`}
          human={human}
          json={() => reason}
          agent={() => ({
            kind: "access-reason",
            location,
            description:
              "One reason this entity is reachable, as rendered in the access summary. Removing this reason is one of the levers for changing who can see it.",
            data: reason,
            summary: human(),
            attributes: {
              ...attributes,
              reason_kind: reason.kind,
              container_type: reason.containerType ?? null,
              container_id: reason.containerId ?? null,
            },
          })}
        />
      </span>
    </li>
  );
}

export default AccessSummaryPanel;
