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
// 🚨 BUT A FAILED CHECK IS NOT A FACT ABOUT THE ORGANIZATION (lane SHARE-OUT,
// item 3, 21 September). Reading OFF is the right thing for a READ PATH and the
// wrong thing to SAY to a person. Lane PEEK-SHARE watched `/data-v2` print
// "This organization does not keep its data in the unified record store yet" —
// a definite claim, about an organization whose switch was demonstrably `true` —
// through a transient PostgREST schema-cache reload (`PGRST002`) caused by
// another lane's DDL. The organization picker two screens earlier gets this
// right ("We could not check your organization"); this surface did not, because
// `enabled()` collapsed "off" and "could not look" into one `false`.
//
// So there are now TWO readers and they are different on purpose:
//   `check()`   — the honest three-state answer, `on` | `off` | `unavailable`
//                 with the cause. EVERY surface that SAYS something to a person
//                 reads this one.
//   `enabled()` — the boolean, implemented in terms of `check()`, for a READ
//                 PATH that must choose a store or a nav entry that must choose
//                 whether to appear. It still fails closed and still announces
//                 itself; it simply never becomes a sentence.
//
// NOT AN ENV VAR. The process environment is not consulted here and must never
// be (this module's own test asserts that by reading its source): an env var is
// a value, never a toggle (repo law,
// `common-docs/policies/env-vars-are-values-not-toggles.md`).

// SERVER-SAFE ON PURPOSE (lane RSC-FIX, 19 September). This module is
// imported by genuine Server Components — e.g. every server page under
// `features/hr/settings/` reaches it through `features/organizations/service.ts` →
// `features/organizations/service/organizationStoreContents.ts` — so it must
// carry NO React. The one thing here that needed React (the mount hook a
// campaign route and the sidebar use) lives in the sibling
// `useUnifiedDataCampaignGate.ts`, a `"use client"` file, because importing
// `useEffect`/`useState` into a Server Component's module graph is a hard
// Next.js error, not a warning: on 19 September that exact import, added to
// this file at line 117 by dac8fe4b48, reached every page in the app the
// moment c8ded1d430 gave `organizationStoreContents.ts` a reason to import
// this module, and the whole app 500'd. Nothing else moved: `enabled()`,
// the registry re-exports and `UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE` are
// unchanged, and the hook is not re-exported from here — re-exporting it
// would put React right back on every server import path this split exists
// to protect. See `lib/knobs/__tests__/lib-knobs-is-server-safe.test.ts`.
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
    // FAILS CLOSED, STILL. `unavailable` is not `on`, so an unreachable database can
    // never turn the store on for a read path — and it is no longer indistinguishable
    // from `off` for anybody who has to say something to a person.
    return (await check(organizationId)).state === "on";
}

/**
 * THE THREE-STATE ANSWER. `on`, `off`, or `unavailable` — and `unavailable`
 * carries the cause, so a screen can say "we could not check" and offer a retry
 * instead of stating a fact about somebody's organization that nobody measured.
 *
 * No organization picked yet is `off` and not `unavailable`: there is nothing to
 * check, which is a real answer, and the sidebar asks this on every boot.
 */
async function check(organizationId: string | null | undefined): Promise<StoreSwitchAnswer> {
    if (!organizationId) return { state: UNIFIED_DATA_CAMPAIGN_DEFAULT ? "on" : "off" };
    try {
        const { data, error } = await createClient()
            .schema("platform")
            .rpc(UNIFIED_DATA_STORE_DOOR, { p_organization_id: organizationId });
        if (error) throw new Error(error.message);
        const answer = (data ?? null) as { on?: boolean } | null;
        return { state: answer?.on === true ? "on" : "off" };
    } catch (error) {
        const cause = error instanceof Error ? error.message : String(error);
        console.warn(
            `[unified-data-campaign] could not read platform.${UNIFIED_DATA_STORE_DOOR}` +
                `(${organizationId}) — this is NOT an answer about the organization. A read path ` +
                `stays on the old table and a screen says it could not check, with a retry. ` +
                `Remedy: retry; if it persists, an owner or an administrator of this organization ` +
                `turns the store on once, for everybody, on the unified data ramp screen ` +
                `(/administration/database/unified-data-ramp), which writes ` +
                `${UNIFIED_DATA_CAMPAIGN_FEATURE}.${UNIFIED_DATA_CAMPAIGN_KEY} for the organization. ` +
                `Cause: ${cause}`,
        );
        return { state: "unavailable", cause };
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
    check,
} as const;

/**
 * What the one switch actually answered. `unavailable` is NOT `off`: it means
 * nobody could look, which is a different thing and gets a different sentence.
 */
export type StoreSwitchAnswer =
    | { state: "on" }
    | { state: "off" }
    | { state: "unavailable"; cause: string };

/**
 * What a campaign route says when the switch is off. Never a blank screen, and
 * never a knob key at a person: it names the one thing that turns it on, in the
 * words of the screen that does it.
 *
 * Pure string — safe from here, unlike the hook that used to sit below it.
 * `useUnifiedDataCampaignGate.ts` imports this one constant.
 */
export const UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE =
    "This organization does not keep its data in the unified record store yet, so there are no " +
    "tables here. An owner or an administrator of it turns that on once, for everybody, on the " +
    "unified data ramp screen. Your existing data pages are unaffected.";

/**
 * What a campaign route says when the switch COULD NOT BE READ. It states
 * nothing about the organization, because nothing was measured — it says what
 * happened and what to do about it, which is the organization picker's own
 * shape ("We could not check your organization", `useOrganizationRequired.ts`).
 *
 * THE RULE THIS SENTENCE EXISTS FOR: a failed read is "could not check —
 * retry", never "you do not have / are not / have not". Guard:
 * `pnpm check:failed-check-is-not-a-fact`.
 */
export const UNIFIED_DATA_CAMPAIGN_UNAVAILABLE_SENTENCE =
    "We could not check whether this organization keeps its data in the unified record store, so " +
    "nothing was loaded. This does not mean it is switched off — we simply could not look. Try " +
    "again, and if it keeps happening, reload the page.";
