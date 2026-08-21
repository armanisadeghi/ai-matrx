"use client";

/**
 * The Press Room's data layer.
 *
 * These are REAL reads against the live Supabase `seo` schema, on the canonical
 * client path (browser → Supabase direct, RLS-filtered — never through Python,
 * never through a Next route). `seo.story_angle` and `seo.source_request` have
 * no rows yet, so when the real read comes back empty the workspace falls back
 * to the ONE fixture file and says so on screen, in a banner the user cannot
 * miss. That is the difference between a demo and a lie: the query ran, the
 * answer was "none", and we show what the surface will look like once it isn't.
 *
 * `?data=ready|empty|error|stalled` FORCES a load state so the unglamorous ones
 * are reachable and reviewable on the real route. The switch only forces the
 * state; the copy for a stall still comes from the real React Query signals
 * (`isPaused` / `failureCount`) on the live path, so what a reviewer reads is
 * what a user would read.
 *
 * Coverage → angle: `seo.coverage_mention` has NO foreign key to
 * `seo.story_angle`. The tie lives in `metadata.story_angle_id`, and THIS FILE
 * is the only reader of that key — nothing downstream assumes the shape.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useQuery } from "@tanstack/react-query";

import type { Database, Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { isJsonRecord } from "@/features/marketing/types";
import { operationFailed } from "@/utils/errors";
// TYPE ONLY. `fixtures.ts` is ~950 lines of sample dataset that almost nobody
// on this route ever sees, so it must not sit in the bundle every user
// downloads. A type-only import is erased at build time; the module itself is
// pulled in at runtime by `useSampleFixture` below, and only on the path that
// actually renders sample data.
import type { PressRoomFixture } from "@/features/marketing/pr/fixtures";
import type { PressRoomScenario } from "@/features/marketing/pr/routes";
import { ladderPercent, readLadder } from "@/features/marketing/pr/ladder";
import {
  readEntryKeys,
  readEvidenceRefs,
  readMissingEvidence,
  readProofRequired,
  isJsonObject,
  type CoverageMention,
  type SourceRequest,
  type StoryAngle,
} from "@/features/marketing/pr/types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

function assertData<T>(data: T | null, error: unknown): T {
  if (error) throw error;
  if (data === null) {
    throw new Error("Supabase returned no data and no error");
  }
  return data;
}

const pressKeys = {
  root: ["marketing", "press-room"] as const,
  angles: (siteId: string) => [...pressKeys.root, "angles", siteId] as const,
  requests: (siteId: string) => [...pressKeys.root, "requests", siteId] as const,
  coverage: (siteId: string) => [...pressKeys.root, "coverage", siteId] as const,
};

export async function listStoryAngles(
  siteId: string,
  signal?: AbortSignal,
): Promise<StoryAngle[]> {
  const response = await (await seoDb())
    .from("story_angle")
    .select("*")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("priority", { ascending: false })
    .limit(500)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export async function listSourceRequests(
  siteId: string,
  signal?: AbortSignal,
): Promise<SourceRequest[]> {
  const response = await (await seoDb())
    .from("source_request")
    .select("*")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("deadline_at", { ascending: true, nullsFirst: false })
    .limit(500)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

const COVERAGE_WINDOW_DAYS = 180;

export async function listCoverageWon(
  siteId: string,
  signal?: AbortSignal,
): Promise<CoverageMention[]> {
  const since = new Date(
    Date.now() - COVERAGE_WINDOW_DAYS * 86_400_000,
  ).toISOString();
  const response = await (await seoDb())
    .from("coverage_mention")
    .select("*")
    .eq("site_id", siteId)
    .eq("is_competitor", false)
    .gte("discovered_at", since)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

/**
 * The angle a piece of coverage came from, when the producer recorded one.
 * `metadata` is free-form `Json`, so this is guarded rather than cast.
 */
export function angleIdFromMention(mention: CoverageMention): string | null {
  if (!isJsonRecord(mention.metadata)) return null;
  const raw = mention.metadata["story_angle_id"];
  return typeof raw === "string" && raw ? raw : null;
}

/**
 * The sample dataset, fetched only when the surface actually needs it.
 *
 * `fixtures.ts` is the biggest file in this feature and it exists for the case
 * where the real reads come back empty — a case that disappears the day
 * `seo.story_angle` has rows. Shipping it statically taxed every user's bundle
 * for a screen approximately nobody sees, so it loads on demand.
 *
 * The anchor is fixed on the first mount so the relative deadlines inside the
 * fixture do not re-randomise under the user while they read the page, exactly
 * as the eager version behaved.
 */
function useSampleFixture(wanted: boolean): PressRoomFixture | null {
  const [anchor] = useState(() => Date.now());
  const [fixture, setFixture] = useState<PressRoomFixture | null>(null);

  useEffect(() => {
    if (!wanted || fixture !== null) return;
    let cancelled = false;
    void import("@/features/marketing/pr/fixtures").then(
      (module) => {
        if (!cancelled) setFixture(module.buildPressRoomFixture(anchor));
      },
      (error: unknown) => {
        // Loud, never silent: a chunk that fails to arrive would otherwise
        // read as "the sample is empty", which is a different claim entirely.
        console.error("[press-room] sample dataset failed to load:", error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [wanted, fixture, anchor]);

  return fixture;
}

export interface PressRoomData {
  angles: StoryAngle[];
  requests: SourceRequest[];
  coverage: CoverageMention[];
  /** True when the three reads returned nothing and sample data is on screen. */
  isSample: boolean;
  sampleBrandName: string | null;
  isLoading: boolean;
  /** The load is not merely slow — it is offline or being retried. */
  isStalled: boolean;
  stallReason: "offline" | "retrying" | null;
  /** How many times the reads have already been retried. */
  retryAttempt: number;
  isError: boolean;
  error: unknown;
  /** Named so the error strip can say WHICH read failed. */
  failed: string[];
  refetch: () => void;
  isFetching: boolean;
  /** Non-null when `?data=` is forcing this state rather than the DB producing it. */
  forcedScenario: Exclude<PressRoomScenario, "live"> | null;
}

const FORCED_ERROR = new Error(
  // access-errors: ok — deliberate ?data=error fixture string, not real page copy
  "seo.story_angle: permission denied for schema seo (RLS). This is the forced ?data=error state — no real read failed.",
);

export function usePressRoom(
  siteId: string,
  scenario: PressRoomScenario = "live",
): PressRoomData {
  const forced = scenario === "live" ? null : scenario;
  const enabled = Boolean(siteId) && forced === null;

  const angles = useQuery({
    queryKey: pressKeys.angles(siteId),
    queryFn: ({ signal }) => listStoryAngles(siteId, signal),
    enabled,
    staleTime: 60_000,
  });
  const requests = useQuery({
    queryKey: pressKeys.requests(siteId),
    queryFn: ({ signal }) => listSourceRequests(siteId, signal),
    enabled,
    // Deadlines move; a stale request queue is the one thing that hurts.
    staleTime: 30_000,
    refetchInterval: 5 * 60_000,
  });
  const coverage = useQuery({
    queryKey: pressKeys.coverage(siteId),
    queryFn: ({ signal }) => listCoverageWon(siteId, signal),
    enabled,
    staleTime: 5 * 60_000,
  });

  const liveLoading =
    enabled && (angles.isLoading || requests.isLoading || coverage.isLoading);

  /**
   * A REAL stall signal, not a timer. React Query reports `isPaused` when the
   * browser is offline and a rising `failureCount` while it retries a request
   * that errored or never answered — both mean "we asked and got nothing", the
   * silence a user would otherwise read as a hung page. A wall-clock timeout
   * would also fire on a merely slow-but-healthy fetch and say the wrong thing.
   */
  const isPaused = angles.isPaused || requests.isPaused || coverage.isPaused;
  const retrying = Math.max(
    angles.failureCount,
    requests.failureCount,
    coverage.failureCount,
  );

  const realAngles = angles.data ?? [];
  const realRequests = requests.data ?? [];
  const realCoverage = coverage.data ?? [];
  const settled = !liveLoading && !angles.isError && !requests.isError;
  // Also true before a site is chosen: the queries are disabled, there is
  // nothing real to show, and the honest sample + its banner is more use than
  // an empty page. The banner names which of the three cases this is.
  const wantsSample =
    forced === "ready" ||
    (forced === null &&
      settled &&
      realAngles.length === 0 &&
      realRequests.length === 0);

  // Loaded on demand — see `useSampleFixture`. Until the chunk lands this is
  // null, and the surface reports `isLoading`, which is exactly what it is.
  const fixture = useSampleFixture(wantsSample);
  const isSample = wantsSample && fixture !== null;

  const refetch = useCallback(() => {
    void angles.refetch();
    void requests.refetch();
    void coverage.refetch();
  }, [angles, requests, coverage]);

  if (forced !== null) {
    return {
      angles: fixture?.angles ?? [],
      requests: fixture?.requests ?? [],
      coverage: fixture?.coverage ?? [],
      isSample,
      sampleBrandName: fixture?.brandName ?? null,
      // `?data=ready` is still loading while its sample chunk is in flight.
      isLoading: forced === "stalled" || (wantsSample && fixture === null),
      isStalled: forced === "stalled",
      stallReason: forced === "stalled" ? "retrying" : null,
      retryAttempt: forced === "stalled" ? 2 : 0,
      isError: forced === "error",
      error: forced === "error" ? FORCED_ERROR : null,
      failed: forced === "error" ? ["story angles"] : [],
      refetch,
      isFetching: false,
      forcedScenario: forced,
    };
  }

  const failed = [
    angles.isError ? "story angles" : null,
    requests.isError ? "source requests" : null,
    coverage.isError ? "coverage" : null,
  ].filter((value): value is string => value !== null);

  return {
    angles: isSample && fixture ? fixture.angles : realAngles,
    requests: isSample && fixture ? fixture.requests : realRequests,
    coverage: isSample && fixture ? fixture.coverage : realCoverage,
    isSample,
    sampleBrandName: isSample && fixture ? fixture.brandName : null,
    // The sample chunk being in flight is a load, not an empty page.
    isLoading: liveLoading || (wantsSample && fixture === null),
    isStalled: liveLoading && (isPaused || retrying > 0),
    stallReason: isPaused
      ? ("offline" as const)
      : retrying > 0
        ? ("retrying" as const)
        : null,
    retryAttempt: retrying,
    // A failed angles read is fatal to the page; a failed coverage read is not.
    isError: angles.isError || requests.isError,
    error: angles.error ?? requests.error ?? coverage.error,
    failed,
    refetch,
    isFetching: angles.isFetching || requests.isFetching || coverage.isFetching,
    forcedScenario: null,
  };
}

// ─── Rulings held in this session ───────────────────────────────────────────

/**
 * Accept / Mark pitched / Dismiss / "I have this" all WORK — the queue, the
 * funnel and the readiness numbers move together the moment one is made.
 *
 * ALL of them PERSIST: they write straight to `seo.story_angle` /
 * `seo.source_request` on the canonical client path (browser → Supabase
 * direct), optimistically, with any failure surfaced rather than silently
 * reverted. "I have this" writes the SAME projection the page is showing —
 * `missing_evidence`, `proof_required`, `evidence_refs`, `evidence_quality`
 * and the pitch promotion — through `projectEvidenceHold`, which is the ONE
 * place that computes it for both the screen and the row.
 *
 * ONE honest treatment, applied everywhere: the ruling applies, and the status
 * bar says out loud how many rulings were made and whether every one of them
 * was written. A disabled button that explains itself was the alternative, and
 * it is worse — it teaches the user the product cannot do the thing at all,
 * when in fact the whole surface can already compute the consequence.
 */
export interface PressRoomRulings {
  angleStatus: Record<string, string>;
  requestStatus: Record<string, string>;
  /** angle id → the proofs the human says are now in hand, when they said it. */
  evidenceHeld: Record<string, HeldEvidence[]>;
}

/**
 * One "I have this". `heldAt` is recorded ONCE, at the click, and reused on
 * every subsequent write for that angle — each hold rewrites the whole
 * projection from the stored row, so a stamp that moved would rewrite the
 * provenance of evidence the user confirmed ten minutes ago.
 */
export interface HeldEvidence {
  key: string;
  heldAt: string;
}

export const EMPTY_RULINGS: PressRoomRulings = {
  angleStatus: {},
  requestStatus: {},
  evidenceHeld: {},
};

export function countRulings(rulings: PressRoomRulings): number {
  return (
    Object.keys(rulings.angleStatus).length +
    Object.keys(rulings.requestStatus).length +
    Object.values(rulings.evidenceHeld).reduce(
      (sum, keys) => sum + keys.length,
      0,
    )
  );
}

export interface RulingController {
  rulings: PressRoomRulings;
  count: number;
  ruleAngle: (angleId: string, status: string) => void;
  ruleRequest: (requestId: string, status: string) => void;
  /**
   * Takes the STORED angle, not the projected one on screen: the write is
   * recomputed from the row in the database plus every hold made this session,
   * so it is idempotent and never stacks a projection on a projection.
   */
  holdEvidence: (angle: StoryAngle, proofKey: string) => void;
  discard: () => void;
  /** Ruling id → why its write failed. Empty when everything persisted. */
  failures: Record<string, string>;
}

/**
 * Persist a ruling. This is a DB write, so it goes DIRECT to Supabase on the
 * canonical client path — NOT through the Python `/press/angles/{id}/ruling`
 * endpoint, which exists for server-side callers. Routing a row update through
 * aidream would be the extra hop the platform rules forbid.
 *
 * Optimistic: state moves immediately and the row is written behind it. A
 * failed write surfaces on the ruling itself rather than silently reverting.
 */
async function persistAngleRuling(
  angleId: string,
  status: string,
): Promise<void> {
  const now = new Date().toISOString();
  const stamp: Record<string, string> = {
    accepted: "accepted_at",
    pitched: "pitched_at",
    landed: "landed_at",
    dismissed: "dismissed_at",
  };
  const patch: Database["seo"]["Tables"]["story_angle"]["Update"] = {
    status,
    human_reviewed_at: now,
    requires_human_review: false,
    ...(stamp[status] ? { [stamp[status]]: now } : {}),
  };

  const { error } = await supabase
    .schema("seo")
    .from("story_angle")
    .update(patch)
    .eq("id", angleId);
  if (error) throw operationFailed("save this ruling", error);
}

async function persistRequestRuling(
  requestId: string,
  status: string,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Database["seo"]["Tables"]["source_request"]["Update"] = {
    status,
    ...(status === "submitted" ? { submitted_at: now } : {}),
    ...(status === "won" ? { won_at: now } : {}),
  };

  const { error } = await supabase
    .schema("seo")
    .from("source_request")
    .update(patch)
    .eq("id", requestId);
  if (error) throw operationFailed("save this ruling", error);
}

/**
 * THE PITCH FLOOR. The backend gate (`aidream/services/seo/story_engine.py`
 * ::`gate_angle`) withdraws `pitch_now` below this, and this client mirrors it.
 * The two are one rule in two places: change one, change both, and say so in
 * `aidream/services/seo/FEATURE.md` § Press & PR.
 */
const PITCH_QUALITY_FLOOR = 50;

/**
 * PROVENANCE. An `evidence_refs` entry the USER put there must never be
 * mistakable for one the analyst cited from the evidence bundle. The `source`
 * line is what the ladder renders, so it says so in the user's own language;
 * `held_by` / `held_at` carry the machine-readable version for anything that
 * reads the column later (a re-analysis, an audit, a Hindsight replay).
 */
const HELD_EVIDENCE_SOURCE = "Confirmed by you";

export interface EvidenceHoldProjection {
  missing_evidence: Json;
  proof_required: Json;
  evidence_refs: Json;
  evidence_quality: number;
  recommended_action: string;
  requires_human_review: boolean;
}

function jsonArray(value: Json): Json[] {
  return Array.isArray(value) ? [...value] : [];
}

/**
 * THE ONE PROJECTION. What "I have this" does to an angle — for the screen and
 * for the row, computed once so the two can never disagree.
 *
 * It edits the STORED jsonb in place rather than serialising the parsed view
 * models back over the columns: the readers normalise key spellings and drop
 * what they cannot parse, so a round-trip through them would delete the
 * analyst's own fields and every malformed entry the surface promised to print
 * verbatim. Only three things change — the closed gap leaves
 * `missing_evidence`, a requirement that DECLARED itself unsatisfied is flipped
 * (silence is left alone: silence lets `missing_evidence` decide, and that gap
 * is already gone), and a new ref is appended carrying its provenance.
 *
 * `heldBy` is null on the in-memory path, where nothing renders it; the write
 * path passes the signed-in user's id.
 */
export function projectEvidenceHold(
  angle: StoryAngle,
  held: readonly HeldEvidence[],
  heldBy: string | null,
): EvidenceHoldProjection | null {
  if (held.length === 0) return null;
  const heldAt = new Map(held.map((entry) => [entry.key, entry.heldAt]));

  const missingKeys = readEntryKeys(angle.missing_evidence, "missing");
  const proofKeys = readEntryKeys(angle.proof_required, "proof");
  const missingByKey = new Map(
    readMissingEvidence(angle.missing_evidence).items.map((item) => [
      item.key,
      item,
    ]),
  );
  const declaredUnsatisfied = new Set(
    readProofRequired(angle.proof_required)
      .items.filter((item) => item.satisfied === false)
      .map((item) => item.key),
  );
  const existingRefKeys = new Set(
    readEvidenceRefs(angle.evidence_refs).items.map((item) => item.key),
  );

  const nextMissing = jsonArray(angle.missing_evidence).filter((_, index) => {
    const key = missingKeys[index];
    return key === null || !heldAt.has(key);
  });

  // A rung can be a gap because `proof_required` declared `satisfied: false`
  // while `missing_evidence` never named it. Holding that key has to clear the
  // declaration too, or "I have this" is a no-op that reports success.
  const nextProof = jsonArray(angle.proof_required).map((entry, index) => {
    const key = proofKeys[index];
    if (key === null || !heldAt.has(key)) return entry;
    if (!declaredUnsatisfied.has(key) || !isJsonObject(entry)) return entry;
    return { ...entry, satisfied: true };
  });

  const nextRefs = jsonArray(angle.evidence_refs);
  for (const entry of held) {
    if (existingRefKeys.has(entry.key)) continue;
    const gap = missingByKey.get(entry.key);
    if (!gap) continue;
    nextRefs.push({
      key: gap.key,
      label: gap.label,
      source: HELD_EVIDENCE_SOURCE,
      url: null,
      captured_at: entry.heldAt,
      held_at: entry.heldAt,
      ...(heldBy ? { held_by: heldBy } : {}),
    });
  }

  // Recomputed from the LADDER, so the number here and the bar the user is
  // looking at can never disagree. Deriving it from the raw columns counted a
  // different set of rungs and produced two percentages on one screen.
  const projected: StoryAngle = {
    ...angle,
    missing_evidence: nextMissing,
    proof_required: nextProof,
    evidence_refs: nextRefs,
  };
  const ladder = readLadder(projected);
  const quality = ladderPercent(ladder);

  // The payoff the whole surface promises: prove the last thing and the angle
  // becomes pitchable. Mirrors `gate_angle` — no outstanding rung, no
  // contradiction, and evidence quality at or above the floor.
  const contradictions = Array.isArray(angle.contradictions)
    ? angle.contradictions.length
    : 0;
  const stillBuilding =
    angle.recommended_action === "develop_evidence" ||
    angle.recommended_action === "needs_expert_input";
  const promoted =
    stillBuilding &&
    ladder.held === ladder.total &&
    contradictions === 0 &&
    quality >= PITCH_QUALITY_FLOOR;

  return {
    missing_evidence: nextMissing,
    proof_required: nextProof,
    evidence_refs: nextRefs,
    evidence_quality: quality,
    recommended_action: promoted ? "pitch_now" : angle.recommended_action,
    // Anything short of a clean pitch keeps its review flag — the same rule the
    // backend gate applies when it withdraws `pitch_now`.
    requires_human_review: promoted ? false : angle.requires_human_review,
  };
}

/**
 * Persist a hold, on the same canonical client path as a status ruling.
 *
 * The projection is recomputed from the STORED row plus every hold made this
 * session, so the write is idempotent: holding a second proof rewrites the
 * whole set from the row rather than stacking a projection on a projection,
 * and the first entry's `held_at` is reproduced exactly because it was recorded
 * at the click.
 */
async function persistEvidenceHold(
  angle: StoryAngle,
  held: readonly HeldEvidence[],
): Promise<void> {
  const session = await requireAuthenticatedSupabaseSession(supabase);
  const projection = projectEvidenceHold(angle, held, session.user.id);
  if (!projection) return;

  const patch: Database["seo"]["Tables"]["story_angle"]["Update"] = {
    missing_evidence: projection.missing_evidence,
    proof_required: projection.proof_required,
    evidence_refs: projection.evidence_refs,
    evidence_quality: projection.evidence_quality,
    recommended_action: projection.recommended_action,
    requires_human_review: projection.requires_human_review,
    human_reviewed_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .schema("seo")
    .from("story_angle")
    .update(patch)
    .eq("id", angle.id);
  if (error) throw operationFailed("save this review", error);
}

export function usePressRoomRulings(): RulingController {
  const [rulings, setRulings] = useState<PressRoomRulings>(EMPTY_RULINGS);
  const [failures, setFailures] = useState<Record<string, string>>({});

  const ruleAngle = useCallback((angleId: string, status: string) => {
    setRulings((current) => ({
      ...current,
      angleStatus: { ...current.angleStatus, [angleId]: status },
    }));
    void persistAngleRuling(angleId, status).then(
      () =>
        setFailures((f) => {
          if (!(angleId in f)) return f;
          const next = { ...f };
          delete next[angleId];
          return next;
        }),
      (err: Error) =>
        setFailures((f) => ({ ...f, [angleId]: err.message })),
    );
  }, []);

  const ruleRequest = useCallback((requestId: string, status: string) => {
    setRulings((current) => ({
      ...current,
      requestStatus: { ...current.requestStatus, [requestId]: status },
    }));
    void persistRequestRuling(requestId, status).catch((err: Error) =>
      setFailures((f) => ({ ...f, [requestId]: err.message })),
    );
  }, []);

  const holdEvidence = useCallback(
    (angle: StoryAngle, proofKey: string) => {
      const existing = rulings.evidenceHeld[angle.id] ?? [];
      if (existing.some((entry) => entry.key === proofKey)) return;
      const held: HeldEvidence[] = [
        ...existing,
        { key: proofKey, heldAt: new Date().toISOString() },
      ];
      setRulings((current) => ({
        ...current,
        evidenceHeld: { ...current.evidenceHeld, [angle.id]: held },
      }));

      // Keyed per PROOF, not per angle: two holds on one angle can fail
      // independently, and a status ruling on the same angle must not overwrite
      // either message.
      const failureKey = `${angle.id}#${proofKey}`;
      void persistEvidenceHold(angle, held).then(
        () =>
          setFailures((f) => {
            if (!(failureKey in f)) return f;
            const next = { ...f };
            delete next[failureKey];
            return next;
          }),
        (err: Error) =>
          setFailures((f) => ({ ...f, [failureKey]: err.message })),
      );
    },
    [rulings],
  );

  const discard = useCallback(() => setRulings(EMPTY_RULINGS), []);

  return useMemo(
    () => ({
      rulings,
      count: countRulings(rulings),
      ruleAngle,
      ruleRequest,
      holdEvidence,
      discard,
      failures,
    }),
    [rulings, ruleAngle, ruleRequest, holdEvidence, discard, failures],
  );
}

/**
 * A ruling is applied OVER the loaded row so the whole surface moves together.
 * It never mutates the source row, and it recomputes `evidence_quality` from
 * the ladder rather than inventing a number.
 */
export function applyAngleRulings(
  angles: readonly StoryAngle[],
  rulings: PressRoomRulings,
): StoryAngle[] {
  const hasStatus = Object.keys(rulings.angleStatus).length > 0;
  const hasEvidence = Object.keys(rulings.evidenceHeld).length > 0;
  if (!hasStatus && !hasEvidence) return [...angles];

  return angles.map((angle) => {
    const status = rulings.angleStatus[angle.id];
    const held = rulings.evidenceHeld[angle.id];
    if (!status && (!held || held.length === 0)) return angle;

    let next: StoryAngle = angle;
    if (status) next = { ...next, status };

    // THE SAME projection the write path persists — one function, so the page
    // and the row can never tell the user different things.
    const projection = projectEvidenceHold(angle, held ?? [], null);
    if (projection) next = { ...next, ...projection };

    return next;
  });
}

export function applyRequestRulings(
  requests: readonly SourceRequest[],
  rulings: PressRoomRulings,
): SourceRequest[] {
  if (Object.keys(rulings.requestStatus).length === 0) return [...requests];
  return requests.map((request) => {
    const status = rulings.requestStatus[request.id];
    return status ? { ...request, status } : request;
  });
}

// ─── The page clock ─────────────────────────────────────────────────────────

/**
 * ONE clock for every countdown on the page — a timer per row is how a list of
 * thirty deadlines starts dropping frames.
 *
 * It is an external store rather than state-in-an-effect for a specific reason:
 * the SERVER snapshot is `0`, and so is the client's first render, so the two
 * agree and hydration is exact. The real time arrives on the first published
 * tick, immediately after subscription. Callers treat `0` as "the clock has not
 * started" and render their loading state — never a countdown against the epoch.
 */
const CLOCK_INTERVAL_MS = 30_000;

let clockValue = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();

function publishClock() {
  for (const listener of clockListeners) listener();
}

function subscribeClock(onStoreChange: () => void): () => void {
  clockListeners.add(onStoreChange);
  if (clockTimer === null) {
    clockTimer = setInterval(() => {
      clockValue = Date.now();
      publishClock();
    }, CLOCK_INTERVAL_MS);
  }
  if (clockValue === 0) {
    clockValue = Date.now();
    // After the current commit, never during it.
    queueMicrotask(publishClock);
  }
  return () => {
    clockListeners.delete(onStoreChange);
    if (clockListeners.size === 0 && clockTimer !== null) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

const readClock = () => clockValue;
const readServerClock = () => 0;

/** Milliseconds since epoch, or `0` before the clock has started. */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribeClock, readClock, readServerClock);
}
