"use client";

// features/masterwork/sourceLinks.ts
//
// THE ONE definition of "what counts as a source attached to a Rulebook".
//
// Extracted 2026-09-15 when the interview start screen needed the same answer
// the Sources panel already had: whether this Rulebook has anything written
// down. The `auto` interview context mode turns on exactly that question
// (`interviewModes.ts::resolveContextMode`), and a second copy of the token
// list would have drifted the moment either side gained a source type — so the
// list lives here and `RulebookSourcesPanel` reads it from here too.

import { useMemo } from "react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";

/**
 * The registered source→rulebook pairs (`platform.association_types`,
 * `container_side=none` — provenance only).
 */
export const DUMP_SOURCE_TOKENS: EntityTypeToken[] = [
  "note",
  "transcript",
  "studio_session",
  "file",
  "udt_document",
  "fc_set",
  "research_topic",
  "pc_show",
  "pc_episode",
  "pc_studio_run",
];

/** The edge role every attached source carries. */
export const DUMP_ROLE = "distillation_source";

export type RulebookSourceCount =
  | { state: "loading" }
  | { state: "failed"; reason: string; retry: () => void }
  | { state: "ready"; count: number };

/**
 * How many sources are attached to this Rulebook right now.
 *
 * Deliberately three-valued at the call site: `loading` is NOT zero. A screen
 * that reads "no sources" while the association read is still in flight would
 * choose the blank-slate interviewer for a Rulebook with a corpus behind it.
 */
export function useRulebookSourceCount(
  rulebookId: string,
  organizationId: string | null | undefined,
): RulebookSourceCount {
  const links = useContainerLinks({
    containerType: "rulebook",
    containerId: rulebookId,
    orgId: organizationId ?? undefined,
  });
  const count = useMemo(
    () =>
      DUMP_SOURCE_TOKENS.reduce(
        (total, token) =>
          total + links.linksFor(token).filter((l) => l.role === DUMP_ROLE).length,
        0,
      ),
    // `linksFor` is stable per render over the hook's internal edges array —
    // the same dependency set `RulebookSourcesPanel` uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [links.totalCount, links.status, rulebookId],
  );
  if (links.status === "error") {
    return {
      state: "failed",
      // Never "0 sources" on a failed read — that answer would silently pick
      // the blank-slate interviewer for a Rulebook with a corpus behind it.
      reason:
        links.error ??
        "We couldn't read what's attached to this rulebook, so we can't tell whether it has sources.",
      retry: () => void links.reload(),
    };
  }
  if (links.status !== "ready") return { state: "loading" };
  return { state: "ready", count };
}
