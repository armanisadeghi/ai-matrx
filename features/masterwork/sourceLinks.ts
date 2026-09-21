"use client";

// features/masterwork/sourceLinks.ts
//
// THE ONE definition of "what counts as a source on a Rulebook".
//
// Extracted 2026-09-15 when the interview start screen needed the same answer
// the Sources panel already had: whether this Rulebook has anything written
// down. The `auto` interview context mode turns on exactly that question
// (`interviewModes.ts::resolveContextMode`), and a second copy of the token
// list would have drifted the moment either side gained a source type — so the
// list lives here and `RulebookSourcesPanel` reads it from here too.
//
// 🚨 WHY THIS FILE COUNTS TWO STORES NOW (2026-09-18, VERIFICATION.md D7).
//
// It claimed to be THE ONE definition while knowing about ONE of the two
// places a source can be. A Rulebook was given 50 Sources through the export
// flow — 50 rows in `platform.masterwork_source`, 50 `kept_source` edges, the
// send returning 200 — and its own screen said **"Add your first resource /
// Attach at least one source first"**, on both tabs. A person who followed the
// dialog's own "Open the Rulebook" landed on a page telling them they had
// nothing, holding 50 of their own emails.
//
// The cause was not a bug in a query. It was that "this Rulebook's Sources"
// had two disjoint meanings and every gate read only the older one:
//
//   ATTACHED  `platform.associations`, role `distillation_source`, plus the
//             URLs staged on `rulebook.metadata.dump_url_sources`. Written by
//             the capture panel when somebody points the dump lane at
//             something. It means "we are ABOUT to read this".
//
//   KEPT      `platform.masterwork_source` rows (and their `kept_source`
//             edges). Written by `raw_material.keep` — the chokepoint EVERY
//             acquisition door goes through: send-to-Rulebook from a Library,
//             an export selection, an extension capture, an interview's turns,
//             a file's extracted pages. It means "we HAVE this, in the
//             person's own words".
//
// Until today the kept store was WRITE-ONLY across the entire platform: a
// census of both repos (2026-09-18) found no reader outside its own writer's
// idempotency check. So every door built on the raw-material seam delivered
// Sources into a room nobody was looking at.
//
// The two meanings stay distinct where the distinction matters — the kept
// list at `/masterwork/[id]/sources/kept` is deliberately not mixed with
// intentions, and `kept-sources/listConfig.tsx` says why. But for the COUNT
// and for the GATE there is one answer: a Rulebook that has either has
// sources, and "does this Rulebook have material?" must never be answered by
// looking at half of it.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import {
  listKeptSourcesBrief,
  type KeptSourceBrief,
} from "./kept-sources/service";
import {
  entityIdentity,
  interviewIdentity,
  keptIdentity,
  urlIdentity,
} from "./sourceIdentity";
import { tallySourceGroups } from "./sourceTally";

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

/** The edge role an ATTACHED source carries — a thing we are about to read. */
export const DUMP_ROLE = "distillation_source";

/**
 * The edge role the conversation an interview happened IN carries.
 *
 * 🚨 IT IS MATERIAL (cold walk 18, defect 2). It was missing from this union,
 * so a Rulebook whose only source was a recorded interview that had not been
 * distilled yet counted ZERO — which is how `/masterwork/all` told six Experts
 * their Rulebook came from "Nothing yet" while it held their own voice. Its
 * identity is `interview:<conversation_id>`, the same key the sitting's kept
 * row carries, so keeping it does not double-count a distilled interview.
 */
export const INTERVIEW_ROLE = "interview";

/** The edge role a KEPT source carries — material we already hold. */
export const KEPT_SOURCE_ROLE = "kept_source";

/**
 * What one Rulebook has, split by which store it came from.
 *
 * `total` is the only number a gate should ever read. The two parts are
 * exposed because a SCREEN may legitimately want to say which is which
 * ("3 attached, 50 kept"), and because a reader that had to re-derive them
 * would be the second definition this file exists to prevent.
 */
export interface RulebookSourceTally {
  /** Edges with role `distillation_source` — pointed at, not yet read. */
  attached: number;
  /** Rows in `platform.masterwork_source` — material we hold. */
  kept: number;
  /** Everything, which is what "does this Rulebook have sources" means. */
  total: number;
  /**
   * How many of `attached + kept` were the SAME source under two names —
   * the number this screen used to add twice. Exposed so a reader can prove
   * the union happened instead of trusting that it did.
   */
  countedOnce: number;
}

/** The two fields an identity needs off a kept row. */
export interface KeptIdentityRow {
  source_key: string;
  approach_key?: string | null;
  /** `platform.masterwork_source.medium`, when the caller holds it. */
  medium?: string | null;
}

export type RulebookSourceCount =
  | { state: "loading" }
  | { state: "failed"; reason: string; retry: () => void }
  | { state: "ready"; count: number; tally: RulebookSourceTally };

/** The kept half on its own, for a caller that already holds the edges. */
export type KeptSourceCount =
  | { state: "loading" }
  | { state: "failed"; reason: string; retry: () => void }
  | {
      state: "ready";
      /** The server's exact number over the whole set. */
      count: number;
      /** The rows the screen may list and hand to an ingest run. */
      rows: KeptSourceBrief[];
      /** True when `count` exceeds what one run takes — the screen SAYS so. */
      more: boolean;
      retry: () => void;
    };

/**
 * How many rows `platform.masterwork_source` holds for this Rulebook.
 *
 * Its own hook because `RulebookSourcesPanel` already reads the association
 * edges for the attach controls, and calling the combined hook there would
 * read them twice. Both callers share THIS, so "kept" has one definition.
 */
export function useKeptSourceCount(rulebookId: string): KeptSourceCount {
  const [kept, setKept] = useState<{
    rows: KeptSourceBrief[];
    total: number;
  } | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!rulebookId) return;
    let live = true;
    setReason(null);
    listKeptSourcesBrief(rulebookId)
      .then((value) => {
        if (live) setKept(value);
      })
      .catch((error: unknown) => {
        if (!live) return;
        // Never fall back to 0. See the header: an unread store answering
        // "nothing" is exactly how 50 kept Sources became "add your first".
        setKept(null);
        setReason(
          error instanceof Error
            ? error.message
            : "We couldn't read the material this rulebook has kept.",
        );
      });
    return () => {
      live = false;
    };
  }, [rulebookId, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  if (reason) return { state: "failed", reason, retry };
  if (kept === null) return { state: "loading" };
  return {
    state: "ready",
    count: kept.total,
    rows: kept.rows,
    more: kept.total > kept.rows.length,
    retry,
  };
}

/**
 * How many sources this Rulebook has right now, across BOTH stores.
 *
 * Deliberately three-valued at the call site: `loading` is NOT zero. A screen
 * that reads "no sources" while a read is still in flight would choose the
 * blank-slate interviewer for a Rulebook with a corpus behind it.
 *
 * `failed` if EITHER read fails, for the same reason: half an answer to this
 * question is the defect, not a degraded mode. A partial success would once
 * again render "you have nothing" over material we are holding.
 *
 * @param extraUrls Sources this Rulebook has that live on neither store —
 *   today only the URLs staged on `rulebook.metadata.dump_url_sources`, which
 *   the caller already holds on the Rulebook row and would otherwise re-fetch.
 *   URLs, not a count: a staged URL and a kept `url:` row are one source, and
 *   only the address can prove it (N4).
 */
export function useRulebookSourceCount(
  rulebookId: string,
  organizationId: string | null | undefined,
  extraUrls: readonly string[] = [],
): RulebookSourceCount {
  const links = useContainerLinks({
    containerType: "rulebook",
    containerId: rulebookId,
    orgId: organizationId ?? undefined,
  });
  const kept = useKeptSourceCount(rulebookId);

  const attached = useMemo(
    () => [
      ...DUMP_SOURCE_TOKENS.flatMap((token) =>
        links
          .linksFor(token)
          .filter((l) => l.role === DUMP_ROLE)
          .map((l) => entityIdentity(token, l.resourceId)),
      ),
      // The interview itself. See INTERVIEW_ROLE.
      ...links
        .linksFor("conversation")
        .filter((l) => l.role === INTERVIEW_ROLE)
        .map((l) => interviewIdentity(l.resourceId)),
    ],
    // `linksFor` is stable per render over the hook's internal edges array —
    // the same dependency set `RulebookSourcesPanel` uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [links.totalCount, links.status, rulebookId],
  );

  const retry = useCallback(() => {
    if (kept.state === "failed") kept.retry();
    void links.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links.reload, kept]);

  if (links.status === "error" || kept.state === "failed") {
    return {
      state: "failed",
      reason:
        links.error ??
        (kept.state === "failed" ? kept.reason : null) ??
        "We couldn't read what's on this rulebook, so we can't tell whether it has sources.",
      retry,
    };
  }
  if (links.status !== "ready" || kept.state !== "ready") return { state: "loading" };

  return {
    state: "ready",
    ...tallyOf(
      [...attached, ...extraUrls.map((url) => urlIdentity(url))],
      kept.rows,
      kept.count,
    ),
  };
}

/**
 * THE ONE PLACE the two stores are brought together — by IDENTITY, not by
 * addition.
 *
 * Every gate, badge and empty state derives its number here, so a Rulebook
 * cannot be "empty" on one screen and full on the next.
 *
 * 🚨 IT USED TO BE `attached + kept` (cold walk 13, N4). Those two stores
 * overlap by construction: every file the dump lane reads gets a
 * `distillation_source` edge AND a `platform.masterwork_source` row, so a
 * Rulebook holding one interview, one email thread and five uploads reported
 * TWELVE sources and listed four of its own five files as material it already
 * held "besides" them. Each item is now counted once under the identity
 * `aidream/services/distillation/source_identity.py` already gives it
 * (`./sourceIdentity`).
 */
export function tallyOf(
  attached: readonly string[],
  kept: readonly KeptIdentityRow[],
  keptTotal: number = kept.length,
): { count: number; tally: RulebookSourceTally } {
  // 🚨 ONE ARITHMETIC. The union runs through `sourceTally.ts`, the same
  // function the SOURCE column on `/masterwork/all` folds its two reads with,
  // so the panel and the list cannot say different numbers about one Rulebook
  // (cold walk 18, defect 2). Identities the caller holds as bare strings
  // carry no kind, so only the COUNT is taken here — the sentence is the
  // column's, which reads the rows themselves.
  const { total: distinct } = tallySourceGroups([
    ...attached.map((sourceKey) => ({ sourceKey })),
    ...kept.map((row) => ({
      sourceKey: keptIdentity(row),
      approachKey: row.approach_key,
      medium: row.medium,
      kept: true,
    })),
  ]);
  // Kept rows past the page this screen holds cannot be compared to anything,
  // so they are counted as themselves rather than guessed at. `keptTotal` is
  // the server's exact number; `kept` is the page. Saying a smaller number
  // than we hold would be the D7 defect wearing the N4 fix.
  const beyondThePage = Math.max(0, keptTotal - kept.length);
  const total = distinct + beyondThePage;
  const tally: RulebookSourceTally = {
    attached: attached.length,
    kept: keptTotal,
    total,
    countedOnce: attached.length + keptTotal - total,
  };
  return { count: total, tally };
}

/** The identity of every attachment the panel can see, for {@link tallyOf}. */
export function attachedIdentities(input: {
  sourceLinks: readonly { token: string; resourceId: string }[];
  stagedUrls: readonly { url: string }[];
}): string[] {
  return [
    ...input.sourceLinks.map((l) => entityIdentity(l.token, l.resourceId)),
    ...input.stagedUrls.map((s) => urlIdentity(s.url)),
  ];
}
