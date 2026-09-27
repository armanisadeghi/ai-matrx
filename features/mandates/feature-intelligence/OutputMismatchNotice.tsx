"use client";

// features/mandates/feature-intelligence/OutputMismatchNotice.tsx
//
// WHEN A CHOICE MAY NOT FIT, SAY SO — AND OFFER THE FIX. Validation offers,
// never blocks (common-docs/policies/validation-offers-never-blocks.md): a
// person or an organization chose an agent whose declared output lacks keys
// the job expects. Since aidream 1363 that choice is NEVER set aside — it
// decides and it runs, and the ladder carries `output_warning` on that rung.
// This names, in one plain line, that the choice runs anyway, what the chosen
// agent returns and what the job expects, and puts the two remedies beside it:
// pick another agent or workflow, or fix it with AI (a registered promise until
// it is built). Amber, never red: it is a warning on a choice that runs.

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

function carriesOutputWarning(row: MandateLadderRow): boolean {
  return Boolean(row.output_warning) || (row.output_missing_keys?.length ?? 0) > 0;
}

/**
 * The person's or organization's choice that DECIDES this job and carries the
 * door's output warning, if any. The deciding rung is the highest one (user,
 * then org) that is enabled, chose a holder, and was not dropped. A warning on
 * a rung that does not decide is not what runs, so it is not shown here; the
 * system default's warning is spoken by the job's own health, not this line.
 */
export function outputMismatchRung(rows: readonly MandateLadderRow[]): MandateLadderRow | null {
  for (const rung of ["user", "org"] as const) {
    const row = rows.find((r) => r.rung === rung);
    if (!row || !row.is_enabled || !row.chose_holder) continue;
    if (typeof row.dropped_code === "string" && row.dropped_code.length > 0) continue;
    return carriesOutputWarning(row) ? row : null;
  }
  return null;
}

export function OutputMismatchNotice({
  rung,
  expects,
  onPickAnother,
}: {
  rung: MandateLadderRow;
  /** What the job expects, in words ("flashcards"). */
  expects: string;
  onPickAnother: () => void;
}) {
  const facts = useHolderFacts(rung);
  const who = rung.rung === "org" ? "Your organization's choice" : rung.rung === "user" ? "Your choice" : RUNG_LABEL[rung.rung];
  const keys = rung.output_missing_keys?.length ? ` (missing ${rung.output_missing_keys.join(", ")})` : "";
  const sentence = facts
    ? `${who} runs anyway; its output may not fit. ${facts.name} returns ${facts.returns}; this job expects ${expects}.`
    : `${who} runs anyway; its output may not fit. It does not declare the ${expects} this job expects${keys}.`;
  return (
    <div
      role="status"
      data-output-mismatch-notice
      className="flex min-w-0 flex-col gap-2 border-t border-amber-500/30 bg-amber-500/5 px-3 py-2 sm:flex-row sm:items-center"
      onClick={(event) => event.stopPropagation()}
    >
      <p className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-amber-800 dark:text-amber-200">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate" title={`${sentence}${rung.output_warning ? `\n\n${rung.output_warning}` : ""}`}>
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
