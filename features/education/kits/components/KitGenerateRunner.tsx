"use client";

// features/education/kits/components/KitGenerateRunner.tsx
//
// The kit chat's generate door (living-kit W4): the same run the Make more
// dialog and the Add more buttons start, with no dialog on screen. The chat's
// apply only sets the request and returns "started"; this runner then does what
// the dialogs do — the age gate, the entitlement guard (check before spend,
// commit on success only), a tab-bound run marker so a refresh is reported and
// repeatable — and says what it made in a toast. Never holds the tool call open.

import { useEffect, useEffectEvent, useRef } from "react";
import { toast } from "@/lib/toast";
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
  const toastId = `kit-generate:${kit.sourceId}`;
  const what = describeKitGenerate(request);

  const perform = async (): Promise<void> => {
    if (cardLimit.max === null && request.kind === "deck") {
      throw new Error(cardLimit.error ?? "The most cards one run may make is still loading. Ask again in a moment.");
    }
    const orgId = await ensureOrgId(kit.organizationId);
    toast.loading(`Making ${what}…`, { id: toastId, duration: Infinity });
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
        onStatus: (line) => toast.loading(`${line}`, { id: toastId, duration: Infinity }),
        saving,
        settle,
      }),
    );
    await gen.commit();
    toast.success(outcome.summary, {
      id: toastId,
      duration: 20_000,
      action: outcome.undo
        ? {
            label: "Undo",
            onClick: () => {
              void outcome.undo?.().then((problem) => {
                if (problem) toast.error(problem);
                else toast.info("Taken back out.");
                onFinished(true);
              });
            },
          }
        : undefined,
    });
  };

  const start = useEffectEvent(async () => {
    onBusyChange(true);
    try {
      if (!(await coppa.ensureAllowed())) {
        toast.info("A parent needs to approve AI study tools before this can run.", { id: toastId });
        return;
      }
      let ran = false;
      const verdict = await gen.guard(async () => {
        ran = true;
        await perform();
      });
      if (!ran && !verdict.allowed) toast.info("Nothing was made: your generation allowance is used up.", { id: toastId });
      if (ran) onFinished(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That could not be made. Try again.", { id: toastId });
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
    </>
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
