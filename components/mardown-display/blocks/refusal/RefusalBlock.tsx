"use client";

/**
 * RefusalBlock — THE one renderer for the `refusal` kind.
 *
 * A desk that declines to produce until its frame holds. This screen is a
 * FINISHED RESULT, and it is drawn that way: the refusal in one plain
 * sentence, then the facts that are missing — each with why it matters and the
 * concrete move that would supply it — then whatever the desk can already say.
 *
 * Deliberately NOT drawn as a failure. No destructive red, no alert triangle,
 * no "something went wrong": nothing went wrong. The reader is the person who
 * holds the missing facts, and every line is addressed to them.
 *
 * Server half: `aidream/kinds/masterwork.py::Refusal`. Nothing here is
 * Masterwork-specific — every desk on the platform refuses in this shape.
 */

import { ArrowRight, HandHelping, Hand, Lightbulb } from "lucide-react";

import type {
  MissingFact,
  RefusalData,
} from "@/features/content-ir/kinds/refusal";

export interface RefusalBlockProps {
  serverData?: unknown;
}

function readData(serverData: unknown): RefusalData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<RefusalData>;
  if (typeof candidate.headline !== "string" || candidate.headline === "") {
    return null;
  }
  return {
    headline: candidate.headline,
    missing: Array.isArray(candidate.missing) ? candidate.missing : [],
    whatICanSayNow: candidate.whatICanSayNow ?? null,
    protocolFrame: candidate.protocolFrame ?? null,
    provenance: Array.isArray(candidate.provenance) ? candidate.provenance : [],
  };
}

/** One missing fact: the name, what it settles, and how to get it. */
function MissingFactRow({ item }: { item: MissingFact }) {
  return (
    <li className="rounded-md border border-border bg-muted/30 p-2.5">
      <p className="text-xs font-medium text-foreground">{item.fact}</p>
      {item.whyItMatters ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {item.whyItMatters}
        </p>
      ) : null}
      {item.howToGetIt ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-foreground">
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{item.howToGetIt}</span>
        </p>
      ) : null}
    </li>
  );
}

export function RefusalBlock({ serverData }: RefusalBlockProps) {
  const data = readData(serverData);
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Hand className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">{data.headline}</p>
          {data.protocolFrame ? (
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Not settled: {data.protocolFrame}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <HandHelping className="h-3.5 w-3.5 shrink-0 text-primary" />
          What I need before I can do this
        </p>
        {data.missing.length > 0 ? (
          <ul className="mt-1.5 space-y-1.5">
            {data.missing.map((item, index) => (
              <MissingFactRow
                key={`${index}-${item.fact.slice(0, 24)}`}
                item={item}
              />
            ))}
          </ul>
        ) : (
          // A refusal that names nothing is not actionable, and saying so is
          // the honest screen — never a blank space that reads as a bug.
          <p className="mt-1.5 text-xs text-muted-foreground">
            This refusal did not name what is missing, so there is nothing to
            act on yet. Ask the desk what it needs.
          </p>
        )}
      </div>

      {data.whatICanSayNow ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-primary" />
            What I can tell you already
          </p>
          <p className="mt-1 text-xs text-foreground">{data.whatICanSayNow}</p>
        </div>
      ) : null}

      {data.provenance.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Required by {data.provenance.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

export default RefusalBlock;
