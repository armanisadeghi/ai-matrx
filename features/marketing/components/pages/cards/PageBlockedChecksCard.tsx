"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  analysisKeys,
  usePageBlockedChecks,
} from "@/features/marketing/data/analysis-hooks";
import type { MarketingAnalysisResult } from "@/features/marketing/data/analysis-types";
import {
  readRemediation,
  runRemediation,
  type Remediation,
  type RemediationCommand,
} from "@/features/marketing/crawler/remediation";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { MarketingPage } from "@/features/marketing/types";

interface BlockedGroup {
  remediation: Remediation;
  /** Every check this one command unblocks, newest analysis run only. */
  checks: Array<{ itemKey: string; reasoning: string }>;
}

function reasoningOf(result: MarketingAnalysisResult): string {
  const metadata = result.metadata;
  if (typeof metadata !== "object" || metadata === null) return "";
  const value = (metadata as { reasoning?: unknown }).reasoning;
  return typeof value === "string" ? value : "";
}

/**
 * Group the page's blocked checks by the command that unblocks them. Several
 * checks almost always wait on the SAME action ("we haven't checked this
 * page's links yet" blocks three of them) — one button per action, never one
 * per check, so the user sees a fix list, not a wall of identical buttons.
 */
function groupByRemediation(
  results: MarketingAnalysisResult[],
): BlockedGroup[] {
  const groups = new Map<RemediationCommand, BlockedGroup>();
  for (const result of results) {
    const remediation = readRemediation(result.metadata);
    if (!remediation) continue;
    const existing = groups.get(remediation.command);
    const entry = {
      itemKey: result.item_key,
      reasoning: reasoningOf(result),
    };
    if (existing) {
      existing.checks.push(entry);
    } else {
      groups.set(remediation.command, { remediation, checks: [entry] });
    }
  }
  // Page-scoped fixes first: they are the cheap, instant ones.
  return [...groups.values()].sort((left, right) =>
    left.remediation.scope === right.remediation.scope
      ? left.remediation.label.localeCompare(right.remediation.label)
      : left.remediation.scope === "page"
        ? -1
        : 1,
  );
}

/**
 * "Checks waiting on us" — the NO DEAD ENDS half of the page audit.
 *
 * A deterministic check that could not run says so in plain language and ships
 * with the button that unblocks it. The reasoning sentence never instructs the
 * user to run anything; the binding on the row (`metadata.remediation`,
 * authored by `matrx_scraper.seo_audit.Remediation`) carries the action, and
 * `crawler/remediation.ts` dispatches it through the existing crawler command
 * endpoints. After it finishes, the page's analysis + findings queries refetch.
 */
export function PageBlockedChecksCard({ page }: { page: MarketingPage }) {
  const { site } = useMarketingSite();
  const queryClient = useQueryClient();
  const blocked = usePageBlockedChecks(site.id, page.id);
  const [running, setRunning] = useState<RemediationCommand | null>(null);

  const groups = groupByRemediation(blocked.data ?? []);

  const run = async (group: BlockedGroup) => {
    setRunning(group.remediation.command);
    try {
      await runRemediation(group.remediation, {
        siteId: site.id,
        pageUrl: page.url,
      });
      // The command wrote new evidence; the analysis catalogue has to re-read
      // it before these checks can answer. Refresh what the page shows either
      // way, so the user never stares at a stale "we haven't…".
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "site", site.id],
      });
      toast.success(`${group.remediation.label} — done.`, {
        description:
          "Run “Analyze now” on the site audit to score the checks this unblocked.",
      });
    } catch (error) {
      toast.error(`${group.remediation.label} didn’t finish`, {
        description: extractErrorMessage(error),
      });
    } finally {
      setRunning(null);
    }
  };

  const copy = webCopy({
    kind: "web-page-blocked-checks",
    label: "Checks waiting on us",
    description:
      "Deterministic SEO checks that could not run on this page because evidence is missing, each with the crawler command that would unblock it.",
    surface: `Blocked checks — ${page.url}`,
    data: { page_id: page.id, site_id: site.id, groups },
    lines: [
      ["Page", page.path || "/"],
      ["Blocked checks", blocked.data?.length ?? 0],
      ...groups.map(
        (group): [string, string] => [
          group.remediation.label,
          group.checks.map((check) => check.itemKey).join(", "),
        ],
      ),
    ],
    attributes: { page_id: page.id, site_id: site.id },
  });

  return (
    <SectionCard
      title={
        groups.length > 0
          ? `Checks waiting on us (${blocked.data?.length ?? 0})`
          : "Checks waiting on us"
      }
      collapsible
      anchor="blocked_checks"
      copy={copy}
    >
      {blocked.isLoading ? (
        <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : blocked.isError ? (
        <QueryError error={blocked.error} onRetry={() => void blocked.refetch()} />
      ) : groups.length === 0 ? (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Every check we can run on this page has run.
        </div>
      ) : (
        <ul className="divide-y divide-border/70">
          {groups.map((group) => {
            const isRunning = running === group.remediation.command;
            return (
              <li
                key={group.remediation.command}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <ul className="space-y-0.5">
                    {group.checks.map((check) => (
                      <li
                        key={check.itemKey}
                        className="text-xs text-foreground"
                      >
                        {check.reasoning || check.itemKey}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-muted-foreground">
                    {group.remediation.explainer}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => void run(group)}
                  disabled={running !== null}
                >
                  {isRunning ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wrench className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {isRunning ? "Working…" : group.remediation.label}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
