"use client";

/**
 * useKindSandboxKnob — the ONE gate that decides whether an organization-
 * authored kind component renders inside the Shape sandbox frame
 * (`/kind-sandbox`) or in the page, as it does today.
 *
 * The knob is `platform.feature_knob` family **custom**, key
 * **sandbox_org_components** (DD-123 §1.10). Its honest purpose is a rollback
 * lever for a RENDERING regression — it is not an invitation to run untrusted
 * code in the page, and the settings copy must say so.
 *
 * DEFAULT OFF UNTIL THE ROW EXISTS. `knobBool` RAISES on a missing row by
 * design (there is deliberately no code fallback), and the seed migration is
 * S7. So until that row lands, this reads OFF — and says so out loud, ONCE,
 * naming the remedy. That is a named stand-in, not a silent fallback (Law 4):
 * OFF is byte-identical to today's behavior, so nothing a user sees changes
 * while the sentence sits in the console for whoever comes next.
 *
 * Platform components never reach this compiler at all, so there is nothing to
 * exempt them from — the gate is per-render, on the db-source path only.
 */

import React from "react";
import { knobBool } from "@/lib/knobs/featureKnobs";

export const KIND_SANDBOX_KNOB = {
    feature: "custom",
    key: "sandbox_org_components",
} as const;

let announced = false;

/** Shared across every mounted component — one read per knob TTL window. */
export async function readKindSandboxKnob(): Promise<boolean> {
    try {
        return await knobBool(KIND_SANDBOX_KNOB.feature, KIND_SANDBOX_KNOB.key);
    } catch (error) {
        if (!announced) {
            announced = true;
            console.warn(
                `[kind-sandbox] Organization components are rendering IN THE PAGE, ` +
                    `not in the Shape sandbox, because the feature knob ` +
                    `"${KIND_SANDBOX_KNOB.feature}.${KIND_SANDBOX_KNOB.key}" could not be read: ` +
                    `${error instanceof Error ? error.message : String(error)} ` +
                    `Seed that knob row (DD-123 S7) and the sandbox turns on with no code change.`,
            );
        }
        return false;
    }
}

/** Test seam — re-arms the one-time announcement. */
export function resetKindSandboxKnobAnnouncement(): void {
    announced = false;
}

/**
 * React binding. Starts false so the first paint is today's behavior; flips
 * when the knob answers true.
 */
export function useKindSandboxEnabled(): boolean {
    const [enabled, setEnabled] = React.useState(false);

    React.useEffect(() => {
        let live = true;
        void readKindSandboxKnob().then((value) => {
            if (live) setEnabled(value);
        });
        return () => {
            live = false;
        };
    }, []);

    return enabled;
}
