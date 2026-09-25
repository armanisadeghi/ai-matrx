"use client";

/**
 * Client-side agent-mandate resolution — the browser half of the Mandates
 * system, for agents whose CONSUMER runs in this repo (client calls
 * POST /agents/{id} directly).
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/intelligence/mandates/STATE.md
 * Ruling: /common-docs/systems/intelligence/mandates/STATE.md
 *
 * 🚨 THE CLIENT NEVER RESOLVES (D-R2, Arman 2026-09-01). There is ONE ladder —
 * user → the ACTIVE org → system — and it is walked in exactly one place. This
 * module does not walk it: it ASKS, at `GET /mandates/{key}/resolution`, through
 * the org-bound transport that binds the admitted `X-Organization-Id`
 * fail-closed. The verdict that comes back (holder, config overrides, rung) is
 * the same verdict the server itself runs on, so no screen here can differ from
 * what actually executes.
 *
 * What this module still reads directly, and why it is NOT resolution:
 *   - the definition row, by key, for the job's IDENTITY (`mandateId`) and its
 *     code-owned `pins` / `pinnedContext` — one row, no rung, no principal;
 *   - the treatment row for `presentation` — DISPLAY identity, which the
 *     doctrine block in `launch-agent-execution.thunk.ts` deliberately leaves
 *     to the browser (the server owns the run decision, the browser owns how
 *     the result is painted).
 * It reads NO binding rows. `mandate.binding` filtered by `principal_type` is
 * forbidden outside the storage seam and the admin door, and
 * `matrx/no-mandate-binding-ladder-query` enforces it.
 *
 * WHAT WAS DELETED HERE, 2026-09-07, and must never come back: a hand-written
 * two-rung ladder (an `org` binding query that named NO organization, so every
 * user inherited every RLS-visible org binding — measured live: a non-admin who
 * belongs to neither reads all 27 system-org rows), plus a module doctrine
 * saying access "never depends on the active organization". D-R1 rules the
 * opposite: the org rung IS the active org.
 *
 * ORG ADMISSION IS PART OF THE ANSWER. Resolution waits for the active-org
 * bootstrap and then refuses in words when it finishes with no selection —
 * `MandateOrganizationUnresolvedError`. It never silently answers at the system
 * rung, because "no org selected yet" and "your org has no override" are
 * different facts that used to look identical.
 *
 * A version-pinned winner is a VALID verdict. Launch goes through
 * `POST /ai/mandates/{key}` (see `resolveStartPath`); the server honours the
 * pin. This module's job is DISPLAY IDENTITY: `agentId` is always the
 * `agent.definition` id (attribution / snapshot / EntityRef), and `isVersion` +
 * `versionId` carry the pin. Refusing a pin here was a false access denial —
 * the server said "this is what runs" and every `useMandate` consumer disabled
 * the job (captured 2026-09-19 on `/mandates/workflow.deep_research.keyword_synthesis`).
 *
 * Failures are LOUD: unknown mandate, disabled mandate, unresolved organization,
 * a pin whose definition id the server omitted, and a non-agent Holder all
 * throw. No silent fallback to a hardcoded id — that would hide exactly the
 * breakage this system exists to surface.
 */

import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { isJsonObject } from "@/types/json";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import { apiGet, buildPath } from "@/lib/api/typed-client";
import { BackendApiError } from "@/lib/api/errors";
import {
  peekSelectedOrganizationId,
  waitForOrganizationAdmission,
  type OrganizationAdmission,
} from "@/lib/api/organization-admission";
import type { components } from "@/types/python-generated/api-types";
import { toLlmParams } from "./llm-params";
import { invalidateMandateCatalogueCache } from "./catalogue";
import {
  missingRequiredVariables,
  missingVariablesMessage,
  parseMandateContract,
  type MandateContract,
} from "./contract";
import {
  parseMandateWave1,
  type MandateWave1Fields,
} from "./provision-shapes";
import type { JsonObject } from "@/types/json";
import {
  MANDATE_HOLDER_COLUMNS,
  MANDATE_STORAGE_LABEL,
  holderOfMandate,
  isFloatingMandate,
  mandateDefinitions,
  mandateTreatments,
} from "@/lib/supabase/mandateStorage";
import type { AnyMandateKey } from "./mandate-key";
import {
  TREATMENT_TIER_WIDGET,
  parseTreatmentConfig,
  type BindingPresentation,
} from "@/features/bindings/treatment-shape";

export interface ResolvedMandate {
  mandateKey: AnyMandateKey;
  /**
   * `agent.mandate.id` — the row the JOB is, as opposed to the agent currently
   * holding it. Consumers that write something ABOUT the mandate (notes,
   * observations) key on this, never on `agentId`, which moves with the pin.
   */
  mandateId: string;
  /**
   * The agent.definition id of the Holder — ALWAYS the live agent row, even
   * when the winning rung is version-pinned. Attribution, snapshots, and
   * EntityRef doors key on this. The pin, if any, is `versionId`.
   */
  agentId: string;
  /**
   * True when the winning rung named a frozen Holder version. The run door
   * (`POST /ai/mandates/{key}`) honours this; a consumer that still POSTs
   * `/ai/agents/{id}` must send `is_version: true` and the `versionId`.
   */
  isVersion: boolean;
  /** The pinned `agent.definition_version` id when `isVersion` is true. */
  versionId: string | null;
  /**
   * The DECIDING layer's Holder type. Always `"agent"` today — a binding
   * naming any other Holder refuses resolution outright (see
   * `assertExecutableHolder`) instead of degrading to the system default — but
   * consumers read it rather than assume it, so the day workflow Holders
   * execute the field is already threaded through. Defaults to `"agent"` when
   * no binding applies (the system default is an agent by construction).
   */
  holderType: string;
  configOverrides: Partial<FeLlmParams> | null;
  /**
   * WHICH RUNG ANSWERED, straight from the server verdict — the values
   * `resolve_mandate` stamps. `system` is the mandate's own default (there is
   * no `global` rung — aidream 1041).
   */
  provenance: "system" | "org" | "user" | "run";
  /**
   * The organization the verdict was resolved IN — the caller's ACTIVE org,
   * admitted by the server. Surfaces that claim "this is what runs for you" name
   * it, so the sentence is checkable instead of ambient.
   *
   * `null` means the answer was resolved with NO organization in play, which
   * today happens in exactly one place: `resolveMandateServer`, the SSR
   * first-paint path, where no workspace has been selected yet. A `null` here is
   * a PLATFORM DEFAULT, not a verdict — a surface claiming "this is what runs
   * for you" must not print it as one.
   */
  organizationId: string | null;
  /**
   * The server's own honest staleness bound for this answer, published with it.
   * Show it rather than implying the verdict is instantaneous.
   */
  freshness: string;
  /** The Provision consumption map the winning rung carries, if any. */
  consumptionMap: JsonObject | null;
  /** The behavioural promise the winning binding carries. `null` = no opinion. */
  autoRun: boolean | null;
  /**
   * The Mandate's declared IO contract. `requiredVariables` is an INPUT
   * PRECONDITION on the caller, not only a bind-time check on the agent: a run
   * whose required variable is absent REFUSES (disease D4). Consumers that
   * resolve-then-launch pre-check with `assertMandateVariables` so the user
   * sees a real refusal instead of a thrown promise.
   *
   * A mandate carrying a `provisionKey` declares its inputs through the
   * PROVISION instead — its contract's required-variable list is legacy and
   * the binding's consumption map decides what the Holder consumes.
   */
  contract: MandateContract;
  /** Declared IO kinds (`agent.mandate.input_kind` / `output_kind`). */
  inputKind: string | null;
  outputKind: string | null;
  /** The Provision this mandate's inputs come from — null for legacy mandates
   * (see `./provisions.ts`). */
  provisionKey: string | null;
  /** Code-owned levers the mandate PINS (reasoning/streaming — never model
   * ids). Pins win over binding overrides at run time. */
  pins: JsonObject;
  /** Offered values the mandate force-delivers as context. */
  pinnedContext: string[];
  /**
   * THE JOB'S PRESENTATION — how it shows itself when it runs (widget, variable
   * panel, reveal toggles, gate, write access). `null` when the job stores none,
   * which is the platform default and NOT the same as "off".
   *
   * 🚨 This is DISPLAY IDENTITY, which is exactly what this client path is for
   * — read the doctrine block in `launch-agent-execution.thunk.ts`: the server
   * owns the run decision (holder, consumption, `config_overrides`, which is
   * why those are deliberately not echoed back), and the browser owns how the
   * result is painted. A shortcut has honoured its stored presentation since
   * the cutover, off this exact table; a job stored one it could not honour,
   * which is the inversion this field closes.
   */
  presentation: BindingPresentation | null;
  /**
   * 🚨 EVERY RUNG THE SERVER SET ASIDE, and why (2026-09-08, FIX-R1c).
   *
   * Empty on almost every resolution, and that is the point: when it is not
   * empty, somebody's deliberate choice for this job did not run. Before the
   * server grew this field the drop existed only as a `logger.error` in a
   * container log — an organization bound an agent its members could not open,
   * eight of its nine members silently got the platform default instead, and no
   * screen anywhere could say so (V-CORRECTNESS §5).
   *
   * `reason` is a finished sentence written for a person; show it as-is.
   */
  droppedRungs: DroppedRung[];
}

/**
 * Read `dropped_rungs` off the verdict WITHOUT trusting the generated types.
 *
 * The field is additive on `MandateResolutionResponse` and the committed
 * `types/python-generated/api-types.ts` is regenerated against a running server
 * — a heavier, whole-surface operation than this one field deserves — so this
 * narrows the shape itself. Anything it cannot recognise is dropped rather than
 * rendered half-parsed: a garbled sentence beside a resolution is worse than
 * none. The cost of that choice is that an OLD server simply reports no drops,
 * which is exactly what an old server means.
 *
 * 🚨 When the API types are next regenerated, this can become a plain read.
 */
function parseDroppedRungs(verdict: unknown): DroppedRung[] {
  const raw = (verdict as { dropped_rungs?: unknown })?.dropped_rungs;
  if (!Array.isArray(raw)) return [];
  const out: DroppedRung[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const rung = e.rung;
    const reason = e.reason;
    if (rung !== "org" && rung !== "user") continue;
    if (typeof reason !== "string" || !reason) continue;
    out.push({
      rung,
      bindingId: typeof e.binding_id === "string" ? e.binding_id : null,
      organizationId:
        typeof e.organization_id === "string" ? e.organization_id : null,
      holderId: typeof e.holder_id === "string" ? e.holder_id : null,
      reason,
    });
  }
  return out;
}

/** One rung the server verdict set aside, with the reason. */
export interface DroppedRung {
  rung: "org" | "user";
  bindingId: string | null;
  organizationId: string | null;
  holderId: string | null;
  reason: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: ResolvedMandate }>();

/**
 * THE CACHE KEY CARRIES THE ORG (review §12). A verdict is only true for one
 * person in one organization: the org rung is the ACTIVE org, so an entry keyed
 * on user+key alone serves the previous workspace's answer for up to five
 * minutes after a switch, and serves a cold tab's pre-bootstrap answer for five
 * minutes after the real org arrives. `dropMandateCacheForOrgSwitch` then
 * evicts on the switch itself, so toggling back and forth cannot accumulate two
 * live answers for one job.
 */
function mandateCacheKey(
  userId: string,
  organizationId: string,
  mandateKey: string,
): string {
  return `${userId}:${organizationId}:${mandateKey}`;
}

/**
 * Drop every cached resolution — wired to the app-context organization change
 * so a switch cannot serve the old workspace's verdict. Separate from
 * `invalidateMandateCache` on purpose: this is not a write, so it must NOT
 * clear `pinCache` (system default pins are org-independent, review §12) and it
 * still notifies subscribers so mounted consumers re-resolve in the new org.
 */
export function dropMandateCacheForOrgSwitch(): void {
  cache.clear();
  for (const listener of invalidationListeners) listener(undefined);
}

/** Subscribers re-resolve when a mandate's cached resolution is invalidated
 * (binding saved/removed) — how a mounted picker/consumer refreshes without
 * prop-drilling a reload. `mandateKey === undefined` means "all mandates". */
const invalidationListeners = new Set<
  (mandateKey: string | undefined) => void
>();

export function onMandateCacheInvalidated(
  listener: (mandateKey: string | undefined) => void,
): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

/**
 * ONE INVALIDATION FOR EVERY CACHE A MANDATE WRITE CAN STALE.
 *
 * Census of the module-level caches under `features/mandates` (FIX-Q9,
 * 2026-09-11) and what a GOAL write does to each:
 *   · `cache` (this file) — resolutions; cleared here, always.
 *   · `pinCache` (this file) — system default pins; cleared on a WRITE only
 *     (never on an org switch — see `dropMandateCacheForOrgSwitch`).
 *   · `cached`/`inflight` (`./catalogue`) — HOLDS THE GOAL, page-lifetime, and
 *     was never cleared by anything: the FIX-Q9 defect. Cleared here now.
 *   · `provisionCache` (`./provisions`) — provision OFFERS; carries no goal, so
 *     a goal write leaves it alone. A provision write clears it itself.
 */
export function invalidateMandateCache(mandateKey?: string): void {
  // The goal and the rest of the declaration live in the catalogue, which is
  // cached for the page's life. Any mandate write can make it a lie.
  invalidateMandateCatalogueCache();
  if (mandateKey) {
    for (const key of cache.keys()) {
      if (key.endsWith(`:${mandateKey}`)) cache.delete(key);
    }
    pinCache.delete(mandateKey);
  } else {
    cache.clear();
    pinCache.clear();
  }
  for (const listener of invalidationListeners) listener(mandateKey);
}

type MandateResolutionResponse =
  components["schemas"]["MandateResolutionResponse"];

/**
 * NO ORGANIZATION IS ADMITTED YET — a distinct outcome, never a quiet system
 * answer.
 *
 * The org rung is the ACTIVE org (D-R1). A caller with no selected workspace has
 * not got a wrong answer, it has got NO answer, and the two used to be
 * indistinguishable: resolution simply skipped the rung and returned the system
 * default. Consumers catch this by name to say "pick a workspace" rather than
 * printing a holder that may not be the one that would run.
 */
export class MandateOrganizationUnresolvedError extends Error {
  readonly code = "mandate_organization_unresolved";
  constructor(readonly mandateKey: string, readonly admission: Exclude<OrganizationAdmission, "ready"> = "unresolved") {
    super(admission === "timed-out"
      ? `mandate "${mandateKey}" cannot resolve yet: workspace initialization timed out. Wait for initialization or reload if it remains stuck; no workspace was chosen for you.`
      : admission === "unavailable"
      ? `mandate "${mandateKey}" cannot resolve yet: workspace state is unavailable. Reload the application to initialize it; no workspace was chosen for you.`
      : `mandate "${mandateKey}" cannot resolve yet: no organization is selected. ` +
        `Which agent runs this job depends on your active workspace, so there is ` +
        `no honest answer until one is chosen — select a workspace and try again.`,
    );
    this.name = "MandateOrganizationUnresolvedError";
  }
}

/**
 * REFUSE a verdict this client cannot paint or launch — the client half of the
 * server's `EXECUTABLE_HOLDER_TYPES` gate. A `holder_type='workflow'` winner
 * carries NO `agent_id` by construction; running the system default instead
 * would be a deliberate binding silently evaporating, with the caller told the
 * platform default was in charge.
 *
 * A version-pinned AGENT winner is runnable: the mandate start door honours
 * the pin. What this returns is DISPLAY IDENTITY (`agentId` = definition id)
 * plus the pin itself. A pin whose definition id the server omitted cannot be
 * painted or attributed — that is a broken door, not a reason to unpin.
 */
function assertRunnableVerdict(
  mandateKey: string,
  verdict: MandateResolutionResponse,
): { agentId: string; isVersion: boolean; versionId: string | null } {
  const rung = verdict.provenance;
  if (verdict.holder_type !== "agent" || !verdict.agent_id) {
    throw new Error(
      `mandate "${mandateKey}": the ${rung} rung names a ${verdict.holder_type} ` +
        `Mandate Holder, and this screen can only run an agent. Rebind the ${rung} rung ` +
        `to an agent, or route this consumer through the server.`,
    );
  }
  const isVersion = Boolean(verdict.is_version);
  if (isVersion) {
    const definitionId = verdict.definition_agent_id;
    if (!definitionId) {
      throw new Error(
        `mandate "${mandateKey}": the ${rung} rung is pinned to a Mandate Holder ` +
          `version, but the resolution door did not name the agent that ` +
          `version belongs to. This screen cannot paint or attribute the run ` +
          `without that id. Retry; if it persists the door is missing ` +
          `definition_agent_id.`,
      );
    }
    return {
      agentId: definitionId,
      isVersion: true,
      versionId: verdict.agent_id,
    };
  }
  return {
    agentId: verdict.definition_agent_id ?? verdict.agent_id,
    isVersion: false,
    versionId: null,
  };
}

export interface ResolveMandateOptions {
  /** An unassigned optional Mandate disables its affordance without error capture. */
  optional?: boolean;
  /**
   * THE ORGANIZATION THE CALLER HAS ALREADY PROVED — the org of the RECORD the job runs on
   * (access is personal, owner 2026-09-23: an object resolves its organization FROM THE
   * OBJECT). Given, the ladder is asked for THAT organization and the active-workspace wait is
   * skipped; the server still decides, and still refuses an organization this person may not
   * act in. Left out, the question is asked for the selected workspace, exactly as before.
   */
  organizationId?: string | null;
}

/**
 * 🚨 THE KEY IS TYPED, NEVER `string` (V-L6a, 2026-09-17) — a wrong or stale
 * key must fail `pnpm type-check`, not arrive here as a 404 nobody sees. A
 * DB-authored `app.*` / `shortcut.*` key is legitimate, so the parameter is
 * `AnyMandateKey`; narrow an unknown string with `isMandateKey` at its
 * boundary rather than widening this back.
 */
/** The selected workspace, once admitted — or the named refusal when there is none. */
async function selectedOrganizationFor(mandateKey: AnyMandateKey): Promise<string> {
  const admission = await waitForOrganizationAdmission();
  const organizationId = peekSelectedOrganizationId();
  if (admission !== "ready" || !organizationId) {
    throw new MandateOrganizationUnresolvedError(mandateKey, admission === "ready" ? "unresolved" : admission);
  }
  return organizationId;
}

/**
 * THE ONE ASK — `GET /mandates/{key}/resolution`, bound to the proved
 * organization. Holder-neutral: it returns whatever the server's ladder chose
 * (agent OR workflow). `resolveMandate` narrows it to a runnable agent for
 * launch consumers; `resolveMandateHolder` paints either kind. `null` = the
 * optional lane's 404 and nothing else.
 */
async function fetchResolutionVerdict(
  mandateKey: AnyMandateKey,
  options: ResolveMandateOptions,
  cacheLookup?: (cacheKey: string) => ResolvedMandate | undefined,
): Promise<
  | { kind: "verdict"; verdict: MandateResolutionResponse; organizationId: string; cacheKey: string }
  | { kind: "cached"; value: ResolvedMandate }
  | null
> {
  const supabase = createClient();
  // `mandate.definition` is authenticated-only. Establish identity before a
  // protected read or cache lookup so hydration/session drift cannot emit an
  // anonymous PostgREST request or reuse another caller's resolved binding.
  const { data: auth, error: authError } = await getClaimsUser(supabase);
  const userId = auth.user?.id;
  if (authError || !userId) {
    throw new Error("mandate resolution requires an authenticated session");
  }

  // THE ORGANIZATION IS PART OF THE QUESTION (D-R1). Wait for the active-org
  // bootstrap — `useMandate`/`useMandateSet` resolve on mount, inside the very
  // window that used to burn refused requests — and then read the SELECTED org.
  // Deliberately never `getActiveOrgId()`: its personal-org fallback would
  // resolve on the personal workspace while a company org is actually selected,
  // which under this ruling is a DIFFERENT AGENT running.
  const organizationId = options.organizationId ?? (await selectedOrganizationFor(mandateKey));

  const cacheKey = mandateCacheKey(userId, organizationId, mandateKey);
  const cachedValue = cacheLookup?.(cacheKey);
  if (cachedValue) return { kind: "cached", value: cachedValue };

  // THE ONE LADDER, ASKED — never walked here. The transport binds the admitted
  // `X-Organization-Id` fail-closed, so the rung the server picks is the rung of
  // the org the user actually selected, and it is the same verdict the server
  // runs on. 404 is the ONLY "this mandate does not exist" answer (the router
  // maps every other refusal to its own status).
  let verdict: MandateResolutionResponse;
  try {
    const { data } = await apiGet(
      buildPath("/mandates/{mandate_key}/resolution", {
        mandate_key: mandateKey,
      }),
      {
        // BIND THE ORG WE ALREADY PROVED, rather than letting the transport
        // re-read the store a moment later. The verdict must be bound to the
        // SAME organization the cache key names: if a switch lands between the
        // two reads, the answer would be filed under one org and resolved in
        // another — the exact class of mismatch this campaign exists to close.
        // `RequestOptions.organizationId` is documented for precisely this case,
        // a caller that has authoritatively resolved its own scope.
        organizationId,
        // The OPTIONAL lane owns its own outcome: a deliberately-unassigned key
        // answering 404 is the documented result, not a system error, so it must
        // not enter the global Error Inspector. Anything that is not a 404 is
        // re-thrown below and captured by the consumer that asked.
        captureErrors: !options.optional,
      },
    );
    verdict = data;
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) {
      if (options.optional) return null;
      throw recordUnavailable({
        entity: "mandate",
        reason: "unknown",
        recordId: mandateKey,
        relation: "mandate.definition",
      });
    }
    throw error;
  }
  return { kind: "verdict", verdict, organizationId, cacheKey };
}

export function resolveMandate(
  mandateKey: AnyMandateKey,
  options: { optional: true },
): Promise<ResolvedMandate | null>;
export function resolveMandate(
  mandateKey: AnyMandateKey,
  options?: ResolveMandateOptions,
): Promise<ResolvedMandate>;
export async function resolveMandate(
  mandateKey: AnyMandateKey,
  options: ResolveMandateOptions = {},
): Promise<ResolvedMandate | null> {
  const supabase = createClient();
  const fetched = await fetchResolutionVerdict(mandateKey, options, (cacheKey) => {
    const cached = cache.get(cacheKey);
    return cached && Date.now() - cached.at < CACHE_TTL_MS ? cached.value : undefined;
  });
  if (fetched === null) return null;
  if (fetched.kind === "cached") return fetched.value;
  const { verdict, organizationId, cacheKey } = fetched;

  const holder = assertRunnableVerdict(mandateKey, verdict);
  const provenance = verdict.provenance;
  const holderType: string = verdict.holder_type ?? "agent";
  const configOverrides: Partial<FeLlmParams> | null = isJsonObject(
    verdict.config_overrides,
  )
    ? toLlmParams(verdict.config_overrides)
    : null;

  // IDENTITY + CODE-OWNED LEVERS, read straight off the definition row. This is
  // NOT a rung: one row, addressed by key, no principal and no binding. The job
  // id is what notes and observations hang off, and `pins`/`pinnedContext` are
  // code-owned levers the mandate itself declares.
  //
  // `select("*")` on purpose: the wave-1 columns (provision_key, pins,
  // pinned_context) are live but ahead of the generated Row type — they ride
  // the full row and are narrowed at ingress by `parseMandateWave1`.
  const { data: mandate, error } = await mandateDefinitions(supabase)
    .select("*")
    .eq("mandate_key", mandateKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!mandate) {
    if (options.optional) return null;
    throw recordUnavailable({
      entity: "mandate",
      reason: "unknown",
      recordId: mandateKey,
      relation: "mandate.definition",
    });
  }

  // THE PRESENTATION LAYER. One row per job (`tier='widget'`, `is_default`),
  // the same natural key `mandate.vw_shortcut` joins on. A read failure is NOT
  // a launch failure: a job whose presentation could not be read still runs, on
  // the platform default, and says so in the console rather than refusing.
  let presentation: BindingPresentation | null = null;
  {
    const { data: treatment, error: treatmentError } = await mandateTreatments(
      supabase,
    )
      .select("config, is_enabled")
      .eq("mandate_id", mandate.id)
      .eq("tier", TREATMENT_TIER_WIDGET)
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (treatmentError) {
      console.warn(
        `[resolveMandate] "${mandateKey}": its display options could not be read; running on the platform default presentation`,
        treatmentError,
      );
    } else if (treatment && treatment.is_enabled !== false) {
      presentation = parseTreatmentConfig(treatment.config);
    }
  }

  const wave1: MandateWave1Fields = parseMandateWave1(mandate);
  const value: ResolvedMandate = {
    mandateKey,
    mandateId: mandate.id,
    agentId: holder.agentId,
    isVersion: holder.isVersion,
    versionId: holder.versionId,
    holderType,
    configOverrides,
    provenance,
    organizationId,
    freshness: verdict.freshness,
    consumptionMap: isJsonObject(verdict.consumption_map)
      ? verdict.consumption_map
      : null,
    autoRun: verdict.auto_run ?? null,
    droppedRungs: parseDroppedRungs(verdict),
    // The contract, input kind and output kind come from the SERVER VERDICT —
    // it applies the fallback chain, so for the 33 definitions carrying a
    // `fallback_mandate_key` these describe the mandate that actually answered,
    // which the local definition row cannot know (review §4).
    contract: parseMandateContract(verdict.contract ?? null),
    inputKind: verdict.input_kind ?? null,
    outputKind: verdict.output_kind ?? null,
    provisionKey: verdict.provision_key ?? null,
    pins: wave1.pins,
    pinnedContext: wave1.pinnedContext,
    presentation,
  };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/**
 * WHAT RUNS FOR ME — holder-neutral (workflow parity, 2026-09-25).
 *
 * A mandate is filled by an agent OR a workflow, equally. `resolveMandate`
 * narrows the verdict to an agent because its consumers LAUNCH it in the
 * browser; a screen that only SAYS what runs must not inherit that refusal —
 * the record page printed "Mandate Holder: Not available · Unavailable" for
 * every job a workflow holds, although the server resolves and runs it.
 *
 * This is the same one ask (`GET /mandates/{key}/resolution`), painted as the
 * server answered it. Never a run path.
 */
export interface ResolvedMandateHolder {
  mandateKey: AnyMandateKey;
  holderType: "agent" | "workflow";
  /** agent.definition id, or workflow.definition id — always the live record. */
  holderId: string;
  /** The pinned version id (agent or workflow version), or null for latest. */
  versionId: string | null;
  isVersion: boolean;
  /** The pinned version's number, when the server named it. */
  versionNumber: number | null;
  provenance: ResolvedMandate["provenance"];
  organizationId: string | null;
  freshness: string;
  droppedRungs: DroppedRung[];
}

export async function resolveMandateHolder(
  mandateKey: AnyMandateKey,
  options: ResolveMandateOptions = {},
): Promise<ResolvedMandateHolder | null> {
  const fetched = await fetchResolutionVerdict(mandateKey, options);
  if (fetched === null) return null;
  if (fetched.kind === "cached") {
    // Unreachable (no cache lookup is passed); kept total for the type.
    return null;
  }
  const { verdict, organizationId } = fetched;
  const base = {
    mandateKey,
    provenance: verdict.provenance,
    organizationId,
    freshness: verdict.freshness,
    droppedRungs: parseDroppedRungs(verdict),
    versionNumber: verdict.version_number ?? null,
  };
  if (verdict.holder_type === "workflow") {
    if (!verdict.workflow_id) {
      throw new Error(
        `mandate "${mandateKey}": the ${verdict.provenance} rung names a workflow, ` +
          `but the resolution door did not say which one. Retry; if it persists ` +
          `the door is missing workflow_id.`,
      );
    }
    return {
      ...base,
      holderType: "workflow",
      holderId: verdict.workflow_id,
      versionId: verdict.workflow_version_id ?? null,
      isVersion: Boolean(verdict.workflow_version_id),
    };
  }
  const agent = assertRunnableVerdict(mandateKey, verdict);
  return {
    ...base,
    holderType: "agent",
    holderId: agent.agentId,
    versionId: agent.versionId,
    isVersion: agent.isVersion,
  };
}

// ── Mandate pin display / fork info ─────────────────────────────────────────────

/**
 * The system default PIN of a mandate, for display and "fork what actually runs"
 * flows (research's agent-roles page). Unlike `resolveMandate` this is NOT a
 * run path: version-pinned mandates are fine here, and no binding layer applies —
 * it answers "what is the system default", not "what runs for me".
 */
export interface MandatePin {
  mandateKey: string;
  /** Master agent row id (always backfilled on mandate rows; loud if missing). */
  agentId: string;
  /** Pinned agx_version id — null for floating (use_latest) mandates. */
  versionId: string | null;
  useLatest: boolean;
  isEnabled: boolean;
}

/**
 * Display identity for a mandate's platform-default Holder. This deliberately
 * does not resolve user/org bindings: admin inventory surfaces need to show
 * the system assignment they can inspect and repair in the Mandates console.
 */
export interface MandateAssignment extends MandatePin {
  agentName: string | null;
  agentType: string | null;
}

const pinCache = new Map<string, { at: number; value: MandatePin }>();

/** Fetch the system default pins for a set of mandates in one query. */
export async function fetchMandatePins(
  mandateKeys: readonly string[],
): Promise<Record<string, MandatePin>> {
  const out: Record<string, MandatePin> = {};
  const missing: string[] = [];
  for (const key of mandateKeys) {
    const cached = pinCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS)
      out[key] = cached.value;
    else missing.push(key);
  }
  if (missing.length === 0) return out;

  const supabase = createClient();
  const { data, error } = await mandateDefinitions(supabase)
    .select(`mandate_key, ${MANDATE_HOLDER_COLUMNS}, is_enabled` as const)
    .in("mandate_key", missing)
    .is("deleted_at", null);
  if (error) throw error;

  const found = new Set<string>();
  for (const row of data ?? []) {
    found.add(row.mandate_key);
    const holder = holderOfMandate(row);
    if (!holder.holderId) {
      // Master id is backfilled on every research mandate; a NULL here is a data
      // defect worth screaming about, not silently skipping.
      console.error(
        `[mandates] mandate "${row.mandate_key}" has no default Mandate Holder — backfill the master id on ${MANDATE_STORAGE_LABEL}`,
      );
      continue;
    }
    const value: MandatePin = {
      mandateKey: row.mandate_key,
      agentId: holder.holderId,
      versionId: holder.versionId,
      useLatest: isFloatingMandate(row),
      isEnabled: row.is_enabled ?? true,
    };
    pinCache.set(row.mandate_key, { at: Date.now(), value });
    out[row.mandate_key] = value;
  }
  for (const key of missing) {
    if (!found.has(key)) {
      recordUnavailable({
        entity: "mandate",
        reason: "unknown",
        recordId: key,
        relation: "agent.mandate",
      });
    }
  }
  return out;
}

/**
 * IDENTITY of a set of mandates — the row id, the human label, and whether it
 * is live — in ONE read.
 *
 * Chrome that LISTS mandates (the Agents header menu naming what AI runs on
 * this page) needs the label to render and the id to hang notes off, and it
 * must not go through `resolveMandate`: that is the RUN path and it throws on
 * a disabled mandate or a non-agent Holder, which is exactly right for running
 * and exactly wrong for listing. A key with no row is reported (`recordUnavailable`)
 * and simply absent from the result — a surface that names a mandate the
 * database does not have is a wiring defect worth seeing.
 */
export interface MandateIdentity {
  mandateKey: string;
  mandateId: string;
  label: string;
  description: string | null;
  defaultAgentId: string | null;
  isEnabled: boolean;
}

export async function fetchMandateIdentities(
  mandateKeys: readonly string[],
): Promise<Record<string, MandateIdentity>> {
  const keys = [...new Set(mandateKeys)].filter(Boolean);
  const out: Record<string, MandateIdentity> = {};
  if (keys.length === 0) return out;

  const { data, error } = await mandateDefinitions(createClient())
    .select(
      `id, mandate_key, label, description, ${MANDATE_HOLDER_COLUMNS}, is_enabled` as const,
    )
    .in("mandate_key", keys)
    .is("deleted_at", null);
  if (error) throw error;

  for (const row of data ?? []) {
    out[row.mandate_key] = {
      mandateKey: row.mandate_key,
      mandateId: row.id,
      label: row.label,
      description: row.description,
      defaultAgentId: holderOfMandate(row).holderId,
      isEnabled: row.is_enabled ?? true,
    };
  }
  for (const key of keys) {
    if (!out[key]) {
      recordUnavailable({
        entity: "mandate",
        reason: "unknown",
        recordId: key,
        relation: "agent.mandate",
      });
    }
  }
  return out;
}

/** Fetch the platform-default Holder identities for a small set of mandates. */
export async function fetchMandateAssignments(
  mandateKeys: readonly string[],
): Promise<Record<string, MandateAssignment>> {
  const pins = await fetchMandatePins(mandateKeys);
  const agentIds = [...new Set(Object.values(pins).map((pin) => pin.agentId))];
  if (agentIds.length === 0) return {};

  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, name, agent_type")
    .in("id", agentIds);
  if (error) throw error;

  const identities = new Map(
    (data ?? []).map((agent) => [
      agent.id,
      { name: agent.name, agentType: agent.agent_type },
    ]),
  );
  const assignments: Record<string, MandateAssignment> = {};
  for (const [mandateKey, pin] of Object.entries(pins)) {
    const identity = identities.get(pin.agentId);
    assignments[mandateKey] = {
      ...pin,
      agentName: identity?.name ?? null,
      agentType: identity?.agentType ?? null,
    };
  }
  return assignments;
}

// ── The document-variable precondition (disease D4) ─────────────────────────

/**
 * REFUSE when a Mandate's required variables were not supplied.
 *
 * 🚨 Arman, 2026-08-19, on the Masterwork Conductor starting blind and fetching
 * its Rulebook with a tool call on turn 1: *"this agent should never have even
 * started without getting the rules in place."*
 *
 * There is no seed fallback and no "the model can fetch it itself" consolation:
 * a document that arrives by tool call is a document that gets skimmed. Throws
 * — the caller either pre-checks with `missingRequiredVariables` and renders a
 * refusal, or lets this stop the launch.
 */
export function assertMandateVariables(
  mandate: ResolvedMandate,
  supplied: Record<string, unknown> | null | undefined,
): void {
  const missing = missingRequiredVariables(mandate.contract, supplied);
  if (missing.length > 0) {
    throw new Error(missingVariablesMessage(mandate.mandateKey, missing));
  }
}

export {
  missingRequiredVariables,
  missingVariablesMessage,
  type MandateContract,
} from "./contract";
