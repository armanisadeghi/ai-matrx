"use client";

// features/marketing/seo/tool-door/useToolSection.ts — one screen section over
// one paid envelope-tool call, through `useToolAction` (the screen-run door, its
// paid approval dialog, dedupe and busy states). Shared by the domain page
// (`seo_domain`) and AI visibility's brand lookup (`seo_ai_visibility`).
//
// `args === null` means the section cannot run yet. When args arrive or change,
// the section PROBES for a free stored result (see
// `domain-research/section-state.ts`): a fresh stored result comes back free,
// anything that would cost money is refused before any spend — and that refusal
// carries this call's exact estimate (`estimate.ts`), so the screen can name
// the price before anyone clicks. `buy` runs the paid call.

import { useEffect, useEffectEvent, useState } from "react";
import {
  toolActionKey,
  useToolAction,
} from "@ai-matrx/chat/action-requests/hooks/useToolAction";
import type { ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";
import {
  PROBE_MAX_COST_USD,
  sectionFromOutcome,
  type SectionState,
} from "../domain-research/section-state";
import { estimateFromOutcome } from "./estimate";

interface Slot<T> {
  key: string | null;
  state: SectionState<T>;
  /** The price the last probe's refusal named; null when it named none. */
  estimateUsd: number | null;
}

export function useToolSection<T>(toolName: string, args: Record<string, unknown> | null) {
  const tool = useToolAction<ToolEnvelope<T>>(toolName);
  const key = args ? toolActionKey(toolName, args) : null;
  // State is tagged with the call it answers; an answer for a call the page
  // has moved off is never shown.
  const [slot, setSlot] = useState<Slot<T>>({
    key: null,
    state: { kind: "idle" },
    estimateUsd: null,
  });

  // A click (buy, recheck) marks its call loading first, so its answer lands
  // only while that call is still the one on screen.
  const runWith = async (extra: Record<string, unknown>, probe: boolean) => {
    if (!args || !key) return;
    const asked = key;
    setSlot((prev) => ({
      key: asked,
      state: { kind: "loading", buying: !probe },
      estimateUsd: prev.key === asked ? prev.estimateUsd : null,
    }));
    const outcome = await tool.run({ ...args, ...extra });
    setSlot((prev) =>
      prev.key === asked
        ? {
            key: asked,
            state: sectionFromOutcome<T>(outcome, { probe }),
            estimateUsd: probe ? estimateFromOutcome(outcome) : prev.estimateUsd,
          }
        : prev,
    );
  };

  const startProbe = useEffectEvent(() =>
    tool.run({ ...(args ?? {}), max_cost_usd: PROBE_MAX_COST_USD }),
  );

  // A new call opens with the free probe; leaving that call drops its answer.
  useEffect(() => {
    if (!key) return;
    let live = true;
    void startProbe().then((outcome) => {
      if (live) {
        setSlot({
          key,
          state: sectionFromOutcome<T>(outcome, { probe: true }),
          estimateUsd: estimateFromOutcome(outcome),
        });
      }
    });
    return () => {
      live = false;
    };
  }, [key]);

  const current = key && slot.key === key;
  const state: SectionState<T> = current
    ? slot.state
    : key
      ? { kind: "loading", buying: false }
      : { kind: "idle" };

  return {
    state,
    estimateUsd: current ? slot.estimateUsd : null,
    running: tool.running,
    buy: (extra: Record<string, unknown> = {}) => runWith(extra, false),
    /** Ask again for a free stored result; never spends. */
    recheck: () => runWith({ max_cost_usd: PROBE_MAX_COST_USD }, true),
    approvalDialog: tool.approvalDialog,
  };
}
