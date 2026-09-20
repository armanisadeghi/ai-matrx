"use client";

/**
 * THE RULES IN SCOPE — the seam that lets a rendered `masterwork_result`
 * resolve the rule ids its ruling cites.
 *
 * A kind component is mounted BY THE REGISTRY, not by the page: it receives a
 * value and nothing else, and that is the whole point — one component renders
 * this shape on Encore, in the Masterworks lane, and in a chat transcript
 * months later. So the surrounding facts a renderer may legitimately use reach
 * it the only way they can without a second renderer: through context that the
 * surface publishes and the component reads if it is there.
 *
 * Same seam shape `MasterworkCheckupFindingBlock` already proved with
 * `useCurrentSurfaceUiState` — absent context is a normal, honest state, never
 * an error. With no Rulebook in hand the ruling renders exactly as the agent
 * wrote it (D14's rule: never invent a citation).
 *
 * Opened by walk 12, D14 (2026-09-20).
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { RulebookRule } from "../types";
import {
  buildRuleCitationIndex,
  type RuleCitationIndex,
} from "../ruleCitations";
import { getRulebook } from "../service";

const MasterworkRulesContext = createContext<RuleCitationIndex | null>(null);

/**
 * Publish a Rulebook's rules to everything rendered below.
 *
 * `rules` when the surface already holds them (the Rulebook page, the
 * Masterworks lane) — no second read. Omit them and the provider reads the
 * Rulebook itself, which is what Encore does: the Operator holds a reference
 * to it, never its rules. A refused read leaves the index null and the ruling
 * verbatim; it is enrichment and never blanks a result.
 */
export function MasterworkRulesProvider({
  rulebookId,
  rules,
  children,
}: {
  /** Null when the viewer has no Rulebook in scope — then nothing resolves. */
  rulebookId: string | null;
  rules?: readonly RulebookRule[];
  children: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState<readonly RulebookRule[] | null>(null);
  const given = rules ?? null;

  useEffect(() => {
    if (!rulebookId || given) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    getRulebook(rulebookId)
      .then((rulebook) => {
        if (!cancelled) setLoaded(rulebook?.rules ?? null);
      })
      .catch(() => {
        // Enrichment. A refused read means "no citations resolve", which is
        // the same honest state as no provider at all.
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rulebookId, given]);

  const index = useMemo(() => {
    const inScope = given ?? loaded;
    if (!rulebookId || !inScope || inScope.length === 0) return null;
    return buildRuleCitationIndex(rulebookId, inScope);
  }, [rulebookId, given, loaded]);

  return (
    <MasterworkRulesContext.Provider value={index}>
      {children}
    </MasterworkRulesContext.Provider>
  );
}

/** The rules in scope, or null where no surface published any. */
export function useRuleCitationIndex(): RuleCitationIndex | null {
  return useContext(MasterworkRulesContext);
}
