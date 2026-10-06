"use client";

// features/marketing/seo/domain-research/useDomainSection.ts — one section of
// the domain page over one `seo_domain` action, through `useToolAction` (the
// screen-run door, its paid approval dialog, dedupe and busy states).
//
// `args === null` means the section cannot run yet (no domain, no site, no seed
// keywords). When args arrive or change, the section probes for a free stored
// result (see section-state.ts); `buy` runs the paid call, and `buy(true)`
// buys a fresh read past the reuse window.

import { useEffect, useEffectEvent, useState } from "react";
import {
  toolActionKey,
  useToolAction,
} from "@ai-matrx/chat/action-requests/hooks/useToolAction";
import type { ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";
import { PROBE_MAX_COST_USD, sectionFromOutcome, type SectionState } from "./section-state";
import type { DomainAction, DomainActionData } from "./types";

export const SEO_DOMAIN_TOOL = "seo_domain";

export function useDomainSection<A extends DomainAction>(
  action: A,
  args: Record<string, unknown> | null,
) {
  type T = DomainActionData[A];
  const tool = useToolAction<ToolEnvelope<T>>(SEO_DOMAIN_TOOL);
  const key = args ? toolActionKey(SEO_DOMAIN_TOOL, { ...args, action }) : null;
  // State is tagged with the call it answers; an answer for a call the page
  // has moved off is never shown.
  const [slot, setSlot] = useState<{ key: string | null; state: SectionState<T> }>({
    key: null,
    state: { kind: "idle" },
  });

  // A click (buy, recheck) marks its call loading first, so its answer lands
  // only while that call is still the one on screen.
  const runWith = async (extra: Record<string, unknown>, probe: boolean) => {
    if (!args || !key) return;
    const asked = key;
    setSlot({ key: asked, state: { kind: "loading", buying: !probe } });
    const outcome = await tool.run({ ...args, action, ...extra });
    setSlot((prev) =>
      prev.key === asked ? { key: asked, state: sectionFromOutcome<T>(outcome, { probe }) } : prev,
    );
  };

  const startProbe = useEffectEvent(() =>
    tool.run({ ...(args ?? {}), action, max_cost_usd: PROBE_MAX_COST_USD }),
  );

  // A new call opens with the free probe; leaving that call drops its answer.
  useEffect(() => {
    if (!key) return;
    let live = true;
    void startProbe().then((outcome) => {
      if (live) setSlot({ key, state: sectionFromOutcome<T>(outcome, { probe: true }) });
    });
    return () => {
      live = false;
    };
  }, [key]);

  const state: SectionState<T> =
    key && slot.key === key ? slot.state : key ? { kind: "loading", buying: false } : { kind: "idle" };

  return {
    state,
    running: tool.running,
    buy: (refresh = false) => runWith(refresh ? { refresh: true } : {}, false),
    /** Ask again for a free stored result; never spends. */
    recheck: () => runWith({ max_cost_usd: PROBE_MAX_COST_USD }, true),
    approvalDialog: tool.approvalDialog,
  };
}
