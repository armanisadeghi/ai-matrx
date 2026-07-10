"use client";

// features/education/onboard/components/SummaryDetail.tsx
//
// Viewer for a grounded study summary (study_media, media_kind='summary').
// Renders the markdown + key points + the P0 TrustEnvelope citations, and
// offers Markdown export (data-ownership). Reads via studyMediaService (RLS).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { VerifyAgainstSourceButton } from "@/features/education/trust/components/VerifyAgainstSourceButton";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { studyMediaService } from "@/features/education/media/service";
import type { StudyMediaRow } from "@/features/education/media/types";
import { downloadTextFile } from "../export/download";

interface SummaryEnvelope {
  __kind?: string;
  title?: string;
  markdown?: string;
  key_points?: string[];
}

export function SummaryDetail({ id }: { id: string }) {
  const router = useRouter();
  const [row, setRow] = useState<StudyMediaRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await studyMediaService.getById(id);
      if (!alive) return;
      if (res.error || !res.data) setError(res.error ?? "Summary not found");
      else setRow(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (error || !row) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center text-sm text-muted-foreground">
        {error ?? "Summary not found"}
      </div>
    );
  }

  const env = (row.ir_envelope ?? {}) as SummaryEnvelope;
  const markdown = env.markdown ?? "";
  const keyPoints = Array.isArray(env.key_points) ? env.key_points : [];
  const trust = coerceTrustEnvelope(row.trust);

  const onExport = () => {
    const kp = keyPoints.length
      ? `\n\n## Key points\n${keyPoints.map((k) => `- ${k}`).join("\n")}`
      : "";
    downloadTextFile(`${row.title || "summary"}.md`, `# ${row.title}\n\n${markdown}${kp}`);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-foreground">
            {row.title}
          </h1>
          <div className="mt-0.5 flex items-center gap-2">
            <ConfidenceBadge confidence={trust?.confidence} />
            <span className="text-xs text-muted-foreground">Study summary</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4" /> Markdown
        </Button>
      </div>

      {keyPoints.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ListChecks className="h-4 w-4 text-primary" /> Key points
          </div>
          <ul className="space-y-1.5">
            {keyPoints.map((k, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground">
                <span className="text-primary">•</span>
                <span>{k}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="prose-sm max-w-none">
        <BasicMarkdownContent content={markdown} showCopyButton={false} />
      </div>

      {trust && trust.citations.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <SourceCitations trust={trust} label="Grounded in your material" />
          <VerifyAgainstSourceButton
            trust={trust}
            front={row.title}
            back={markdown || keyPoints.join("; ")}
          />
        </div>
      )}
    </div>
  );
}
