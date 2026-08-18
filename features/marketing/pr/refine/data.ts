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
 * Coverage → angle: `seo.coverage_mention` has NO foreign key to
 * `seo.story_angle`. The tie lives in `metadata.story_angle_id`, and THIS FILE
 * is the only reader of that key — nothing downstream assumes the shape.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { isJsonRecord } from "@/features/marketing/types";
import {
  buildPressRoomFixture,
  type PressRoomFixture,
} from "@/features/marketing/pr/refine/fixtures";
import type {
  CoverageMention,
  SourceRequest,
  StoryAngle,
} from "@/features/marketing/pr/refine/types";

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
}

export function usePressRoom(siteId: string): PressRoomData {
  const enabled = Boolean(siteId);
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

  const isLoading =
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
  const isStalled = isLoading && (isPaused || retrying > 0);

  // The sample dataset is built once per mount so its relative deadlines do not
  // re-randomise under the user while they read the page.
  const [fixtureAnchor] = useState(() => Date.now());
  const fixture = useMemo<PressRoomFixture>(
    () => buildPressRoomFixture(fixtureAnchor),
    [fixtureAnchor],
  );

  const realAngles = angles.data ?? [];
  const realRequests = requests.data ?? [];
  const realCoverage = coverage.data ?? [];
  const settled = !isLoading && !angles.isError && !requests.isError;
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
    isLoading,
    isStalled,
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
    refetch: () => {
      void angles.refetch();
      void requests.refetch();
      void coverage.refetch();
    },
    isFetching: angles.isFetching || requests.isFetching || coverage.isFetching,
  };
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
