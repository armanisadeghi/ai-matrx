"use client";

/**
 * THE PROOF LEDGER — the honest heart of the product.
 *
 * The brief's hardest design constraint: an angle that is not provable yet is
 * NOT a failure, it is a to-do. So this component breaks the reflex a
 * developer has when data says "missing":
 *
 *   • Nothing here is destructive-coloured. Red on this desk is reserved for
 *     a journalist deadline. A gap gets primary and progress language.
 *   • The framing is a completion count, not a defect count: "3 of 5 proofs
 *     in hand", with the remaining items phrased as the shortest path
 *     ("two facts from pitchable").
 *   • Every gap ships with the action that closes it — a one-click "I have
 *     this" that writes real evidence onto the row, and a copyable ask
 *     addressed to the person who owns the fact.
 */

import { useState } from "react";
import {
  Check,
  CircleDashed,
  Copy,
  ExternalLink,
  ScanSearch,
  Scale,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import type { ProofItem, ProofLedgerSummary } from "../lib/proof";
import type { StoryAngleRow } from "../types";

export function ProofLedger({
  angle,
  ledger,
  onAttach,
}: {
  angle: StoryAngleRow;
  ledger: ProofLedgerSummary;
  onAttach: (input: { label: string; note: string }) => void;
}) {
  const [pending, setPending] = useState<ProofItem | null>(null);
  const remaining = ledger.missing.length;

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/70 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Proof ledger
          </h3>
          <p className="mt-0.5 text-[13px] font-medium text-foreground">
            {ledger.total === 0
              ? "No proof list was generated for this angle"
              : remaining === 0
                ? "Every proof a newsroom would ask for is in hand"
                : `${ledger.met} of ${ledger.total} proofs in hand — ${remaining === 1 ? "one fact" : `${remaining} facts`} from pitchable`}
          </p>
        </div>
        {ledger.total > 0 ? (
          <ProofBar met={ledger.met} total={ledger.total} />
        ) : null}
      </header>

      {ledger.total === 0 ? (
        <p className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          The analyzer did not record what a journalist would demand for this
          claim. That is a gap in the analysis, not a green light — treat the
          evidence below as unaudited and expect an editor to ask for more.
        </p>
      ) : null}

      {ledger.missing.length > 0 ? (
        <div className="px-3 py-2.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Still to gather
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {ledger.missing.map((item) => (
              <li
                key={item.key}
                className="group rounded-lg border border-dashed border-primary/35 bg-primary/[0.03] p-2.5"
              >
                <div className="flex items-start gap-2">
                  <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-snug text-foreground">
                      {item.label}
                    </p>
                    {item.detail ? (
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                        {item.detail}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {item.owner ? (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {item.owner}
                        </span>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setPending(item)}
                      >
                        <Check className="mr-1 h-3 w-3" />
                        I have this
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px] text-muted-foreground"
                        onClick={() => copyAsk(angle, item)}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        Copy the ask
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ledger.inHand.length > 0 ? (
        <div className="border-t border-border/60 px-3 py-2.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            In hand
          </h4>
          <ul className="mt-1.5 space-y-1">
            {ledger.inHand.map((item) => (
              <li key={item.key} className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-xs leading-snug text-foreground",
                      item.raw && "font-mono text-[11px] text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    {item.source ? <span>{item.source}</span> : null}
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-primary hover:underline"
                      >
                        source
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ledger.contradictions.length > 0 ? (
        <div className="border-t border-amber-500/30 bg-amber-500/[0.04] px-3 py-2.5">
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <Scale className="h-3.5 w-3.5" />
            A reporter will push back on this
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {ledger.contradictions.map((item) => (
              <li key={item.key}>
                <p className="text-xs font-medium leading-snug text-foreground">
                  {item.label}
                </p>
                {item.detail ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {item.detail}
                  </p>
                ) : null}
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                  >
                    open the page they will find
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <TextInputDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="Record the evidence"
        description={
          pending
            ? `Where does "${pending.label}" live, and what does it show? This becomes an evidence_refs entry on the angle and closes the gap.`
            : undefined
        }
        placeholder="e.g. Chain-of-custody audit PDF from Sterling Compliance, dated 12 Aug — covers the full Jan–Jun window."
        multiline
        rows={4}
        confirmLabel="Attach evidence"
        onConfirm={(note) => {
          if (!pending) return;
          onAttach({ label: pending.label, note });
          setPending(null);
        }}
      />
    </section>
  );
}

/** Progress, not deficit — filled segments in the brand colour, never red. */
function ProofBar({ met, total }: { met: number; total: number }) {
  return (
    <span
      className="flex shrink-0 items-center gap-1"
      aria-label={`${met} of ${total} proofs in hand`}
    >
      {Array.from({ length: Math.min(total, 8) }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 w-5 rounded-full",
            index < met ? "bg-primary" : "bg-primary/15",
          )}
        />
      ))}
    </span>
  );
}

/** The gap's one-click fix: a written ask, ready to send to whoever owns it. */
async function copyAsk(angle: StoryAngleRow, item: ProofItem): Promise<void> {
  const text = [
    `Subject: quick evidence request — "${angle.headline}"`,
    "",
    `We are preparing a press pitch built on this claim:`,
    `  ${angle.summary}`,
    "",
    `Before it goes to a journalist we need one thing:`,
    `  ${item.label}`,
    item.detail ? `  (${item.detail})` : "",
    "",
    item.owner
      ? `Flagged as yours (${item.owner}). If it sits somewhere else, point me at it and I will chase it.`
      : "If you know where this lives, point me at it and I will chase it.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await navigator.clipboard.writeText(text);
    toast.success("The ask is on your clipboard", {
      description: item.owner ? `Addressed to ${item.owner}.` : undefined,
    });
  } catch {
    toast.error("Could not reach the clipboard", {
      description:
        "Your browser blocked clipboard access. Select the text in the panel and copy it manually.",
    });
  }
}

/** Facts vs inferences — the analyzer's own separation, kept visible. */
export function FactsAndInferences({
  facts,
  inferences,
}: {
  facts: ProofItem[];
  inferences: ProofItem[];
}) {
  if (facts.length === 0 && inferences.length === 0) return null;
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <Column
        title="What we know"
        hint="Stated as fact, sourced."
        items={facts}
        icon={<Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
      />
      <Column
        title="What we inferred"
        hint="The analyzer's reading — challengeable."
        items={inferences}
        icon={<ScanSearch className="h-3.5 w-3.5 text-muted-foreground" />}
      />
    </section>
  );
}

function Column({
  title,
  hint,
  items,
  icon,
}: {
  title: string;
  hint: string;
  items: ProofItem[];
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <p className="text-[11px] text-muted-foreground/80">{hint}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing recorded here.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">{icon}</span>
              <div className="min-w-0">
                <p className="text-xs leading-snug text-foreground">{item.label}</p>
                {item.detail ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {item.detail}
                  </p>
                ) : null}
                {item.source ? (
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    {item.source}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
