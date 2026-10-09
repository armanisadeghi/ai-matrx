"use client";

// features/education/assessment/components/AddMoreQuestionsButton.tsx
//
// "Add more questions" — the night-before-the-exam top-up on a quiz or practice
// test, on the ONE Source input. It opens the same input the other generators
// use, already holding the material the assessment was made from (its `source`
// lineage edges; an assessment with none gets a first pick). The questions come
// from the same generator as a new quiz (`generateQuestionsFromSources`): same
// grounding, same count law, and nothing the assessment already asks is made
// again. The person can steer it: a focus in their own words and the question
// types they want. The run lives in this tab (`useTabBoundRun`): a reload is
// reported and repeatable. Success carries an Undo that archives exactly the
// questions this run added.
//
// React Compiler is on: no manual useMemo / useCallback.

import { emptyRunMessage } from "@/features/education/convert/segmentedGenerate";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { ClampedNumberInput } from "@/components/official/ClampedNumberInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Button } from "@/components/ui/button";
import { Chip, ChipSet } from "@ai-matrx/design-system/controls";
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
import { readArtifactOrigins, type ArtifactOrigin } from "@/features/education/convert/lineage";
import { recordLineageForSources } from "@/features/education/convert/recordSourceLineage";
import { announceLineage } from "@/features/education/convert/announceLineage";
import { newBatchId, type GenerationSteer } from "@/features/education/convert/steering";
import type { ConvertProgress } from "@/features/education/convert/types";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { useSourceSet } from "@/features/resource-manager/source-input/useSourceSet";
import { ALL_SOURCE_KIND_IDS } from "@/features/resource-manager/source-input/sourceKinds";
import type { SourceDraft, SourceKindId } from "@ai-matrx/agents/sources/runtime";
import { originToDraft } from "@/features/flashcards/components/set-detail/AddMoreCardsButton";
import { sourceNamesOf } from "@/features/flashcards/data/deckSourceSet";
import {
  FLASHCARD_SOURCE_DELIVERIES,
  backfillFileIds,
  lineageSourceOf,
} from "@/features/flashcards/data/generateDeckFromSources";
import { useTabBoundRun, type TabBoundRun } from "@/lib/wizard-draft/useTabBoundRun";
import { assessmentService } from "../data/assessmentService";
import { generateQuestionsFromSources } from "../data/generateQuestionsFromSources";
import {
  addMoreQuestionsRunKey,
  questionRunRequest,
  restoreQuestionRunRequest,
  type QuestionRunRequest,
} from "../data/questionRunRequest";
import { QUESTION_TYPES, isDepth } from "../data/types";
import type { AssessmentItemRow, AssessmentRow, QuestionType } from "../data/types";
import { kindConfigFor } from "./kindConfig";

/** The top-up never offers "Just a topic": the questions come from material. */
const TOPUP_KINDS: readonly SourceKindId[] = ALL_SOURCE_KIND_IDS.filter((k) => k !== "topic");

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  fill_blank: "Fill in the blank",
  short_answer: "Short answer",
  written_response: "Written response",
};

const FOCUS_MAX = 2000;

/** The Source input key for one assessment's top-up — picks survive a reload. */
export function addMoreQuestionsSurfaceKey(assessmentId: string): string {
  return `assessment:add-more:${assessmentId}`;
}

export function addMoreQuestionsStoppedLine(count: number): string {
  return `Adding ${count} ${count === 1 ? "question" : "questions"} stopped when the page closed.`;
}

/** The run had sent its save: the questions may be in — never redo blind. */
export function addMoreQuestionsStoppedSavingLine(count: number): string {
  return `The page closed while saving ${count} ${count === 1 ? "question" : "questions"}. Check the list.`;
}

const questionCount = (n: number) => `${n} ${n === 1 ? "question" : "questions"}`;

/** Archive exactly the questions one run added (soft delete; never a hard delete). */
export async function undoAddedQuestions(itemIds: readonly string[]): Promise<string | null> {
  const results = await Promise.all(itemIds.map((id) => assessmentService.deleteItem(id)));
  const failed = results.filter((r) => r.error);
  return failed.length ? `${failed.length} of ${itemIds.length} could not be removed.` : null;
}

export function AddMoreQuestionsButton({
  assessment,
  items,
  onAdded,
  initialOpen = false,
  extraDrafts,
}: {
  assessment: AssessmentRow;
  /** The questions the assessment already holds — what a new one must not repeat. */
  items: AssessmentItemRow[];
  onAdded?: () => void;
  /** Open the dialog on mount (a host that loaded the assessment on the press). */
  initialOpen?: boolean;
  /** Material to preselect beside the assessment's own (a kit's Sources). */
  extraDrafts?: readonly SourceDraft[];
}) {
  const [open, setOpen] = useState(initialOpen);
  const tabRun = useTabBoundRun(addMoreQuestionsRunKey(assessment.id), restoreQuestionRunRequest);
  const [redo, setRedo] = useState<{ request: QuestionRunRequest; auto: boolean } | null>(null);
  const stopped = tabRun.stopped;
  const toastId = `assessment-add-more-stopped:${assessment.id}`;
  const openRedo = useEffectEvent((auto: boolean) => {
    if (!stopped) return;
    setRedo({ request: stopped.request, auto });
    setOpen(true);
    toast.dismiss(toastId);
    tabRun.dismiss();
  });
  const dismissStopped = useEffectEvent(() => tabRun.dismiss());
  const stoppedCount = stopped?.request.count ?? null;
  const stoppedWhileSaving = stopped?.whileSaving === true;
  useEffect(() => {
    if (stoppedCount === null || open) return;
    if (stoppedWhileSaving) {
      toast.info(addMoreQuestionsStoppedSavingLine(stoppedCount), {
        id: toastId,
        duration: Infinity,
        onDismiss: () => dismissStopped(),
      });
      return;
    }
    toast.info(addMoreQuestionsStoppedLine(stoppedCount), {
      id: toastId,
      duration: Infinity,
      action: { label: "Try again", onClick: () => openRedo(true) },
      onDismiss: () => dismissStopped(),
    });
  }, [stoppedCount, stoppedWhileSaving, open, toastId]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        icon={<Plus />}
        onClick={() => {
          if (stopped && !stopped.whileSaving) openRedo(false);
          else {
            if (stopped) {
              toast.dismiss(toastId);
              tabRun.dismiss();
            }
            setOpen(true);
          }
        }}
      >
        Add questions
      </Button>
      {open ? (
        <AddMoreQuestionsDialog
          assessment={assessment}
          items={items}
          extraDrafts={extraDrafts}
          tabRun={tabRun}
          redo={redo}
          onClose={() => {
            setOpen(false);
            setRedo(null);
          }}
          onAdded={onAdded}
        />
      ) : null}
    </>
  );
}

function AddMoreQuestionsDialog({
  assessment,
  items,
  extraDrafts,
  tabRun,
  redo,
  onClose,
  onAdded,
}: {
  assessment: AssessmentRow;
  items: AssessmentItemRow[];
  extraDrafts?: readonly SourceDraft[];
  tabRun: TabBoundRun<QuestionRunRequest>;
  redo: { request: QuestionRunRequest; auto: boolean } | null;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const config = kindConfigFor(assessment.assessment_kind);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const surfaceKey = addMoreQuestionsSurfaceKey(assessment.id);
  const set = useSourceSet(surfaceKey);
  const generation = useEntitlementGuard(config.capability);
  const coppa = useAiComplianceGate();

  // null = still reading which material the assessment came from.
  const [origins, setOrigins] = useState<ArtifactOrigin[] | null>(null);
  const [count, setCount] = useState(config.defaultCount);
  const [shownCount, setShownCount] = useState<number | null>(config.defaultCount);
  const [focus, setFocus] = useState("");
  const [types, setTypes] = useState<ReadonlySet<QuestionType>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seeded = useRef(false);
  const seed = useEffectEvent((found: ArtifactOrigin[]) => {
    setOrigins(found);
    if (seeded.current) return;
    seeded.current = true;
    if (redo) {
      // The stopped run's own request, exactly: material, count, focus, types.
      for (const s of set.sources) set.remove(s.id);
      for (const draft of redo.request.drafts) set.addReady(draft);
      setCount(redo.request.count);
      setFocus(redo.request.instruction);
      setTypes(new Set(redo.request.questionTypes));
      return;
    }
    const lineage = found.map(originToDraft).filter((d): d is SourceDraft => !!d?.ref);
    for (const draft of [...lineage, ...(extraDrafts ?? [])]) {
      if (draft.ref && !set.hasRef(draft.ref.resource_type, draft.ref.resource_id)) {
        set.addReady(draft);
      }
    }
  });
  useEffect(() => {
    let cancelled = false;
    void readArtifactOrigins("assessment", assessment.id).then((found) => {
      if (!cancelled) seed(found);
    });
    return () => {
      cancelled = true;
    };
  }, [assessment.id]);

  const ready = set.sources.filter((s) => s.status === "ready" && s.draft.ref);
  const landing = set.sources.filter((s) => s.status === "pending" || s.status === "resolving");
  const safeCount = Math.min(config.countMax, Math.max(1, count || config.defaultCount));
  // The plan makes at least one question per Source: the count shown is the plan's.
  const plannedCount = ready.length > 1 ? Math.max(safeCount, ready.length) : safeCount;
  const plannedShown =
    shownCount === null ? null : ready.length > 1 ? Math.max(shownCount, ready.length) : shownCount;

  const toggleType = (t: QuestionType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const orgId = await ensureOrgId(assessment.organization_id);
      setStatus(`Reading ${ready.length} ${ready.length === 1 ? "source" : "sources"}…`);
      const chosen = set.toSourceSet();
      const chosenNames = sourceNamesOf(set.sources);
      const chosenTypes = QUESTION_TYPES.filter((t) => types.has(t));
      const steer: GenerationSteer = { instruction: focus.trim(), questionTypes: chosenTypes };
      const batchId = newBatchId();
      await tabRun.track(
        questionRunRequest(plannedCount, focus, chosenTypes, chosen, chosenNames),
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
            depth:
              assessment.depth && isDepth(assessment.depth)
                ? assessment.depth
                : config.kind === "practice_test"
                  ? "exam"
                  : "applied",
            title: assessment.title,
            steer,
            existing: items.map((it) => ({ prompt: it.prompt, correctAnswer: it.correct_answer })),
            batchId,
            targetKind: config.kind,
            surfaceKey: `education-add-more-${config.base}`,
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
                made.gapNote ?? "Nothing new came out of this material. Add other material or change the focus.",
              ),
            );
          }
          setStatus("Adding them to your list…");
          await saving();
          const added = await assessmentService.addItems(assessment.id, made.questions, {
            startPosition: items.length,
          });
          if (added.error || !added.data) throw new Error(added.error ?? "The questions could not be saved.");
          settle();
          // Every Source used is linked to the assessment (idempotent).
          const result = {
            targetKind: config.kind,
            artifactId: assessment.id,
            resourceType: "assessment",
            href: `/education/${config.base}/${assessment.id}`,
            title: assessment.title,
            detail: `${questionCount(made.questions.length)} more`,
          };
          const linkSources = made.sources.map(lineageSourceOf);
          announceLineage(
            await recordLineageForSources(result, linkSources, orgId),
            () => recordLineageForSources(result, linkSources, orgId),
          );
          await generation.commit();
          const addedIds = added.data.map((row) => row.id);
          toast.success(
            `Added ${questionCount(addedIds.length)}${made.gapNote ? ` — ${made.gapNote}` : ""}.`,
            {
              action: {
                label: "Undo",
                onClick: () => {
                  void undoAddedQuestions(addedIds).then((problem) => {
                    if (problem) toast.error(problem);
                    else toast.success(`Removed ${questionCount(addedIds.length)}.`);
                    onAdded?.();
                  });
                },
              },
            },
          );
          for (const s of set.sources) set.remove(s.id);
          onAdded?.();
          onClose();
        },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "More questions could not be made. Try again.";
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

  const blocked = landing.length
    ? "Wait until your new source has finished adding."
    : ready.length === 0
      ? "Pick at least one source."
      : null;

  // "Try again" on a stopped run starts it as soon as its material is back.
  const [armed, setArmed] = useState(redo?.auto ?? false);
  const fire = useEffectEvent(() => {
    setArmed(false);
    void start();
  });
  const redoCount = redo?.request.count;
  useEffect(() => {
    if (armed && origins !== null && !blocked && !busy && count === redoCount) fire();
  }, [armed, origins, blocked, busy, count, redoCount]);

  const body = (
    <div className="flex max-h-[75dvh] flex-col gap-4 overflow-y-auto">
      <SourceInput
        surfaceKey={surfaceKey}
        title="Sources"
        purpose="the new questions"
        kinds={TOPUP_KINDS}
        required
        deliveries={FLASHCARD_SOURCE_DELIVERIES}
        attachTo={{ entityType: "assessment", entityId: assessment.id, label: assessment.title }}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assessment-add-count">How many new questions</Label>
        <ClampedNumberInput
          id="assessment-add-count"
          min={1}
          max={config.countMax}
          value={count}
          onChange={setCount}
          onDraftChange={setShownCount}
          className="h-11 w-32 text-base sm:h-9"
          disabled={busy}
        />
        {plannedShown !== null && shownCount !== null && plannedShown > shownCount ? (
          <p className="text-xs text-muted-foreground">{`One question per source: ${plannedShown}`}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Question types</Label>
        <ChipSet>
          {QUESTION_TYPES.map((t) => (
            <Chip key={t} label={QUESTION_TYPE_LABELS[t]} pressed={types.has(t)} asChild>
              <button type="button" onClick={() => toggleType(t)} disabled={busy} />
            </Chip>
          ))}
        </ChipSet>
        <p className="text-xs text-muted-foreground">None picked means any type.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assessment-add-focus">Focus</Label>
        <ProTextarea
          id="assessment-add-focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value.slice(0, FOCUS_MAX))}
          placeholder="e.g. Chapter 4 only, harder"
          className="min-h-[60px] text-base"
          disabled={busy}
          surfaceName="matrx-user/education-assessment"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : redo && !busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          {addMoreQuestionsStoppedLine(redo.request.count)}
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
          {busy ? <LoadingSpinner size="sm" className="mr-1.5" /> : <AGENT_ICON className="mr-1.5 h-4 w-4" />}
          {plannedShown ? `Make ${questionCount(plannedShown)}` : "Make questions"}
        </Button>
      </div>
      <generation.Paywall />
    </div>
  );

  const onOpenChange = (next: boolean) => {
    if (!next && !busy) onClose();
  };

  // A plain Dialog: it becomes a bottom sheet on mobile by itself.
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add more questions</DialogTitle>
          <DialogDescription className="sr-only">
            {`Add questions to this ${config.noun}`}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
