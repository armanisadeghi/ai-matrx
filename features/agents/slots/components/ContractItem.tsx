"use client";

/**
 * ContractItem — the canonical row for one required (or extra) contract
 * input in a slot-contract comparison. Absorbed from research's per-topic
 * agents page; consumed by AgentRoleCard (research) and SlotOverrideEditor
 * (/agents/slots + the admin console). Renders name + optional type badge +
 * helpText, with a trailing three-state status mark:
 * pending (not yet compared) / matched / missing / extra (informational).
 */

import { CheckCircle2, CircleDashed, Plus, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContractRow } from "../contract-compare";

export type ContractRowState = "pending" | "matched" | "missing" | "extra";

const STATUS_ICON = {
  pending: CircleDashed,
  matched: CheckCircle2,
  missing: XCircle,
  extra: Plus,
} as const;

const STATUS_CLASS: Record<ContractRowState, string> = {
  pending: "text-muted-foreground/50",
  matched: "text-emerald-600 dark:text-emerald-400",
  missing: "text-destructive",
  extra: "text-muted-foreground/60",
};

export function ContractItem({
  row,
  state,
  showCheck,
  iconSlot,
}: {
  row: ContractRow;
  state: ContractRowState;
  showCheck: boolean;
  /** Optional leading icon (e.g., Hash for variables, key for slots). */
  iconSlot?: React.ReactNode;
}) {
  const Status = STATUS_ICON[state];
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {iconSlot ? (
        <span className="mt-0.5 text-muted-foreground/60">{iconSlot}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <code className="font-mono text-[12.5px] font-medium text-foreground">
            {row.name}
          </code>
          {row.type ? (
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70">
              {row.type}
            </span>
          ) : null}
        </div>
        {row.helpText ? (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground line-clamp-2">
            {row.helpText}
          </p>
        ) : null}
      </div>
      {showCheck ? (
        <Status className={cn("mt-0.5 h-4 w-4 shrink-0", STATUS_CLASS[state])} />
      ) : null}
    </li>
  );
}
