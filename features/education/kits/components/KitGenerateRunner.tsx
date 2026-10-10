"use client";

// features/education/kits/components/KitGenerateRunner.tsx
//
// The kit chat's generate door (living-kit W4): the same run the Make more
// dialog and the Add more buttons start, with no dialog on screen. The chat's
// apply only sets the request and returns "started"; this runner then does what
// the dialogs do — the age gate, the entitlement guard (check before spend,
// commit on success only), a tab-bound run marker so a refresh is reported and
// repeatable — and shows progress and what it made (with Undo) in a card on the kit page. Never holds the tool call open.

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { usePdfClient } from "@/features/pdf/api/client";
import { useIngest } from "@/features/education/onboard/useIngest";
import { useContentConverter } from "@/features/education/convert/useContentConverter";
import { TARGET_CAPABILITY } from "@/features/education/convert/ConvertContentDialog";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { useMaxCardsPerRun } from "@/features/flashcards/data/useMaxCardsPerRun";
import { useTabBoundRun } from "@/lib/wizard-draft/useTabBoundRun";
import type { StudyKit } from "../kitService";
import {
  describeKitGenerate,
  kitGenerateRunKey,
  restoreKitGenerateRequest,
  type KitGenerateRequest,
} from "../kitWrites";
import { recoverKitMaterial } from "../recoverKitMaterial";
import { runKitGenerate } from "../generate/runKitGenerate";

export interface KitGenerateCoverage {
  cards: ReadonlyMap<string, number>;
  questions: ReadonlyMap<string, number>;
}

/** One chat-started run. Mount it keyed by the request's nonce; it runs once. */
export function KitGenerateRun({
  kit,
  request,
  coverage,
  onBusyChange,
  onFinished,
}: {
  kit: StudyKit;
  request: KitGenerateRequest;
  coverage?: KitGenerateCoverage;
  onBusyChange: (busy: boolean) => void;
  /** The run made something (or failed): re-read the kit. */
  onFinished: (made: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const pdf = usePdfClient();
  const { normalizeSources } = useIngest();
  const { convert } = useContentConverter();
  const cardLimit = useMaxCardsPerRun();
  const gen = useEntitlementGuard(TARGET_CAPABILITY[request.kind]);
  const coppa = useAiComplianceGate();
  const tabRun = useTabBoundRun(kitGenerateRunKey(kit), restoreKitGenerateRequest);
  const started = useRef(false);
  const what = describeKitGenerate(request);
  // What the page shows for this run: working (with the live step), what it made (with Undo), or why it did not.
  const [dismissed, setDismissed] = useState(false);
  const [card, setCard] = useState<RunCard>({ phase: "working", line: `Making ${what}…` });

  const perform = async (): Promise<void> => {
    if (cardLimit.max === null && request.kind === "deck") {
      throw new Error(cardLimit.error ?? "The most cards one run may make is still loading. Ask again in a moment.");
    }
    const orgId = await ensureOrgId(kit.organizationId);
    setCard({ phase: "working", line: `Making ${what}…` });
    const outcome = await tabRun.track(request as unknown as Record<string, unknown>, (settle, saving) =>
      runKitGenerate({
        kit,
        request,
        orgId,
        ctx: { dispatch, store, orgId },
        maxCards: cardLimit.max ?? 50,
        coverage,
        recover: () =>
          recoverKitMaterial({ sourceType: kit.sourceType, sourceId: kit.sourceId, kitTitle: kit.title, sources: kit.sources, organizationId: kit.organizationId, normalizeSources, pdf }),
        convert,
        onStatus: (line) => setCard({ phase: "working", line }),
        saving,
        settle,
      }),
    );
    await gen.commit();
    setCard({
      phase: "done",
      line: outcome.summary,
      undo: outcome.undo
        ? async () => {
            setCard({ phase: "working", line: "Taking it back out…" });
            const problem = await outcome.undo?.();
            setCard(problem ? { phase: "failed", line: problem } : { phase: "info", line: "Taken back out." });
            onFinished(true);
          }
        : undefined,
    });
  };

  const start = useEffectEvent(async () => {
    onBusyChange(true);
    try {
      if (!(await coppa.ensureAllowed())) {
        setCard({ phase: "info", line: "A parent needs to approve AI study tools before this can run." });
        return;
      }
      let ran = false;
      const verdict = await gen.guard(async () => {
        ran = true;
        await perform();
      });
      if (!ran && !verdict.allowed) setCard({ phase: "info", line: "Nothing was made: your generation allowance is used up." });
      if (ran) onFinished(true);
    } catch (e) {
      setCard({ phase: "failed", line: e instanceof Error ? e.message : "That could not be made. Try again." });
      onFinished(false);
    } finally {
      onBusyChange(false);
    }
  });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, []);

  return (
    <>
      <coppa.Gate />
      <gen.Paywall />
      {dismissed ? null : <KitRunCard card={card} onDismiss={card.phase === "working" ? undefined : () => setDismissed(true)} />}
    </>
  );
}

type RunCard =
  | { phase: "working"; line: string }
  | { phase: "done"; line: string; undo?: () => Promise<void> }
  | { phase: "info" | "failed"; line: string };

/** The kit page's own readout of a chat-started run: live step while it goes, then what it made with Undo. */
function KitRunCard({ card, onDismiss }: { card: RunCard; onDismiss?: () => void }) {
  const Icon = card.phase === "working" ? Loader2 : card.phase === "done" ? CheckCircle2 : AlertCircle;
  const tone = card.phase === "failed" ? "border-destructive/40" : card.phase === "done" ? "border-success/40" : "border-primary/30";
  return (
    <div role="status" aria-live="polite" data-kit-run-card={card.phase} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-card px-4 py-3 ${tone}`}>
      <Icon className={`h-4 w-4 shrink-0 ${card.phase === "working" ? "animate-spin text-primary" : card.phase === "done" ? "text-success" : card.phase === "failed" ? "text-destructive" : "text-muted-foreground"}`} />
      <span className="min-w-0 flex-1 break-words type-body text-foreground">{card.line}</span>
      {card.phase === "done" && card.undo ? (
        <Button size="sm" variant="outline" onClick={() => void card.undo?.()}>Undo</Button>
      ) : null}
      {onDismiss ? (
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Dismiss" onClick={onDismiss}><X className="h-4 w-4" /></Button>
      ) : null}
    </div>
  );
}

/**
 * Always mounted on an open kit: a chat-started run that stopped with its page
 * (a refresh) is reported with what it asked for and a one-tap redo — the same
 * honesty the Add more dialogs give a stopped run.
 */
export function KitGenerateStopped({
  kit,
  onRetry,
}: {
  kit: StudyKit;
  onRetry: (request: KitGenerateRequest) => void;
}) {
  const tabRun = useTabBoundRun(kitGenerateRunKey(kit), restoreKitGenerateRequest);
  const stopped = tabRun.stopped;
  const dismiss = useEffectEvent(() => tabRun.dismiss());
  const retry = useEffectEvent((request: KitGenerateRequest) => {
    dismiss();
    onRetry(request);
  });
  const request = stopped?.request ?? null;
  const whileSaving = stopped?.whileSaving === true;
  const toastId = `kit-generate-stopped:${kit.sourceId}`;
  useEffect(() => {
    if (!request) return;
    const what = describeKitGenerate(request);
    if (whileSaving) {
      toast.info(`The page closed while saving ${what}. Check the kit before asking again.`, { id: toastId, duration: Infinity, onDismiss: () => dismiss() });
      return;
    }
    toast.info(`Making ${what} stopped when the page closed.`, {
      id: toastId,
      duration: Infinity,
      action: { label: "Try again", onClick: () => retry(request) },
      onDismiss: () => dismiss(),
    });
  }, [request, whileSaving, toastId]);
  return null;
}
