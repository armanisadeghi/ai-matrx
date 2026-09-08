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
import type { Json } from "@/types/database.types";
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
}

/**
 * 🚨 LOCAL RPC TYPING — `mandate.resolve` postdates `types/database.types.ts`
 * (its `mandate.Functions` block is still `never`). The same narrowly-typed
 * seam `features/mandates/browse/service.ts` uses for the `mnd_*` family, so
 * every call site stays fully typed; delete it on the next `pnpm db-types` that
 * carries the function.
 */
interface MandateSchemaRpc {
  rpc: (
    fn: "resolve",
    args: { p_mandate_key: string; p_organization_id: string | null },
  ) => PromiseLike<{
    data: MandateLadderRow[] | null;
    error: { message?: string; code?: string } | null;
  }>;
}

export async function fetchMandateLadder(
  mandateKey: string,
  organizationId: string | null,
): Promise<MandateLadderRow[]> {
  const door = supabase.schema("mandate") as unknown as MandateSchemaRpc;
  const { data, error } = await door.rpc("resolve", {
    p_mandate_key: mandateKey,
    p_organization_id: organizationId,
  });
  if (error) {
    throw new Error(
      error.message?.trim()
        ? `${error.message}${error.code ? ` (${error.code})` : ""}`
        : "The ladder could not be read — the database answered with no message.",
    );
  }
  return data ?? [];
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
    return { title, detail: "Turned off — this rung is not applied." };
  }
  if (ladderRowIsBroken(row)) {
    return {
      title,
      detail:
        row.version_live === false
          ? "Broken — the pinned version it names cannot be read."
          : "Broken — the agent it names cannot be read.",
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
