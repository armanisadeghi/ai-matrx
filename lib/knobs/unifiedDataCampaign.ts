// lib/knobs/unifiedDataCampaign.ts
//
// THE ONE SWITCH THE RECORD STORE'S PAGES READ, AND THERE IS NOT A SECOND ONE.
//
// WHAT A PERSON HIT (independent verdict, fifth pass, 19 September). An admin
// turned the record store ON for their organization on the switch screen — and
// still could not find their data. The pages refused: "The unified data pages
// are switched off for you. They are behind `custom.code_paths_enabled` … An
// administrator turns it on for a person, an organization or the whole
// platform in Settings → Configuration." That second switch saved PER PERSON,
// so an admin could open the pages for themselves and had no way, from any
// screen, to open them for the people they work with. The Records entry in the
// sidebar never appeared at all. The verdict's words: "Three switches stand
// between an admin and their data … Airtable, Notion and Linear each answer
// 'where is my data?' with one link that is always there."
//
// THE RULING (lane NAV-FIX, 19 September). ONE switch per organization — the
// record-store switch on the unified data ramp screen — and the pages read
// THAT and nothing else. The per-person half is gone: not disabled, not
// deprecated, not left as a second way in. `custom.code_paths_enabled` is no
// longer read by any page, route or nav gate in this repo, and its PERSON rung
// was taken off the knob row in the same migration, so nobody can re-open the
// pages for one person from Settings while their colleagues stay locked out.
// (The knob row itself stays: aidream's server half still reads its platform
// default, and dropping a row a live consumer reads is not this lane's to do.)
//
// THE ADDRESS: `platform.feature_knob`, feature `custom`, key `system_enabled`,
// boolean, default `false`, overridable per ORGANIZATION. It is written by
// `platform.unified_data_store_set` from the switch screen and read here
// through `platform.unified_data_store_on`, the member-readable door — because
// the Records entry exists for every member of the organization and not only
// for its administrators, and the administrators-only door beside it
// (`unified_data_store_state`) refuses an ordinary member by design.
//
// WHY IT DOES NOT RAISE. A switch that cannot be read must read as OFF, or an
// unreachable database turns a half-built feature ON for everybody. So every
// failure here returns `false` — and ANNOUNCES itself, naming the door and the
// remedy, because nothing fails silently.
//
// NOT AN ENV VAR. The process environment is not consulted here and must never
// be (this module's own test asserts that by reading its source): an env var is
// a value, never a toggle (repo law,
// `common-docs/policies/env-vars-are-values-not-toggles.md`).

import { createClient } from "@/utils/supabase/client";
import {
    CAMPAIGN_MODULES,
    CAMPAIGN_STORE_TABLES,
    ENTRY_POINTS,
    RUNTIME_ENTRY_POINTS,
} from "./unifiedDataCampaign.register";

/** The registry address of the ONE switch. */
export const UNIFIED_DATA_CAMPAIGN_FEATURE = "custom";
export const UNIFIED_DATA_CAMPAIGN_KEY = "system_enabled";

/** The door that answers it for a member of the organization. */
export const UNIFIED_DATA_STORE_DOOR = "unified_data_store_on";

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

/**
 * Does THIS ORGANIZATION keep its data in the unified record store?
 *
 * One argument, because the switch is one organization's decision. No
 * organization picked yet is `false` — silently, because a person who has not
 * chosen one has no store to be in and the sidebar asks this on every boot.
 */
async function enabled(organizationId: string | null | undefined): Promise<boolean> {
    if (!organizationId) return UNIFIED_DATA_CAMPAIGN_DEFAULT;
    try {
        const { data, error } = await createClient()
            .schema("platform")
            .rpc(UNIFIED_DATA_STORE_DOOR, { p_organization_id: organizationId });
        if (error) throw new Error(error.message);
        const answer = (data ?? null) as { on?: boolean } | null;
        return answer?.on === true;
    } catch (error) {
        console.warn(
            `[unified-data-campaign] could not read platform.${UNIFIED_DATA_STORE_DOOR}` +
                `(${organizationId}) — the record store's pages stay OFF for this organization. ` +
                `Remedy: an owner or an administrator of this organization turns the store on ` +
                `once, for everybody, on the unified data ramp screen ` +
                `(/administration/database/unified-data-ramp), which writes ` +
                `${UNIFIED_DATA_CAMPAIGN_FEATURE}.${UNIFIED_DATA_CAMPAIGN_KEY} for the organization. ` +
                `Cause: ${error instanceof Error ? error.message : String(error)}`,
        );
        return UNIFIED_DATA_CAMPAIGN_DEFAULT;
    }
}

/** The one obvious symbol. Import this, never the door name directly. */
export const UNIFIED_DATA_CAMPAIGN = {
    FEATURE: UNIFIED_DATA_CAMPAIGN_FEATURE,
    KEY: UNIFIED_DATA_CAMPAIGN_KEY,
    DOOR: UNIFIED_DATA_STORE_DOOR,
    DEFAULT: UNIFIED_DATA_CAMPAIGN_DEFAULT,
    ENTRY_POINTS,
    RUNTIME_ENTRY_POINTS,
    CAMPAIGN_MODULES,
    CAMPAIGN_STORE_TABLES,
    enabled,
} as const;

import { useEffect, useState } from "react";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";

export interface UnifiedDataCampaignGate {
    /** `null` until the switch has answered. A screen shows nothing yet, not "off". */
    on: boolean | null;
    /** Why it is on or off, in a sentence a person can act on. */
    because: string;
}

/**
 * THE gate a campaign route and the sidebar mount. The caller passes the
 * reader itself (`UNIFIED_DATA_CAMPAIGN.enabled`), which is how the release
 * guard `pnpm check:campaign-entry-points` can see, in the calling file's own
 * source, that the switch is read there.
 *
 * It re-asks whenever the organization changes. The sidebar used to read the
 * active organization ONCE, in a mount effect, before the organization had
 * loaded — so it always asked about `null`, always got OFF, and the Records
 * entry never appeared however the switch was set (the verdict's third finding).
 */
export function useUnifiedDataCampaign(args: {
    organizationId: string | null | undefined;
    organizationState?: OrganizationState;
    storeSwitch: (organizationId: string | null | undefined) => Promise<boolean>;
}): UnifiedDataCampaignGate {
    const { organizationId, organizationState, storeSwitch } = args;
    const [answer, setAnswer] = useState<{ organizationId: string | null; on: boolean } | null>(null);

    useEffect(() => {
        if (organizationState && organizationState !== "ready") return;
        let cancelled = false;
        const asked = organizationId ?? null;
        void storeSwitch(asked).then((on) => {
            if (!cancelled) setAnswer({ organizationId: asked, on });
        });
        return () => {
            cancelled = true;
        };
        // The reader is a module function passed by the caller; re-running on its
        // identity would re-ask the door on every render for no new fact.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organizationId, organizationState]);

    if (organizationState && organizationState !== "ready") {
        return { on: null, because: "Waiting for organization context." };
    }
    if (!organizationId) {
        return {
            on: false,
            because:
                "No organization is picked yet, so there are no tables to show. " +
                "Pick one from the organization menu and this answers for that organization.",
        };
    }
    // An answer about a DIFFERENT organization is not an answer about this one.
    if (answer === null || answer.organizationId !== organizationId) {
        return { on: null, because: "Reading this organization's switch." };
    }
    return {
        on: answer.on,
        because: answer.on
            ? "This organization keeps its data in the unified record store."
            : UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE,
    };
}

/**
 * What a campaign route says when the switch is off. Never a blank screen, and
 * never a knob key at a person: it names the one thing that turns it on, in the
 * words of the screen that does it.
 */
export const UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE =
    "This organization does not keep its data in the unified record store yet, so there are no " +
    "tables here. An owner or an administrator of it turns that on once, for everybody, on the " +
    "unified data ramp screen. Your existing data pages are unaffected.";
