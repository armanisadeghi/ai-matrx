// features/education/convert/ConvertContentDialog.tsx
//
// THE one-click "turn this into a study artifact" surface — the single dialog
// primitive for every convert SOURCE (a note, a flashcard deck, an assessment, a
// passage). Sources hand it their serialized text + an origin entity token; the
// dialog drives the CANONICAL converter contract (useContentConverter →
// convertContent) — never a bespoke generation path — and each generated artifact
// links a `source` lineage edge back to the origin (written by the generator via
// recordSourceLineage, because the source ref carries the origin entity token).
// Targets light up automatically as owning projects register generators
// (isTargetAvailable).
//
// Metering uses the CANONICAL entitlement primitives (features/entitlements):
// useEntitlementGuard (check-before-spend + Paywall) + EntitlementMeter (visible
// limit BEFORE the action, TRUST mandate). No hand-rolled meter, no toast on a
// cap-hit — the guard opens CapabilityPaywallDialog instead.

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import {
  Layers,
  ListChecks,
  FileCheck2,
  FileText,
  Network,
  Headphones,
  NotebookPen,
  Brain,
  ArrowRight,
  Loader2,
  Boxes,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { Button } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { LiveRunDisplay } from "@ai-matrx/chat/agents/components/live-run/LiveRunDisplay";
import { useContentConverter } from "./useContentConverter";
import { isTargetAvailable } from "./registry";
import type { ConvertResult, ConvertSource, SourceRef, TargetKind } from "./types";
import type { Capability } from "@/features/entitlements/registry";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { Chip, ChipSet, SegmentedControl, Switch } from "@ai-matrx/design-system/controls";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Label } from "@/components/ui/label";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { KIND_CHOICES } from "@/features/flashcards/components/set-detail/AddMoreCardsButton";
import { QUESTION_TYPE_LABELS } from "@/features/education/assessment/components/AddMoreQuestionsButton";
import { QUESTION_TYPES, type QuestionType } from "@/features/education/assessment/data/types";
import type { CardKind } from "@/features/flashcards/utils/cardVariants";
import type { OutlineSection } from "@/features/education/kits/outline/types";
import { gapSections, type GenerationSteer } from "./steering";
import { announceLineage } from "./announceLineage";
import { recordSourceLineage } from "./recordSourceLineage";

interface TargetMeta {
  kind: TargetKind;
  label: string;
  blurb: string;
  icon: typeof Layers;
  capability: Capability;
}

// Presentation for each convert target. Availability is read live from the
// converter registry (isTargetAvailable) — a target greys out as "coming soon"
// until its owning project registers a generator, then lights up with no change.
const TARGETS: TargetMeta[] = [
  {
    kind: "deck",
    label: "Flashcard deck",
    blurb: "Grounded cards you can study in every mode",
    icon: Layers,
    capability: "education.generate_cards",
  },
  {
    kind: "notes",
    label: "Structured study notes",
    blurb: "Clean, organized notes with key terms — a new note",
    icon: NotebookPen,
    capability: "education.notes_generate",
  },
  {
    kind: "quiz",
    label: "Quiz",
    blurb: "Auto-generated questions that grade on meaning",
    icon: ListChecks,
    capability: "education.quiz_generate",
  },
  {
    kind: "practice_test",
    label: "Practice test",
    blurb: "A longer, timed exam-style test",
    icon: FileCheck2,
    capability: "education.practice_test_generate",
  },
  {
    kind: "summary",
    label: "Study summary",
    blurb: "A tight, cited summary with key takeaways",
    icon: FileText,
    capability: "education.ingest_document",
  },
  {
    kind: "mind_map",
    label: "Mind map",
    blurb: "A visual concept map of the ideas",
    icon: Network,
    capability: "education.mindmap_generate",
  },
  {
    kind: "audio",
    label: "Audio overview",
    blurb: "A podcast-style overview you can listen to",
    icon: Headphones,
    capability: "education.audio_generate",
  },
  {
    kind: "memory_aid",
    label: "Memory aids",
    blurb: "Mnemonics, analogies & a memory-palace scaffold",
    icon: Brain,
    capability: "education.memory_generate",
  },
];

/** The metered capability each target spends (the kit chat's generate door meters the same). */
export const TARGET_CAPABILITY: Record<string, Capability> = Object.fromEntries(
  TARGETS.map((t) => [t.kind, t.capability]),
);

type RowState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ConvertResult }
  | { status: "error"; message: string };

/** The origin entity a conversion links back to (the lineage anchor). */
export interface ConvertOrigin {
  /** SourceRef kind ("note" | "deck" | "assessment" | …). */
  kind: SourceRef["kind"];
  /** Registered entity token the lineage edge points at ("note", "fc_set", "assessment"). */
  entityType: string;
  entityId: string;
  title: string;
}

export interface ConvertContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The origin entity + its display title. Drives the lineage ref. */
  origin: ConvertOrigin;
  /** The serialized text of the whole origin, ready to convert. */
  text: string;
  /**
   * The lineage ref to convert under, when the caller already holds a richer one
   * than `origin` can express. A kit top-up passes the ref `reopenAnchor`
   * recovered, which carries the durable `fileId` (and any
   * `processedDocumentId`) the generators ground and cite against — deriving a
   * bare `{ entityType, entityId }` ref from the origin instead would still land
   * the same edge but strip the anchor a citation needs to open its passage.
   */
  sourceRef?: SourceRef;
  orgId?: string;
  /** Optional in-editor selection, if any — enables a "selected passage" toggle. */
  selectionText?: string;
  /** Targets to hide (e.g. a deck source hides "deck"). */
  excludeKinds?: TargetKind[];
  /**
   * The ONE target the caller was asked for — the education home's nudge chip
   * says "this kit has no quiz" and links here, so the quiz row leads and is
   * visibly the thing that was promised. It is highlighted, never auto-run:
   * generation costs the learner's quota, so the last tap stays theirs.
   */
  focusKind?: TargetKind;
  /** Called after a successful conversion so the caller can refresh lineage chips. */
  onConverted?: () => void;
  /**
   * The kit's outline and what each section already holds (living-kit W2):
   * with it the dialog offers "Focus on gaps" (default on), which aims a deck
   * at the sections with the fewest cards and a quiz at those with the fewest
   * questions.
   */
  outline?: {
    sections: OutlineSection[];
    cards: ReadonlyMap<string, number>;
    questions: ReadonlyMap<string, number>;
  };
  /** Pre-aim the run at these sections (Coverage "Make more" / "Go deeper"); gaps off. */
  sections?: OutlineSection[];
}

/** The kinds that read steering (types, instruction, sections). */
const STEERED: ReadonlySet<TargetKind> = new Set(["deck", "quiz", "practice_test"]);

export function ConvertContentDialog({
  open,
  onOpenChange,
  origin,
  text,
  sourceRef,
  orgId,
  selectionText,
  excludeKinds,
  focusKind,
  onConverted,
  outline,
  sections: aimedSections,
}: ConvertContentDialogProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { convert } = useContentConverter();
  // THE FLOATING LAW, inline exception: the generator streams INSIDE the row
  // the user just clicked, not in the floating window. A modal sits ABOVE every
  // window, so floating it here would hide the run behind the dialog the user
  // is looking at — a spinner by another name. Inside a modal there is no page
  // to shift, the stream appears exactly where the click was, and the dialog
  // stays open so the user can convert another target afterwards.
  const [liveRequestId, setLiveRequestId] = useState<string | null>(null);
  // School-safe COPPA gate: an under-13 account with no active guardian link is
  // blocked from AI generation until a parent approves (never a silent failure).
  const coppa = useAiComplianceGate();
  const hasSelection = Boolean(selectionText && selectionText.trim().length > 20);
  const [useSelection, setUseSelection] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  // Steering (deck / quiz / practice test): the person's words, the types
  // they want, and which outline sections to cover.
  const [instruction, setInstruction] = useState("");
  const [cardKinds, setCardKinds] = useState<CardKind[]>([]);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [focusGaps, setFocusGaps] = useState(!aimedSections?.length);
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);
  const steerFor = (kind: TargetKind): GenerationSteer | undefined => {
    if (!STEERED.has(kind)) return undefined;
    const counts = kind === "deck" ? outline?.cards : outline?.questions;
    const sections = aimedSections?.length
      ? aimedSections
      : focusGaps && outline && counts
        ? gapSections(outline.sections, counts)
        : undefined;
    return {
      instruction: instruction.trim() || undefined,
      ...(kind === "deck" ? { cardKinds } : { questionTypes }),
      sections,
    };
  };

  const sourceText = useSelection && selectionText ? selectionText : text;
  const canConvert = sourceText.trim().length > 0;
  const targets = TARGETS.filter((t) => !excludeKinds?.includes(t.kind)).sort(
    (a, b) => Number(b.kind === focusKind) - Number(a.kind === focusKind),
  );

  // Returns true only when the conversion completed (status → done). The row's
  // guard meters the entitlement on that success; a failed conversion returns
  // false and never burns quota.
  const runConvert = async (kind: TargetKind): Promise<boolean> => {
    if (!canConvert) {
      toast.error("There's no content to convert yet.");
      return false;
    }
    // School-safe gate FIRST (COPPA): is this account allowed to collect/process
    // data at all? An unconsented under-13 opens the "a parent must approve"
    // dialog and never reaches the billing gate or starts generation.
    if (!(await coppa.ensureAllowed())) return false;
    setRows((r) => ({ ...r, [kind]: { status: "running" } }));
    const source: ConvertSource = {
      text: sourceText,
      title: origin.title || "Study material",
      // The origin entity token — the generator's recordSourceLineage links the
      // artifact back to it (artifact --source--> origin). A caller-supplied ref
      // wins: it is the same anchor with more of it kept.
      ref: sourceRef ?? {
        kind: origin.kind,
        entityType: origin.entityType,
        entityId: origin.entityId,
      },
    };
    setLiveRequestId(null);
    try {
      const steer = steerFor(kind);
      const result = await convert(
        { source, targetKind: kind, options: steer ? { steer } : undefined },
        (requestId) => setLiveRequestId(requestId),
      );
      setRows((r) => ({ ...r, [kind]: { status: "done", result } }));
      onConverted?.();
      // Saved, but a link did not land: say so, with Retry (never console-only).
      announceLineage(result.lineage, () => recordSourceLineage(result, source, orgId), {
        inKit: Boolean(source.ref?.kitId),
      });
      toast.success(`Created "${result.title}"`, {
        action: { label: "Open", onClick: () => router.push(result.href) },
      });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setRows((r) => ({ ...r, [kind]: { status: "error", message } }));
      toast.error(message);
      return false;
    }
  };

  const body = (
    <div className="flex flex-col gap-4">
      {hasSelection && (
          <SegmentedControl aria-label="Scope of the source" fill value={useSelection ? "selection" : "whole"} onValueChange={(v) => setUseSelection(v === "selection")} data={[{ value: "whole", label: "Whole source" }, { value: "selection", label: "Selected passage" }]} />
        )}

      {targets.some((t) => STEERED.has(t.kind)) && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          {aimedSections?.length ? (
            <p className="truncate text-xs text-muted-foreground">
              {`Section: ${aimedSections.map((s) => s.title).join(", ")}`}
            </p>
          ) : outline?.sections.length ? (
            <label className="flex items-center justify-between gap-3 text-sm text-foreground">
              Focus on gaps
              <Switch checked={focusGaps} onCheckedChange={setFocusGaps} aria-label="Focus on gaps" />
            </label>
          ) : null}
          {targets.some((t) => t.kind === "deck") && (
            <div className="flex flex-col gap-1.5">
              <Label>Card types</Label>
              <ChipSet aria-label="Card types">
                {KIND_CHOICES.map(({ kind, label }) => (
                  <Chip key={kind} label={label} pressed={cardKinds.includes(kind)} asChild>
                    <button
                      type="button"
                      onClick={() =>
                        setCardKinds((cur) => (cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]))
                      }
                    />
                  </Chip>
                ))}
              </ChipSet>
            </div>
          )}
          {targets.some((t) => t.kind === "quiz" || t.kind === "practice_test") && (
            <div className="flex flex-col gap-1.5">
              <Label>Question types</Label>
              <ChipSet aria-label="Question types">
                {QUESTION_TYPES.map((t) => (
                  <Chip key={t} label={QUESTION_TYPE_LABELS[t]} pressed={questionTypes.includes(t)} asChild>
                    <button
                      type="button"
                      onClick={() =>
                        setQuestionTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
                      }
                    />
                  </Chip>
                ))}
              </ChipSet>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convert-instruction">Anything to focus on?</Label>
            <ProTextarea
              id="convert-instruction"
              ref={instructionRef}
              surfaceName="education-convert-instruction"
              getApplicationScope={() => {
                const el = instructionRef.current;
                const start = el?.selectionStart ?? 0;
                const end = el?.selectionEnd ?? 0;
                return buildApplicationScopeFromMenuContext({
                  selectedText: el && start !== end ? el.value.slice(Math.min(start, end), Math.max(start, end)) : "",
                  selectionRange: el ? { type: "editable", element: el, start, end } : null,
                  contextData: { title: origin.title, instruction },
                });
              }}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. isotopes, exam style"
              rows={2}
              autoGrow
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {targets.map((t) => (
          <TargetRow
            key={t.kind}
            meta={t}
            available={isTargetAvailable(t.kind)}
            state={rows[t.kind] ?? { status: "idle" }}
            focused={t.kind === focusKind}
            liveRequestId={liveRequestId}
            onConvert={() => runConvert(t.kind)}
            onOpen={(href) => router.push(href)}
          />
        ))}
      </div>
      <coppa.Gate />
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="pb-safe">
          <DrawerHeader>
            <DrawerTitle className="flex items-center justify-center gap-2">
              <Boxes className="h-4 w-4 text-primary" />
              Turn this into study material
            </DrawerTitle>
            <DrawerDescription>
              Every artifact is grounded in this content and links back to it —
              nothing is siloed.
            </DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[70dvh] overflow-y-auto px-4 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            Turn this into study material
          </DialogTitle>
          <DialogDescription>
            Every artifact is grounded in this content and links back to it —
            nothing is siloed.
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function TargetRow({
  meta,
  available,
  state,
  focused,
  liveRequestId,
  onConvert,
  onOpen,
}: {
  meta: TargetMeta;
  available: boolean;
  state: RowState;
  /** This is the target the caller came here to make — lead with it. */
  focused?: boolean;
  /** The in-flight run's request id — streamed under THIS row while it works. */
  liveRequestId: string | null;
  /** Runs the conversion; resolves true on success so usage is metered. */
  onConvert: () => Promise<boolean>;
  onOpen: (href: string) => void;
}) {
  // Canonical check-before-spend + paywall. `guard()` awaits the server-truth
  // verdict and opens CapabilityPaywallDialog on a block — never a toast.
  const gen = useEntitlementGuard(meta.capability);
  const Icon = meta.icon;
  const running = state.status === "running";
  const done = state.status === "done";
  const disabled = !available || running || gen.isChecking;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-3 py-2.5",
        focused && "border-primary/50 ring-1 ring-primary/30",
        !available && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{meta.label}</span>
          {!available && (
            <button
              type="button"
              onClick={() =>
                void announceComingSoon("education.convert-target-generators")
              }
              className="rounded-full border border-border bg-muted px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Coming soon
            </button>
          )}
          {done && state.result.trust?.confidence && (
            <ConfidenceBadge confidence={state.result.trust.confidence} />
          )}
        </div>
        {done ? (
          <p className="truncate text-[11px] text-muted-foreground">
            {state.result.detail ?? "Created"}
          </p>
        ) : state.status === "error" ? (
          <p className="truncate text-[11px] text-destructive">{state.message} <ErrorAlchemyMenu /></p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span className="truncate">{meta.blurb}</span>
            {available && <EntitlementMeter capability={meta.capability} />}
          </div>
        )}
      </div>
      {done ? (
        <Button size="sm" variant="secondary" onClick={() => onOpen(state.result.href)}>
          Open
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            void gen.guard(async () => {
              // Meter only a successful conversion; a failure burns nothing.
              if (await onConvert()) await gen.commit();
            })
          }
          title={!available ? "This target isn't available yet" : `Convert to ${meta.label}`}
        >
          {running || gen.isChecking ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              {running ? "Working" : "Checking"}
            </>
          ) : (
            "Convert"
          )}
        </Button>
      )}
      </div>

      {/* The run streams right here while this target works — never a bare
          "Working" spinner. Renders nothing until the stream connects. */}
      {running && (
        <LiveRunDisplay
          requestId={liveRequestId}
          label={`Creating your ${meta.label.toLowerCase()}`}
          pending
          className="mt-2"
          bodyClassName="max-h-52 overflow-y-auto px-2.5 py-2 text-sm"
        />
      )}

      <gen.Paywall />
    </div>
  );
}
