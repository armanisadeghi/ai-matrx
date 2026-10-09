"use client";

// features/education/classes/components/MakePracticeTestButton.tsx
//
// "Make a practice test" on a test page. The sources are every file, source
// document and note filed in the units the test covers (deduped, already
// picked on the ONE Source input — the person can drop or add). The questions
// come from the same generator as every quiz (`generateQuestionsFromSources`),
// are saved as a new practice test, and are filed under the test and the
// class. The run lives in this tab (`useTabBoundRun`): a reload is reported
// and repeatable. Entitlement and COPPA gates apply like every generator.
//
// React Compiler is on: no manual useMemo / useCallback.

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { ClampedNumberInput } from "@/components/official/ClampedNumberInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { recordLineageForSources } from "@/features/education/convert/recordSourceLineage";
import { announceLineage } from "@/features/education/convert/announceLineage";
import { newBatchId, type GenerationSteer } from "@/features/education/convert/steering";
import type { ConvertProgress } from "@/features/education/convert/types";
import { emptyRunMessage } from "@/features/education/convert/segmentedGenerate";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { useSourceSet } from "@/features/resource-manager/source-input/useSourceSet";
import { ALL_SOURCE_KIND_IDS } from "@/features/resource-manager/source-input/sourceKinds";
import { createSourceRef } from "@ai-matrx/agents/sources";
import type { SourceDraft, SourceKindId } from "@ai-matrx/agents/sources/runtime";
import { sourceNamesOf } from "@/features/flashcards/data/deckSourceSet";
import {
  FLASHCARD_SOURCE_DELIVERIES,
  backfillFileIds,
  lineageSourceOf,
} from "@/features/flashcards/data/generateDeckFromSources";
import { useTabBoundRun, type TabBoundRun } from "@/lib/wizard-draft/useTabBoundRun";
import { associationsService } from "@/features/scopes/service/associationsService";
import { assessmentService } from "@/features/education/assessment/data/assessmentService";
import { generateQuestionsFromSources } from "@/features/education/assessment/data/generateQuestionsFromSources";
import {
  questionRunRequest,
  restoreQuestionRunRequest,
  type QuestionRunRequest,
} from "@/features/education/assessment/data/questionRunRequest";
import { PRACTICE_TEST_CONFIG } from "@/features/education/assessment/components/kindConfig";
import type { ClassContentItem } from "../types";
import type { ClassTest } from "../classTests";

const config = PRACTICE_TEST_CONFIG;
const TOPUP_KINDS: readonly SourceKindId[] = ALL_SOURCE_KIND_IDS.filter((k) => k !== "topic");
const FOCUS_MAX = 2000;

const questionCount = (n: number) => `${n} ${n === 1 ? "question" : "questions"}`;

/** The tab-bound run key for one test's practice test. */
export function classTestRunKey(testId: string): string {
  return `class-test:practice-test:${testId}`;
}

/** A unit's file / source document / note as a ready Source draft. */
export function draftFromItem(item: ClassContentItem): SourceDraft | null {
  const label = item.title;
  switch (item.token) {
    case "file":
      return { kind: "files", label, ref: createSourceRef("file", item.entityId), fileId: item.entityId };
    case "processed_document":
      return {
        kind: "your_sources",
        label,
        ref: createSourceRef("processed_document", item.entityId),
        processedDocumentId: item.entityId,
      };
    case "note":
      return { kind: "notes", label, ref: createSourceRef("note", item.entityId) };
    default:
      return null;
  }
}

export function MakePracticeTestButton({
  cls,
  test,
  sources,
  onMade,
}: {
  cls: { id: string; organizationId: string | null };
  test: ClassTest;
  /** Everything filed in the covered units that can be a source (deduped). */
  sources: readonly ClassContentItem[];
  onMade: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tabRun = useTabBoundRun(classTestRunKey(test.id), restoreQuestionRunRequest);
  const [redo, setRedo] = useState<QuestionRunRequest | null>(null);
  const stopped = tabRun.stopped;
  const retry = () => {
    if (!stopped) return;
    setRedo(stopped.request);
    setOpen(true);
    tabRun.dismiss();
  };
  return (
    <>
      <Button type="button" variant="primary" icon={<Sparkles />} onClick={() => (stopped && !stopped.whileSaving ? retry() : setOpen(true))}>
        Make a practice test
      </Button>
      {stopped ? (
        <p role="status" className="basis-full text-xs text-muted-foreground">
          {stopped.whileSaving
            ? `The page closed while saving ${questionCount(stopped.request.count)}. Check the list below.`
            : `Making ${questionCount(stopped.request.count)} stopped when the page closed.`}{" "}
          {stopped.whileSaving ? (
            <button type="button" className="underline" onClick={() => tabRun.dismiss()}>
              Dismiss
            </button>
          ) : (
            <button type="button" className="underline" onClick={retry}>
              Try again
            </button>
          )}
        </p>
      ) : null}
      {open ? (
        <MakePracticeTestDialog
          cls={cls}
          test={test}
          sources={sources}
          tabRun={tabRun}
          redo={redo}
          onClose={() => {
            setOpen(false);
            setRedo(null);
          }}
          onMade={onMade}
        />
      ) : null}
    </>
  );
}

function MakePracticeTestDialog({
  cls,
  test,
  sources,
  tabRun,
  redo,
  onClose,
  onMade,
}: {
  cls: { id: string; organizationId: string | null };
  test: ClassTest;
  sources: readonly ClassContentItem[];
  tabRun: TabBoundRun<QuestionRunRequest>;
  redo: QuestionRunRequest | null;
  onClose: () => void;
  onMade: () => void;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const surfaceKey = classTestRunKey(test.id);
  const set = useSourceSet(surfaceKey);
  const generation = useEntitlementGuard(config.capability);
  const coppa = useAiComplianceGate();

  const [count, setCount] = useState(config.defaultCount);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed once: the stopped run's own request, else every source in the units.
  const seeded = useRef(false);
  const seed = useEffectEvent(() => {
    if (seeded.current) return;
    seeded.current = true;
    for (const s of set.sources) set.remove(s.id);
    if (redo) {
      for (const draft of redo.drafts) set.addReady(draft);
      setCount(redo.count);
      setFocus(redo.instruction);
      return;
    }
    for (const item of sources) {
      const draft = draftFromItem(item);
      if (draft?.ref && !set.hasRef(draft.ref.resource_type, draft.ref.resource_id)) set.addReady(draft);
    }
  });
  useEffect(() => {
    seed();
  }, []);

  const ready = set.sources.filter((s) => s.status === "ready" && s.draft.ref);
  const landing = set.sources.filter((s) => s.status === "pending" || s.status === "resolving");
  const safeCount = Math.min(config.countMax, Math.max(1, count || config.defaultCount));
  const plannedCount = ready.length > 1 ? Math.max(safeCount, ready.length) : safeCount;

  const blocked = landing.length
    ? "Wait until your new source has finished adding."
    : ready.length === 0
      ? "Pick at least one source."
      : null;

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const orgId = await ensureOrgId(cls.organizationId);
      setStatus(`Reading ${ready.length} ${ready.length === 1 ? "source" : "sources"}…`);
      const chosen = set.toSourceSet();
      const chosenNames = sourceNamesOf(set.sources);
      const steer: GenerationSteer = { instruction: focus.trim(), questionTypes: [] };
      await tabRun.track(
        questionRunRequest(plannedCount, focus, [], chosen, chosenNames),
        async (settle, saving) => {
          const resolved = await backfillFileIds(await set.resolve());
          if (resolved.dropped.length) {
            toast.info(
              resolved.dropped
                .map((d) => d.detail ?? `One source was left out (${d.reason.replace("_", " ")}).`)
                .join(" "),
            );
          }
          setStatus(`Making ${questionCount(plannedCount)}…`);
          const made = await generateQuestionsFromSources({
            resolved,
            count: safeCount,
            difficulty: "Medium",
            depth: "exam",
            title: test.name,
            steer,
            batchId: newBatchId(),
            targetKind: config.kind,
            surfaceKey: "education-class-test-practice-test",
            ctx: {
              dispatch,
              store,
              orgId,
              onProgress: (p: ConvertProgress) =>
                setStatus(
                  p.total > 1
                    ? `Making ${questionCount(plannedCount)} — part ${Math.min(p.done + 1, p.total)} of ${p.total}…`
                    : `Making ${questionCount(plannedCount)}…`,
                ),
            },
          });
          if (made.questions.length === 0) {
            throw new Error(
              emptyRunMessage(
                made,
                "questions",
                made.gapNote ?? "Nothing came out of this material. Add other material or change the focus.",
              ),
            );
          }
          setStatus("Saving your practice test…");
          await saving();
          const created = await assessmentService.createWithItems(
            {
              assessmentKind: config.kind,
              title: `${test.name} practice test`,
              description: made.agentDescription,
              status: "ready",
              depth: "exam",
              timeLimitSeconds: 1200,
              orgId,
              metadata: { class_id: cls.id, test_id: test.id, unit_ids: test.unitIds },
            },
            made.questions,
          );
          if (created.error || !created.data) throw new Error(created.error ?? "The practice test could not be saved.");
          settle();
          const assessment = created.data.assessment;
          // Filed under the test and the class (plain edges, like any filed item).
          const filed = await Promise.all(
            [test.id, cls.id].map((targetId) =>
              associationsService.add({
                sourceType: "assessment",
                sourceId: assessment.id,
                targetType: "scope",
                targetId,
                orgId,
              }),
            ),
          );
          const refused = filed.find((r) => !r.ok);
          if (refused && !refused.ok) {
            toast.error(`The practice test was made but could not be filed under ${test.name}: ${refused.error.message}`);
          }
          const result = {
            targetKind: config.kind,
            artifactId: assessment.id,
            resourceType: "assessment",
            href: `/education/${config.base}/${assessment.id}`,
            title: assessment.title,
            detail: questionCount(made.questions.length),
          };
          const linkSources = made.sources.map(lineageSourceOf);
          announceLineage(
            await recordLineageForSources(result, linkSources, orgId),
            () => recordLineageForSources(result, linkSources, orgId),
          );
          await generation.commit();
          toast.success(`Made ${assessment.title} with ${questionCount(made.questions.length)}.`);
          for (const s of set.sources) set.remove(s.id);
          onMade();
          onClose();
        },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "The practice test could not be made. Try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const start = async () => {
    if (!(await coppa.ensureAllowed())) return;
    await generation.guard(run);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Make a practice test</DialogTitle>
          <DialogDescription className="sr-only">
            {`A practice test from the material in ${test.name}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[75dvh] flex-col gap-4 overflow-y-auto">
          <SourceInput
            surfaceKey={surfaceKey}
            title="Sources"
            purpose="the questions"
            kinds={TOPUP_KINDS}
            required
            deliveries={FLASHCARD_SOURCE_DELIVERIES}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="class-test-count">How many questions</Label>
            <ClampedNumberInput
              id="class-test-count"
              min={1}
              max={config.countMax}
              value={count}
              onChange={setCount}
              className="h-11 w-32 text-base sm:h-9"
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="class-test-focus">Focus</Label>
            <ProTextarea
              id="class-test-focus"
              value={focus}
              onChange={(e) => setFocus(e.target.value.slice(0, FOCUS_MAX))}
              placeholder="e.g. Units 1 and 2, harder"
              className="min-h-[60px] text-base"
              disabled={busy}
              surfaceName="matrx-user/education-assessment"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <coppa.Gate />
            {busy && status ? (
              <span className="mr-auto text-xs text-muted-foreground">{status}</span>
            ) : blocked ? (
              <span className="mr-auto text-xs text-muted-foreground">{blocked}</span>
            ) : null}
            <Button type="button" variant="quiet" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              disabled={busy || !!blocked || generation.isChecking}
              onClick={() => void start()}
            >
              {busy ? <LoadingSpinner size="sm" className="mr-1.5" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {`Make ${questionCount(plannedCount)}`}
            </Button>
          </div>
          <generation.Paywall />
        </div>
      </DialogContent>
    </Dialog>
  );
}
