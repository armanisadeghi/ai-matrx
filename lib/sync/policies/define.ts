/**
 * lib/sync/policies/define.ts
 *
 * `definePolicy()` — the single entry point slice authors use to opt into the
 * sync engine. Validates the config against the preset's capabilities, freezes
 * the result, and returns an opaque `Policy<TState>`.
 *
 * Replaces (over time): ad-hoc persistence wrappers scattered across feature
 * slices (see decisions.md §8 manifest). Delete trigger: when every slice that
 * wants persistence/broadcast goes through `definePolicy()` — grep for
 * `localStorage.setItem` + `new BroadcastChannel` in `features/` and `lib/`
 * should return zero matches outside `lib/sync/`.
 */

import type { PolicyConfig, Policy, PrePaintDescriptor } from "../types";
import { getPreset } from "./presets";

const isProd = process.env.NODE_ENV === "production";

function fail(message: string): void {
    const full = `[sync] definePolicy: ${message}`;
    if (isProd) {
        // Silent no-op in prod — engine continues; logger.error happens in boot.
        console.error(full);
        return;
    }
    throw new Error(full);
}

function toDescriptorArray(
    prePaint: PrePaintDescriptor | readonly PrePaintDescriptor[] | undefined,
): readonly PrePaintDescriptor[] {
    if (!prePaint) return [];
    return Array.isArray(prePaint) ? (prePaint as readonly PrePaintDescriptor[]) : [prePaint as PrePaintDescriptor];
}

function validatePrePaintDescriptor(d: PrePaintDescriptor, sliceName: string, idx: number): void {
    const where = `"${sliceName}" prePaint[${idx}]`;
    if (d.kind === "attribute") {
        if (d.target !== "html" && d.target !== "body") {
            fail(`${where}: target must be "html" or "body"`);
        }
        if (!d.attribute || typeof d.attribute !== "string") {
            fail(`${where}: attribute must be a non-empty string`);
        }
        if (!d.fromKey || typeof d.fromKey !== "string") {
            fail(`${where}: fromKey must be a non-empty string`);
        }
        if (!Array.isArray(d.allowed) || d.allowed.length === 0) {
            fail(`${where}: allowed must be a non-empty array`);
        }
        if (typeof d.default !== "string") {
            fail(`${where}: default must be a string`);
        }
    } else if (d.kind === "classToggle") {
        if (d.target !== "html" && d.target !== "body") {
            fail(`${where}: target must be "html" or "body"`);
        }
        if (!d.className || typeof d.className !== "string") {
            fail(`${where}: className must be a non-empty string`);
        }
        if (!d.fromKey || typeof d.fromKey !== "string") {
            fail(`${where}: fromKey must be a non-empty string`);
        }
        if (typeof d.whenEquals !== "string") {
            fail(`${where}: whenEquals must be a string`);
        }
    } else {
        fail(`${where}: unknown kind`);
    }
}

/**
 * Register a sync policy for a slice.
 *
 * WARNING — version bumps destroy client data.
 * Until schema-migration helpers land (Q5, Phase 2/6), incrementing `version`
 * silently discards all persisted + peer-offered data for this slice on every
 * client. Only bump `version` when you accept that cost. Document the reason
 * in a comment on the same line as the bump.
 */
export function definePolicy<TState>(config: PolicyConfig<TState>): Policy<TState> {
    if (!config || typeof config !== "object") {
        fail("config is required");
    }
    const { sliceName, preset, version } = config;

    if (!sliceName || typeof sliceName !== "string") {
        fail(`sliceName must be a non-empty string`);
    }
    if (!Number.isInteger(version) || version < 1) {
        fail(`"${sliceName}": version must be a positive integer (got ${String(version)})`);
    }

    const caps = getPreset(preset);
    if (!caps) {
        fail(`"${sliceName}": unknown preset "${preset}"`);
    }

    const broadcastActions = config.broadcast?.actions ?? [];
    const hasBroadcast = broadcastActions.length > 0;

    // Rule: volatile MUST NOT declare broadcast actions.
    if (!caps.allowsBroadcast && hasBroadcast) {
        fail(`"${sliceName}": preset "${preset}" does not allow broadcast actions`);
    }
    // Rule: ui-broadcast / boot-critical MUST declare at least one broadcast action.
    if (caps.requiresBroadcast && !hasBroadcast) {
        fail(`"${sliceName}": preset "${preset}" requires at least one broadcast action`);
    }

    // Rule: non-persisting presets MUST NOT declare persistence fields.
    if (!caps.persists) {
        const forbidden: Array<keyof PolicyConfig<TState>> = [
            "storageKey",
            "partialize",
            "serialize",
            "deserialize",
        ];
        for (const key of forbidden) {
            if (config[key] !== undefined) {
                fail(`"${sliceName}": preset "${preset}" must not declare "${String(key)}"`);
            }
        }
    }

    // Rule: prePaint only valid on presets that allow it.
    if (config.prePaint !== undefined && !caps.allowsPrePaint) {
        fail(`"${sliceName}": preset "${preset}" does not allow prePaint descriptors`);
    }

    const prePaintDescriptors = toDescriptorArray(config.prePaint);
    prePaintDescriptors.forEach((d, i) => validatePrePaintDescriptor(d, sliceName, i));

    // Rule: remote only valid on presets that allow it (warm-cache + live-data).
    if (config.remote !== undefined && !caps.allowsRemote) {
        fail(`"${sliceName}": preset "${preset}" does not allow remote.fetch / remote.write`);
    }
    if (config.remote !== undefined) {
        const {
            fetch: rFetch,
            write: rWrite,
            debounceMs,
            cacheSatisfies,
        } = config.remote;
        if (cacheSatisfies !== undefined) {
            if (typeof cacheSatisfies !== "function") {
                fail(`"${sliceName}": remote.cacheSatisfies must be a function`);
            }
            if (rFetch === undefined) {
                // A sufficiency test with no fetch has no recovery path — the
                // engine would classify the cache as insufficient and have
                // nothing to do about it.
                fail(`"${sliceName}": remote.cacheSatisfies requires remote.fetch`);
            }
        }
        if (rFetch !== undefined && typeof rFetch !== "function") {
            fail(`"${sliceName}": remote.fetch must be a function`);
        }
        if (rWrite !== undefined && typeof rWrite !== "function") {
            fail(`"${sliceName}": remote.write must be a function`);
        }
        if (debounceMs !== undefined) {
            if (!Number.isFinite(debounceMs) || debounceMs < 50) {
                fail(
                    `"${sliceName}": remote.debounceMs must be ≥ 50 (got ${String(debounceMs)})`,
                );
            }
        }
    }

    // Rule: staleAfter only valid on presets that allow it AND only paired
    // with remote.fetch (otherwise staleness has no recovery path).
    if (config.staleAfter !== undefined) {
        if (!caps.allowsStaleAfter) {
            fail(`"${sliceName}": preset "${preset}" does not allow staleAfter`);
        }
        if (!Number.isFinite(config.staleAfter) || config.staleAfter <= 0) {
            fail(
                `"${sliceName}": staleAfter must be a positive number (got ${String(config.staleAfter)})`,
            );
        }
        if (config.remote?.fetch === undefined) {
            fail(`"${sliceName}": staleAfter requires remote.fetch to be declared`);
        }
    }

    // Validate broadcast action uniqueness within this policy (cheap hygiene).
    if (hasBroadcast) {
        const seen = new Set<string>();
        for (const a of broadcastActions) {
            if (typeof a !== "string" || a.length === 0) {
                fail(`"${sliceName}": broadcast.actions entries must be non-empty strings`);
            }
            if (seen.has(a)) {
                fail(`"${sliceName}": duplicate broadcast action "${a}"`);
            }
            seen.add(a);
        }
    }

    // Phase 5: autoSave is only legal on warm-cache. Validate the block.
    if (config.autoSave !== undefined) {
        if (preset !== "warm-cache") {
            fail(
                `"${sliceName}": autoSave is only legal on the "warm-cache" preset (got "${preset}")`,
            );
        }
        const a = config.autoSave;
        if (
            typeof a.recordsKey !== "string" ||
            (a.recordsKey as string).length === 0
        ) {
            fail(
                `"${sliceName}": autoSave.recordsKey must be a non-empty string slice-state key`,
            );
        }
        if (!Array.isArray(a.triggerActions) || a.triggerActions.length === 0) {
            fail(
                `"${sliceName}": autoSave.triggerActions must be a non-empty array`,
            );
        } else {
            const seen = new Set<string>();
            for (const t of a.triggerActions) {
                if (typeof t !== "string" || t.length === 0) {
                    fail(
                        `"${sliceName}": autoSave.triggerActions entries must be non-empty strings`,
                    );
                }
                if (seen.has(t)) {
                    fail(
                        `"${sliceName}": duplicate autoSave.triggerActions "${t}"`,
                    );
                }
                seen.add(t);
            }
        }
        if (typeof a.write !== "function") {
            fail(`"${sliceName}": autoSave.write must be a function`);
        }
        if (a.debounceMs !== undefined) {
            if (typeof a.debounceMs === "number") {
                if (!Number.isFinite(a.debounceMs) || a.debounceMs < 0) {
                    fail(
                        `"${sliceName}": autoSave.debounceMs (number) must be >= 0`,
                    );
                }
            } else if (typeof a.debounceMs !== "function") {
                fail(
                    `"${sliceName}": autoSave.debounceMs must be a number or a function`,
                );
            }
        }
        if (a.shouldSave !== undefined && typeof a.shouldSave !== "function") {
            fail(`"${sliceName}": autoSave.shouldSave must be a function`);
        }
        if (a.optimistic !== undefined) {
            for (const k of ["onStart", "onSuccess", "onError"] as const) {
                const v = a.optimistic[k];
                if (v !== undefined && typeof v !== "function") {
                    fail(
                        `"${sliceName}": autoSave.optimistic.${k} must be a function`,
                    );
                }
            }
        }
    }

    const storageKey = caps.persists ? config.storageKey ?? `matrx:${sliceName}` : "";

    const policy: Policy<TState> = Object.freeze({
        config: Object.freeze({ ...config }) as PolicyConfig<TState>,
        prePaintDescriptors: Object.freeze([...prePaintDescriptors]) as readonly PrePaintDescriptor[],
        storageKey,
        broadcastActions: new Set<string>(broadcastActions),
    });

    return policy;
}
