"use client";

// features/mandates/workspace/useMandateLadder.ts
//
// THE LADDER, READ FROM THE ONE PLACE IT IS WRITTEN.
//
// `mandate.resolve(p_mandate_key, p_organization_id)` is L0's CLIENT DOOR
// (SECURITY DEFINER, granted to `authenticated`, `EXECUTE` revoked from
// PUBLIC). It takes no principal: the subject is `auth.uid()`, and the
// organization argument is proved against `iam.organization_member` inside the
// function — a non-member asking for an org simply gets no `org` rung, which is
// the truth rather than a refusal.
//
// It returns ONE ROW PER RUNG in ladder order (`system` → `global` → `org` →
// `user`), each row carrying `holder_live` / `version_live` so a rung pointing
// at something that cannot be read is shown as BROKEN instead of rendering as a
// working override. Design:
// /common-docs/projects/workflow-mandate-program/DESIGN-one-resolution.md
// (return shape frozen, v2).
//
// 🚨 THIS IS A VIEW, NOT AN ANSWER. Nothing here decides which rung wins — that
// is the server verdict (`resolveMandate` → `GET /mandates/{key}/resolution`),
// and deriving a winner from these rows would be a fourth hand-written ladder,
// which is the exact defect the one-resolution campaign exists to kill. Rows are
// rendered as "what each rung says", in the order the database returned them.

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";
import { onMandateCacheInvalidated } from "../service";

/** A rung of the one ladder. `run` never appears here — it is not stored. */
export type MandateRung = "system" | "global" | "org" | "user";

/**
 * One row of `mandate.resolve`, field for field. Frozen contract — verified
 * against the live `pg_proc` signature on 2026-09-07.
 */
export interface MandateLadderRow {
  rung: MandateRung;
  binding_id: string | null;
  organization_id: string | null;
  subject_user_id: string | null;
  is_enabled: boolean;
  holder_type: string | null;
  holder_id: string | null;
  holder_version_id: string | null;
  /** `null` when the rung names no agent holder; `false` = it cannot be read. */
  holder_live: boolean | null;
  /** `null` when the rung pins no version; `false` = it cannot be read. */
  version_live: boolean | null;
  chose_holder: boolean;
  config_overrides: Json | null;
  consumption_map: Json | null;
  auto_run: boolean | null;
  definition_id: string;
  definition_enabled: boolean;
  fallback_mandate_key: string | null;
  /**
   * 🚨 WHY THIS RUNG WILL NOT DECIDE — the database's own sentence, or `null`
   * when it can (the 18th column, added by aidream migration 0593 and recorded
   * as an amendment to the frozen return shape).
   *
   * It is set when the platform turned the binding off with a reason, and when
   * the rung's Holder is not runnable by THAT RUNG'S OWN principal — an org
   * rung is judged for the organization, not for whoever is looking, so two
   * members of one organization now read the same words here.
   *
   * Optional on the type because a browser can be newer than the database it
   * is talking to; when it is absent this screen says exactly what it said
   * before, never something it cannot back up.
   */
  dropped_reason?: string | null;
  /**
   * 🚨 THE DISCRIMINATOR BEHIND THAT SENTENCE — `mandate._rungs`' 22nd column
   * (aidream `0599`): `platform_disabled` | `holder_unreachable` |
   * `output_contract_unmet`, or `null`/empty when the rung can run.
   *
   * V-PARITY/UX F2, on production v0.4.1728: this column had **zero consumers
   * in the frontend**, so `ladderRowIsBroken()` — which keyed on `holder_live`
   * / `version_live` only — called an output-contract drop *"Names an agent,
   * running its latest version."* The holder IS live in that state; the rung
   * still does not decide. A client that re-derives the door's judgement will
   * always be one rule behind it, so it renders the judgement instead.
   */
  dropped_code?: string | null;
}

/** Generated directly from the live `mandate.resolve` RPC contract. */
type GeneratedLadderRow =
  Database["mandate"]["Functions"]["resolve"]["Returns"][number];

function isMandateRung(value: string): value is MandateRung {
  return value === "system" || value === "global" || value === "org" || value === "user";
}

function toMandateLadderRow(row: GeneratedLadderRow): MandateLadderRow {
  if (!isMandateRung(row.rung)) {
    throw new Error(`The mandate ladder returned an unknown rung: ${row.rung}`);
  }
  return { ...row, rung: row.rung };
}

export async function fetchMandateLadder(
  mandateKey: string,
  organizationId: string | null,
): Promise<MandateLadderRow[]> {
  const args = organizationId
    ? { p_mandate_key: mandateKey, p_organization_id: organizationId }
    : { p_mandate_key: mandateKey };
  const { data, error } = await supabase.schema("mandate").rpc("resolve", args);
  if (error) {
    throw new Error(
      error.message?.trim()
        ? `${error.message}${error.code ? ` (${error.code})` : ""}`
        : "The ladder could not be read — the database answered with no message.",
    );
  }
  return (data ?? []).map(toMandateLadderRow);
}

export interface MandateLadderState {
  rows: MandateLadderRow[];
  loading: boolean;
  /** One plain sentence. A ladder that could not be read says so; it never
   * renders as "no overrides", which is a different fact entirely. */
  error: string | null;
}

/**
 * The ladder for THIS caller in THIS organization. Re-reads when a binding is
 * written anywhere (the same invalidation the resolution cache listens to), so
 * saving an override on this very page updates the rungs beneath it.
 */
export function useMandateLadder(
  mandateKey: string,
  organizationId: string | null,
): MandateLadderState {
  const enabled = mandateKey.trim().length > 0;
  // The question this state answers, as one value: a different key or a
  // different organization is a different ladder, never a stale one dressed up
  // as the current one.
  const question = `${mandateKey}|${organizationId ?? ""}`;
  const [state, setState] = useState<MandateLadderState & { question: string }>({
    question,
    rows: [],
    loading: enabled,
    error: null,
  });
  const [epoch, setEpoch] = useState(0);

  // Reset for a new question DURING RENDER (the documented adjust-state-on-
  // prop-change pattern) — never synchronously inside the effect.
  if (state.question !== question) {
    setState({ question, rows: [], loading: enabled, error: null });
  }

  useEffect(
    () => onMandateCacheInvalidated(() => setEpoch((e) => e + 1)),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchMandateLadder(mandateKey, organizationId)
      .then((rows) => {
        if (!cancelled) setState({ question, rows, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          question,
          rows: [],
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [mandateKey, organizationId, question, enabled, epoch]);

  return { rows: state.rows, loading: state.loading, error: state.error };
}

/* -------------------------------------------------------------------------- */
/* What a rung SAYS — pure, so the words are testable without a database.      */
/* -------------------------------------------------------------------------- */

/**
 * A rung is BROKEN when it names something that cannot be read: an agent whose
 * row is gone or not shared with this person, or a pinned version that is. The
 * database answers that question (`iam.runnable_agent_fields_for` /
 * `iam.runnable_version_fields_for`), so this only reads its verdict.
 */
export function ladderRowIsBroken(row: MandateLadderRow): boolean {
  // THE DOOR'S OWN VERDICT FIRST. `dropped_code` is set whenever the rung will
  // not decide, for ANY reason the database judges — including the ones no
  // client-side check can see (the output contract, a platform disable). The
  // two reachability columns stay as the belt for a database that predates the
  // column: a browser newer than its database still says what it can back up.
  if (typeof row.dropped_code === "string" && row.dropped_code.length > 0) {
    return true;
  }
  return row.holder_live === false || row.version_live === false;
}

/**
 * SETTINGS, NOT A HOLDER SWAP. `chose_holder` is false whenever the rung names
 * no agent — but a rung may still pin a VERSION, which is a holder decision
 * even though `chose_holder` says otherwise. Only a rung that names neither is
 * settings-only, and calling anything else "settings" would understate what it
 * does.
 */
export function ladderRowChangesHolder(row: MandateLadderRow): boolean {
  return row.chose_holder || row.holder_version_id !== null;
}

/** True when the rung carries behaviour but no holder. */
export function ladderRowHasSettings(row: MandateLadderRow): boolean {
  return (
    row.config_overrides !== null ||
    row.consumption_map !== null ||
    row.auto_run !== null
  );
}

export interface LadderRowWords {
  /** Who this rung is. Never an id — the caller supplies the org's name. */
  title: string;
  /** What it says, in one sentence. */
  detail: string;
}

/**
 * The words for one rung. `organizationName` is the name of the row's
 * organization when the caller knows it; a rung whose organization cannot be
 * named says "an organization" rather than printing a uuid at a person.
 */
export function ladderRowWords(
  row: MandateLadderRow,
  organizationName: string | null,
): LadderRowWords {
  const title =
    row.rung === "system"
      ? "System default"
      : row.rung === "global"
        ? "Global binding"
        : row.rung === "org"
          ? organizationName ?? "Your active organization"
          : "Your own binding";

  if (row.rung !== "system" && !row.is_enabled) {
    return {
      title,
      // A binding somebody turned off says so and stops there. One the PLATFORM
      // turned off carries the reason on the row, and the reason is the news.
      detail: row.dropped_reason || "Turned off — this rung is not applied.",
    };
  }
  if (ladderRowIsBroken(row)) {
    return {
      title,
      // The database's sentence when it has one: it knows WHICH principal
      // cannot open the Holder, and it knows the drops no client can see (an
      // unmet output contract, a platform disable) — which is the whole
      // difference between "broken for you" and "broken for everyone".
      detail:
        row.dropped_reason ||
        (row.version_live === false
          ? "Broken — the pinned version it names cannot be read."
          : "Broken — the agent it names cannot be read."),
    };
  }
  if (row.chose_holder && row.holder_version_id !== null) {
    return { title, detail: "Names an agent, pinned to one version." };
  }
  if (row.chose_holder) {
    return { title, detail: "Names an agent, running its latest version." };
  }
  if (row.holder_version_id !== null) {
    return { title, detail: "Pins one version of an agent." };
  }
  if (ladderRowHasSettings(row)) {
    return {
      title,
      detail: "Settings only — it changes how the job runs, not who runs it.",
    };
  }
  return {
    title,
    detail:
      row.rung === "system"
        ? "This job names no agent of its own yet."
        : "Nothing set on this rung.",
  };
}
