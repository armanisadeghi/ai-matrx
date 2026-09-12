/**
 * The gate and the ceilings, decided from what the settings resolver actually
 * returns (DD-123 S7).
 *
 * THE ROWS BELOW ARE THE LIVE ONES. `custom.*` was seeded by
 * `migrations/dd123_kind_sandbox_gate_and_ceilings_knobs.sql` on 2026-09-12 and
 * read back from the database the same minute:
 *
 *   sandbox_org_components            false   platform-locked
 *   sandbox_frame_height_px           4000    platform-locked
 *   sandbox_expanded_frame_height_px  20000   platform-locked
 *   sandbox_message_bytes             65536   platform-locked
 *
 * and `platform.knob_resolve('custom', key, <a normal organization>)` answered
 * `false / 4000 / 20000 / 65536` for exactly those keys. So the OFF case here
 * is the shipped configuration, not an invention; the ON cases are the same
 * rows with the value the rollout will set.
 */

import type { ScopedKnob } from "@/lib/scoped-config/types";

import { resolveKindSandboxSettings } from "../useKindSandboxKnob";

/** A `knob_index` row, with only the fields this decision reads set for real. */
function row(key: string, effective: unknown): ScopedKnob {
    return {
        feature: "custom",
        key,
        full_key: `custom.${key}`,
        label: key,
        description: "",
        value_type: typeof effective === "boolean" ? "boolean" : "integer",
        unit: null,
        allowed_values: null,
        min_value: null,
        max_value: null,
        basis: null,
        set_by: "agent",
        review_due: "2026-10-27",
        overridable_by: [],
        override_direction: "any",
        bound_value: null,
        platform_locked: true,
        org_locked_kinds: [],
        user_override_locked: false,
        platform_default: effective,
        shipped_default: effective,
        org_override: null,
        user_override: null,
        effective_value: effective,
        origin: "platform_default",
        origin_scope_id: null,
        origin_precedence: null,
        is_overridden: false,
        out_of_range: false,
        ui: {},
        taxonomy: null,
        propagation: "next_load",
        scope_chain: [],
        locked: null,
        write_rung: null,
        can_write: false,
        can_write_reason: "platform_locked",
        secret: null,
    } as ScopedKnob;
}

const LIVE_OFF: ScopedKnob[] = [
    row("sandbox_org_components", false),
    row("sandbox_frame_height_px", 4000),
    row("sandbox_expanded_frame_height_px", 20000),
    row("sandbox_message_bytes", 65536),
];

const liveOn = (): ScopedKnob[] => [
    row("sandbox_org_components", true),
    row("sandbox_frame_height_px", 4000),
    row("sandbox_expanded_frame_height_px", 20000),
    row("sandbox_message_bytes", 65536),
];

describe("the shipped configuration", () => {
    it("is OFF, with nothing to enforce and nothing to complain about", () => {
        expect(resolveKindSandboxSettings(LIVE_OFF)).toEqual({
            enabled: false,
            ceilings: null,
            refusal: null,
        });
    });

    it("turns on with the ceilings the register holds — no constant from the code", () => {
        expect(resolveKindSandboxSettings(liveOn())).toEqual({
            enabled: true,
            ceilings: {
                frameHeightPx: 4000,
                expandedFrameHeightPx: 20000,
                messageBytes: 65536,
            },
            refusal: null,
        });
    });

    it("follows the register when an admin moves a ceiling", () => {
        const rows = liveOn().map((knob) =>
            knob.key === "sandbox_frame_height_px"
                ? row("sandbox_frame_height_px", 2500)
                : knob,
        );
        expect(resolveKindSandboxSettings(rows).ceilings?.frameHeightPx).toBe(2500);
    });
});

describe("what happens when the settings cannot be trusted", () => {
    it("stays off and names the missing gate, with the remedy", () => {
        const settings = resolveKindSandboxSettings([]);
        expect(settings.enabled).toBe(false);
        expect(settings.refusal).toContain("custom.sandbox_org_components");
        expect(settings.refusal).toContain("dd123_kind_sandbox_gate_and_ceilings_knobs.sql");
    });

    it("refuses to frame anything when a ceiling is missing, and says which", () => {
        const rows = liveOn().filter(
            (knob) => knob.key !== "sandbox_expanded_frame_height_px",
        );
        const settings = resolveKindSandboxSettings(rows);
        expect(settings.enabled).toBe(false);
        expect(settings.ceilings).toBeNull();
        expect(settings.refusal).toContain("custom.sandbox_expanded_frame_height_px");
    });

    it("refuses a ceiling that is not a usable number", () => {
        const rows = liveOn().map((knob) =>
            knob.key === "sandbox_message_bytes"
                ? row("sandbox_message_bytes", "plenty")
                : knob,
        );
        const settings = resolveKindSandboxSettings(rows);
        expect(settings.enabled).toBe(false);
        expect(settings.refusal).toContain('"plenty"');
    });

    it("refuses an expanded ceiling BELOW the unexpanded one — expanding would show less", () => {
        const rows = liveOn().map((knob) =>
            knob.key === "sandbox_expanded_frame_height_px"
                ? row("sandbox_expanded_frame_height_px", 1200)
                : knob,
        );
        const settings = resolveKindSandboxSettings(rows);
        expect(settings.enabled).toBe(false);
        expect(settings.refusal).toContain("show LESS of it");
    });

    it("never invents a value: a key the register reports as missing is missing", () => {
        const rows = liveOn().map((knob) =>
            knob.key === "sandbox_frame_height_px"
                ? { ...row("sandbox_frame_height_px", null), origin: "missing" as const }
                : knob,
        );
        expect(resolveKindSandboxSettings(rows).enabled).toBe(false);
    });
});
