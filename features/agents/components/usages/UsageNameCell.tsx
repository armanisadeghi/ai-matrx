/**
 * UsageNameCell — the NAME of a usage row, with every door we can open.
 *
 * THE DOOR LAW (no-dead-ends): a row that names a mandate, a derived agent, a
 * shortcut, an app, a scheduled task, or a workflow lets the person reach it
 * without leaving the window they are standing in — a window panel where one
 * exists, a new-tab link always, a peek where the registry has one.
 *
 *   mandate        → opens in place (`useOpenMandateWindow`) + new tab
 *   derived agent  → `EntityRef` (route / new tab / peek) + open in a window
 *   shortcut, app, scheduled task, workflow node → `EntityRef` on its token
 *   surface binding, SMS line, comparison, code usage → no route exists in
 *                    this app yet; the name is printed plainly and says so on
 *                    hover, never dressed as a link.
 */

"use client";

import { AppWindow, ExternalLink } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { useOpenAgentContentWindow } from "@/features/overlays/openers/agentAdvancedEditorWindow";
import { agentHref } from "@/features/mandates/admin/mandate-health";
import type { UnifiedUsageRow } from "./unified-rows";

const CONTROL_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground " +
  "transition-colors hover:bg-accent hover:text-foreground";

/** Where a mandate opens in a new tab — the admin console for admins, the personal page otherwise. */
export function mandateHref(mandateKey: string, superAdmin: boolean): string {
  return superAdmin
    ? `/administration/mandates/${encodeURIComponent(mandateKey)}`
    : `/mandates/${encodeURIComponent(mandateKey)}`;
}

const TOKEN_BY_USAGE_TYPE: Partial<Record<string, string>> = {
  shortcut: "agent_shortcut",
  app: "app",
  scheduled_task: "sch_task",
  derived_agent: "agent",
  workflow_node: "workflow",
};

export function UsageNameCell({ row }: { row: UnifiedUsageRow }) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const openMandateWindow = useOpenMandateWindow();
  const openAgentWindow = useOpenAgentContentWindow();

  if (row.kind === "mandate" && row.verdict) {
    const key = row.verdict.mandate_key;
    const href = mandateHref(key, isSuperAdmin);
    return (
      <div className="flex min-w-0 flex-col gap-0.5" onClick={(event) => event.stopPropagation()}>
        <span className="group/entity-ref flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="truncate text-left font-mono text-[11px] font-medium text-foreground hover:underline"
            title="Open this mandate in place"
            onClick={() =>
              openMandateWindow({
                initialMandateKey: key,
                mandateKeys: [key],
                surfaceName: "agent-find-usages",
                initialView: isSuperAdmin ? "admin" : "yours",
              })
            }
          >
            {key}
          </button>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={CONTROL_CLASS}
            title="Open this mandate in a new tab"
            aria-label="Open this mandate in a new tab"
            data-tap-target
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </span>
        {row.subtitle ? <Subtitle row={row} /> : null}
      </div>
    );
  }

  if (row.kind === "usage" && row.usage) {
    const usage = row.usage;
    const token = TOKEN_BY_USAGE_TYPE[usage.usageType];
    const id =
      usage.usageType === "workflow_node"
        ? (usage.config?.workflow_id as string | undefined) ?? null
        : usage.usageId;
    if (token && id) {
      return (
        <div className="flex min-w-0 flex-col gap-0.5" onClick={(event) => event.stopPropagation()}>
          <EntityRef
            token={token}
            id={id}
            name={row.name}
            href={usage.usageType === "derived_agent" ? agentHref(id, null) : undefined}
            openInNewTab
            alwaysShowActions
            extraActions={
              usage.usageType === "derived_agent" ? (
                <button
                  type="button"
                  className={CONTROL_CLASS}
                  title="Open this agent in a window"
                  aria-label="Open this agent in a window"
                  onClick={(event) => {
                    event.stopPropagation();
                    openAgentWindow({ initialAgentId: id });
                  }}
                >
                  <AppWindow className="h-3 w-3" aria-hidden />
                </button>
              ) : undefined
            }
          />
          {row.subtitle ? <Subtitle row={row} /> : null}
        </div>
      );
    }
    // No route exists in this app for this usage type (surface bindings, SMS
    // lines, comparisons, code usages) — the name is honest text, not a link.
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className="truncate text-sm text-foreground"
          title={`${row.name} — this kind of usage has no page of its own in the app yet, so there is nothing to open.`}
        >
          {row.name}
        </span>
        {row.subtitle ? <Subtitle row={row} /> : null}
      </div>
    );
  }

  // Aggregate — other people's usages, counted, never named (theirs to move).
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-sm text-muted-foreground">{row.name}</span>
      {row.subtitle ? <Subtitle row={row} /> : null}
    </div>
  );
}

function Subtitle({ row }: { row: UnifiedUsageRow }) {
  const verdict = row.verdict;
  // A mandate reached through a duplicate names that duplicate as a door too.
  if (row.kind === "mandate" && verdict && verdict.lineage_path && verdict.lineage_path.length > 1) {
    return (
      <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
        <span className="shrink-0">
          {verdict.holder_kind === "binding" ? `${verdict.principal.kind} binding` : "default"} · on duplicate
        </span>
        <EntityRef
          token="agent"
          id={verdict.agent_id}
          name={verdict.agent_name}
          href={agentHref(verdict.agent_id, null)}
          openInNewTab
          alwaysShowActions
          showIcon={false}
          labelClassName="text-[10px]"
        />
      </span>
    );
  }
  return <span className="truncate text-[10px] text-muted-foreground">{row.subtitle}</span>;
}
