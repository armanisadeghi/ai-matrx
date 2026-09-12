/**
 * apply-prePaint.test.ts — runtime DOM applier for pre-paint descriptors.
 *
 * Complements `pre-paint.test.ts` (which covers the inline <script> body
 * assembly). This suite covers the pure-TS applier invoked by the sync
 * middleware after every state change.
 */

import { applyPrePaintDescriptors } from "../engine/applyPrePaint";
import type { PrePaintDescriptor } from "../types";

describe("applyPrePaintDescriptors", () => {
    beforeEach(() => {
        document.documentElement.className = "";
        document.documentElement.removeAttribute("data-theme");
    });

    it("adds classToggle when state matches whenEquals", () => {
        const d: PrePaintDescriptor = {
            kind: "classToggle",
            target: "html",
            className: "dark",
            fromKey: "mode",
            whenEquals: "dark",
        };
        applyPrePaintDescriptors([d], { mode: "dark" });
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("removes classToggle when state does not match whenEquals", () => {
        document.documentElement.classList.add("dark");
        const d: PrePaintDescriptor = {
            kind: "classToggle",
            target: "html",
            className: "dark",
            fromKey: "mode",
            whenEquals: "dark",
        };
        applyPrePaintDescriptors([d], { mode: "light" });
        expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("sets attribute to allowed value", () => {
        const d: PrePaintDescriptor = {
            kind: "attribute",
            target: "html",
            attribute: "data-theme",
            fromKey: "mode",
            allowed: ["light", "dark"],
            default: "dark",
        };
        applyPrePaintDescriptors([d], { mode: "light" });
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("falls back to default when value not in allowed list", () => {
        const d: PrePaintDescriptor = {
            kind: "attribute",
            target: "html",
            attribute: "data-theme",
            fromKey: "mode",
            allowed: ["light", "dark"],
            default: "dark",
        };
        applyPrePaintDescriptors([d], { mode: "oreo" });
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("applies multiple descriptors in order", () => {
        const descriptors: PrePaintDescriptor[] = [
            {
                kind: "classToggle",
                target: "html",
                className: "dark",
                fromKey: "mode",
                whenEquals: "dark",
            },
            {
                kind: "attribute",
                target: "html",
                attribute: "data-theme",
                fromKey: "mode",
                allowed: ["light", "dark"],
                default: "dark",
            },
        ];
        applyPrePaintDescriptors(descriptors, { mode: "light" });
        expect(document.documentElement.classList.contains("dark")).toBe(false);
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");

        applyPrePaintDescriptors(descriptors, { mode: "dark" });
        expect(document.documentElement.classList.contains("dark")).toBe(true);
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("is a no-op with empty descriptors", () => {
        document.documentElement.classList.add("dark");
        applyPrePaintDescriptors([], { mode: "light" });
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("is a no-op with null data (preserves default/absent state)", () => {
        // classToggle: null data treats the key as undefined (no match) → removes class.
        document.documentElement.classList.add("dark");
        const d: PrePaintDescriptor = {
            kind: "classToggle",
            target: "html",
            className: "dark",
            fromKey: "mode",
            whenEquals: "dark",
        };
        applyPrePaintDescriptors([d], null);
        expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("does not throw when document target is missing", () => {
        // body target on a headless DOM where <body> exists → still fine, just exercising the guard.
        const d: PrePaintDescriptor = {
            kind: "classToggle",
            target: "body",
            className: "foo",
            fromKey: "mode",
            whenEquals: "on",
        };
        expect(() => applyPrePaintDescriptors([d], { mode: "on" })).not.toThrow();
        expect(document.body.classList.contains("foo")).toBe(true);
    });

    it("preserves explicit light choice when OS prefers dark (regression — Phase 5 follow-up)", () => {
        // Pre-fix bug: systemFallback used to override the user's stored
        // value when value !== whenEquals AND OS preferred dark. So
        // picking "light" on a dark-prefer macOS forced .dark back on.
        // Now systemFallback only fires when the stored value is *absent*.
        const original = window.matchMedia;
        Object.defineProperty(window, "matchMedia", {
            value: () => ({ matches: true } as MediaQueryList),
            configurable: true,
            writable: true,
        });
        try {
            document.documentElement.classList.add("dark");
            const d: PrePaintDescriptor = {
                kind: "classToggle",
                target: "html",
                className: "dark",
                fromKey: "mode",
                whenEquals: "dark",
                systemFallback: {
                    mediaQuery: "(prefers-color-scheme: dark)",
                    applyWhenMatches: true,
                },
            };
            applyPrePaintDescriptors([d], { mode: "light" });
            expect(document.documentElement.classList.contains("dark")).toBe(false);
        } finally {
            Object.defineProperty(window, "matchMedia", {
                value: original,
                configurable: true,
                writable: true,
            });
        }
    });

    it("falls back to systemFallback only when stored value is absent", () => {
        const original = window.matchMedia;
        Object.defineProperty(window, "matchMedia", {
            value: () => ({ matches: true } as MediaQueryList),
            configurable: true,
            writable: true,
        });
        try {
            document.documentElement.classList.remove("dark");
            const d: PrePaintDescriptor = {
                kind: "classToggle",
                target: "html",
                className: "dark",
                fromKey: "mode",
                whenEquals: "dark",
                systemFallback: {
                    mediaQuery: "(prefers-color-scheme: dark)",
                    applyWhenMatches: true,
                },
            };
            // No stored mode value → systemFallback applies → OS prefers dark → add .dark
            applyPrePaintDescriptors([d], {});
            expect(document.documentElement.classList.contains("dark")).toBe(true);
        } finally {
            Object.defineProperty(window, "matchMedia", {
                value: original,
                configurable: true,
                writable: true,
            });
        }
    });

    it.each([
        [true, "dark"],
        [false, "light"],
    ])("resolves the stored system preference to %s before paint", (prefersDark, expected) => {
        const original = window.matchMedia;
        Object.defineProperty(window, "matchMedia", {
            value: () => ({ matches: prefersDark } as MediaQueryList),
            configurable: true,
            writable: true,
        });
        try {
            const descriptors: PrePaintDescriptor[] = [
                {
                    kind: "classToggle",
                    target: "html",
                    className: "dark",
                    fromKey: "mode",
                    whenEquals: "dark",
                    systemValue: "system",
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
                    allowed: ["light", "dark", "system"],
                    default: "dark",
                    systemValue: "system",
                    systemFallback: {
                        mediaQuery: "(prefers-color-scheme: dark)",
                        applyWhenMatches: true,
                        whenMatchesValue: "dark",
                        whenDoesNotMatchValue: "light",
                    },
                },
            ];
            applyPrePaintDescriptors(descriptors, { mode: "system" });
            expect(document.documentElement.classList.contains("dark")).toBe(prefersDark);
            expect(document.documentElement.getAttribute("data-theme")).toBe(expected);
        } finally {
            Object.defineProperty(window, "matchMedia", {
                value: original,
                configurable: true,
                writable: true,
            });
        }
    });
});
