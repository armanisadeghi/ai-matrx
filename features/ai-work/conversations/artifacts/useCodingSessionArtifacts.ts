"use client";

// features/ai-work/conversations/artifacts/useCodingSessionArtifacts.ts
//
// ARTIFACTS FOR EVERY TOOL ON THE CONVERSATION, NOT ONE.
//
// Artifact rows are keyed by `metadata.cli_session_id` = one provider session
// id. Since `handoff` (lane XT-05) a conversation can carry SEVERAL claimed
// provider sessions, and this hook used to take a single id — so the transcript
// picked one binding and the originating tool's artifacts were structurally
// invisible on the screen (verifier V-XT-5 § A7: "genuinely broken by
// plurality").
//
// So it now reads EVERY claimed session and keeps the rows GROUPED BY THE TOOL
// that produced them. A merged, unlabelled list would swap one lie for another:
// the panel must be able to say whose files these are. `rows` is the merged set
// for counting only.
//
// An unclaimed handoff offer has no provider session, so it is not in the input
// at all (`artifactSessions` in `../bindingPlurality` decides that) and can
// never appear as a tool with an empty file list.
//
// One tool's failed read never hides another's rows: each group carries its own
// outcome, and the aggregate `state` is `error` only when EVERY read failed.

import { useEffect, useState } from "react";
import type { ArtifactSessionRef } from "../bindingPlurality";
import {
  fetchCodingSessionArtifacts,
  type CodingSessionArtifactRow,
} from "./service";

/** One tool's artifacts, with its own read outcome. */
export interface CodingSessionArtifactGroup extends ArtifactSessionRef {
  state: "loading" | "ready" | "error";
  rows: CodingSessionArtifactRow[];
  error: string | null;
}

export interface CodingSessionArtifactsState {
  /** `idle` = no claimed provider session to read for (binding still loading,
   *  absent, or nothing but unclaimed handoff offers). */
  state: "idle" | "loading" | "ready" | "error";
  /** Every tool's rows merged — the conversation's WHOLE artifact set. Use it
   *  for counting; use `groups` to render, so each file is attributed. */
  rows: CodingSessionArtifactRow[];
  /** One entry per claimed provider session, in the order given. */
  groups: CodingSessionArtifactGroup[];
  /** Set when every read failed, and when SOME did (with `state: "ready"`). */
  error: string | null;
  reload: () => void;
}

interface SessionOutcome {
  rows: CodingSessionArtifactRow[];
  error: string | null;
}

interface ReadResult {
  /** The exact session set this result answers for; a stale set is ignored. */
  forKey: string;
  bySession: Record<string, SessionOutcome>;
}

/** Stable identity of a session set — the effect's only dependency, so a new
 *  array with the same sessions never re-reads. */
function sessionKey(sessions: readonly ArtifactSessionRef[]): string {
  return JSON.stringify(
    sessions.map((session) => [session.provider, session.providerSessionId]),
  );
}

/**
 * Reads the artifacts of every claimed provider session on a conversation.
 * An empty list means "there is no session to read for" and yields the honest
 * `idle` state rather than a pretend-empty file list.
 */
export function useCodingSessionArtifacts(
  sessions: readonly ArtifactSessionRef[],
): CodingSessionArtifactsState {
  const key = sessionKey(sessions);
  const [result, setResult] = useState<ReadResult | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const pairs = JSON.parse(key) as [string, string][];
    if (pairs.length === 0) return;
    let cancelled = false;
    void Promise.all(
      pairs.map(async ([, providerSessionId]) => {
        try {
          const rows = await fetchCodingSessionArtifacts(providerSessionId);
          return [providerSessionId, { rows, error: null }] as const;
        } catch (err: unknown) {
          console.error(
            "[useCodingSessionArtifacts] artifact read failed",
            providerSessionId,
            err,
          );
          return [
            providerSessionId,
            {
              rows: [],
              error: err instanceof Error ? err.message : "Artifact read failed",
            },
          ] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setResult({ forKey: key, bySession: Object.fromEntries(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [key, reloadToken]);

  const reload = () => {
    // Drop the answered result so the panel shows "loading" again instead of
    // the stale list while the re-read is in flight.
    setResult(null);
    setReloadToken((n) => n + 1);
  };

  const answered = result && result.forKey === key ? result.bySession : null;
  const groups: CodingSessionArtifactGroup[] = sessions.map((session) => {
    const outcome = answered?.[session.providerSessionId];
    if (!outcome) {
      return { ...session, state: "loading", rows: [], error: null };
    }
    return outcome.error !== null
      ? { ...session, state: "error", rows: [], error: outcome.error }
      : { ...session, state: "ready", rows: outcome.rows, error: null };
  });

  if (sessions.length === 0) {
    return { state: "idle", rows: [], groups: [], error: null, reload };
  }
  if (!answered) {
    return { state: "loading", rows: [], groups, error: null, reload };
  }
  const failed = groups.filter((group) => group.state === "error");
  if (failed.length === groups.length) {
    return {
      state: "error",
      rows: [],
      groups,
      error: failed[0]?.error ?? "Artifact read failed",
      reload,
    };
  }
  return {
    state: "ready",
    rows: groups.flatMap((group) => group.rows),
    groups,
    // A partial failure is stated, never swallowed: the tools that answered
    // still render, and the ones that did not say so on their own section.
    error:
      failed.length > 0
        ? `${failed.length} of ${groups.length} tools' artifacts could not be read.`
        : null,
    reload,
  };
}
