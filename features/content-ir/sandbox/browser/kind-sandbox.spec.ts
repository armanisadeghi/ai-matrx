/**
 * THE REAL-BROWSER PROOF of the Shape sandbox boundary (DD-123 S6).
 *
 * Everything in `sandbox/__tests__` runs in jsdom, which has no CSP, no origin
 * isolation and no renderer — so the three claims the whole design rests on
 * cannot be made there at all:
 *
 *   1. a component inside the frame reaches NOTHING on the network;
 *   2. the browser refuses each attempt by NAME, as a CSP violation;
 *   3. the frame's origin is opaque, so `window.top`, `parent.document`,
 *      `document.cookie` and `localStorage` all throw `SecurityError`.
 *
 * This spec makes them in a real Chromium, against the real `/kind-sandbox`
 * response with its real header, with a LIVE organization-authored component
 * rendering live `content_ir.kind_instance` data inside the frame.
 *
 * THE RED CONTROL IS PERMANENT, not a note. Every refusal assertion has a twin
 * that runs the SAME probe function in the page — the gate-OFF configuration,
 * where the same component body is mounted straight into the document — and
 * asserts it is NOT refused there. A green run therefore states a difference
 * the boundary makes, never "the network happened to be down".
 *
 * WHY IT IS NOT IN THE DEFAULT TEST CHAIN. `pnpm test` runs on every change and
 * is expected to be seconds. This needs a running app, a browser binary, a
 * Supabase read of the live corpus, and about half a minute of real page work —
 * cost that belongs on the sandbox's own gate, not on every commit.
 *
 *   pnpm test:kind-sandbox:browser
 */
import { expect, test, type Frame, type Request } from "@playwright/test";

import { isolationExpression, probeExpression, type ProbeReport } from "./probes";

/** Somewhere the frame is not allowed to reach. Never actually contacted. */
const REMOTE = "https://sandbox-probe.example";

const WITNESS = "/__kind-sandbox-parity.html";

interface ParityRecord {
    componentKey: string;
    ready?: boolean;
    offErrors: string[];
    onErrors: string[];
    heights: Array<{ height: number; contentHeight?: number; capped: boolean }>;
}

test.describe("the Shape sandbox boundary, in a real browser", () => {
    test("a live component renders in the frame, reaches nothing, and is refused by name", async ({
        page,
    }) => {
        // Every request the page or any of its frames makes, with the frame it
        // came from — this is what "zero outbound" is measured against.
        const requests: Array<{ url: string; fromSandbox: boolean }> = [];
        const record = (request: Request) => {
            const frame = request.frame();
            requests.push({
                url: request.url(),
                fromSandbox: Boolean(frame && frame.url().includes("/kind-sandbox")),
            });
        };
        page.on("request", record);

        await page.goto(WITNESS, { waitUntil: "load" });
        await page.waitForFunction(() => (window as never as { __READY__?: boolean }).__READY__ === true);

        // ── the frame is real, and it is rendering a live instance ─────────
        const frame = await page.waitForFunction(
            () => document.querySelectorAll('iframe[sandbox="allow-scripts"]').length,
        ).then(async () => {
            await page.waitForTimeout(2500);
            const found = page
                .frames()
                .find((f: Frame) => f.url().includes("/kind-sandbox"));
            expect(
                found,
                "no /kind-sandbox frame attached — the witness did not mount",
            ).toBeTruthy();
            return found as Frame;
        });

        const parity = await page.evaluate(
            () => (window as never as { __PARITY__: Record<string, ParityRecord> }).__PARITY__,
        );
        const first = Object.values(parity)[0];
        expect(first.ready, "the frame never answered ready over the port").toBe(true);
        expect(
            first.heights.length,
            "the frame never reported a height — it did not lay anything out",
        ).toBeGreaterThan(0);
        expect(first.onErrors, "the framed render reported errors").toEqual([]);

        const framedText = await frame.evaluate(() => document.body.innerText.trim());
        expect(
            framedText.length,
            "the frame rendered nothing at all",
        ).toBeGreaterThan(20);

        // ── (d) GATE OFF renders in the page ───────────────────────────────
        const unframedText = await page.evaluate(() =>
            (document.querySelector(".unframed") as HTMLElement | null)?.innerText.trim() ?? "",
        );
        expect(
            unframedText.length,
            "gate OFF rendered nothing in the page — the control is not a control",
        ).toBeGreaterThan(20);
        expect(first.offErrors).toEqual([]);

        // ── the probes, in the frame ───────────────────────────────────────
        const framed = (await frame.evaluate(probeExpression(REMOTE))) as ProbeReport;
        // ── the SAME probes, in the page: the permanent RED control ────────
        const inPage = (await page.evaluate(probeExpression(REMOTE))) as ProbeReport;

        // eslint-disable-next-line no-console
        console.log(
            "FRAMED   " + JSON.stringify(framed.results) +
            "\nFRAMED CSP VIOLATIONS " + JSON.stringify(framed.violations) +
            "\nIN PAGE  " + JSON.stringify(inPage.results) +
            "\nIN PAGE CSP VIOLATIONS " + JSON.stringify(inPage.violations),
        );

        // (b) each attempt refused, by the directive the browser names.
        const directives = framed.violations.map((v) => v.directive);
        expect(directives, "connect-src never refused anything in the frame").toContain(
            "connect-src",
        );
        expect(directives, "img-src never refused the remote image").toContain("img-src");
        // Chromium names the javascript: URL refusal `script-src-elem` (the
        // effective directive `script-src` falls back to). Either spelling is
        // the browser's, not ours — assert on the family, not the wording.
        expect(
            directives.some((d) => d.startsWith("script-src")),
            `script-src never refused the javascript: URL — got ${directives.join(", ")}`,
        ).toBe(true);
        expect(framed.results.fetch).toMatch(/^refused/);
        expect(framed.results.image).toBe("refused");
        expect(framed.results.xhr).toBe("refused");
        expect(framed.results.websocket).toBe("refused");
        expect(framed.javascriptUrlRan, "a javascript: URL RAN inside the frame").toBe(
            false,
        );
        // sendBeacon returns true optimistically; the CSP report and the empty
        // network log below are what actually settle it.
        expect(
            framed.violations.filter((v) => v.blockedURI.includes("probe-beacon")).length,
            "the beacon was not refused",
        ).toBeGreaterThan(0);

        // THE RED CONTROL: none of that happens in the page.
        expect(
            inPage.violations,
            "the PAGE refused something too — then this spec is measuring the environment, not the frame",
        ).toEqual([]);
        expect(
            inPage.javascriptUrlRan,
            "the javascript: URL did not run in the page either — the probe itself is broken",
        ).toBe(true);

        // (a) zero outbound from the frame.
        const escaped = requests.filter(
            (r) => r.fromSandbox && !r.url.startsWith(page.url().split("/__kind")[0]),
        );
        expect(
            escaped.map((r) => r.url),
            "a request left the sandbox frame",
        ).toEqual([]);
        expect(
            requests.filter((r) => r.url.includes("sandbox-probe.example")).length,
            "a probe request actually reached the network from somewhere on this page",
        ).toBe(0);

        page.off("request", record);
    });

    test("the frame's origin is opaque: top, parent, cookies and storage all throw", async ({
        page,
    }) => {
        await page.goto(WITNESS, { waitUntil: "load" });
        await page.waitForFunction(() => (window as never as { __READY__?: boolean }).__READY__ === true);
        await page.waitForTimeout(2500);

        const frame = page.frames().find((f: Frame) => f.url().includes("/kind-sandbox"));
        expect(frame, "no /kind-sandbox frame attached").toBeTruthy();

        const framed = (await frame!.evaluate(isolationExpression())) as Record<
            string,
            string
        >;
        const inPage = (await page.evaluate(isolationExpression())) as Record<
            string,
            string
        >;

        // eslint-disable-next-line no-console
        console.log(
            "FRAMED ISOLATION  " + JSON.stringify(framed) +
            "\nIN PAGE ISOLATION " + JSON.stringify(inPage),
        );

        expect(framed.isSubFrame, "this is not a sub-frame at all").toBe("true");
        expect(framed["window.top"]).toMatch(/SecurityError/);
        expect(framed["parent.document"]).toMatch(/SecurityError/);
        expect(framed["document.cookie"]).toMatch(/SecurityError/);
        expect(framed.localStorage).toMatch(/SecurityError/);
        expect(framed.sessionStorage).toMatch(/SecurityError/);

        /**
         * THE TWO ORIGINS (the S6 correction). `frame-bridge.ts` compares
         * `event.origin` against the origin the document was SERVED from,
         * parsed out of `location.href`. Until S6 the comment beside it said
         * `location.origin` is the string "null" inside a sandboxed frame and
         * that the old code "refused the real host every single time". V-30
         * measured otherwise and this asserts it, so the sentence can never
         * drift back: `self.origin` is the opaque one; `Location.origin`
         * follows the document URL.
         */
        expect(
            framed["self.origin"],
            "self.origin is not opaque — this frame is not sandboxed the way it must be",
        ).toBe("null");
        expect(
            framed["location.origin"],
            'location.origin inside the frame IS "null" after all — the S6 comment correction is wrong and frame-bridge.ts must be re-read',
        ).not.toBe("null");
        expect(framed["url.origin"]).toBe(framed["location.origin"]);
        expect(framed["location.origin"]).toBe(new URL(page.url()).origin);

        // THE RED CONTROL: the page reaches all four without complaint.
        expect(inPage["window.top"]).toBe("allowed");
        expect(inPage["document.cookie"]).toBe("allowed");
        expect(inPage.localStorage).toBe("allowed");
        expect(inPage.sessionStorage).toBe("allowed");
    });
});
