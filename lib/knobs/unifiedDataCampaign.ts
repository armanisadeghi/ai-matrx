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
