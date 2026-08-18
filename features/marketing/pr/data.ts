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

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";

import type { Database, Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { isJsonRecord } from "@/features/marketing/types";
import {
  buildPressRoomFixture,
  type PressRoomFixture,
} from "@/features/marketing/pr/fixtures";
import type { PressRoomScenario } from "@/features/marketing/pr/routes";
import { ladderPercent, readLadder } from "@/features/marketing/pr/ladder";
import {
  readEvidenceRefs,
  readMissingEvidence,
  readProofRequired,
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

  // The sample dataset is built once per mount so its relative deadlines do not
  // re-randomise under the user while they read the page.
  const [fixtureAnchor] = useState(() => Date.now());
  const fixture = useMemo<PressRoomFixture>(
    () => buildPressRoomFixture(fixtureAnchor),
    [fixtureAnchor],
  );

  const refetch = useCallback(() => {
    void angles.refetch();
    void requests.refetch();
    void coverage.refetch();
  }, [angles, requests, coverage]);

  if (forced !== null) {
    const showSample = forced === "ready";
    return {
      angles: showSample ? fixture.angles : [],
      requests: showSample ? fixture.requests : [],
      coverage: showSample ? fixture.coverage : [],
      isSample: showSample,
      sampleBrandName: showSample ? fixture.brandName : null,
      isLoading: forced === "stalled",
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

  const realAngles = angles.data ?? [];
  const realRequests = requests.data ?? [];
  const realCoverage = coverage.data ?? [];
  const settled = !liveLoading && !angles.isError && !requests.isError;
  // Also true before a site is chosen: the queries are disabled, there is
  // nothing real to show, and the honest sample + its banner is more use than
  // an empty page. The banner names which of the three cases this is.
  const isSample =
    settled && realAngles.length === 0 && realRequests.length === 0;

  const failed = [
    angles.isError ? "story angles" : null,
    requests.isError ? "source requests" : null,
    coverage.isError ? "coverage" : null,
  ].filter((value): value is string => value !== null);

  return {
    angles: isSample ? fixture.angles : realAngles,
    requests: isSample ? fixture.requests : realRequests,
    coverage: isSample ? fixture.coverage : realCoverage,
    isSample,
    sampleBrandName: isSample ? fixture.brandName : null,
    isLoading: liveLoading,
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
 * Status rulings PERSIST: they write straight to `seo.story_angle` /
 * `seo.source_request` on the canonical client path (browser → Supabase
 * direct), optimistically, with any failure surfaced rather than silently
 * reverted. "I have this" is still session-only — it recomputes the ladder but
 * has no column of its own to land in yet.
 *
 * ONE honest treatment, applied everywhere: the ruling applies, and the status
 * bar says out loud how many rulings are held in this session and offers to
 * discard them. A disabled button that explains itself was the alternative, and
 * it is worse — it teaches the user the product cannot do the thing at all,
 * when in fact the whole surface can already compute the consequence.
 */
export interface PressRoomRulings {
  angleStatus: Record<string, string>;
  requestStatus: Record<string, string>;
  /** angle id → proof keys the human says are now in hand. */
  evidenceHeld: Record<string, string[]>;
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
  holdEvidence: (angleId: string, proofKey: string) => void;
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
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

  const holdEvidence = useCallback((angleId: string, proofKey: string) => {
    setRulings((current) => {
      const existing = current.evidenceHeld[angleId] ?? [];
      if (existing.includes(proofKey)) return current;
      return {
        ...current,
        evidenceHeld: {
          ...current.evidenceHeld,
          [angleId]: [...existing, proofKey],
        },
      };
    });
  }, []);

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

    if (held && held.length > 0) {
      const missing = readMissingEvidence(next.missing_evidence).items;
      const refs = readEvidenceRefs(next.evidence_refs).items;
      const proof = readProofRequired(next.proof_required).items;
      const moved = missing.filter((item) => held.includes(item.key));
      const remaining = missing.filter((item) => !held.includes(item.key));
      const nextRefs = [
        ...refs,
        ...moved
          .filter((item) => !refs.some((ref) => ref.key === item.key))
          .map((item) => ({
            key: item.key,
            label: item.label,
            source: "Confirmed by you in this session",
            url: null,
            captured_at: new Date().toISOString(),
          })),
      ];
      // A rung can be a gap because `proof_required` declared `satisfied: false`
      // while `missing_evidence` never named it. Holding that key has to clear
      // the declaration too, or "I have this" is a no-op that reports success.
      const nextProof = proof.map((item) =>
        held.includes(item.key) && item.satisfied === false
          ? { ...item, satisfied: true }
          : item,
      );

      next = {
        ...next,
        missing_evidence: remaining as unknown as Json,
        evidence_refs: nextRefs as unknown as Json,
        proof_required: nextProof as unknown as Json,
      };

      // Recomputed from the LADDER, so the number here and the bar the user is
      // looking at can never disagree. Deriving it from the raw columns counted
      // a different set of rungs and produced two percentages on one screen.
      const ladder = readLadder(next);
      next = { ...next, evidence_quality: ladderPercent(ladder) };

      // The payoff the whole surface promises: prove the last thing and the
      // angle becomes pitchable. Mirrors the backend gate in
      // `story_engine.gate_angle` — no outstanding rung, no contradiction, and
      // evidence quality at or above the floor.
      const contradictions = Array.isArray(next.contradictions)
        ? next.contradictions.length
        : 0;
      const stillBuilding =
        next.recommended_action === "develop_evidence" ||
        next.recommended_action === "needs_expert_input";
      if (
        stillBuilding &&
        ladder.held === ladder.total &&
        contradictions === 0 &&
        (next.evidence_quality ?? 0) >= 50
      ) {
        next = { ...next, recommended_action: "pitch_now" };
      }
    }
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
