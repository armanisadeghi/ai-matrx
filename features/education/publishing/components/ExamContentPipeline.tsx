"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContentConverter } from "@/features/education/convert/useContentConverter";
import { EXAMS } from "@/features/education/data/exam-prep";
import { certifyDeckAction } from "@/features/education/library/actions";
import {
  EXAM_DECK_PLANS,
  groundingReady,
  type ExamDeckPlan,
} from "../examContentPipeline";
import { verifyGeneratedDeck } from "../verifyGeneratedDeck";
import {
  listLearnerOwnedGroundingSources,
  retrieveGroundedPassages,
  serializeGroundedPassages,
  type GroundingSource,
} from "@/features/rag/api/grounding";
import { fcService } from "@/features/flashcards/data/fcService";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";

type DraftStatus =
  "generating" | "verifying" | "ready" | "failed" | "published";

interface GeneratedDraft {
  plan: ExamDeckPlan;
  status: DraftStatus;
  setId?: string;
  href?: string;
  title?: string;
  verifiedCards?: number;
  totalCards?: number;
  error?: string;
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Content generation failed.";
}

/**
 * Super-admin launch tool for grounded exam-library drafts. It deliberately
 * separates generate → verify → publish/curate. The first two are automated;
 * the last is an explicit human action and still produces only an AI-built
 * starter (WP9's human verification transition remains separate).
 */
export function ExamContentPipeline() {
  const { convert } = useContentConverter();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [examSlug, setExamSlug] = useState(EXAMS[0]?.slug ?? "");
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sourceQuery, setSourceQuery] = useState("");
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [drafts, setDrafts] = useState<GeneratedDraft[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadSources() {
      setLoadingSources(true);
      setSourceError(null);
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !user) {
        setSourceError(error?.message ?? "Sign in to load grounded sources.");
        setLoadingSources(false);
        return;
      }
      try {
        const next = await listLearnerOwnedGroundingSources(user.id);
        if (!cancelled) setSources(next);
      } catch (loadError) {
        if (!cancelled) setSourceError(messageFor(loadError));
      } finally {
        if (!cancelled) setLoadingSources(false);
      }
    }
    void loadSources();
    return () => {
      cancelled = true;
    };
  }, []);

  const exam = EXAMS.find((entry) => entry.slug === examSlug) ?? EXAMS[0];
  const shownSources = sources.filter((source) => {
    const needle = sourceQuery.trim().toLowerCase();
    return !needle || source.title.toLowerCase().includes(needle);
  });
  const selectedSources = sources.filter((source) =>
    selected.has(`${source.sourceKind}:${source.sourceId}`),
  );

  function patchDraft(plan: ExamDeckPlan, patch: Partial<GeneratedDraft>) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.plan.key === plan.key ? { ...draft, ...patch } : draft,
      ),
    );
  }

  async function generate() {
    if (!exam || selectedSources.length === 0 || running) return;
    setRunning(true);
    setDrafts(EXAM_DECK_PLANS.map((plan) => ({ plan, status: "generating" })));

    for (const plan of EXAM_DECK_PLANS) {
      try {
        const retrieval = await retrieveGroundedPassages({
          query: `${exam.name}: ${plan.label}. ${plan.focus}`,
          corpus: { mode: "explicit", sources: selectedSources },
          limit: 12,
        });
        const readiness = groundingReady(retrieval);
        if (!readiness.ok) throw new Error(readiness.reason);

        const result = await convert({
          source: {
            title: `${exam.name} — ${plan.label}`,
            text: serializeGroundedPassages(retrieval.passages),
          },
          targetKind: "deck",
          options: {
            count: 15,
            difficulty: plan.difficulty,
            focus: plan.focus,
          },
        });

        const tagged = await fcService.mergeSetMetadata(
          result.artifactId,
          (current) => ({
            ...current,
            exam_slug: exam.slug,
            curated: true,
            content_status: "draft",
            generation_pipeline: "education-grounded-content-v1",
            grounding_chunk_ids: readiness.chunkIds,
          }),
        );
        if (tagged.error) throw new Error(tagged.error);

        patchDraft(plan, {
          status: "verifying",
          setId: result.artifactId,
          href: result.href,
          title: result.title,
          verifiedCards: 0,
        });
        const verification = await verifyGeneratedDeck(
          result.artifactId,
          readiness.chunkIds,
          dispatch,
          store,
          (completed, total) =>
            patchDraft(plan, { verifiedCards: completed, totalCards: total }),
        );
        if (!verification.ready) {
          const failed = verification.cards.filter(
            (card) => card.verdict.status !== "verified",
          );
          throw new Error(
            `${failed.length} card${failed.length === 1 ? "" : "s"} failed source verification. Open the draft to correct or remove them.`,
          );
        }
        patchDraft(plan, {
          status: "ready",
          verifiedCards: verification.cards.length,
          totalCards: verification.cards.length,
        });
      } catch (error) {
        patchDraft(plan, { status: "failed", error: messageFor(error) });
      }
    }
    setRunning(false);
  }

  async function publish(draft: GeneratedDraft) {
    if (!draft.setId || draft.status !== "ready") return;
    patchDraft(draft.plan, { status: "verifying", error: undefined });
    try {
      const visible = await fcService.updateSetVisibility(
        draft.setId,
        "public",
      );
      if (visible.error) throw new Error(visible.error);
      await certifyDeckAction(
        draft.setId,
        "Grounded against the recorded official-source passages and passed the automated source-verification mandate. AI-built starter; not human verified.",
      );
      const tagged = await fcService.mergeSetMetadata(
        draft.setId,
        (current) => ({
          ...current,
          content_status: "published_ai_starter",
        }),
      );
      if (tagged.error) throw new Error(tagged.error);
      patchDraft(draft.plan, { status: "published" });
    } catch (error) {
      patchDraft(draft.plan, { status: "failed", error: messageFor(error) });
    }
  }

  return (
    <section className="mx-auto mt-10 max-w-6xl rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <BookOpenCheck className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold">
            Grounded exam content pipeline
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select processed official sources. The pipeline retrieves exact
            passages, creates three private deck drafts through the canonical
            mandate, and verifies every card against its citation. Publishing
            remains a separate review action and labels the result as an
            AI-built starter.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content-exam">Exam</Label>
            <Select
              value={examSlug}
              onValueChange={setExamSlug}
              disabled={running}
            >
              <SelectTrigger id="content-exam" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXAMS.map((entry) => (
                  <SelectItem key={entry.slug} value={entry.slug}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="min-h-11 w-full"
            onClick={() => void generate()}
            disabled={running || !exam || selectedSources.length === 0}
          >
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Generate and verify 3 drafts
          </Button>
          <p className="text-xs text-muted-foreground">
            {selectedSources.length} source
            {selectedSources.length === 1 ? "" : "s"} selected
          </p>
        </div>

        <div>
          <Label htmlFor="content-source-search">
            Processed official sources
          </Label>
          <Input
            id="content-source-search"
            className="mt-2 min-h-11"
            value={sourceQuery}
            onChange={(event) => setSourceQuery(event.target.value)}
            placeholder="Filter source titles"
          />
          <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border p-2">
            {loadingSources ? (
              <p className="p-3 text-sm text-muted-foreground">
                Loading sources…
              </p>
            ) : sourceError ? (
              <p className="p-3 text-sm text-destructive">{sourceError}</p>
            ) : shownSources.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No matching processed sources. Add the official material through
                the existing Files or Notes “Process for RAG” action first.
              </p>
            ) : (
              shownSources.map((source) => {
                const key = `${source.sourceKind}:${source.sourceId}`;
                return (
                  <label
                    key={key}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      disabled={running}
                      onChange={(event) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(key);
                          else next.delete(key);
                          return next;
                        });
                      }}
                      className="h-5 w-5"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {source.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {source.sourceKind}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>

      {drafts.length > 0 ? (
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {drafts.map((draft) => (
            <article key={draft.plan.key} className="rounded-lg border p-4">
              <h3 className="font-medium">{draft.title ?? draft.plan.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {draft.status === "generating"
                  ? "Generating from retrieved passages…"
                  : null}
                {draft.status === "verifying"
                  ? `Verifying ${draft.verifiedCards ?? 0}/${draft.totalCards ?? "…"} cards…`
                  : null}
                {draft.status === "ready"
                  ? "Every card passed source verification."
                  : null}
                {draft.status === "published"
                  ? "Public AI-built starter."
                  : null}
              </p>
              {draft.error ? (
                <p className="mt-3 flex gap-2 text-xs text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  {draft.error}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {draft.href ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                  >
                    <Link href={draft.href} target="_blank">
                      Open draft
                    </Link>
                  </Button>
                ) : null}
                {draft.status === "ready" ? (
                  <Button
                    size="sm"
                    className="min-h-11"
                    onClick={() => void publish(draft)}
                  >
                    Publish as AI-built starter
                  </Button>
                ) : null}
                {draft.status === "published" ? (
                  <span className="inline-flex min-h-11 items-center gap-2 text-xs text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Published
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
