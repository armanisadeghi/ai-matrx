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
    MAX_INBOUND_BYTES,
    checkFrameMessage,
} from "../protocol";
import {
    frameHeight,
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
                height: 5979,
                contentHeight: 5979,
                capped: false,
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
 * The host's side of the same contract: there is no height cap. The numbers
 * are ones headless Chrome measured from a LIVE body (5979 px).
 */
describe("the iframe is always its full content height", () => {
    it("shows a component that fits at exactly its height", () => {
        expect(frameHeight(1238)).toBe(1238);
    });

    it("never caps a tall component", () => {
        expect(frameHeight(5979)).toBe(5979);
        expect(frameHeight(25000)).toBe(25000);
    });

    it("rounds fractions up and never goes below 1px", () => {
        expect(frameHeight(412.2)).toBe(413);
        expect(frameHeight(0)).toBe(1);
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
