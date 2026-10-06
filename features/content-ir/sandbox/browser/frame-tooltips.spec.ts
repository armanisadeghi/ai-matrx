/**
 * TOOLTIPS INSIDE THE FRAME LAND AT THEIR TRIGGER (2026-10-06).
 *
 * The bug this guards: in an organization whose components render in the
 * sandbox frame, every tap-button tooltip (the copy bar, `KindHeaderBar`'s
 * buttons) rendered as a full-width strip at the BOTTOM of the frame instead
 * of beside the button hovered — "tooltips show up in random parts of the
 * page". The design-system tooltip takes `position: fixed` from the package
 * stylesheet, and the frame's stylesheet did not load it, so the element fell
 * back to `position: static` and flowed to the end of `<body>` (and grew the
 * frame by its own height on every hover). Radix tooltips were unaffected
 * because Radix sets `position: fixed` inline. Fixed by loading the root
 * layout's whole stylesheet stack in `runtime/sandbox.css`.
 *
 * WHY A FIXED BODY AND NOT A LIVE ONE. The boundary spec proves the frame
 * against live organization bodies; this proves a POSITIONING contract, so it
 * needs a body that is guaranteed to carry every tooltip family a Shape can
 * use — a Radix `Tooltip`, `CopyButtons` rows and a `KindHeaderBar` — and to
 * be taller than the window, so the host has to scroll the frame's top out of
 * view before the deep triggers are hovered. A live body can be edited out
 * from under the gate; this one cannot.
 *
 * RED → GREEN: with `public/kind-sandbox.css` built from the pre-fix
 * `sandbox.css` (globals.css only) this fails on the copy-bar tooltips; with
 * the current stylesheet it passes. Run: `pnpm test:kind-sandbox:browser`.
 */
import { expect, test, type Frame, type Page } from "@playwright/test";
import { defaultComponentEntries } from "@ai-matrx/code-runtime/scope";

import { SANDBOX_PROTOCOL_VERSION } from "../protocol";
import { transformKindComponentBody } from "../transform/transform-kind-body";

const WITNESS = "/__kind-sandbox-parity.html";
const ROWS = 40;
/** How far a tooltip may sit from its trigger and still be "at" it. */
const MAX_GAP_PX = 16;
/** The width the host allots the component — the only part of the frame the reader sees. */
const COLUMN_PX = 720;

const BODY = `
import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { KindHeaderBar } from "@/components/kind-kit/KindHeaderBar";

export default function TooltipProbe({ data }) {
  const rows = Array.from({ length: ${ROWS} }, (_, i) => i);
  return (
    <TooltipProvider delayDuration={0}>
      <div className="p-4 space-y-3">
        <KindHeaderBar
          title="Source ranking probe"
          subtitle="Every tooltip family a Shape can use"
          size="sm"
          copy={{ label: "Source ranking probe", human: () => "probe", agent: () => ({ kind: "probe", data }) }}
        />
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <span data-probe-edge="" className="rounded bg-muted px-2 py-1 text-xs">Tier</span>
            </TooltipTrigger>
            <TooltipContent side="top">Authority tier: high, three independent sources agree</TooltipContent>
          </Tooltip>
        </div>
        {rows.map((i) => (
          <div key={i} data-probe-row={i} className="flex items-center gap-3 rounded border p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span data-probe-chip={i} className="rounded bg-muted px-2 py-1 text-xs">Scrape {80 - i}</span>
              </TooltipTrigger>
              <TooltipContent side="top">Scrape: {80 - i} / 100</TooltipContent>
            </Tooltip>
            <span className="flex-1 text-sm">Source {i}</span>
            <CopyButtons
              label={"Source " + i}
              size="xs"
              human={() => "Source " + i}
              agent={() => ({ kind: "probe_row", data: { i } })}
            />
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
`;

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Mount the probe body in a real `/kind-sandbox` frame below a tall host header. */
async function mountProbe(page: Page): Promise<Frame> {
    const { payload, error } = transformKindComponentBody(BODY, defaultComponentEntries());
    expect(payload, `the probe body did not transform: ${error}`).toBeTruthy();

    await page.goto(WITNESS, { waitUntil: "load" });
    await page.waitForFunction(() => (window as never as { __READY__?: boolean }).__READY__ === true);

    await page.evaluate(
        ({ payload: body, version, COLUMN }) => {
            const host = document.getElementById("cases") as HTMLElement;
            host.innerHTML = "";
            // Host content ABOVE the frame, so the frame starts below the fold
            // and scrolling to a deep row pushes the frame's top off-screen.
            const spacer = document.createElement("div");
            spacer.style.height = "600px";
            host.appendChild(spacer);
            const clip = document.createElement("div");
            clip.className = "clip";
            clip.style.width = COLUMN + "px";
            // Host page to the LEFT of the frame too, so a pointer can leave
            // the frame sideways onto the host.
            clip.style.marginLeft = "300px";
            host.appendChild(clip);
            const tail = document.createElement("div");
            tail.style.height = "1200px";
            host.appendChild(tail);

            const frame = document.createElement("iframe");
            frame.setAttribute("sandbox", "allow-scripts");
            frame.src = "/kind-sandbox";
            frame.title = "tooltip probe";
            frame.style.height = "320px";
            frame.style.width = document.documentElement.clientWidth + "px";
            clip.appendChild(frame);

            const w = window as never as {
                __PROBE__: { ready: boolean; errors: string[]; height: number };
                rootTokens: () => Record<string, string>;
            };
            w.__PROBE__ = { ready: false, errors: [], height: 0 };
            frame.addEventListener("load", () => {
                const channel = new MessageChannel();
                channel.port1.onmessage = (event: MessageEvent) => {
                    const msg = (event.data ?? {}) as { type?: string; height?: number; message?: string };
                    if (msg.type === "matrx:sandbox:ready") w.__PROBE__.ready = true;
                    if (msg.type === "matrx:sandbox:error") w.__PROBE__.errors.push(String(msg.message));
                    if (msg.type === "matrx:sandbox:size" && typeof msg.height === "number") {
                        w.__PROBE__.height = msg.height;
                        frame.style.height = msg.height + "px";
                    }
                };
                channel.port1.start();
                frame.contentWindow?.postMessage(
                    {
                        type: "matrx:sandbox:init",
                        protocolVersion: version,
                        instanceId: "tooltip-probe",
                        kind: "tooltip_probe",
                        body,
                        propsTransform: null,
                        props: { data: { probe: true }, kind: "tooltip_probe", config: {}, uiOptions: {} },
                        themeTokens: w.rootTokens(),
                        colorScheme: "light",
                        readerViewportWidth: document.documentElement.clientWidth,
                        contentWidth: COLUMN,
                    },
                    "*",
                    [channel.port2],
                );
            });
        },
        { payload, version: SANDBOX_PROTOCOL_VERSION, COLUMN: COLUMN_PX },
    );

    await page.waitForFunction(
        () => {
            const p = (window as never as { __PROBE__: { ready: boolean; height: number } }).__PROBE__;
            return p.ready && p.height > 0;
        },
        undefined,
        { timeout: 30_000 },
    );
    const frame = page.frames().find((f) => f.url().includes("/kind-sandbox"));
    expect(frame, "no /kind-sandbox frame attached").toBeTruthy();
    await (frame as Frame).locator(`[data-probe-row="${ROWS - 1}"]`).waitFor();
    // Let the size report settle.
    await page.waitForTimeout(500);
    const errors = await page.evaluate(
        () => (window as never as { __PROBE__: { errors: string[] } }).__PROBE__.errors,
    );
    expect(errors, "the framed probe reported errors").toEqual([]);
    return frame as Frame;
}

/** The smallest distance between two rects (0 when they touch or overlap). */
function gap(a: Rect, b: Rect): number {
    const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
    const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
    return Math.hypot(dx, dy);
}

/**
 * Hover `selector` inside the frame (scrolled into view by the HOST, as a
 * reader would), and return the trigger and the open tooltip in the frame's
 * own coordinates.
 */
async function hoverAndMeasure(
    page: Page,
    frame: Frame,
    selector: string,
): Promise<{ trigger: Rect; tooltip: Rect | null; position: string; frameTop: number }> {
    // Close whatever is open, in a spot outside the frame.
    await page.mouse.move(2, 2);
    await page.waitForTimeout(250);

    const trigger = frame.locator(selector).first();
    await trigger.scrollIntoViewIfNeeded();
    const box = await trigger.boundingBox();
    expect(box, `${selector} has no box`).toBeTruthy();
    // A hand moves through points, not by teleport: Radix opens on the
    // trigger's SECOND move once it has seen the pointer arrive.
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 8 });

    // Both families mark the open bubble `role="tooltip"`. Radix also renders
    // a visually-hidden copy for screen readers, which has no area, and the
    // title takeover keeps ONE shared surface in the DOM, `visibility: hidden`
    // while closed — so "open" is area AND visibility, never presence.
    await frame
        .waitForFunction(
            () =>
                Array.from(document.querySelectorAll('[role="tooltip"]')).some((el) => {
                    const r = el.getBoundingClientRect();
                    return (
                        r.width > 2 &&
                        r.height > 2 &&
                        getComputedStyle(el).visibility === "visible"
                    );
                }),
            undefined,
            { timeout: 5_000 },
        )
        .catch(() => undefined);
    await page.waitForTimeout(250);

    const frameBox = await (await frame.frameElement()).boundingBox();
    return frame.evaluate(
        ({ sel, frameTop }) => {
            const t = (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
            const bubble = Array.from(document.querySelectorAll('[role="tooltip"]'))
                .map((el) => el as HTMLElement)
                .find((el) => {
                    const r = el.getBoundingClientRect();
                    return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility === "visible";
                });
            // The positioned box is the bubble itself (tap-target) or Radix's
            // popper wrapper around it.
            const positioned =
                (bubble?.closest("[data-radix-popper-content-wrapper]") as HTMLElement | null) ?? bubble;
            const r = bubble?.getBoundingClientRect();
            return {
                trigger: { x: t.x, y: t.y, width: t.width, height: t.height },
                tooltip: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
                position: positioned ? getComputedStyle(positioned).position : "none",
                frameTop,
            };
        },
        { sel: selector, frameTop: frameBox?.y ?? 0 },
    );
}

test.describe("tooltips inside the Shape sandbox frame", () => {
    test("every tooltip family lands at its trigger, with the frame taller than the window and its top scrolled away", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1400, height: 800 });
        const frame = await mountProbe(page);

        const frameHeight = await page.evaluate(
            () => (window as never as { __PROBE__: { height: number } }).__PROBE__.height,
        );
        expect(
            frameHeight,
            "the probe frame is not taller than the window — the scrolled case is not being tested",
        ).toBeGreaterThan(1200);

        const deep = Math.floor(ROWS * 0.75);
        const cases: Array<{ name: string; selector: string; expectScrolledFrame: boolean }> = [
            { name: "KindHeaderBar copy button", selector: '[aria-label^="Copy, transform or export Source ranking probe"]', expectScrolledFrame: false },
            { name: "Radix tooltip, right edge of the column", selector: "[data-probe-edge]", expectScrolledFrame: false },
            { name: "Radix tooltip, first row", selector: '[data-probe-chip="0"]', expectScrolledFrame: false },
            { name: "Radix tooltip, deep row", selector: `[data-probe-chip="${deep}"]`, expectScrolledFrame: true },
            { name: "CopyButtons, first row", selector: '[aria-label^="Copy, transform or export Source 0"]', expectScrolledFrame: false },
            { name: "CopyButtons, deep row", selector: `[aria-label^="Copy, transform or export Source ${deep}"]`, expectScrolledFrame: true },
            { name: "CopyButtons, last row", selector: `[aria-label^="Copy, transform or export Source ${ROWS - 1}"]`, expectScrolledFrame: true },
        ];

        const report: string[] = [];
        const failures: string[] = [];
        for (const c of cases) {
            const m = await hoverAndMeasure(page, frame, c.selector);
            const distance = m.tooltip ? gap(m.trigger, m.tooltip) : Infinity;
            const line =
                `${c.name}: frameTop=${Math.round(m.frameTop)} trigger=(${Math.round(m.trigger.x)},${Math.round(m.trigger.y)} ${Math.round(m.trigger.width)}x${Math.round(m.trigger.height)}) ` +
                (m.tooltip
                    ? `tooltip=(${Math.round(m.tooltip.x)},${Math.round(m.tooltip.y)} ${Math.round(m.tooltip.width)}x${Math.round(m.tooltip.height)}) position=${m.position} gap=${distance.toFixed(1)}px`
                    : "tooltip=NONE");
            report.push(line);
            if (c.expectScrolledFrame && m.frameTop >= 0) {
                failures.push(`${c.name}: the host never scrolled the frame's top off-screen (frameTop=${m.frameTop})`);
            }
            if (!m.tooltip) {
                failures.push(`${c.name}: no tooltip opened`);
                continue;
            }
            if (m.position !== "fixed" && m.position !== "absolute") {
                failures.push(`${c.name}: tooltip is position:${m.position} — it flows into the page instead of floating at its trigger`);
            }
            // THE CLIP: the frame is as wide as the reader's window, but the
            // host shows only the first COLUMN_PX of it. A tooltip past that
            // edge is cut off where the reader cannot see it.
            const tipRight = m.tooltip.x + m.tooltip.width;
            if (m.tooltip.x < 0 || tipRight > COLUMN_PX) {
                failures.push(
                    `${c.name}: tooltip spans x ${Math.round(m.tooltip.x)}..${Math.round(tipRight)}, past the visible column 0..${COLUMN_PX}`,
                );
            }
            if (distance > MAX_GAP_PX) {
                failures.push(`${c.name}: tooltip is ${distance.toFixed(0)}px from its trigger (max ${MAX_GAP_PX})`);
            }
        }
        // eslint-disable-next-line no-console
        console.log("FRAMED TOOLTIPS\n  " + report.join("\n  "));
        expect(failures, "tooltips inside the frame did not land at their triggers").toEqual([]);
    });

    test("a tooltip closes when the pointer leaves the frame in one motion", async ({ page }) => {
        await page.setViewportSize({ width: 1400, height: 800 });
        const frame = await mountProbe(page);
        const frameBox = (await (await frame.frameElement()).boundingBox())!;

        const chip = frame.locator('[data-probe-chip="0"]');
        await chip.scrollIntoViewIfNeeded();
        const box = (await chip.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
        await expect(chip, "the Radix tooltip never opened on hover").not.toHaveAttribute(
            "data-state",
            "closed",
        );

        // One flick straight off the chip, out of the frame's left edge onto
        // the host, then wander the host as a reader does. The frame sees the
        // leave and NO later move — every one of those lands on the host.
        const frameEdgeGap = box.x - frameBox.x;
        await page.mouse.move(frameBox.x - 150, box.y + box.height / 2, { steps: 2 });
        await page.mouse.move(frameBox.x - 200, box.y + 300, { steps: 10 });
        await page.waitForTimeout(600);

        const open = await frame.evaluate(() =>
            Array.from(document.querySelectorAll('[role="tooltip"]'))
                .filter((el) => {
                    const r = el.getBoundingClientRect();
                    return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility === "visible";
                })
                .map((el) => (el.textContent ?? "").trim()),
        );
        // eslint-disable-next-line no-console
        console.log(
            `FLICK OFF THE FRAME: chip ${Math.round(frameEdgeGap)}px from the frame edge; still open after: ${JSON.stringify(open)}`,
        );
        expect(
            open,
            "a tooltip stayed open after the pointer left the frame — the frame never heard the pointer was gone",
        ).toEqual([]);
        await expect(chip).toHaveAttribute("data-state", "closed");
    });
});
