"use client";

/**
 * UnfoldingRulingBlock — THE one renderer for the `unfolding_ruling` kind.
 *
 * Where the desk committed, and on what: the diagnosis, how sure it is, the
 * step it committed at, the path it took to get there, and the dangerous
 * branches it considered. The dangerous-branch section renders even when the
 * list is EMPTY — "none were considered" is the safety fact the unfolding
 * Audition scores, and hiding it would hide the finding.
 *
 * Contract: `common-docs/systems/masterwork/unfolding-case-contract.md` §3.
 */

import { AlertTriangle, Gavel } from "lucide-react";

import type { UnfoldingRulingData } from "@/features/content-ir/kinds/masterwork-unfolding";
import {
  describeLedgerEntry,
  formatConfidence,
} from "@/features/content-ir/kinds/masterwork-unfolding";

export interface UnfoldingRulingBlockProps {
  serverData?: unknown;
}

function readData(serverData: unknown): UnfoldingRulingData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<UnfoldingRulingData>;
  if (typeof candidate.diagnosis !== "string" || !candidate.diagnosis) {
    return null;
  }
  return candidate as UnfoldingRulingData;
}

export function UnfoldingRulingBlock({ serverData }: UnfoldingRulingBlockProps) {
  const ruling = readData(serverData);
  if (!ruling) return null;
  const steps = ruling.path?.requests ?? [];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Gavel className="h-3.5 w-3.5 shrink-0 text-primary" />
          The desk committed
        </p>
        <p className="text-sm font-semibold text-foreground">
          {ruling.diagnosis}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {[
            // 0-1 on the wire, a percentage to a person — never a bare 0.7.
            ruling.confidence !== null && ruling.confidence !== undefined
              ? `Confidence ${formatConfidence(ruling.confidence)}`
              : null,
            ruling.committedAtStep !== null
              ? `committed at step ${ruling.committedAtStep}`
              : null,
            ruling.path?.cost !== null && ruling.path?.cost !== undefined
              ? `cost ${ruling.path.cost}`
              : null,
            ruling.path?.risk !== null && ruling.path?.risk !== undefined
              ? `risk ${ruling.path.risk}`
              : null,
          ]
            .filter((part): part is string => part !== null)
            .join(" · ")}
        </p>
      </div>

      {steps.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-foreground">The path it took</p>
          <ol className="mt-1 space-y-0.5">
            {steps.map((entry, index) => (
              <li
                key={`${entry.step ?? index}-${entry.request.target ?? index}`}
                className="text-xs text-muted-foreground"
              >
                {describeLedgerEntry(entry)}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
          Dangerous branches considered
        </p>
        {ruling.dangerousBranches.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {ruling.dangerousBranches.map((branch, index) => (
              <li key={`${index}-${branch.branch.slice(0, 24)}`}>
                <span className="text-foreground">{branch.branch}</span>
                {branch.why ? ` — ${branch.why}` : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            None were considered on the way to this ruling.
          </p>
        )}
      </div>
    </div>
  );
}

export default UnfoldingRulingBlock;
