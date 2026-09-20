"use client";

/**
 * THE RULES IN SCOPE — the seam that lets a rendered `masterwork_result`
 * resolve the rule ids its ruling cites.
 *
 * A kind component is mounted BY THE REGISTRY, not by the page: it receives a
 * value and nothing else, and that is the whole point — one component renders
 * this shape on Encore, in the build dialog, on the run permalink, and in a
 * chat transcript months later. So the surrounding facts a renderer may
 * legitimately use reach it the only way they can without a second renderer:
 * through context that the surface publishes and the component reads if it is
 * there.
 *
 * Absent context is a normal, honest state, never an error. With no Rulebook in
 * hand the ruling renders exactly as the agent wrote it (D14's rule: never
 * invent a citation).
 *
 * ── 🚨 WALK 13, N3 — WHERE THIS MOUNTS, AND WHY IT MOVED ───────────────────
 * The first cut mounted this on two PAGES (Encore detail, the Masterworks
 * lane). That was the wrong seam and walk 13 proved it within a day: the
 * deliverable is drawn by a COMPONENT, and the build dialog and the
 * `/workflows/runs/<id>` permalink both draw it too. Both rendered the same
 * ruling with a null index and printed all twelve rule ids raw.
 *
 * So the provider now rides with the things that actually carry a Masterwork
 * run, and it can find the Rulebook by itself from either of them:
 *
 *   · `masterworkId` — a `workflow.definition` id. Its
 *     `metadata.built_from_rulebook` names the Rulebook. This is what
 *     `TryMasterworkBox` mounts, so EVERY run box on every surface inherits it
 *     with no page having to remember.
 *   · `runId`        — a `workflow.run` id, resolved to its definition first.
 *     This is what the run permalink mounts.
 *   · `rulebookId` (+ optional `rules`) — for a surface that already knows,
 *     which reads nothing twice.
 *
 * NESTING NEVER CLOBBERS. An inner provider that resolves nothing hands the
 * parent's index straight through, so a page that already knows its Rulebook
 * is never made worse by a run box mounted inside it.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { RulebookRule } from "../types";
import {
  buildRuleCitationIndex,
  type RuleCitationIndex,
} from "../ruleCitations";
import { getRulebook } from "../service";
import { rulebookIdForMasterwork, rulebookIdForRun } from "./rulebookForRun";

const MasterworkRulesContext = createContext<RuleCitationIndex | null>(null);

export function MasterworkRulesProvider({
  rulebookId,
  masterworkId,
  runId,
  rules,
  children,
}: {
  /** Known outright. Null/absent means "ask one of the two below". */
  rulebookId?: string | null;
  /** A `workflow.definition` id built from a Rulebook. */
  masterworkId?: string | null;
  /** A `workflow.run` id — resolved to its definition, then its Rulebook. */
  runId?: string | null;
  /** The rules, when the surface already holds them. Skips every read. */
  rules?: readonly RulebookRule[];
  children: React.ReactNode;
}) {
  // Never make an outer scope worse: this is the value we fall back to.
  const inherited = useContext(MasterworkRulesContext);
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<readonly RulebookRule[] | null>(null);
  const given = rules ?? null;

  // Leg 1 — find the Rulebook, if we were not simply told.
  useEffect(() => {
    if (rulebookId) {
      setResolvedId(rulebookId);
      return;
    }
    let cancelled = false;
    const lookup = masterworkId
      ? rulebookIdForMasterwork(masterworkId)
      : runId
        ? rulebookIdForRun(runId)
        : Promise.resolve(null);
    lookup
      .then((id) => {
        if (!cancelled) setResolvedId(id);
      })
      .catch(() => {
        // Enrichment. "We could not find the Rulebook" resolves nothing and
        // inherits whatever an outer scope knew.
        if (!cancelled) setResolvedId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rulebookId, masterworkId, runId]);

  // Leg 2 — read its rules, unless the surface handed them over.
  useEffect(() => {
    if (!resolvedId || given) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    getRulebook(resolvedId)
      .then((rulebook) => {
        if (!cancelled) setLoaded(rulebook?.rules ?? null);
      })
      .catch(() => {
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedId, given]);

  const index = useMemo(() => {
    const inScope = given ?? loaded;
    if (!resolvedId || !inScope || inScope.length === 0) return inherited;
    return buildRuleCitationIndex(resolvedId, inScope);
  }, [resolvedId, given, loaded, inherited]);

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
