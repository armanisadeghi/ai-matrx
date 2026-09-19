// lib/knobs/unifiedDataCampaign.ts
//
// THE code-side OFF switch for the unified data campaign, frontend half.
//
// WHY THIS EXISTS. The campaign's DATABASE changes land behind their own
// `platform.feature_knob` guards, but its CODE ships to production
// continuously: any other lane's `release*:` commit builds the whole pushed
// range. So campaign code that reaches production must be INERT until one
// switch is turned on. This is that switch, and its aidream twin is
// `aidream/services/unified_data_campaign/flag.py`
// (`unified_data_campaign_enabled()`), reading the SAME row.
//
// THE ROW: `platform.feature_knob`, feature `custom`, key `code_paths_enabled`,
// boolean, default `false`. Seeded by migration — never by code.
//
// WHY IT DOES NOT RAISE, when every other knob read in this repo does.
// `knobBool` raises on a missing row on purpose: a ceiling with no row is a
// bug, and a frozen fallback would hide it. A KILL SWITCH is the one shape
// where the opposite is true — "I could not read the switch" must mean OFF, or
// an unreachable database would turn the campaign ON in production. So this
// reader catches and returns `false` — and ANNOUNCES it every time, naming the
// key and the remedy, because nothing fails silently.
//
// NOT AN ENV VAR. The process environment is not consulted here and must
// never be (this module's own test asserts that, by reading its source): an
// env var is a value, never a toggle (repo law,
// `common-docs/policies/env-vars-are-values-not-toggles.md`).

import { knobBool } from "./featureKnobs";
import {
    CAMPAIGN_MODULES,
    CAMPAIGN_STORE_TABLES,
    ENTRY_POINTS,
    RUNTIME_ENTRY_POINTS,
} from "./unifiedDataCampaign.register";

/** The registry address of the switch. One place, both halves of the repo. */
export const UNIFIED_DATA_CAMPAIGN_FEATURE = "custom";
export const UNIFIED_DATA_CAMPAIGN_KEY = "code_paths_enabled";

/**
 * The SAME address as the pair above, in the `{ feature, key }` shape every
 * scoped-config reader takes — written as literals on purpose.
 *
 * `lib/scoped-config/__tests__/every-knob-read-addresses-a-real-row.test.ts`
 * resolves a call site's address by reading the source: an inline
 * `{ feature: UNIFIED_DATA_CAMPAIGN.FEATURE, key: … }` is a member access on an
 * imported object, which it cannot follow, so the read counted as COMPUTED and
 * the census could not tell whether it addressed a real row. A call site that
 * imports THIS constant resolves like any other. The pair is pinned against the
 * two constants above by this module's own test, so the literals cannot drift.
 */
export const UNIFIED_DATA_CAMPAIGN_KNOB = { feature: "custom", key: "code_paths_enabled" };

/** What the switch reads as when it cannot be read at all. */
export const UNIFIED_DATA_CAMPAIGN_DEFAULT = false;

export {
    CAMPAIGN_MODULES,
    CAMPAIGN_STORE_TABLES,
    ENTRY_POINTS,
    RUNTIME_ENTRY_POINTS,
} from "./unifiedDataCampaign.register";
export type {
    CampaignEntryPoint,
    CampaignEntryPointKind,
} from "./unifiedDataCampaign.register";

async function enabled(): Promise<boolean> {
    try {
        return await knobBool("custom", "code_paths_enabled");
    } catch (error) {
        console.warn(
            `[unified-data-campaign] could not read platform.feature_knob ` +
                `"${UNIFIED_DATA_CAMPAIGN_FEATURE}"."${UNIFIED_DATA_CAMPAIGN_KEY}" ` +
                `— every unified-data campaign code path stays OFF. ` +
                `Remedy: seed/repair that boolean row (default false) and set it ` +
                `to true when the campaign is ready to run. Cause: ` +
                `${error instanceof Error ? error.message : String(error)}`,
        );
        return UNIFIED_DATA_CAMPAIGN_DEFAULT;
    }
}

/** The one obvious symbol. Import this, never `knobBool` directly. */
export const UNIFIED_DATA_CAMPAIGN = {
    FEATURE: UNIFIED_DATA_CAMPAIGN_FEATURE,
    KEY: UNIFIED_DATA_CAMPAIGN_KEY,
    DEFAULT: UNIFIED_DATA_CAMPAIGN_DEFAULT,
    ENTRY_POINTS,
    RUNTIME_ENTRY_POINTS,
    CAMPAIGN_MODULES,
    CAMPAIGN_STORE_TABLES,
    enabled,
} as const;

// ── THE PER-PERSON HALF OF THE SWITCH ────────────────────────────────────────
//
// `enabled()` above reads the PLATFORM DEFAULT of `custom.code_paths_enabled`
// — one row, one answer for everybody. That is the right shape for a kill
// switch and the wrong shape for a rollout: the campaign's first screens have
// to be usable by the person building them while the default stays `false` for
// everyone else.
//
// The knob register already answers that, and this repo already has the ladder:
// the row is declared `overridable_by {user}`, and `platform.knob_resolve`
// (through `lib/scoped-config`) returns the nearest rung's value — a user
// override, then an organization override, then the platform default. So the
// per-person answer is not a second switch invented here; it is the SAME row,
// resolved properly.
//
// WHY THE PLATFORM DEFAULT IS STILL READ. `knob_resolve` needs an organization
// to resolve for, and a person who has not picked one yet has none. In that
// window the kill switch's own answer is the answer — it can only be `false`
// or an announced failure, never an accidental `true`.

import { useEffect, useState } from "react";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

export interface UnifiedDataCampaignGate {
  /** `null` until both halves have answered. A screen shows nothing yet, not "off". */
  on: boolean | null;
  /** Which rung answered, so a screen can say why it is on or off. */
  because: string;
}

/**
 * THE gate a campaign route mounts. The route passes the platform default
 * reader itself (`UNIFIED_DATA_CAMPAIGN.enabled`), which is how the release
 * guard `pnpm check:campaign-entry-points` can see, in the route's own source,
 * that the kill switch is read there.
 */
export function useUnifiedDataCampaign(args: {
  organizationId: string | null | undefined;
  userId: string | null | undefined;
  platformDefault: () => Promise<boolean>;
}): UnifiedDataCampaignGate {
  const { organizationId, userId, platformDefault } = args;
  const [fallback, setFallback] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void platformDefault().then((value) => {
      if (!cancelled) setFallback(value);
    });
    return () => {
      cancelled = true;
    };
    // The reader is the module's own function; re-running on identity would
    // re-read the knob on every render for no new fact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolved = useEffectiveKnob(organizationId, userId, UNIFIED_DATA_CAMPAIGN_KNOB);

  if (!organizationId) {
    return {
      on: fallback,
      because:
        "No organization is picked yet, so the platform default of " +
        `"${UNIFIED_DATA_CAMPAIGN_FEATURE}.${UNIFIED_DATA_CAMPAIGN_KEY}" is the answer. ` +
        "Pick an organization and your own override applies.",
    };
  }
  if (resolved === undefined) return { on: null, because: "Reading the switch." };
  return {
    on: resolved === true || resolved === "true",
    because:
      `Resolved from "${UNIFIED_DATA_CAMPAIGN_FEATURE}.${UNIFIED_DATA_CAMPAIGN_KEY}" for this ` +
      "person in this organization — a person-level override beats the organization, which beats " +
      "the platform default.",
  };
}

/** What a campaign route says when the switch is off. Never a blank screen. */
export const UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE =
  "The unified data pages are switched off for you. They are behind " +
  `"${UNIFIED_DATA_CAMPAIGN_FEATURE}.${UNIFIED_DATA_CAMPAIGN_KEY}", which is off by default while the ` +
  "campaign is built. An administrator turns it on for a person, an organization or the whole " +
  "platform in Settings → Configuration. The existing data pages at /data are unaffected.";
