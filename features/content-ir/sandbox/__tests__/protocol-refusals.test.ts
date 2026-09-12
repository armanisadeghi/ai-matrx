/**
 * The host↔frame protocol's refusals, asserted on the SHARED validator both
 * sides use (`sandbox/protocol.ts`) — so a passing test here is a statement
 * about the real message path, not about a copy of it.
 *
 * What is deliberately NOT here: the network-refusal proof. A jest test
 * cannot show that an iframe's CSP stopped a `fetch` — only a real browser
 * can, and that proof is in the B-27 report (console + network log with the
 * knob on). A mock of a CSP would be a test proving its own fixture.
 */
import {
    FRAME_MESSAGE_TYPES,
    HOST_MESSAGE_TYPES,
    MAX_INBOUND_BYTES,
    MAX_OUTBOUND_PROPS_BYTES,
    checkFrameMessage,
    checkHostMessage,
    measureBytes,
} from "../protocol";

const INSTANCE = "sandbox-instance-1";

describe("frame → host messages", () => {
    it("accepts every allowlisted type", () => {
        const samples = [
            { type: "matrx:sandbox:ready", instanceId: INSTANCE, runtimeVersion: 1 },
            { type: "matrx:sandbox:size", instanceId: INSTANCE, height: 412 },
            {
                type: "matrx:sandbox:action",
                instanceId: INSTANCE,
                callId: "c1",
                key: "trigger_agent",
                input: { agentId: "a" },
            },
            { type: "matrx:sandbox:resolve", instanceId: INSTANCE, value: { a: 1 } },
            {
                type: "matrx:sandbox:error",
                instanceId: INSTANCE,
                message: "it threw",
            },
        ];
        expect(samples).toHaveLength(FRAME_MESSAGE_TYPES.length);
        for (const sample of samples) {
            expect(checkFrameMessage(sample, INSTANCE, MAX_INBOUND_BYTES).ok).toBe(true);
        }
    });

    it("drops an unknown type, and names what it dropped", () => {
        const checked = checkFrameMessage(
            { type: "matrx:sandbox:exfiltrate", instanceId: INSTANCE },
            INSTANCE,
            MAX_INBOUND_BYTES,
        );
        expect(checked.ok).toBe(false);
        if (checked.ok) return;
        expect(checked.refusal).toContain("matrx:sandbox:exfiltrate");
        expect(checked.refusal).toContain("unknown type");
    });

    it("drops a host-only type arriving from the frame", () => {
        // The frame may never tell the host to init, or answer its own call.
        for (const type of HOST_MESSAGE_TYPES) {
            const checked = checkFrameMessage({ type, instanceId: INSTANCE }, INSTANCE, MAX_INBOUND_BYTES);
            expect(checked.ok).toBe(false);
        }
    });

    it("drops a message addressed to another instance", () => {
        const checked = checkFrameMessage(
            { type: "matrx:sandbox:size", instanceId: "someone-else", height: 10 },
            INSTANCE,
            MAX_INBOUND_BYTES,
        );
        expect(checked.ok).toBe(false);
        if (checked.ok) return;
        expect(checked.refusal).toContain("someone-else");
    });

    it("drops a message over the 64 KB inbound cap", () => {
        const message = {
            type: "matrx:sandbox:resolve",
            instanceId: INSTANCE,
            value: "x".repeat(MAX_INBOUND_BYTES + 1),
        };
        expect(measureBytes(message)).toBeGreaterThan(MAX_INBOUND_BYTES);
        const checked = checkFrameMessage(message, INSTANCE, MAX_INBOUND_BYTES);
        expect(checked.ok).toBe(false);
        if (checked.ok) return;
        expect(checked.refusal).toContain(String(MAX_INBOUND_BYTES));
        expect(checked.refusal).toContain("Nothing was rendered from it");
    });

    it("drops an action with no call id or no key", () => {
        expect(
            checkFrameMessage(
                { type: "matrx:sandbox:action", instanceId: INSTANCE, key: "k" },
                INSTANCE,
                MAX_INBOUND_BYTES,
            ).ok,
        ).toBe(false);
        expect(
            checkFrameMessage(
                { type: "matrx:sandbox:action", instanceId: INSTANCE, callId: "c" },
                INSTANCE,
                MAX_INBOUND_BYTES,
            ).ok,
        ).toBe(false);
    });

    it("drops a non-object, including null and an array", () => {
        for (const raw of [null, undefined, 42, "matrx:sandbox:ready", [1, 2]]) {
            expect(checkFrameMessage(raw, INSTANCE, MAX_INBOUND_BYTES).ok).toBe(false);
        }
    });
});

describe("host → frame messages", () => {
    it("accepts every allowlisted type", () => {
        const samples = [
            {
                type: "matrx:sandbox:init",
                instanceId: INSTANCE,
                protocolVersion: 1,
                kind: "k",
                body: {},
                props: {},
            },
            { type: "matrx:sandbox:props", instanceId: INSTANCE, props: {} },
            { type: "matrx:sandbox:theme", instanceId: INSTANCE, colorScheme: "dark" },
            {
                type: "matrx:sandbox:action-result",
                instanceId: INSTANCE,
                callId: "c1",
                ok: true,
                value: 1,
            },
            { type: "matrx:sandbox:dispose", instanceId: INSTANCE },
        ];
        expect(samples).toHaveLength(HOST_MESSAGE_TYPES.length);
        for (const sample of samples) {
            expect(checkHostMessage(sample, INSTANCE).ok).toBe(true);
        }
    });

    it("drops a frame-only type arriving from the host", () => {
        for (const type of FRAME_MESSAGE_TYPES) {
            expect(checkHostMessage({ type, instanceId: INSTANCE }, INSTANCE).ok).toBe(
                false,
            );
        }
    });

    /**
     * The host direction carries the component body and the instance value, so
     * its ceiling is the 256 KB outbound cap — a 70 KB live body must cross,
     * and 300 KB of props must not.
     */
    it("carries a body larger than the inbound cap, and refuses one over the outbound cap", () => {
        const bigBody = {
            type: "matrx:sandbox:init",
            instanceId: INSTANCE,
            protocolVersion: 1,
            kind: "k",
            body: { transformed: "x".repeat(70_000) },
            props: {},
        };
        expect(measureBytes(bigBody)).toBeGreaterThan(MAX_INBOUND_BYTES);
        expect(checkHostMessage(bigBody, INSTANCE).ok).toBe(true);

        const tooBig = {
            type: "matrx:sandbox:props",
            instanceId: INSTANCE,
            props: { data: "x".repeat(MAX_OUTBOUND_PROPS_BYTES + 1) },
        };
        const checked = checkHostMessage(tooBig, INSTANCE);
        expect(checked.ok).toBe(false);
        if (checked.ok) return;
        expect(checked.refusal).toContain(String(MAX_OUTBOUND_PROPS_BYTES));
    });
});
