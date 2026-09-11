"use client";

/** React hook over resolveMandate — see service.ts for the resolution
 * doctrine. Loud: `error` set means the mandate could not resolve; the consumer
 * disables its affordance and shows the message, never falls back to a
 * hardcoded agent id. Re-resolves automatically when the mandate's cache is
 * invalidated (a binding was saved/removed via the mandate picker or /mandates). */

import { useEffect, useState } from "react";
import {
  MandateOrganizationUnresolvedError,
  onMandateCacheInvalidated,
  resolveMandate,
  type ResolvedMandate,
} from "./service";
import { extractErrorMessage } from "@/utils/errors";

export interface MandateState {
  mandate: ResolvedMandate | null;
  loading: boolean;
  error: string | null;
  /**
   * 🚨 THE DOOR SAID THIS JOB DOES NOT EXIST — and ONLY that (a 404 from
   * `GET /mandates/{key}/resolution`). `mandate === null` does NOT mean this:
   * it is also every refusal, every unadmitted organization and every network
   * failure, because the optional lane sets `mandate` to null on all of them.
   *
   * V-PARITY/UX F4 (2026-09-08): `AutomationButton` read `mandate !== null` as
   * "the job exists", so a LIVE, system-homed `mandate.goal_writer` wore
   * *"Not available yet — … no live job has that name. Create it and this
   * button works"* — a disabled control with a false, actionable reason,
   * telling an admin to create a job that already exists. It is the second
   * time this key's probe has lied, and both times because one boolean was
   * carrying three different facts. So the three facts are three fields:
   * `loading`, `absent`, and `error` (the door's own sentence).
   */
  absent: boolean;

  /**
   * 🚨 THE WORKSPACE IS NOT READY YET — and that is NOT a broken binding.
   *
   * Which agent runs a job depends on the active organization, so resolution
   * refuses until one is in force (`MandateOrganizationUnresolvedError`). On a
   * COLD navigation that refusal arrives as "workspace initialization timed
   * out", and consumers printed it inside their unbound-mandate remedy:
   * *"…An administrator can bind an agent to the `masterwork.conductor`
   * Mandate."* — telling an Expert to go fix a binding that was never broken
   * (wall W10, Expert Book Challenge 2026-09-10; reproduced twice on a cold
   * `/masterwork/[id]/conduct`).
   *
   * So it is its own fact. `organizationPending` means WAIT, not REPAIR: the
   * consumer shows a "getting your workspace ready" state and must never
   * print the administrator remedy. The hook has already retried once on its
   * own before setting it.
   */
  organizationPending: boolean;
}

interface UseMandateOptions {
  /** An unresolved optional override is an expected fallback, not a console error. */
  optional?: boolean;
}

export function useMandate(
  mandateKey: string,
  options: UseMandateOptions = {},
): MandateState {
  const hasMandateKey = mandateKey.trim().length > 0;
  const [state, setState] = useState<
    MandateState & { key: string; epoch: number; organizationRetries: number }
  >({
    key: mandateKey,
    epoch: 0,
    organizationRetries: 0,
    mandate: null,
    loading: hasMandateKey,
    error: null,
    absent: false,
    organizationPending: false,
  });

  // Reset for a new mandate key during render (the documented adjust-state-on-
  // prop-change pattern) — never synchronously inside the effect.
  if (state.key !== mandateKey) {
    setState({
      key: mandateKey,
      epoch: 0,
      organizationRetries: 0,
      mandate: null,
      loading: hasMandateKey,
      error: null,
      absent: false,
      organizationPending: false,
    });
  }

  // Bump the epoch when this mandate's cached resolution is invalidated so the
  // resolve effect re-runs (e.g. the user just saved an override).
  useEffect(() => {
    return onMandateCacheInvalidated((invalidatedKey) => {
      if (invalidatedKey === undefined || invalidatedKey === mandateKey) {
        setState((prev) => ({ ...prev, epoch: prev.epoch + 1, loading: true }));
      }
    });
  }, [mandateKey]);

  const epoch = state.epoch;
  useEffect(() => {
    // Callers with an optional resolution lane still invoke hooks
    // unconditionally. The empty key is their disabled sentinel, not a
    // mandate identity: never turn it into a zero-row database read.
    if (!hasMandateKey) return;

    let cancelled = false;
    const resolution = options.optional
      ? resolveMandate(mandateKey, { optional: true })
      : resolveMandate(mandateKey);
    resolution
      .then((mandate) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            key: mandateKey,
            mandate,
            loading: false,
            error: null,
            // The optional lane answers `null` for a 404 and ONLY a 404 —
            // every other outcome throws. That is what makes "absent"
            // provable rather than guessed.
            absent: mandate === null,
            organizationPending: false,
          }));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // THE WORKSPACE, NOT THE BINDING. A cold navigation can reach this
        // hook before an organization is in force; resolution then refuses
        // with `MandateOrganizationUnresolvedError`, which is a WAIT and not a
        // fault. Retry once on our own before telling anybody anything —
        // initialization normally lands in that window — and when it still has
        // not, say `organizationPending` rather than handing the consumer a
        // sentence it will print under an "ask an administrator" remedy.
        const organizationPending =
          error instanceof MandateOrganizationUnresolvedError;
        if (organizationPending && state.organizationRetries === 0) {
          setState((prev) => ({
            ...prev,
            key: mandateKey,
            organizationRetries: prev.organizationRetries + 1,
            epoch: prev.epoch + 1,
            loading: true,
          }));
          return;
        }
        const message = extractErrorMessage(error);
        if (!options.optional && !organizationPending) {
          console.error(`[mandates] ${mandateKey} failed to resolve:`, message);
        }
        setState((prev) => ({
          ...prev,
          key: mandateKey,
          mandate: null,
          loading: false,
          error: message,
          // A refusal is not an absence. Saying "no such job" here is the
          // F4 lie.
          absent: false,
          organizationPending,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [
    mandateKey,
    epoch,
    options.optional,
    hasMandateKey,
    state.organizationRetries,
  ]);

  return {
    mandate: state.mandate,
    loading: state.loading,
    error: state.error,
    absent: state.absent,
    organizationPending: state.organizationPending,
  };
}
