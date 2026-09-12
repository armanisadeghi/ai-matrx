"use client";

/**
 * CaseDisclosureBlock — THE one renderer for the `case_disclosure` kind.
 *
 * The sealed case unfolding, as the Expert watches it: one row per request the
 * desk made, what it asked for, and what answered — the case (naming the
 * timeline step it came from) or, when the case is silent, the Expert. The
 * ledger is cumulative, so this component always draws the whole path.
 *
 * Nothing here is medical and nothing here is Masterwork-specific: it renders
 * the contract's ledger, and every Rulebook inherits it.
 *
 * Contract: `common-docs/systems/masterwork/unfolding-case-contract.md` §3.
 */

import {
  ArrowRight,
  CircleSlash,
  Flag,
  HelpCircle,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  CaseDisclosureData,
  CaseLedgerEntry,
} from "@/features/content-ir/kinds/masterwork-unfolding";

export interface CaseDisclosureBlockProps {
  serverData?: unknown;
}

function readData(serverData: unknown): CaseDisclosureData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<CaseDisclosureData>;
  if (typeof candidate.available !== "boolean") return null;
  if (!Array.isArray(candidate.disclosed)) return null;
  return candidate as CaseDisclosureData;
}

/** What the desk asked for, as a chip + the target it named. */
function RequestLine({ entry }: { entry: CaseLedgerEntry }) {
  const { request } = entry;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {request.kind ? (
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {request.kind}
        </span>
      ) : null}
      <span className="text-xs font-medium text-foreground">
        {request.target ?? request.question ?? "a request"}
      </span>
      {request.cost !== null || request.risk !== null ? (
        <span className="text-[11px] text-muted-foreground">
          cost {request.cost ?? 0} · risk {request.risk ?? 0}
        </span>
      ) : null}
    </div>
  );
}

/**
 * WHAT ANSWERED. The silent case is NOT an error state — it is the moment the
 * desk turns to the Expert, and it says exactly that in those words.
 */
function AnswerLine({ entry }: { entry: CaseLedgerEntry }) {
  if (!entry.available) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
        <HelpCircle className="h-3.5 w-3.5 shrink-0" />
        The case does not say → asked the Expert
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {entry.answeredBy === "human" ? (
        <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" />
      ) : (
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
      )}
      {entry.answeredBy === "human"
        ? "The Expert answered"
        : entry.answeredFromStep !== null
          ? `The case answered, from step ${entry.answeredFromStep}`
          : "The case answered"}
    </p>
  );
}

export function CaseDisclosureBlock({ serverData }: CaseDisclosureBlockProps) {
  const data = readData(serverData);
  if (!data) return null;
  const { ledger } = data;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xs font-medium text-foreground">
          What the case has released
        </p>
        <p className="text-[11px] text-muted-foreground">
          {ledger.steps ?? ledger.requests.length} step
          {(ledger.steps ?? ledger.requests.length) === 1 ? "" : "s"} · cost{" "}
          {ledger.cost ?? 0} · risk {ledger.risk ?? 0}
        </p>
      </div>

      {ledger.requests.length > 0 ? (
        <ol className="space-y-1.5">
          {ledger.requests.map((entry, index) => (
            <li
              key={`${entry.step ?? index}-${entry.request.target ?? index}`}
              className={cn(
                "rounded-md border border-border bg-muted/30 p-2",
                !entry.available && "border-amber-500/40",
              )}
            >
              <p className="text-[11px] text-muted-foreground">
                Step {entry.step ?? index + 1}
              </p>
              <RequestLine entry={entry} />
              {entry.request.question ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.request.question}
                </p>
              ) : null}
              <AnswerLine entry={entry} />
            </li>
          ))}
        </ol>
      ) : (
        // An OPENING disclosure has no requests yet. That is a real state, not
        // an empty one — the case has opened and nothing has been asked.
        <p className="text-xs text-muted-foreground">
          The case has opened. Nothing has been asked of it yet.
        </p>
      )}

      {data.disclosed.length > 0 ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
          <p className="text-[11px] font-medium text-foreground">
            Just released by the case
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-foreground">
            {data.disclosed.map((fact, index) => (
              <li key={`${index}-${fact.slice(0, 24)}`}>{fact}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.answer ? (
        <p className="text-xs text-foreground">{data.answer}</p>
      ) : null}

      {!data.available ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
          <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {data.reason ??
            "The case does not state this — the Expert is being asked instead."}
        </p>
      ) : null}

      {data.caseOver ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Flag className="h-3.5 w-3.5 shrink-0 text-primary" />
          The case is over — it has nothing further to give.
        </p>
      ) : null}
    </div>
  );
}

export default CaseDisclosureBlock;
