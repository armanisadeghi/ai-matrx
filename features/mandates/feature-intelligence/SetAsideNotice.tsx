"use client";

// features/mandates/feature-intelligence/SetAsideNotice.tsx
//
// WHEN A CHOICE IS SET ASIDE, SAY WHY — AND OFFER THE FIX (nothing fails
// silently). A person or an organization chose an agent whose output does not
// fit the job; the ladder set that choice aside and the level below runs
// instead. The card used to say only "Override set aside". This names, in one
// plain line, what the chosen agent returns and what the job expects, and puts
// the two remedies beside it: pick another agent or workflow, or fix it with AI
// (a registered promise until it is built).

import { useEffect, useState } from "react";
import { TriangleAlert, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { declaredOutputKind } from "../contract-check";
import { kindPhrase } from "../provision-shapes";
import type { MandateLadderRow } from "../workspace/useMandateLadder";
import { RUNG_LABEL } from "./job-card-parts";

interface HolderFacts {
  name: string;
  returns: string;
}

function outputWords(outputSchema: unknown): string {
  if (outputSchema == null) return "plain text";
  const kind = declaredOutputKind(outputSchema);
  if (kind) return kindPhrase(kind).replace(/^an? /, "");
  return "a different structure";
}

function useHolderFacts(row: MandateLadderRow | null): HolderFacts | null {
  const [facts, setFacts] = useState<HolderFacts | null>(null);
  const holderId = row?.holder_id ?? null;
  const versionId = row?.holder_version_id ?? null;
  useEffect(() => {
    if (!holderId) return;
    let live = true;
    const client = createClient();
    void (async () => {
      const { data: agent } = await client
        .schema("agent")
        .from("definition")
        .select("name, output_schema")
        .eq("id", holderId)
        .maybeSingle();
      let schema: unknown = agent?.output_schema ?? null;
      if (versionId) {
        const { data: version } = await client
          .schema("agent")
          .from("definition_version")
          .select("output_schema")
          .eq("id", versionId)
          .maybeSingle();
        if (version) schema = version.output_schema ?? null;
      }
      if (live) setFacts({ name: agent?.name ?? "The chosen agent", returns: outputWords(schema) });
    })();
    return () => {
      live = false;
    };
  }, [holderId, versionId]);
  return facts;
}

/** The rung whose chosen agent was set aside for its output, if any. */
export function setAsideRung(rows: readonly MandateLadderRow[]): MandateLadderRow | null {
  return (
    rows.find((row) => row.rung !== "system" && row.chose_holder && row.dropped_code === "output_contract_unmet") ??
    null
  );
}

export function SetAsideNotice({
  rung,
  expects,
  runsInstead,
  onPickAnother,
}: {
  rung: MandateLadderRow;
  /** What the job expects, in words ("flashcards"). */
  expects: string;
  /** Who runs instead. */
  runsInstead: string;
  onPickAnother: () => void;
}) {
  const facts = useHolderFacts(rung);
  const who = rung.rung === "org" ? "Your organization's choice" : rung.rung === "user" ? "Your choice" : RUNG_LABEL[rung.rung];
  const sentence = facts
    ? `${facts.name} returns ${facts.returns}; this job expects ${expects}. ${who} is set aside — ${runsInstead} runs instead.`
    : `${who} does not return the ${expects} this job expects, so it is set aside — ${runsInstead} runs instead.`;
  return (
    <div
      role="status"
      data-set-aside-notice
      className="flex min-w-0 flex-col gap-2 border-t border-amber-500/30 bg-amber-500/5 px-3 py-2 sm:flex-row sm:items-center"
      onClick={(event) => event.stopPropagation()}
    >
      <p className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-amber-800 dark:text-amber-200">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate" title={`${sentence}${rung.dropped_reason ? `\n\n${rung.dropped_reason}` : ""}`}>
          {sentence}
        </span>
      </p>
      <span className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onPickAnother}>
          Pick another
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => void announceComingSoon("mandates.fix-output-mismatch-with-ai")}
        >
          <Wand2 className="mr-1 h-3.5 w-3.5" />
          Fix with AI
          <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">Soon</span>
        </Button>
      </span>
    </div>
  );
}
