"use client";

import { Check, Minus, Pencil, Plus, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RulebookRule } from "../types";
import {
  CHECKUP_KIND_LABELS,
  confidenceBand,
  type CheckupDisposition,
  type CheckupFinding,
} from "./types";

/**
 * The queue. One row per finding, always showing the three things the Expert
 * decides on: what kind of change it is, what it is about, and how sure we
 * are — plus their own decision once made, so a 30-finding pass is readable
 * at a glance instead of a wall of identical rows.
 */

const KIND_ICON = {
  add: Plus,
  modify: Pencil,
  remove: Minus,
} as const;

export function checkupFindingTitle(
  finding: CheckupFinding,
  rule: RulebookRule | undefined,
): string {
  if (finding.kind === "add") return finding.proposed?.name ?? "A missing rule";
  return rule?.name ?? finding.proposed?.name ?? "A rule you wrote";
}

export function CheckupFindingList({
  findings,
  focusedId,
  dispositions,
  ruleFor,
  onFocus,
}: {
  findings: CheckupFinding[];
  focusedId: string | null;
  dispositions: Record<string, CheckupDisposition>;
  ruleFor: (finding: CheckupFinding) => RulebookRule | undefined;
  onFocus: (id: string) => void;
}) {
  if (findings.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        Nothing in this list.
      </p>
    );
  }
  return (
    <ul className="space-y-0.5 p-1.5">
      {findings.map((finding) => {
        const Icon = KIND_ICON[finding.kind];
        const disposition = dispositions[finding.id];
        const band = confidenceBand(finding.confidence);
        const focused = finding.id === focusedId;
        return (
          <li key={finding.id}>
            <button
              type="button"
              onClick={() => onFocus(finding.id)}
              aria-current={focused}
              className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                focused
                  ? "bg-primary/10 ring-1 ring-primary/40"
                  : "hover:bg-muted"
              }`}
            >
              <div className="flex items-start gap-2">
                <Icon
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                    finding.kind === "remove"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-foreground">
                    {checkupFindingTitle(finding, ruleFor(finding))}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">
                      {CHECKUP_KIND_LABELS[finding.kind]}
                    </span>
                    {band === "unsure" ? (
                      <Badge
                        variant="outline"
                        className="px-1 py-0 text-[9px] border-destructive/40 text-destructive"
                      >
                        Not sure
                      </Badge>
                    ) : band === "likely" ? (
                      <Badge
                        variant="outline"
                        className="px-1 py-0 text-[9px] border-amber-500/50 text-amber-600 dark:text-amber-500"
                      >
                        Worth a look
                      </Badge>
                    ) : null}
                  </div>
                </div>
                {disposition ? (
                  <span
                    className={`mt-0.5 flex shrink-0 items-center gap-0.5 ${
                      disposition.decision === "approve"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                    title={
                      disposition.byAi
                        ? "Accepted by Approve with AI — you can change it"
                        : undefined
                    }
                  >
                    {disposition.byAi ? (
                      <Sparkles className="h-3 w-3" />
                    ) : null}
                    {disposition.decision === "approve" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </span>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
