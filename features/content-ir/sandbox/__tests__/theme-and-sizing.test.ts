/**
 * S3's two new contracts, asserted on the REAL modules both halves use:
 *
 *  1. THEME PARITY — the host must be able to name every custom property the
 *     page declares on its root element, because those names are what crosses
 *     to the frame. A hand-kept list would be wrong the first time someone
 *     added a token and wrong SILENTLY (the frame would render the package
 *     default), so `collectThemeTokenNames` reads them out of the stylesheets
 *     the page actually loaded — including a rule a theme applier added at
 *     runtime, which is the organization-theme case.
 *
 *  2. SIZING — the frame tells the host what it occupies, and a size message
 *     the host cannot trust must be REFUSED with a sentence rather than
 *     applied. A frame sized from a bad number is a component the reader sees
 *     a slice of, with nothing on screen saying so.
 *
 * What is deliberately NOT here: the proof that a framed component LOOKS like
 * an unframed one, and the proof that a body which grows re-sizes its frame.
 * Neither can be shown by a jest assertion over this code — they are browser
 * facts and they are witnessed, with screenshots and measured heights, in the
 * B-33 report.
 */
import {
    EXPANDED_FRAME_HEIGHT_CEILING_PX,
    FRAME_HEIGHT_CEILING_PX,
    MAX_INBOUND_BYTES,
    checkFrameMessage,
} from "../protocol";
import {
    frameHeightDecision,
    sandboxFrameTitle,
} from "../../react/db-component/KindSandboxFrame";
import {
    collectThemeTokenNames,
    invalidateThemeTokenNames,
    readColorScheme,
} from "../theme-tokens";

const INSTANCE = "sandbox-instance-s3";

function styleSheet(css: string): HTMLStyleElement {
    const element = document.createElement("style");
    element.textContent = css;
    document.head.append(element);
    return element;
}

describe("theme tokens the host sends the frame", () => {
    beforeEach(() => {
        invalidateThemeTokenNames();
        document.head.querySelectorAll("style").forEach((node) => node.remove());
        document.documentElement.className = "";
        document.documentElement.removeAttribute("style");
    });

    it("names every token declared on the root element, light and dark", () => {
        styleSheet(`
            :root { --background: 0 0% 100%; --primary: 221 83% 53%; }
            .dark { --background: 224 71% 4%; }
            .card-title { --not-a-root-token: 1; color: red; }
        `);

        const names = collectThemeTokenNames(document);

        expect(names).toContain("--background");
        expect(names).toContain("--primary");
        // A token declared on some ordinary component class is NOT a root
        // token: sending it would overwrite that component's own value inside
        // the frame with whatever the root happened to resolve.
        expect(names).not.toContain("--not-a-root-token");
    });

    it("sees a token an organization theme wrote at runtime", () => {
        styleSheet(":root { --primary: 221 83% 53%; }");
        expect(collectThemeTokenNames(document)).not.toContain("--org-accent");

        // What an organization theme applier does: one inline custom property
        // on <html>. If the collector missed this, every themed organization
        // would get platform-default colours inside the frame and matching
        // colours outside it — the exact parity failure S3 exists to prevent.
        document.documentElement.style.setProperty("--org-accent", "12 90% 50%");
        invalidateThemeTokenNames();

        expect(collectThemeTokenNames(document)).toContain("--org-accent");
    });

    it("reads light or dark the way the app's own dark variant decides it", () => {
        expect(readColorScheme(document)).toBe("light");
        document.documentElement.classList.add("dark");
        expect(readColorScheme(document)).toBe("dark");
    });
});

describe("the size message the host acts on", () => {
    it("accepts a measured height with the content height beside it", () => {
        const checked = checkFrameMessage(
            {
                type: "matrx:sandbox:size",
                instanceId: INSTANCE,
                height: FRAME_HEIGHT_CEILING_PX,
                contentHeight: FRAME_HEIGHT_CEILING_PX + 1200,
                capped: true,
            },
            INSTANCE,
            MAX_INBOUND_BYTES,
        );
        expect(checked.ok).toBe(true);
    });

    it("refuses a content height that is not a number, and says what it did", () => {
        const checked = checkFrameMessage(
            {
                type: "matrx:sandbox:size",
                instanceId: INSTANCE,
                height: 420,
                contentHeight: "tall",
            },
            INSTANCE,
            MAX_INBOUND_BYTES,
        );
        expect(checked.ok).toBe(false);
        if (checked.ok) throw new Error("unreachable");
        expect(checked.refusal).toContain("content height is not a number");
        expect(checked.refusal).toContain("stays at the height it already had");
    });

    it("refuses a height that is not finite", () => {
        for (const height of [Number.NaN, Number.POSITIVE_INFINITY, "600"]) {
            const checked = checkFrameMessage(
                { type: "matrx:sandbox:size", instanceId: INSTANCE, height },
                INSTANCE,
                MAX_INBOUND_BYTES,
            );
            expect(checked.ok).toBe(false);
        }
    });
});

/**
 * The host's side of the same contract: what the reader is given when a
 * component is taller than the ceiling. The numbers below are the ones headless
 * Chrome measured on 2026-09-12 from a LIVE body — `newsjacking_expert_article_default`
 * rendered at 80 px wide reported `height 4000 / contentHeight 5979 / capped`.
 */
const SEEDED_CEILINGS = {
    // The values `custom.sandbox_frame_height_px` and
    // `custom.sandbox_expanded_frame_height_px` were SEEDED with (S7) — the
    // same numbers the frame compiles in, so these cases still describe the
    // shipped configuration.
    frameHeightPx: FRAME_HEIGHT_CEILING_PX,
    expandedFrameHeightPx: EXPANDED_FRAME_HEIGHT_CEILING_PX,
};

describe("what the reader gets when a component passes the height ceiling", () => {
    it("shows it whole when it fits, with no control and nothing to explain", () => {
        const decision = frameHeightDecision(1238, 1238, false, SEEDED_CEILINGS);
        expect(decision).toEqual({
            height: 1238,
            capped: false,
            control: "none",
            sentence: null,
        });
    });

    it("holds it at the ceiling AND says how tall it really is", () => {
        const decision = frameHeightDecision(FRAME_HEIGHT_CEILING_PX, 5979, false, SEEDED_CEILINGS);
        expect(decision.height).toBe(FRAME_HEIGHT_CEILING_PX);
        expect(decision.control).toBe("show-all");
        // Never a bare truncation: the reader is told the real number.
        expect(decision.sentence).toBe(
            `This component is 5979 pixels tall; ${FRAME_HEIGHT_CEILING_PX} are shown.`,
        );
    });

    it("expands to the whole thing, and offers the way back", () => {
        const decision = frameHeightDecision(FRAME_HEIGHT_CEILING_PX, 5979, true, SEEDED_CEILINGS);
        expect(decision.height).toBe(5979);
        expect(decision.control).toBe("show-less");
        expect(decision.sentence).toBe("Showing all 5979 pixels of this component.");
    });

    it("says plainly when even expanded is not the whole thing", () => {
        const tooTall = EXPANDED_FRAME_HEIGHT_CEILING_PX + 4321;
        const decision = frameHeightDecision(FRAME_HEIGHT_CEILING_PX, tooTall, true, SEEDED_CEILINGS);
        expect(decision.height).toBe(EXPANDED_FRAME_HEIGHT_CEILING_PX);
        expect(decision.sentence).toContain("the rest is cut off");
        expect(decision.sentence).toContain(String(tooTall));
    });
});

describe("the frame's accessible name", () => {
    it("uses the row's own label when it has one", () => {
        expect(sandboxFrameTitle("wine_tasting_card", { label: "Wine tasting" })).toBe(
            "Wine tasting — component",
        );
    });

    it("falls back to the kind, spelled the way the product spells a key", () => {
        // Never "frame", and never the raw key: an unnamed iframe is announced
        // as "frame" and a reader has no idea what they tabbed into.
        expect(sandboxFrameTitle("wine_tasting_card", null)).toBe(
            "Wine Tasting Card — component",
        );
    });
});
