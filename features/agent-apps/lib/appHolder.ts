"use client";

/**
 * THE APP HOLDER ROUTER — the one place this repo answers "which agent does
 * this app run?".
 *
 * Phase 6.9 of the workflow-mandate program pointed every `app.definition`
 * row at a `mandate.definition` (an app IS a job with a custom treatment and a
 * publication record — DESIGN-unification §5.2), because an app's
 * `agent_id NOT NULL` is *exactly* the hardcoded agent the Mandate law exists
 * to eliminate: rebinding the intelligence behind an app took a row edit that
 * only that app could see, and nothing on the platform could swap it.
 *
 * ┌─ THE SWITCH ──────────────────────────────────────────────────────────────┐
 * │  APP_MANDATE_CUTOVER = false   app.agent_id (the live serving path)       │
 * │  APP_MANDATE_CUTOVER = true    resolve app.mandate_id, then run           │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * With the switch OFF this module is a pure pass-through: it returns the row's
 * own `agent_id` / `agent_version_id` / `use_latest` synchronously, with no
 * fetch, no loading state and no error state — byte-identical to what the call
 * sites did before it existed. With it ON the app's runs honour a rebind with
 * no deploy, which is the same founding-promise proof the chat one-resolver
 * convergence shipped.
 *
 * WHY A CONSTANT AND NOT AN ENV VAR: the scar `mandateStorage.ts` and
 * `shortcutStorage.ts` both document —
 * `/common-docs/policies/env-vars-are-values-not-toggles.md`. The flip is a
 * one-line release after Arman's nod; never fire it from a build.
 *
 * THE TWO RESOLUTION LANES, and why there are two.
 *   Signed in  → `resolveMandate` (client, RLS): system default → org binding
 *                → the caller's OWN user binding. This is the full ladder and
 *                the reason a user's personal override reaches an app at all.
 *   Guest      → the mandate columns the public app RPC already carries
 *                (`get_aga_public_data`). `anon` cannot read
 *                `mandate.definition` and never will, and a guest has no
 *                bindings by construction, so the system default IS the whole
 *                honest answer for them. Passing those columns in is not a
 *                second resolver — it is the same system-default layer,
 *                delivered through the one definer door that surface already
 *                reads.
 *
 * LOUD ON FAILURE. An unresolvable mandate returns `agentId: null` plus an
 * `error`; the consumer disables its affordance and shows the message. It NEVER
 * falls back to `agent_id` — a silent fallback would hide exactly the breakage
 * the cutover exists to surface, and would make the switch untestable.
 */

import { useMemo } from "react";

import { useMandate } from "@/features/mandates/useMandate";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/slices/userSlice";

/** OFF — ships dark. The flip is a one-line release (Arman's nod). */
export const APP_MANDATE_CUTOVER = true;

/** Human-readable name of the ACTIVE binding source, for error copy and logs. */
export const APP_HOLDER_LABEL = APP_MANDATE_CUTOVER
  ? "app.mandate_id"
  : "app.agent_id";

/**
 * The app fields this router reads. Deliberately structural rather than
 * `AgentApp | PublicAgentApp`: the authed row, the public RPC row and the
 * version-preview row all satisfy it, and none of them has to be widened.
 */
export interface AppHolderSource {
  /** The pinned agent — the serving source with the switch OFF. */
  agent_id: string;
  agent_version_id?: string | null;
  use_latest?: boolean | null;
  /** The JOB this app fronts. Null only for a row created before Phase 6.9. */
  mandate_id?: string | null;
  /** Carried by the public RPC so a guest needs no mandate read of their own. */
  mandate_key?: string | null;
  mandate_agent_id?: string | null;
  mandate_agent_version_id?: string | null;
}

export interface AppHolder {
  /** The agent to run. `null` means REFUSE — never a fallback. */
  agentId: string | null;
  agentVersionId: string | null;
  useLatest: boolean;
  /** The binding's settings half. Always null on the pinned path. */
  configOverrides: Partial<FeLlmParams> | null;
  /** The job behind the app, for doors and notes. Null on the pinned path. */
  mandateId: string | null;
  mandateKey: string | null;
  /** Which layer decided, for the provenance pill. Null on the pinned path. */
  provenance: "system" | "org" | "user" | null;
  loading: boolean;
  error: string | null;
}

/**
 * The pinned answer — what every call site did before this module existed.
 * Exported so the settings surface can show "what is pinned today" beside
 * "what the mandate resolves to" without re-deriving the shape.
 */
export function pinnedHolder(app: AppHolderSource): AppHolder {
  return {
    agentId: app.agent_id,
    agentVersionId: app.agent_version_id ?? null,
    useLatest: app.use_latest ?? false,
    configOverrides: null,
    mandateId: null,
    mandateKey: null,
    provenance: null,
    loading: false,
    error: null,
  };
}

/**
 * The guest answer, straight off the public RPC's mandate columns. Only ever
 * consulted with the switch ON and no signed-in session.
 */
function guestHolder(app: AppHolderSource): AppHolder {
  const agentId = app.mandate_agent_id ?? null;
  return {
    agentId,
    agentVersionId: app.mandate_agent_version_id ?? null,
    useLatest: app.mandate_agent_version_id == null,
    configOverrides: null,
    mandateId: app.mandate_id ?? null,
    mandateKey: app.mandate_key ?? null,
    provenance: agentId ? "system" : null,
    loading: false,
    error: agentId
      ? null
      : `app "${app.mandate_key ?? app.mandate_id ?? "?"}" has no resolvable Holder — ` +
        "the mandate is missing, disabled, or held by something that cannot run yet",
  };
}

export interface UseAppHolderOptions {
  /**
   * Force the guest lane. Normally you do NOT pass this: the hook reads the
   * session itself, because the guest lane is not a surface's choice — it is a
   * fact about the caller. `anon` cannot read `mandate.definition`, so a
   * signed-out visitor on ANY surface must take the RPC's columns, and a
   * signed-in visitor on the public page must take the full ladder so their
   * own override applies. Pass it only where the session is deliberately
   * ignored (a preview rendering the app as the public sees it).
   */
  guest?: boolean;
}

/**
 * Resolve the agent an app should run.
 *
 * OFF: returns `pinnedHolder(app)`, memoised, no network. The `useMandate`
 * call below is still made — hooks are unconditional — but with an empty key
 * it short-circuits, and its result is discarded by the literal-narrowed
 * branch, so the pinned path is unchanged.
 */
export function useAppHolder(
  app: AppHolderSource | null | undefined,
  options: UseAppHolderOptions = {},
): AppHolder {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const guest = options.guest ?? !isAuthenticated;
  const wantsClientResolve =
    APP_MANDATE_CUTOVER && !guest && Boolean(app?.mandate_key);
  const mandateState = useMandate(
    wantsClientResolve ? (app?.mandate_key as string) : "",
  );

  return useMemo<AppHolder>(() => {
    if (!app) {
      return {
        agentId: null,
        agentVersionId: null,
        useLatest: false,
        configOverrides: null,
        mandateId: null,
        mandateKey: null,
        provenance: null,
        loading: true,
        error: null,
      };
    }
    if (!APP_MANDATE_CUTOVER) return pinnedHolder(app);
    if (guest) return guestHolder(app);
    if (!app.mandate_key) {
      return {
        ...pinnedHolder(app),
        agentId: null,
        error:
          "this app does not name a mandate yet — re-run " +
          "aidream/scripts/migrate_apps_to_mandates.py before running it",
      };
    }
    if (mandateState.loading) {
      return {
        agentId: null,
        agentVersionId: null,
        useLatest: true,
        configOverrides: null,
        mandateId: app.mandate_id ?? null,
        mandateKey: app.mandate_key,
        provenance: null,
        loading: true,
        error: null,
      };
    }
    if (mandateState.error || !mandateState.mandate) {
      return {
        agentId: null,
        agentVersionId: null,
        useLatest: true,
        configOverrides: null,
        mandateId: app.mandate_id ?? null,
        mandateKey: app.mandate_key,
        provenance: null,
        loading: false,
        error: mandateState.error ?? `mandate "${app.mandate_key}" did not resolve`,
      };
    }
    const resolved = mandateState.mandate;
    return {
      agentId: resolved.agentId,
      // The client run path has no version channel — a client-resolved
      // mandate is FLOATING by construction (resolveMandate refuses a pinned
      // one outright), so this is the truth, not a default.
      agentVersionId: null,
      useLatest: true,
      configOverrides: resolved.configOverrides,
      mandateId: resolved.mandateId,
      mandateKey: resolved.mandateKey,
      provenance: resolved.provenance,
      loading: false,
      error: null,
    };
  }, [app, guest, mandateState]);
}
