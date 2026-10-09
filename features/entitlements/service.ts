// features/entitlements/service.ts
//
// The resolver client. `checkEntitlement` is the imperative, server-truth path
// callers MUST await before SPENDING (starting a generation, sending a tutor
// message) — the DoD forbids a mid-generation ambush, so the cap check happens
// before the action starts.
//
// The database decides. Whether a capability is enforced, which tier unlocks it
// and which window meters it are `billing.capability`'s answers, returned on
// every verdict by the `entitlement_check` SECURITY DEFINER RPC (the same
// resolver the aidream-side spend path calls) — the client keeps no copy and
// never short-circuits on one (USAGE-GATE.md rule 1). An un-enforced capability
// comes back `permissive_stub` from the resolver itself.

import { createClient } from "@/utils/supabase/client";
import { awaitEffectiveOrganizationId } from "@/features/organizations/awaitWorkspace";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { isCapability, type Capability } from "./registry";
import type {
  EntitlementCheckResult,
  EntitlementConsumeResult,
  EntitlementReason,
  EntitlementPeriod,
  EntitlementSnapshot,
  EntitlementTier,
  EntitlementUsage,
  EntitlementWindow,
  OrgCapabilityStatus,
} from "./types";

// Dev-only, once-per-capability-per-session warning so a permissive stub is
// never silently mistaken for "enforced and fine" (types.ts documents this as
// "Loud in dev" — this is that promise, kept). Never fires in production;
// never throttles/blocks the permissive verdict itself (fail-open by design).
const warnedPermissive = new Set<Capability>();
function warnPermissiveOnce(capability: Capability): void {
  if (process.env.NODE_ENV === "production") return;
  if (warnedPermissive.has(capability)) return;
  warnedPermissive.add(capability);
  // eslint-disable-next-line no-console -- intentional loud-recovery dev signal
  console.warn(
    `[entitlements] "${capability}" resolved permissive_stub — ` +
      `billing.capability has it enforced = false, so it is unlimited for every ` +
      `user until that row is flipped.`,
  );
}

// Loud recovery for an UNKNOWN capability id (F3). The resolver fails open
// (never break prod) but the client must not stay quiet — a capability the DB
// doesn't recognize means the registry and billing.capability drifted apart, or
// a caller passed a bad id. Screams once per id, dev-only.
const warnedUnknown = new Set<string>();
function warnUnknownCapability(capability: Capability): void {
  if (process.env.NODE_ENV === "production") return;
  if (warnedUnknown.has(capability)) return;
  warnedUnknown.add(capability);
  // eslint-disable-next-line no-console -- intentional loud-recovery dev signal
  console.error(
    `[entitlements] resolver reported "${capability}" as UNKNOWN — it is not ` +
      `registered in billing.capability. The verdict FAILED OPEN (unlimited). ` +
      `Add the row to billing.capability (+ billing.capability_limit) or fix ` +
      `the caller; the client registry and the DB have drifted apart.`,
  );
}

/** A refusal the client produced itself (no verdict from the resolver). */
function refusal(
  capability: Capability,
  reason: "organization_required" | "resolver_error",
): EntitlementCheckResult {
  return {
    capability,
    allowed: false,
    remaining: null,
    limit: null,
    used: 0,
    tier: "free",
    reason,
    period: null,
    windows: [],
    isLoading: false,
    checkId: null,
  };
}

/**
 * Imperative pre-action check. Returns the resolver's verdict for `capability`.
 *
 * FAIL policy: on resolver error we FAIL CLOSED here (spend path). Whether the
 * capability is enforced is the resolver's answer, so with no answer there is
 * nothing to be permissive on. The UI read path (the hook/selector) fails open;
 * this spend path does not.
 */
export async function checkEntitlement(
  capability: Capability,
  opts?: { organizationId?: string | null },
): Promise<EntitlementCheckResult> {
  // 🚨 A TIER BELONGS TO AN ORGANIZATION (DD-047; billing.user_plan retired
  // 2026-09-29). There is no personal plan to answer from, so a check with no
  // organization is HELD, never answered: `ensureOrgId` uses the organization
  // the caller named (the record's own), else the one the person is working in,
  // else asks them to set one and continues. Closing the picker is "not now":
  // the action does not run and nothing is shown (reason organization_required).
  let organizationId: string;
  try {
    organizationId = await ensureOrgId(opts?.organizationId ?? null);
  } catch (e) {
    if (isOrganizationRequiredError(e)) {
      return refusal(capability, "organization_required");
    }
    return refusal(capability, "resolver_error");
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .schema("billing")
      .rpc("entitlement_check", {
        p_capability: capability,
        // Always the organization: the one-argument overload refuses (23502).
        p_org: organizationId,
      });

    if (error || !data) {
      return refusal(capability, "resolver_error");
    }
    const row = data as EntitlementCheckRow;
    // Loud recovery (F3): the resolver failed OPEN on an unknown capability id.
    // The DB already RAISEd a WARNING server-side; scream in the client too so a
    // typo'd/unregistered capability can't silently resolve unlimited in dev.
    if (row.unknown) warnUnknownCapability(capability);
    else if (row.reason === "permissive_stub") warnPermissiveOnce(capability);
    return mapCheckRow(capability, row);
  } catch {
    return refusal(capability, "resolver_error");
  }
}

// Loud recovery for a failed metering WRITE. A completed metered action whose
// consume RPC fails means the meter under-counts (dishonest the other way) — we
// never break the user's already-finished action, but we must not stay quiet.
// Dev-only scream; the caller falls back to a full snapshot refresh.
function warnConsumeFailed(capability: Capability, err: unknown): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console -- intentional loud-recovery dev signal
  console.error(
    `[entitlements] consume FAILED for "${capability}" — the metered action ` +
      `completed but billing.usage_ledger was NOT written, so the meter will ` +
      `under-count until the next snapshot refresh. Investigate the RPC error.`,
    err,
  );
}

/**
 * Record real usage for a metered action on its SUCCESS path (writes a
 * `billing.usage_ledger` row via the race-safe `entitlement_consume` RPC).
 *
 * CRITICAL: unlike `checkEntitlement`, this NEVER short-circuits on
 * `enforced: false`. `enforced` controls only whether a cap BLOCKS at the
 * limit — usage recording (and thus a truthful decrementing meter) must happen
 * regardless. The RPC itself writes the ledger for un-enforced/unknown
 * capabilities and only runs the advisory-locked cap check when enforced.
 *
 * Returns the fresh resolver windows (so the meter can re-render the new
 * `remaining` without a boot re-hydration), or `null` when the write failed
 * (caller should fall back to a full snapshot refresh). Fails soft — a metered
 * action that already succeeded must never surface a metering error to the user.
 */
export async function consumeEntitlement(
  capability: Capability,
  opts?: { quantity?: number; checkId?: string | null },
): Promise<EntitlementConsumeResult | null> {
  // 🚨 THE METER NAMES THE ORGANIZATION IT IS CHARGING (2026-09-19 ruling;
  // added in the 2026-09-19 review). This used to call the THREE-argument
  // `billing.entitlement_consume`, which has no organization parameter at all
  // and filled the ledger row's `organization_id` with
  // the old own-organization provisioner inside the function. So
  // every metered action a person took from the browser — while working
  // inside a team organization they had explicitly selected — was billed to a
  // own organization nobody chose. A billing query picking an organization
  // is precisely what the ruling names, and it survived the first pass because
  // the substitution lives in SQL, where no TypeScript guard was looking.
  //
  // The four-argument overload takes `p_org` and CHECKS it
  // (`iam.has_org_access_for`, DD-208), so the claim cannot be forged.
  //
  // With no organization selected we do NOT open the picker: this runs on the
  // success path of an action that already completed, so a dialog would appear
  // with nothing behind it to explain itself (the gate's own
  // `interactive: false` rule). We skip the write and scream instead — the
  // same loud-recovery contract this function already has for an RPC failure.
  // An under-counted meter is recoverable; a ledger row filed against the
  // wrong tenant is not.
  //
  // "NOBODY HAS LOOKED YET" IS NOT "THERE IS NONE". Reading `getActiveOrgId()`
  // and skipping on null would under-count every metered action taken in the
  // seconds before boot resolves the organization — a false refusal, which is
  // as dishonest as a false success and is the exact race
  // `check:org-three-states` exists to catch (it caught this line).
  // `awaitEffectiveOrganizationId` joins the answer boot is already fetching,
  // bounded by the workspace knob, and then tells the three states apart.
  // org-filter: server-call the call runs in the organization the person is working in
  const resolution = await awaitEffectiveOrganizationId();
  if (resolution.status !== "ready") {
    warnConsumeFailed(
      capability,
      new Error(
        `no organization to charge (${resolution.cause}): ${resolution.reason} ` +
          "Nothing was substituted — the ledger row is skipped rather than " +
          "billed to a workspace nobody chose. The next metered action records " +
          "normally once an organization is selected.",
      ),
    );
    return null;
  }
  const organizationId = resolution.organizationId;

  try {
    const supabase = createClient();
    // org-filter: server-call the call runs in the organization the person is working in
    const { data, error } = await supabase
      .schema("billing")
      .rpc("entitlement_consume", {
        p_capability: capability,
        p_quantity: opts?.quantity ?? 1,
        // Omit when absent (the RPC defaults it to NULL); the generated arg type
        // is `string | undefined`, so undefined — not null — is the "no id" value.
        p_check_id: opts?.checkId ?? undefined,
        p_org: organizationId,
      });
    if (error || !data) {
      warnConsumeFailed(capability, error);
      return null;
    }
    return mapConsumeRow(capability, data as EntitlementConsumeRow);
  } catch (e) {
    warnConsumeFailed(capability, e);
    return null;
  }
}

/**
 * Project a consume result onto the slice's per-capability usage shape so the
 * reactive meter re-renders the new remaining. Reuses the boot-snapshot usage
 * contract exactly (one source of truth for how a capability's usage is shaped).
 */
export function usageFromConsume(r: EntitlementConsumeResult): EntitlementUsage {
  return {
    used: r.used,
    limit: r.limit,
    period: r.period,
    resetsAt: r.windows[0]?.resetsAt ?? null,
    windows: r.windows,
    enforced: r.enforced,
  };
}

/**
 * Fetch the full boot snapshot (tier + trial + per-capability usage) for the
 * organization the person is working in. A tier belongs to an organization
 * (DD-047), so with no organization resolved this returns `null` and the caller
 * hydrates nothing — never a personal-plan answer, never an invented "free".
 * The boot path re-runs when the organization is set or switched. Fails soft to
 * the free permissive snapshot on a resolver error.
 */
export async function fetchEntitlementSnapshot(
  options: { fresh?: boolean } = {},
): Promise<EntitlementSnapshot | null> {
  // org-filter: server-call the call runs in the organization the person is working in
  const resolution = await awaitEffectiveOrganizationId();
  if (resolution.status !== "ready") return null;
  // ONE READ PER ORGANIZATION, SHARED (lane DEDUPE-READS). The boot effect, the usage gate and the
  // meters each asked `billing.entitlement_snapshot` for the same organization within the same
  // second. They share the read in flight and its answer for SNAPSHOT_SHARED_MS; a caller that
  // knows the answer changed (a purchase returning, a failed consume) passes `fresh`.
  const held = sharedSnapshot;
  if (
    !options.fresh &&
    held &&
    held.organizationId === resolution.organizationId &&
    (held.at === 0 || Date.now() - held.at < SNAPSHOT_SHARED_MS)
  ) {
    return held.read;
  }
  const entry: SharedSnapshot = {
    organizationId: resolution.organizationId,
    at: 0,
    read: readEntitlementSnapshot(resolution.organizationId),
  };
  sharedSnapshot = entry;
  void entry.read.then(
    (answer) => {
      // A failed read (the free permissive stand-in) is never kept past its flight.
      if (answer && standIns.has(answer)) {
        if (sharedSnapshot === entry) sharedSnapshot = null;
      } else entry.at = Date.now();
    },
    () => {
      if (sharedSnapshot === entry) sharedSnapshot = null;
    },
  );
  return entry.read;
}

type SharedSnapshot = {
  organizationId: string;
  at: number;
  read: Promise<EntitlementSnapshot | null>;
};
/** How long one organization's snapshot is shared: a page load, never a session of stale meters. */
const SNAPSHOT_SHARED_MS = 30_000;
let sharedSnapshot: SharedSnapshot | null = null;
/** The free stand-ins a failed read answers with: announced as what they are, never kept. */
const standIns = new WeakSet<object>();

/** Sign-out or a known change: the next boot read asks the resolver. */
export function forgetEntitlementSnapshot(): void {
  sharedSnapshot = null;
}

async function readEntitlementSnapshot(
  organizationId: string,
): Promise<EntitlementSnapshot | null> {
  const empty: EntitlementSnapshot = {
    tier: "free",
    isSubscribed: false,
    trialEndsAt: null,
    usage: {},
    fetchedAt: Date.now(),
  };
  standIns.add(empty);
  try {
    const supabase = createClient();
    // org-filter: server-call the call runs in the organization the person is working in
    const { data, error } = await supabase
      .schema("billing")
      .rpc("entitlement_snapshot", { p_org: organizationId });
    if (error || !data) return empty;
    return mapSnapshotRow(data as EntitlementSnapshotRow);
  } catch {
    return empty;
  }
}

/**
 * Every capability verdict for one (current user, organization), in one round
 * trip, plus the tier the org holds and the tier it would need.
 *
 * This is what a gated surface reads so it can explain itself. Fails soft to a
 * free/empty status — a resolver hiccup must never turn a working surface into
 * an error page; the ENFORCED verdict that actually stops an action is the
 * server-side one in aidream's send gate, not this.
 */
export async function fetchOrgCapabilityStatus(
  organizationId: string,
): Promise<OrgCapabilityStatus | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .schema("billing")
      .rpc("org_capability_status", { p_org: organizationId });
    if (error || !data) return null;
    const row = data as OrgCapabilityStatusRow;
    const capabilities: OrgCapabilityStatus["capabilities"] = {};
    for (const [id, raw] of Object.entries(row.capabilities ?? {})) {
      if (!isCapability(id)) continue; // DB knows a capability this build doesn't
      capabilities[id] = mapCheckRow(id, raw as EntitlementCheckRow);
    }
    return {
      organizationId,
      tier: row.tier,
      orgTier: row.org_tier,
      capabilities,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

// --- RPC row shapes (kept local until the RPC + generated types land) --------

interface OrgCapabilityStatusRow {
  organization_id: string;
  tier: EntitlementTier;
  org_tier: EntitlementTier;
  capabilities: Record<string, unknown>;
}

interface EntitlementCheckRow {
  allowed: boolean;
  remaining: number | null;
  limit: number | null;
  used: number;
  tier: EntitlementTier;
  reason: EntitlementReason;
  period: EntitlementPeriod;
  windows?: EntitlementWindow[] | null;
  check_id: string | null;
  /** True when the resolver failed open on an unknown capability id (F3). */
  unknown?: boolean;
  /** The tier that would unlock this capability — the refusal's own fix. */
  required_tier?: EntitlementTier | null;
  /** The org this verdict was resolved for; null for a user-scoped check. */
  organization_id?: string | null;
}

interface EntitlementSnapshotRow {
  tier: EntitlementTier;
  is_subscribed: boolean;
  trial_ends_at: string | null;
  usage: Record<string, EntitlementUsage>;
}

// `entitlement_consume` returns `resolve_capability(...)` merged with the
// consume flags — same field surface as a check row plus `consumed`/`duplicate`
// and the `enforced` flag from the resolver.
interface EntitlementConsumeRow {
  allowed: boolean;
  remaining: number | null;
  limit: number | null;
  used: number;
  tier: EntitlementTier;
  reason: EntitlementReason;
  period: EntitlementPeriod;
  windows?: EntitlementWindow[] | null;
  enforced?: boolean;
  consumed?: boolean;
  duplicate?: boolean;
}

function mapConsumeRow(
  capability: Capability,
  row: EntitlementConsumeRow,
): EntitlementConsumeResult {
  return {
    capability,
    allowed: row.allowed,
    remaining: row.remaining,
    limit: row.limit,
    used: row.used,
    tier: row.tier,
    reason: row.reason,
    period: row.period,
    windows: row.windows ?? [],
    isLoading: false,
    enforced: row.enforced ?? false,
    consumed: row.consumed ?? false,
    duplicate: row.duplicate ?? false,
  };
}

function mapCheckRow(
  capability: Capability,
  row: EntitlementCheckRow,
): EntitlementCheckResult {
  return {
    capability,
    allowed: row.allowed,
    remaining: row.remaining,
    limit: row.limit,
    used: row.used,
    tier: row.tier,
    reason: row.reason,
    period: row.period,
    windows: row.windows ?? [],
    isLoading: false,
    checkId: row.check_id,
    requiredTier: row.required_tier ?? null,
    organizationId: row.organization_id ?? null,
  };
}

function mapSnapshotRow(row: EntitlementSnapshotRow): EntitlementSnapshot {
  return {
    tier: row.tier,
    isSubscribed: row.is_subscribed,
    trialEndsAt: row.trial_ends_at,
    usage: (row.usage ?? {}) as EntitlementSnapshot["usage"],
    fetchedAt: Date.now(),
  };
}
