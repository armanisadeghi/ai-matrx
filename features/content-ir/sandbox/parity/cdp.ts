/**
 * cdp — the smallest headless-Chrome driver that can prove what an IFRAME
 * renders (DD-123 S5).
 *
 * WHY A DRIVER AT ALL, AND WHY THIS ONE.
 * The whole sandbox question is "does the framed render match the unframed
 * one", and that is a picture, not an assertion. The repo has no Playwright /
 * Puppeteer / Cypress (still true 2026-09-12), and the agent browser pane
 * refuses sub-frame document loads (`net::ERR_BLOCKED_BY_CLIENT`), which is
 * exactly the thing under test. So the sweep talks to a locally installed
 * Chrome over the DevTools protocol: navigate, evaluate, screenshot a clip.
 *
 * It deliberately does NOT try to be a browser library. Four methods, one
 * socket, and a named failure when Chrome is not on this machine.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
];

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Browser {
    navigate(url: string): Promise<void>;
    evaluate<T = unknown>(expression: string): Promise<T>;
    /** Screenshot a rectangle of the page, beyond the viewport if need be. */
    shot(file: string, clip?: Rect): Promise<string>;
    close(): Promise<void>;
}

function chromeBinary(): string {
    const fromEnv = process.env.CHROME_PATH;
    if (fromEnv) return fromEnv;
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    const hit = CHROME_CANDIDATES.find((p) => existsSync(p));
    if (!hit) {
        throw new Error(
            "The rendering-parity sweep needs a local Chrome or Chromium and found none. " +
                "Install Google Chrome, or set CHROME_PATH to the executable.",
        );
    }
    return hit;
}

export async function launch(opts: {
    width: number;
    height: number;
}): Promise<Browser> {
    const port = 9400 + Math.floor(Math.random() * 300);
    const profile = `/tmp/kind-sandbox-parity-${port}`;
    const child: ChildProcess = spawn(
        chromeBinary(),
        [
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${profile}`,
            "--headless=new",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--hide-scrollbars=false",
            `--window-size=${opts.width},${opts.height}`,
            "about:blank",
        ],
        { stdio: "ignore" },
    );

    let page: { webSocketDebuggerUrl: string } | undefined;
    for (let i = 0; i < 80 && !page; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/list`);
            const list = (await res.json()) as Array<{
                type: string;
                webSocketDebuggerUrl: string;
            }>;
            page = list.find((t) => t.type === "page");
        } catch {
            /* not up yet */
        }
        if (!page) await sleep(250);
    }
    if (!page) {
        child.kill();
        throw new Error("Chrome did not open a debugging port within 20 seconds.");
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((r) => {
        ws.onopen = () => r();
    });
    let id = 0;
    const pending = new Map<number, (msg: any) => void>();
    ws.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(String(e.data));
        if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)!(msg);
            pending.delete(msg.id);
        }
    };
    const send = (method: string, params: Record<string, unknown> = {}) => {
        const mid = ++id;
        ws.send(JSON.stringify({ id: mid, method, params }));
        return new Promise<any>((r) => pending.set(mid, r));
    };

    await send("Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
    });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
        width: opts.width,
        height: opts.height,
        deviceScaleFactor: 1,
        mobile: false,
    });

    return {
        async navigate(url: string) {
            await send("Page.navigate", { url });
        },
        async evaluate<T>(expression: string): Promise<T> {
            const res = await send("Runtime.evaluate", {
                expression,
                awaitPromise: true,
                returnByValue: true,
            });
            if (res.result?.exceptionDetails) {
                throw new Error(
                    `Evaluating in the parity page failed: ${
                        res.result.exceptionDetails.exception?.description ??
                        res.result.exceptionDetails.text
                    }`,
                );
            }
            return res.result?.result?.value as T;
        },
        async shot(file: string, clip?: Rect) {
            const res = await send("Page.captureScreenshot", {
                format: "png",
                captureBeyondViewport: true,
                ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
            });
            if (!res.result?.data) {
                throw new Error("Chrome returned no screenshot bytes.");
            }
            mkdirSync(file.replace(/\/[^/]+$/, ""), { recursive: true });
            writeFileSync(file, Buffer.from(res.result.data, "base64"));
            return file;
        },
        async close() {
            try {
                ws.close();
            } catch {
                /* already gone */
            }
            child.kill();
        },
    };
}
