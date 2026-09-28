"use client";

// features/education/onboard/components/SummaryDetail.tsx
//
// Viewer for a grounded study summary (study_media, media_kind='summary').
// Renders the markdown + key points + the P0 TrustEnvelope citations, and
// offers Markdown export (data-ownership). Reads via studyMediaService (RLS).
//
// The body renders through MarkdownStream — the kind-aware rich-document
// engine (already code-split, ssr:false, via its shell) — NOT the kind-blind
// BasicMarkdownContent. Summary agents emit real markdown that can carry
// `__kind` fenced blocks (flashcard_set, diagram_spec, tables, mermaid, …);
// this is the education-side half of the Content IR integration (Lane C).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, ListChecks, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import MarkdownStream from "@/components/MarkdownStream";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { VerifyAgainstSourceButton } from "@/features/education/trust/components/VerifyAgainstSourceButton";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { MadeFromSource } from "@/features/education/convert/MadeFromSource";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { studyMediaService } from "@/features/education/media/service";
import type { StudyMediaRow } from "@/features/education/media/types";
import { downloadTextFile } from "../export/download";
import { ContentFindControl } from "@/features/rich-document/search/ContentFindControl";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationSummariesScope } from "@/features/surfaces/manifests/education-summaries.manifest";
import { useAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useStudyMediaAuthReady } from "@/features/education/media/authLoad";
import { SummaryEditor } from "./SummaryEditor";

interface SummaryEnvelope {
  __kind?: string;
  title?: string;
  trust?: unknown;
  /** Registered `study_summary` kind field (2026-08-25 on). */
  summary_markdown?: string;
  /** Pre-registration fabricated-envelope spelling — old rows only. */
  markdown?: string;
  key_points?: string[];
}

export function SummaryDetail({ id, edit = false }: { id: string; edit?: boolean }) {
  const router = useRouter();
  const [row, setRow] = useState<StudyMediaRow | null>(null);
  // The raw failure, never a sentence — the gate decides what it means.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const access = useAccess("study_media", id);
  const canEdit = !access.loading && canEditAccess(access.level);
  const authReady = useStudyMediaAuthReady();

  useEffect(() => {
    if (!authReady) return undefined;
    let alive = true;
    (async () => {
      setLoading(true);
      const res = await studyMediaService.getById(id);
      if (!alive) return;
      if (res.error || !res.data) {
        setLoadError(res.error ?? null);
        setRow(null);
      } else {
        setLoadError(null);
        setRow(res.data);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [id, reloadKey, authReady]);

  if (loading) {
    return (
      <SurfaceRuntimeProvider
        surfaceName="matrx-user/education-summaries"
        getScope={() => createEducationSummariesScope({ view: "detail", summary_loading: true })}
      >
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </SurfaceRuntimeProvider>
    );
  }
  if (!row) {
    // Denied / deleted / never existed / signed-out all read as zero rows here.
    return (
      <SurfaceRuntimeProvider
        surfaceName="matrx-user/education-summaries"
        getScope={() => createEducationSummariesScope({ view: "detail", summary_not_found: true })}
      >
        <AccessGate
          token="study_media"
          id={id}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          // The summaries library — a real index route since 2026-08-20, so the
          // way forward is the tool the learner was already in, not the hub.
          fallbackHref="/education/summaries"
          fallbackLabel="Study Summaries"
        />
      </SurfaceRuntimeProvider>
    );
  }

  if (edit) return <SummaryEditor media={row} isOwner={access.isOwner} />;

  const env = (row.ir_envelope ?? {}) as SummaryEnvelope;
  const markdown = env.summary_markdown ?? env.markdown ?? "";
  const keyPoints = Array.isArray(env.key_points) ? env.key_points : [];
  const trust = coerceTrustEnvelope(env.trust ?? row.trust);

  const onExport = () => {
    const kp = keyPoints.length
      ? `\n\n## Key points\n${keyPoints.map((k) => `- ${k}`).join("\n")}`
      : "";
    downloadTextFile(`${row.title || "summary"}.md`, `# ${row.title}\n\n${markdown}${kp}`);
  };
  const onDelete = async () => {
    if (!access.isOwner) return;
    const accepted = await confirm({ title: "Delete this summary?", description: "It will be removed from your summary library. This cannot be undone.", confirmLabel: "Delete summary", variant: "destructive" });
    if (!accepted) return;
    const result = await studyMediaService.softDelete(row.id);
    if (result.error) { toast.error(result.error); return; }
    toast.success("Summary deleted");
    router.push("/education/summaries");
  };

  const getScope = () =>
    createEducationSummariesScope({
      view: "detail",
      summary_id: row.id,
      summary_title: row.title,
      summary_source_title: row.source_title ?? undefined,
      summary_markdown: markdown || undefined,
      key_points: keyPoints,
      trust_confidence: trust?.confidence,
      trust_grounded_in: trust?.groundedIn,
      trust_citation_count: trust?.citations.length,
      trust_citations: trust?.citations.map((c) => ({
        sourceId: c.sourceId,
        sourceKind: c.sourceKind,
        title: c.title ?? null,
        excerpt: c.excerpt ?? null,
      })),
    });

  return (
    <SurfaceRuntimeProvider surfaceName="matrx-user/education-summaries" getScope={getScope}>
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
        <ContentFindControl rootRef={contentRef} label="Find in summary" />
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4" /> Markdown
        </Button>
        {canEdit ? <Button variant="outline" size="sm" onClick={() => router.push(`/education/summaries/${row.id}/edit`)}><Pencil className="h-4 w-4" />Edit</Button> : null}
        {access.isOwner ? <Button variant="outline" size="icon" onClick={() => { void onDelete(); }} aria-label="Delete summary"><Trash2 className="h-4 w-4" /></Button> : null}
      </div>

      <div ref={contentRef} className="space-y-5">
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
        <MarkdownStream imagePolicy="ai" content={markdown} hideCopyButton />
      </div>
      </div>

      {/* Where this came from + the rest of the kit made from the same upload. */}
      <MadeFromSource entityType="study_media" entityId={row.id} />

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
    </SurfaceRuntimeProvider>
  );
}
