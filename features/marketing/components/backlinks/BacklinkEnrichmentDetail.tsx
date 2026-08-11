"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  humanizeAssessmentValue,
  jsonRecord,
  parseBacklinkAssessment,
} from "@/features/marketing/components/backlinks/lib/enrichment";
import type { BacklinkObservationRow } from "@/features/marketing/data/backlinks-types";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";

function fact(label: string, value: ReactNode) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-xs text-foreground">
        {value === null || value === undefined || value === "" ? "—" : value}
      </div>
    </div>
  );
}

export function BacklinkEnrichmentDetail({
  row,
  sitePath,
  onSaved,
}: {
  row: BacklinkObservationRow;
  sitePath: string;
  onSaved: () => void;
}) {
  const assessment = parseBacklinkAssessment(row.resolved_assessment);
  const capture = jsonRecord(row.source_capture);
  const existingHuman = jsonRecord(row.human_ruling);
  const [verdict, setVerdict] = useState(
    typeof existingHuman.verdict === "string"
      ? existingHuman.verdict
      : "confirmed",
  );
  const [note, setNote] = useState(
    typeof existingHuman.note === "string" ? existingHuman.note : "",
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const response = await supabase
        .schema("seo")
        .rpc("update_backlink_human_ruling", {
          p_backlink_id: row.id,
          p_ruling: { verdict, note: note.trim() } as Json,
        });
      if (response.error) throw response.error;
      toast.success("Human backlink ruling saved.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <a
          href={row.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Open source page <ExternalLink className="h-3 w-3" />
        </a>
        {row.page_id ? (
          <Link
            href={`${sitePath}/pages/${row.page_id}`}
            className="font-medium text-primary hover:underline"
          >
            Open target page
          </Link>
        ) : (
          <a
            href={row.target_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            Open target <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {fact("Enrichment", humanizeAssessmentValue(row.enrichment_status))}
        {fact("Our score", assessment.overallScore)}
        {fact(
          "Relevance",
          `${humanizeAssessmentValue(assessment.relevanceVerdict)}${assessment.relevanceScore === null ? "" : ` · ${assessment.relevanceScore}`}`,
        )}
        {fact("Source type", humanizeAssessmentValue(assessment.pageType))}
        {fact(
          "Can you change it?",
          humanizeAssessmentValue(assessment.controlLevel),
        )}
        {fact(
          "Editorial nature",
          humanizeAssessmentValue(assessment.editorialKind),
        )}
        {fact(
          "Anchor quality",
          humanizeAssessmentValue(assessment.anchorVerdict),
        )}
        {fact("Risk", humanizeAssessmentValue(assessment.riskVerdict))}
      </div>

      {assessment.pageSummary ? (
        <section className="mt-3 rounded-md border border-border/60 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            What the source page is about
          </p>
          <p className="mt-1 text-sm text-foreground">
            {assessment.pageSummary}
          </p>
          {assessment.topics.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {assessment.topics.join(" · ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          Recommended next step · {humanizeAssessmentValue(assessment.priority)}{" "}
          priority
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {humanizeAssessmentValue(assessment.action)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {assessment.actionReason ?? "Capture and analysis are still pending."}
        </p>
      </section>

      {typeof capture.content_excerpt === "string" &&
      capture.content_excerpt ? (
        <details className="mt-3 rounded-md border border-border/60 p-3">
          <summary className="cursor-pointer text-xs font-medium text-foreground">
            Captured source-page text
          </summary>
          <pre className="mt-2 max-h-64 whitespace-pre-wrap overflow-auto text-[11px] leading-5 text-muted-foreground">
            {capture.content_excerpt}
          </pre>
        </details>
      ) : null}

      <section className="mt-3 rounded-md border border-border p-3">
        <p className="text-xs font-semibold text-foreground">Your ruling</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Confirm the assessment, flag a needed change, or dismiss it. Your
          judgment stays separate from provider and AI evidence.
        </p>
        <select
          value={verdict}
          onChange={(event) => setVerdict(event.target.value)}
          className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="confirmed">Confirm assessment</option>
          <option value="needs_change">Needs correction</option>
          <option value="dismissed">Dismiss action</option>
        </select>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional context only your team knows…"
          className="mt-2 min-h-20 text-xs"
        />
        <Button
          size="sm"
          className="mt-2"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save ruling
        </Button>
      </section>
    </div>
  );
}
