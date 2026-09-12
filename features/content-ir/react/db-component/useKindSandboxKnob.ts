"use client";

/**
 * useKindSandboxKnob — the ONE read that decides whether an organization-
 * authored kind component renders inside the Shape sandbox frame
 * (`/kind-sandbox`) or in the page as it does today, AND the three ceilings
 * the host enforces once it does (DD-123 §1.10, S7).
 *
 * FOUR ROWS, ONE CALL, feature `custom`
 * (migration `dd123_kind_sandbox_gate_and_ceilings_knobs.sql`):
 *
 *   sandbox_org_components            the gate (boolean, seeded OFF)
 *   sandbox_frame_height_px           the height one frame gets before the
 *                                     host offers "Show all"
 *   sandbox_expanded_frame_height_px  what "Show all" grows to
 *   sandbox_message_bytes             the largest message the host accepts
 *                                     from a frame
 *
 * They are read through the SHARED client resolver — `useScopedKnobs`, one
 * `platform.knob_index` RPC — never through a bespoke setting and never
 * through a second read of the register. That resolver is what makes the
 * rollout in the plan's §6 executable at all: the gate is resolved FOR THE
 * ACTIVE ORGANIZATION, so the platform organization can run framed while
 * every other organization stays on today's path, with one override row and
 * no deploy. (The rows ship platform-locked; the rollout's own migration opens
 * the organization rung.)
 *
 * NOTHING IS SILENT AND NOTHING FALLS BACK (Law 4 + the knob law). If the
 * resolver cannot answer — no active organization, an RPC failure, a key the
 * register does not have, a ceiling that is not a number, or an expanded
 * ceiling BELOW the unexpanded one — the sandbox stays OFF and the reason is
 * said out loud, once, naming the remedy. OFF is byte-identical to the
 * behavior shipped today, so a reader sees exactly what they saw yesterday
 * while the sentence sits in the console for whoever comes next. There is no
 * constant to fall back on: the numbers in `sandbox/protocol.ts` are the
 * FRAME's compiled-in copies and the register's `default_value`, not a
 * host-side default.
 *
 * Platform components never reach this compiler at all, so there is nothing to
 * exempt them from — the gate is per-render, on the db-source path only.
 */

import React from "react";

import { ReactReduxContext } from "react-redux";

import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import type { RootState } from "@/lib/redux/store";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";
import type { ScopedKnob } from "@/lib/scoped-config/types";

export const KIND_SANDBOX_KNOB = {
    feature: "custom",
    key: "sandbox_org_components",
} as const;

/** The ceilings the HOST enforces, resolved from the register. */
export interface KindSandboxCeilings {
    /** Iframe height before the "Show all" control appears. */
    frameHeightPx: number;
    /** What "Show all" grows to before the host says the rest is cut off. */
    expandedFrameHeightPx: number;
    /** Largest single frame→host message the host will accept. */
    messageBytes: number;
}

export interface KindSandboxSettings {
    /** True only when the gate is on AND all three ceilings resolved. */
    enabled: boolean;
    /** Null whenever `enabled` is false — there is nothing to enforce. */
    ceilings: KindSandboxCeilings | null;
    /**
     * Why the sandbox is off, when it is off for a reason worth saying. Null
     * when the gate simply resolved to false (that is an answer, not a fault)
     * and while the first read is still in flight.
     */
    refusal: string | null;
}

const OFF: KindSandboxSettings = { enabled: false, ceilings: null, refusal: null };

function readCeiling(
    knob: ScopedKnob | undefined,
    key: string,
): { ok: true; value: number } | { ok: false; refusal: string } {
    if (!knob || knob.origin === "missing") {
        return {
            ok: false,
            refusal:
                `the ceiling "custom.${key}" is not in the settings register. ` +
                `Apply migrations/dd123_kind_sandbox_gate_and_ceilings_knobs.sql.`,
        };
    }
    const raw = knob.effective_value;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return {
            ok: false,
            refusal:
                `the ceiling "custom.${key}" resolved to ${JSON.stringify(raw)}, ` +
                `which is not a usable number of ${key.endsWith("bytes") ? "bytes" : "pixels"}.`,
        };
    }
    return { ok: true, value };
}

/**
 * PURE, so the decision is testable without a browser or a database: the rows
 * `knob_index` returned → what the host does. Every path that does not end in
 * a framed render ends in a sentence.
 */
export function resolveKindSandboxSettings(
    knobs: readonly ScopedKnob[],
): KindSandboxSettings {
    const gate = knobs.find((knob) => knob.key === "sandbox_org_components");
    if (!gate || gate.origin === "missing") {
        return {
            enabled: false,
            ceilings: null,
            refusal:
                `the feature knob "custom.sandbox_org_components" is not in the ` +
                `settings register. Apply ` +
                `migrations/dd123_kind_sandbox_gate_and_ceilings_knobs.sql and the ` +
                `sandbox turns on with no code change.`,
        };
    }
    const on = gate.effective_value === true || gate.effective_value === "true";
    if (!on) return OFF;

    // Each key is named as a LITERAL comparison on purpose: it is how the
    // settings guards (`check:settings-orphans` / `-unregistered`) read a
    // `useScopedKnobs` consumer, so a row seeded here and a row read here can
    // never drift apart unnoticed.
    const frame = readCeiling(
        knobs.find((knob) => knob.key === "sandbox_frame_height_px"),
        "sandbox_frame_height_px",
    );
    if (!frame.ok) return { enabled: false, ceilings: null, refusal: frame.refusal };
    const expanded = readCeiling(
        knobs.find((knob) => knob.key === "sandbox_expanded_frame_height_px"),
        "sandbox_expanded_frame_height_px",
    );
    if (!expanded.ok) return { enabled: false, ceilings: null, refusal: expanded.refusal };
    const message = readCeiling(
        knobs.find((knob) => knob.key === "sandbox_message_bytes"),
        "sandbox_message_bytes",
    );
    if (!message.ok) return { enabled: false, ceilings: null, refusal: message.refusal };

    if (expanded.value < frame.value) {
        return {
            enabled: false,
            ceilings: null,
            refusal:
                `"custom.sandbox_expanded_frame_height_px" is ${expanded.value} pixels, ` +
                `below "custom.sandbox_frame_height_px" at ${frame.value} — expanding a ` +
                `component would show LESS of it, so nothing is framed until the two ` +
                `settings agree.`,
        };
    }

    return {
        enabled: true,
        ceilings: {
            frameHeightPx: frame.value,
            expandedFrameHeightPx: expanded.value,
            messageBytes: message.value,
        },
        refusal: null,
    };
}

/**
 * The active organization, WITHOUT assuming a Redux Provider is overhead.
 *
 * A kind component is rendered in places that are not the app shell — the
 * repo's own suites call `renderToStaticMarkup(<DbKindComponent …/>)` with no
 * store at all, and `useSelector` THROWS there. A gate that crashes the render
 * it gates is worse than the thing it was gating, so this subscribes to the
 * store when there is one and answers `null` when there is not (which the
 * caller turns into "sandbox off, and here is why").
 */
function useActiveOrganizationId(): string | null {
    const context = React.useContext(ReactReduxContext);
    const store = context?.store ?? null;
    const subscribe = React.useCallback(
        (onChange: () => void) => (store ? store.subscribe(onChange) : () => {}),
        [store],
    );
    const read = React.useCallback(
        () =>
            store ? selectOrganizationId(store.getState() as RootState) : null,
        [store],
    );
    return React.useSyncExternalStore(subscribe, read, read);
}

const announced = new Set<string>();

/** Say each distinct reason exactly once per page. */
function announce(reason: string): void {
    if (announced.has(reason)) return;
    announced.add(reason);
    console.warn(
        `[kind-sandbox] Organization components are rendering IN THE PAGE, not in ` +
            `the Shape sandbox, because ${reason}`,
    );
}

/** Test seam — re-arms the announcements. */
export function resetKindSandboxKnobAnnouncement(): void {
    announced.clear();
}

/**
 * React binding. Starts OFF so the first paint is today's behavior; flips when
 * the resolver answers.
 */
export function useKindSandboxSettings(): KindSandboxSettings {
    const organizationId = useActiveOrganizationId();
    const { knobs, isLoading, error } = useScopedKnobs({
        organizationId,
        featurePrefix: "custom",
    });

    const settings = React.useMemo<KindSandboxSettings>(() => {
        if (!organizationId) {
            return {
                enabled: false,
                ceilings: null,
                refusal:
                    `no organization is active in this session, and the settings ` +
                    `resolver answers per organization.`,
            };
        }
        if (error) {
            return {
                enabled: false,
                ceilings: null,
                refusal: `the settings resolver failed: ${error}`,
            };
        }
        if (isLoading) return OFF;
        return resolveKindSandboxSettings(knobs);
    }, [organizationId, knobs, isLoading, error]);

    React.useEffect(() => {
        if (settings.refusal) announce(settings.refusal);
    }, [settings.refusal]);

    return settings;
}

/** The gate alone, for call sites that only choose a render path. */
export function useKindSandboxEnabled(): boolean {
    return useKindSandboxSettings().enabled;
}
