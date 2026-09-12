/**
 * S5 — a resource the frame's CSP refuses is SAID OUT LOUD.
 *
 * WHY THIS TEST EXISTS. The frame's `img-src` is `data: blob:` plus the
 * platform image door (chair ruling 2). Nine live organization-authored bodies
 * render an `<img src>` whose URL arrives in the instance data, so the moment
 * the knob goes on, a body pointed at a remote image shows a broken-image box:
 * the browser refuses the request, the component is never told, the reader
 * sees a gap, and the author — who is the only person who can fix it — never
 * hears about it. A silent break is the one failure mode this whole sandbox
 * was built to remove.
 *
 * The frame cannot report a CSP violation the usual way: `report-uri` and the
 * Reporting API are network calls and `connect-src` is `'none'`. It does get
 * the DOM event, so the bridge relays it as an ordinary sandbox error, which
 * the host already routes to `captureError` AND to
 * `content_ir.kind_component_incident` — the queue the component-authoring
 * agent reads.
 *
 * PROVEN RED FIRST: with the listener removed from `frame-bridge.ts`, the
 * frame sends nothing at all and both assertions below fail.
 */
import { MessageChannel as NodeMessageChannel } from "node:worker_threads";

import { installTrackedFrameBridge, recordingMount } from "./sandbox-harness";
import { SANDBOX_PROTOCOL_VERSION } from "../protocol";

describe("a resource the frame's CSP refuses", () => {
    let uninstall: (() => void) | null = null;
    const openChannels: NodeMessageChannel[] = [];
    afterEach(() => {
        uninstall?.();
        uninstall = null;
        // Close every port: an open MessagePort keeps the jest worker alive
        // and leaks this file's state into whatever runs next.
        for (const channel of openChannels) {
            channel.port1.close();
            channel.port2.close();
        }
        openChannels.length = 0;
        document.body.innerHTML = "";
    });

    function startFrame(): { fromFrame: unknown[] } {
        document.body.innerHTML = '<main id="root"></main>';
        const { mount } = recordingMount();
        uninstall = installTrackedFrameBridge(mount);
        const channel = new NodeMessageChannel();
        openChannels.push(channel);
        const fromFrame: unknown[] = [];
        (channel.port1 as unknown as MessagePort).onmessage = (event) => {
            fromFrame.push((event as MessageEvent).data);
        };
        (channel.port1 as unknown as { start(): void }).start();
        window.dispatchEvent(
            new MessageEvent("message", {
                data: {
                    type: "matrx:sandbox:init",
                    protocolVersion: SANDBOX_PROTOCOL_VERSION,
                    instanceId: "blocked-1",
                    kind: "employee_card",
                    body: {
                        transformed: "return function C(){ return null; };",
                        importBindings: [],
                        declaredTopLevel: [],
                        allowedImports: [],
                    },
                    props: { data: {}, kind: "employee_card", config: {}, uiOptions: {} },
                    themeTokens: {},
                    colorScheme: "light",
                },
                origin: window.location.origin,
                ports: [channel.port2 as unknown as MessagePort],
            }),
        );
        return { fromFrame };
    }

    function violate(blockedURI: string, effectiveDirective: string): void {
        const event = new Event("securitypolicyviolation") as Event &
            Record<string, unknown>;
        event.blockedURI = blockedURI;
        event.effectiveDirective = effectiveDirective;
        document.dispatchEvent(event);
    }

    async function drain(): Promise<void> {
        await new Promise((r) => setTimeout(r, 20));
    }

    it("tells the author which image was refused, and says nothing was shown", async () => {
        const { fromFrame } = startFrame();
        violate("https://i.pravatar.cc/150?img=47", "img-src");
        await drain();

        const errors = fromFrame.filter(
            (m) => (m as { type?: string }).type === "matrx:sandbox:error",
        ) as Array<{ message: string; errorType?: string }>;
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain("https://i.pravatar.cc/150?img=47");
        expect(errors[0].message).toContain("nothing was displayed");
        // Its own type, so the incident queue — one open row per
        // (kind, error_type, platform, role) — does not fold "cannot show its
        // pictures" into "crashed".
        expect(errors[0].errorType).toBe("blocked_resource");
    });

    it("files one incident for a repeated refusal, not one per image", async () => {
        const { fromFrame } = startFrame();
        violate("https://i.pravatar.cc/150?img=47", "img-src");
        violate("https://i.pravatar.cc/150?img=47", "img-src");
        violate("https://i.pravatar.cc/150?img=47", "img-src");
        await drain();
        expect(
            fromFrame.filter(
                (m) => (m as { type?: string }).type === "matrx:sandbox:error",
            ),
        ).toHaveLength(1);
    });

    it("names a non-image refusal with the directive that stopped it", async () => {
        const { fromFrame } = startFrame();
        violate("https://evil.example.com/collect", "connect-src");
        await drain();
        const errors = fromFrame.filter(
            (m) => (m as { type?: string }).type === "matrx:sandbox:error",
        ) as Array<{ message: string }>;
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain("connect-src");
        expect(errors[0].message).toContain("https://evil.example.com/collect");
    });
});
