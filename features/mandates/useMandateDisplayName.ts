"use client";

// features/mandates/useMandateDisplayName.ts
//
// 🚨 A DISCLOSURE NAMES THE JOB. IT NEVER PRINTS THE KEY.
//
// Cold walk 20 (2026-09-22, production v0.4.2135 AND v0.4.2139) read this off
// the Rulebook — the screen a first-time Expert returns to more than any other
// — on EVERY load:
//
//     Understudy
//     masterwork.understudy
//     Quick test of a temporary stand-in we're building in real time
//
// and `masterwork.scout` heading the interview drawer. Walks 16, 17, 18 and 19
// each saw it and each filed it as "friction"; four walks of friction is how a
// defect survives.
//
// The rule was already written down in `./mandate-words` — "slugs live in mono
// chips; prose speaks labels" — and `mandateDisplayName` was already the ONE
// function that turns a key into words. What every disclosure lacked was the
// LABEL: `declare_mandate("masterwork.understudy", label="Masterwork —
// Understudy", …)` in aidream writes `agent.mandate.label`, and no disclosure
// surface read it, so each one fell back to `?? mandateKey` by copy-paste.
//
// This is that read, once, for every disclosure — and it is SYNCHRONOUSLY SAFE:
// before the label arrives (and forever, if the read fails or the row is gone)
// the name is derived from the key's own last segment by `mandateDisplayName`,
// which is a derivation of what the author typed, never an invention and never
// the dotted key. There is no frame in which a disclosure paints a key.
//
// Guard: `features/mandates/__tests__/no-disclosure-prints-a-mandate-key.test.tsx`.

import { useEffect, useState } from "react";

import { fetchMandateIdentities } from "@/features/mandates/service";
import { mandateDisplayName } from "@/features/mandates/mandate-words";

/** key → the author's label, once read. `null` = read, and there is none. */
const labels = new Map<string, string | null>();
/** key → the in-flight read, so twelve chips on one page make one request. */
const inflight = new Map<string, Promise<string | null>>();

/** Test seam — the caches are module state, so a suite must be able to clear them. */
export function __resetMandateDisplayNameCache(): void {
  labels.clear();
  inflight.clear();
}

async function readLabel(mandateKey: string): Promise<string | null> {
  const existing = inflight.get(mandateKey);
  if (existing) return existing;
  const run = fetchMandateIdentities([mandateKey])
    .then((identities) => {
      const label = identities[mandateKey]?.label ?? null;
      labels.set(mandateKey, label);
      return label;
    })
    .catch((error: unknown) => {
      // A NAME IS A COURTESY, NEVER A GATE (the `org_names` law). A failed read
      // leaves the derived name standing; it never falls back to the key and it
      // never says "unknown". The failure is still loud in the console.
      console.error("[mandates] display-name read failed", mandateKey, error);
      labels.set(mandateKey, null);
      return null;
    })
    .finally(() => {
      inflight.delete(mandateKey);
    });
  inflight.set(mandateKey, run);
  return run;
}

/**
 * The job's name as a person reads it — the author's label when the platform
 * has one, otherwise the key's last segment title-cased. Never the key.
 *
 * Pass `label` when the caller already holds the row (the Agents menu batches
 * its own identity read); the hook then does no work at all.
 */
export function useMandateDisplayName(
  mandateKey: string,
  label?: string | null,
): string {
  const given = typeof label === "string" ? label.trim() : "";
  const [resolved, setResolved] = useState<string | null>(
    () => labels.get(mandateKey) ?? null,
  );

  useEffect(() => {
    if (given) return;
    if (!mandateKey) return;
    if (labels.has(mandateKey)) {
      setResolved(labels.get(mandateKey) ?? null);
      return;
    }
    let cancelled = false;
    void readLabel(mandateKey).then((next) => {
      if (!cancelled) setResolved(next);
    });
    return () => {
      cancelled = true;
    };
  }, [mandateKey, given]);

  return mandateDisplayName(mandateKey, given || resolved);
}
