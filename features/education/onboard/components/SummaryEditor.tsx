"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ContentEditor } from "@/components/official/content-editor/ContentEditor";
import { toast } from "@/lib/toast";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { studyMediaService } from "@/features/education/media/service";
import type { StudyMediaRow } from "@/features/education/media/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationSummariesScope } from "@/features/surfaces/manifests/education-summaries.manifest";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { parseCreateSummaries, parseSummaryIds, parseStudySummary, parseUpdateSummaries } from "../summaryWrites";

const SURFACE_NAME = "matrx-user/education-summaries";

type SummaryDraft = { title: string; summary_markdown: string; key_points: string[] };

function draftFrom(media?: StudyMediaRow): SummaryDraft {
  const envelope = media?.ir_envelope;
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { title: media?.title ?? "", summary_markdown: "", key_points: ["", "", ""] };
  }
  const value: Record<string, unknown> = envelope;
  return {
    title: media?.title ?? "",
    summary_markdown: typeof value.summary_markdown === "string" ? value.summary_markdown : typeof value.markdown === "string" ? value.markdown : "",
    key_points: Array.isArray(value.key_points) && value.key_points.every((point) => typeof point === "string")
      ? [...value.key_points]
      : ["", "", ""],
  };
}

export function SummaryEditor({ media, isOwner = false }: { media?: StudyMediaRow; isOwner?: boolean }) {
  const router = useRouter();
  const [currentMedia, setCurrentMedia] = useState(media);
  const [draft, setDraft] = useState<SummaryDraft>(() => draftFrom(media));
  const [baseRevision, setBaseRevision] = useState(media?.version);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = Boolean(currentMedia && isOwner);
  const draftKey = `study-summary-draft:${currentMedia?.id ?? "new"}`;
  const persistedDraft = draftFrom(currentMedia);
  const dirty = JSON.stringify(draft) !== JSON.stringify(persistedDraft);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      const stored = sessionStorage.getItem(draftKey);
      if (!active || !stored) return;
      try {
        const saved = JSON.parse(stored) as { draft?: SummaryDraft; baseRevision?: number };
        if (!saved.draft || typeof saved.draft.title !== "string" || typeof saved.draft.summary_markdown !== "string" || !Array.isArray(saved.draft.key_points)) throw new Error("Invalid draft");
        setDraft(saved.draft); setBaseRevision(saved.baseRevision); toast.info("Your unsaved summary was restored.");
      } catch { sessionStorage.removeItem(draftKey); }
    });
    return () => { active = false; };
  }, [draftKey]);
  useEffect(() => {
    if (!dirty) { sessionStorage.removeItem(draftKey); return; }
    sessionStorage.setItem(draftKey, JSON.stringify({ draft, baseRevision }));
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [baseRevision, draft, draftKey, dirty]);

  const scope = () => createEducationSummariesScope({
    view: currentMedia ? "detail" : "new",
    summary_id: currentMedia?.id,
    summary_title: draft.title || undefined,
    summary_markdown: draft.summary_markdown || undefined,
    key_points: draft.key_points,
  });
  const handlers = () => collectionWriteHandlers({
    plural: "summaries", singular: "summary",
    create: {
      parse: parseCreateSummaries,
      run: async (summary) => {
        const result = await studyMediaService.create({ mediaKind: "summary", title: summary.title, irEnvelope: summary, status: "ready" });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not create summary.");
        return { id: result.data.id, name: result.data.title };
      }, nameOf: (summary) => summary.title,
    },
    update: currentMedia ? {
      parse: (value) => { if (dirty || saving) throw new Error("Save or cancel your edits before applying agent changes."); return parseUpdateSummaries(value, [currentMedia]); },
      run: async (plan) => {
        const result = await studyMediaService.updateVersioned(plan.id, plan.version, { title: plan.summary.title, ir_envelope: plan.irEnvelope, trust: plan.trust });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not update summary.");
        setCurrentMedia(result.data);
        setDraft(draftFrom(result.data)); setBaseRevision(result.data.version); sessionStorage.removeItem(draftKey);
        return { id: result.data.id, name: result.data.title };
      }, nameOf: (plan) => plan.summary.title, changedOf: (plan) => plan.changed,
    } : undefined,
    delete: canDelete && currentMedia ? {
      parse: (value) => { if (dirty || saving) throw new Error("Save or cancel your edits before applying agent changes."); return parseSummaryIds(value, "delete_summaries", [currentMedia]).map(() => currentMedia); },
      run: async (row) => {
        const result = await studyMediaService.softDelete(row.id);
        if (result.error) throw new Error(result.error);
        router.push("/education/summaries");
        return { id: row.id, name: row.title };
      }, nameOf: (row) => row.title,
    } : undefined,
  }, refuseSurfaceWrite);

  async function save() {
    let summary;
    try { summary = parseStudySummary(draft); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "Check the summary.";
      setError(message);
      toast.error(message);
      return;
    }
    setSaving(true);
    setError(null);
    const updatePlan = currentMedia
      ? parseUpdateSummaries([{ id: currentMedia.id, expected_revision: baseRevision, ...draft }], [currentMedia])[0]
      : null;
    const result = currentMedia && updatePlan
      ? await studyMediaService.updateVersioned(currentMedia.id, currentMedia.version, { title: updatePlan.summary.title, ir_envelope: updatePlan.irEnvelope, trust: updatePlan.trust })
      : await studyMediaService.create({ mediaKind: "summary", title: summary.title, irEnvelope: summary, status: "ready" });
    setSaving(false);
    if (result.error || !result.data) {
      const message = result.error ?? "Could not save summary.";
      setError(message);
      toast.error(message);
      return;
    }
    sessionStorage.removeItem(draftKey);
    toast.success(currentMedia ? "Summary saved" : "Summary created");
    router.push(`/education/summaries/${result.data.id}`);
    router.refresh();
  }

  return <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={scope} getWriteHandlers={handlers}>
    <main className="mx-auto w-full max-w-4xl space-y-5 px-4 pb-20 pt-4">
      <div className="space-y-1"><Label htmlFor="summary-title">Title</Label><Input id="summary-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></div>
      <ContentEditor value={draft.summary_markdown} onChange={(summary_markdown) => setDraft((current) => ({ ...current, summary_markdown }))} title="Summary" initialMode="markdown" availableModes={["wysiwyg", "markdown", "preview"]} surfaceName={SURFACE_NAME} imagePolicy="ai" />
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div><h2 className="font-semibold">Key points</h2><p className="text-sm text-muted-foreground">Add concise takeaways when they help; they are optional for a manual summary.</p></div>
        {draft.key_points.map((point, index) => <div key={index} className="flex gap-2"><Input aria-label={`Key point ${index + 1}`} value={point} onChange={(event) => setDraft((current) => ({ ...current, key_points: current.key_points.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} /><Button type="button" size="icon" variant="ghost" aria-label={`Remove key point ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, key_points: current.key_points.filter((_, itemIndex) => itemIndex !== index) }))}><Minus className="h-4 w-4" /></Button></div>)}
        <Button type="button" variant="outline" size="sm" onClick={() => setDraft((current) => ({ ...current, key_points: [...current.key_points, ""] }))}><Plus className="mr-1 h-4 w-4" />Add key point</Button>
      </section>
      {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}<ErrorAlchemyMenu error={error} /></p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { sessionStorage.removeItem(draftKey); router.back(); }}>Cancel</Button><Button type="button" disabled={saving} onClick={() => { void save(); }}>{saving ? "Saving…" : currentMedia ? "Save changes" : "Create summary"}</Button></div>
    </main>
  </SurfaceRuntimeProvider>;
}
