// lib/knobs/unifiedDataCampaign.ts
//
// THE RECORD STORE IS NEVER OFF (lane CHAIR-ALWAYS-ON, 2026-10-03).
//
// Arman, 2026-10-03, verbatim: "Why am I being told that the table builder is off to
// organizations by default? EVERYTHING IS ON by default and things can only be TURNED OFF!
// Don't limit what users can do." Since the final switch (2026-10-01) the record store is the
// ONLY data system, so the per-organization on/off switch this module used to read —
// `platform.feature_knob` `custom/system_enabled`, through the door
// `platform.unified_data_store_on` — has no meaning and is retired: the knob is archived, its
// `false` overrides are gone, and `custom.store_is_open` (the one answer every store door asks)
// returns true for every organization (migrations/campaign/chairalwayson_a_the_store_is_never_off.sql).
//
// WHAT IS LEFT HERE, AND WHY. Nothing that can be asked. The reader (`enabled()` / `check()`),
// the client gate hook beside this file, the sidebar gate id `"unified-data-campaign"`,
// the switch notice and its OFF/UNAVAILABLE sentences, and the ramp screen's per-organization Off
// control are DELETED, not disabled — a reader that can only say yes is still a door somebody can
// make say no. This module is now only the census: the registry re-exports (`CAMPAIGN_MODULES`,
// `CAMPAIGN_STORE_TABLES`, `ENTRY_POINTS`) that `pnpm check:campaign-entry-points` and the cutover
// scripts read. Guard: features/shell/__tests__/no-nav-row-is-gated.test.ts.
//
// WHERE "OFF BY DEFAULT" CAME FROM, FOR THE RECORD. This file's own header (lane NAV-FIX,
// 19 September) declared the knob "boolean, default `false`, overridable per ORGANIZATION" and
// `UNIFIED_DATA_CAMPAIGN_DEFAULT = false` ("what the switch reads as when it cannot be read at
// all"); the sidebar hid the Data entries while the switch was unanswered or off; and the knob
// row's own description read "OFF means schema custom is unreachable". The platform value was
// flipped to true on 2026-09-23 (owner ruling, lane STORE-ON) but the switch, its screen and its
// sentences stayed. They are gone now.
//
// NOT AN ENV VAR. The process environment is not consulted here and must never be: an env var is
// a value, never a toggle (`common-docs/policies/env-vars-are-values-not-toggles.md`).
//
// SERVER-SAFE ON PURPOSE (lane RSC-FIX, 19 September): this module is imported by genuine Server
// Components (`features/organizations/service/organizationStoreContents.ts`), so it carries NO
// React. See `lib/knobs/__tests__/lib-knobs-is-server-safe.test.ts`.
import {
    CAMPAIGN_MODULES,
    CAMPAIGN_STORE_TABLES,
    ENTRY_POINTS,
    RUNTIME_ENTRY_POINTS,
} from "./unifiedDataCampaign.register";

/** The registry address of the RETIRED switch (archived in platform.feature_knob; kept for the census). */
export const UNIFIED_DATA_CAMPAIGN_FEATURE = "custom";
export const UNIFIED_DATA_CAMPAIGN_KEY = "system_enabled";

/** The store is on for every organization. There is no other answer. */
export const UNIFIED_DATA_CAMPAIGN_DEFAULT = true;

export {
    CAMPAIGN_ENTRY_POINT_KINDS,
    CAMPAIGN_MODULES,
    CAMPAIGN_STORE_TABLES,
    ENTRY_POINTS,
    RUNTIME_ENTRY_POINTS,
} from "./unifiedDataCampaign.register";
export type {
    CampaignEntryPoint,
    CampaignEntryPointKind,
} from "./unifiedDataCampaign.register";

/** The one obvious symbol. */
export const UNIFIED_DATA_CAMPAIGN = {
    FEATURE: UNIFIED_DATA_CAMPAIGN_FEATURE,
    KEY: UNIFIED_DATA_CAMPAIGN_KEY,
    DEFAULT: UNIFIED_DATA_CAMPAIGN_DEFAULT,
    ENTRY_POINTS,
    RUNTIME_ENTRY_POINTS,
    CAMPAIGN_MODULES,
    CAMPAIGN_STORE_TABLES,
} as const;
