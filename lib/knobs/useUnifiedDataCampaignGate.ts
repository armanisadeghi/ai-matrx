"use client";

// lib/knobs/useUnifiedDataCampaignGate.ts
//
// THE CLIENT-ONLY HALF of the unified-data campaign's one switch — the React
// hook a campaign route and the sidebar mount. Split out of
// `unifiedDataCampaign.ts` (lane RSC-FIX, 19 September) because that module is
// also imported by genuine Server Components: every server page under
// `features/hr/settings/` reaches it through `features/organizations/service.ts` →
// `features/organizations/service/organizationStoreContents.ts`, and Next
// treats "a Server Component's module graph reaches `useEffect`/`useState`"
// as a hard build/runtime error, not a warning. That is exactly what
// happened: dac8fe4b48 added this hook to `unifiedDataCampaign.ts` at line
// 117, and the moment c8ded1d430 gave `organizationStoreContents.ts` a reason
// to import that module, every page in the app started 500ing.
//
// Behaviour is byte-identical to the hook this replaces — only its file
// changed. `unifiedDataCampaign.ts` never re-exports it: doing so would put
// React right back on every server import path this split exists to protect.
//
// See `lib/knobs/__tests__/lib-knobs-is-server-safe.test.ts` for the guard
// that keeps this split from silently reverting.

import { useEffect, useState } from "react";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";
import { UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE } from "./unifiedDataCampaign";

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
