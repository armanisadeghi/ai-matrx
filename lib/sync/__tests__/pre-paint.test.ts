/**
 * pre-paint.test.ts — declarative pre-paint script correctness.
 *
 * Requires jsdom (Phase 1 D1.1 flips jest.config.js.ts). Under node this
 * file's test suite is skipped via the environment guard so the rest of the
 * sync tests still run.
 */

import { __internal } from "../components/SyncBootScript";
import { definePolicy } from "../policies/define";
import { themePolicy } from "@/styles/themes/themeSlice";

const { buildPrePaintScript } = __internal;

const hasDom = typeof document !== "undefined" && typeof window !== "undefined";
const describeIfDom = hasDom ? describe : describe.skip;

describeIfDom("buildPrePaintScript (jsdom)", () => {
    function makeThemePolicy() {
        return definePolicy<{ mode: "light" | "dark" }>({
            sliceName: "theme",
            preset: "boot-critical",
            version: 1,
            broadcast: { actions: ["theme/setMode"] },
            prePaint: [
                {
                    kind: "classToggle",
                    target: "html",
                    className: "dark",
                    fromKey: "mode",
                    whenEquals: "dark",
                    systemFallback: {
                        mediaQuery: "(prefers-color-scheme: dark)",
                        applyWhenMatches: true,
                    },
                },
                {
                    kind: "attribute",
                    target: "html",
                    attribute: "data-theme",
                    fromKey: "mode",
                    allowed: ["light", "dark"],
                    default: "dark",
                    systemFallback: {
                        mediaQuery: "(prefers-color-scheme: dark)",
                        applyWhenMatches: true,
                        whenMatchesValue: "dark",
                    },
                },
            ],
        });
    }

    function runScript(script: string) {
        // eslint-disable-next-line no-new-func
        new Function(script)();
    }

    function resetDom() {
        document.documentElement.className = "";
        document.documentElement.removeAttribute("data-theme");
    }

    function stubMatchMedia(matches: boolean) {
        (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (_q: string) =>
            ({
                matches,
                media: _q,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false,
            }) as unknown as MediaQueryList;
    }

    afterEach(() => {
        resetDom();
        window.localStorage.clear();
    });

    it("applies stored value (dark)", () => {
        window.localStorage.setItem(
            "matrx:theme",
            JSON.stringify({ version: 1, identityKey: "i", body: { mode: "dark" } }),
        );
        const script = buildPrePaintScript([makeThemePolicy()]);
        runScript(script);
        expect(document.documentElement.classList.contains("dark")).toBe(true);
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("applies stored value (light)", () => {
        window.localStorage.setItem(
            "matrx:theme",
            JSON.stringify({ version: 1, identityKey: "i", body: { mode: "light" } }),
        );
        const script = buildPrePaintScript([makeThemePolicy()]);
        runScript(script);
        expect(document.documentElement.classList.contains("dark")).toBe(false);
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("empty storage + systemFallback matches → applies dark", () => {
        stubMatchMedia(true);
        const script = buildPrePaintScript([makeThemePolicy()]);
        runScript(script);
        expect(document.documentElement.classList.contains("dark")).toBe(true);
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("empty storage + systemFallback does not match → applies default", () => {
        stubMatchMedia(false);
        const script = buildPrePaintScript([makeThemePolicy()]);
        runScript(script);
        expect(document.documentElement.classList.contains("dark")).toBe(false);
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark"); // default
    });

    it("malformed JSON falls through to fallback", () => {
        window.localStorage.setItem("matrx:theme", "{bad json");
        stubMatchMedia(true);
        const script = buildPrePaintScript([makeThemePolicy()]);
        runScript(script);
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("is idempotent — re-running produces same DOM state", () => {
        window.localStorage.setItem(
            "matrx:theme",
            JSON.stringify({ version: 1, identityKey: "i", body: { mode: "light" } }),
        );
        const script = buildPrePaintScript([makeThemePolicy()]);
        runScript(script);
        const first = document.documentElement.outerHTML;
        runScript(script);
        expect(document.documentElement.outerHTML).toBe(first);
    });

    it.each([
        [true, "dark"],
        [false, "light"],
    ])("resolves stored system to %s in the inline pre-paint script", (prefersDark, expected) => {
        window.localStorage.setItem(
            "matrx:theme",
            JSON.stringify({ version: 1, identityKey: "i", body: { mode: "system" } }),
        );
        stubMatchMedia(prefersDark);
        runScript(buildPrePaintScript([themePolicy]));

        expect(document.documentElement.classList.contains("dark")).toBe(prefersDark);
        expect(document.documentElement.getAttribute("data-theme")).toBe(expected);
    });

    it("returns empty string when no boot-critical policies declare prePaint", () => {
        const script = buildPrePaintScript([]);
        expect(script).toBe("");
    });
});
