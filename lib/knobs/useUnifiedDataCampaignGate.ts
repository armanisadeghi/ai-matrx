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

import { useCallback, useEffect, useState } from "react";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";
import {
    UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE,
    UNIFIED_DATA_CAMPAIGN_UNAVAILABLE_SENTENCE,
    type StoreSwitchAnswer,
} from "./unifiedDataCampaign";

/**
 * 🚨 FOUR STATES, NOT A BOOLEAN (lane SHARE-OUT, item 3, 21 September).
 *
 * This used to be `{ on: boolean | null }`, with `null` meaning "not answered
 * yet" and `false` meaning BOTH "switched off" and "the read failed". So a
 * transient PostgREST schema-cache reload made `/data-v2` tell a person, as a
 * fact, that their organization does not keep its data in the record store —
 * about an organization whose switch was `true`. A failed check is "could not
 * check — retry", never a claim about somebody's organization.
 *
 * `OrganizationContextNotice` already proved the shape two screens earlier:
 * a real discriminant (`resolving` / `unavailable` / `required` / `ready`), and
 * `unavailable` gets a retry rather than the remedy for a different problem.
 */
export type UnifiedDataCampaignState = "resolving" | "on" | "off" | "unavailable";

export interface UnifiedDataCampaignGate {
    /** The one discriminant. Branch on THIS, never on `on`. */
    state: UnifiedDataCampaignState;
    /**
     * `true` only when the switch answered ON. `null` for every other state —
     * including `unavailable`, which is deliberately NOT `false`, so a caller
     * that still reads a boolean can never turn "we could not look" into "off".
     */
    on: boolean | null;
    /** What to say, in a sentence a person can act on. */
    because: string;
    /** The engineer-facing cause, when the check failed. `null` otherwise. */
    cause: string | null;
    /** Ask again. Safe to call at any time; a no-op while a read is in flight. */
    retry: () => void;
}

/** Older call sites pass a plain boolean reader; both shapes are accepted. */
function normalize(answer: boolean | StoreSwitchAnswer): StoreSwitchAnswer {
    if (typeof answer === "boolean") return { state: answer ? "on" : "off" };
    return answer;
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
    storeSwitch: (organizationId: string | null | undefined) => Promise<boolean | StoreSwitchAnswer>;
}): UnifiedDataCampaignGate {
    const { organizationId, organizationState, storeSwitch } = args;
    const [answer, setAnswer] = useState<
        { organizationId: string | null; result: StoreSwitchAnswer } | null
    >(null);
    const [attempt, setAttempt] = useState(0);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);

    useEffect(() => {
        if (organizationState && organizationState !== "ready") return;
        let cancelled = false;
        const asked = organizationId ?? null;
        setAnswer(null);
        void storeSwitch(asked).then((raw) => {
            if (!cancelled) setAnswer({ organizationId: asked, result: normalize(raw) });
        });
        return () => {
            cancelled = true;
        };
        // The reader is a module function passed by the caller; re-running on its
        // identity would re-ask the door on every render for no new fact.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organizationId, organizationState, attempt]);

    if (organizationState && organizationState !== "ready") {
        return { state: "resolving", on: null, because: "Waiting for organization context.", cause: null, retry };
    }
    if (!organizationId) {
        return {
            state: "off",
            on: false,
            because:
                "No organization is picked yet, so there are no tables to show. " +
                "Pick one from the organization menu and this answers for that organization.",
            cause: null,
            retry,
        };
    }
    // An answer about a DIFFERENT organization is not an answer about this one.
    if (answer === null || answer.organizationId !== organizationId) {
        return { state: "resolving", on: null, because: "Reading this organization's switch.", cause: null, retry };
    }
    if (answer.result.state === "unavailable") {
        // 🚨 NOT `on: false`. Nobody looked, so nothing is claimed — see the type's header.
        return {
            state: "unavailable",
            on: null,
            because: UNIFIED_DATA_CAMPAIGN_UNAVAILABLE_SENTENCE,
            cause: answer.result.cause,
            retry,
        };
    }
    const on = answer.result.state === "on";
    return {
        state: on ? "on" : "off",
        on,
        because: on
            ? "This organization keeps its data in the unified record store."
            : UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE,
        cause: null,
        retry,
    };
}
