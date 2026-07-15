/**
 * Drift guard for the promote-bridge converter (W2-A).
 *
 * Runs the SAME language-neutral fixture cases as aidream's Python twin
 * (`aidream/services/cms/tests/test_cms_convert.py`). If this suite and that
 * one disagree, one of the two converters drifted from the shared spec.
 */

import fixtures from "../promote-convert-fixtures.json";
import { splitHtmlDocument, slugifyTitle } from "../promoteConvert";

interface FixtureCase {
    name: string;
    input_html: string;
    expected: {
        body: string;
        css: string | null;
        js: string | null;
        extracted_title: string | null;
        extracted_description: string | null;
        was_full_document: boolean;
        warnings: string[];
    };
}

describe("splitHtmlDocument — shared fixture cases", () => {
    for (const c of (fixtures as { cases: FixtureCase[] }).cases) {
        it(c.name, () => {
            const result = splitHtmlDocument(c.input_html);
            expect(result.body).toBe(c.expected.body);
            expect(result.css).toBe(c.expected.css);
            expect(result.js).toBe(c.expected.js);
            expect(result.extractedTitle).toBe(c.expected.extracted_title);
            expect(result.extractedDescription).toBe(c.expected.extracted_description);
            expect(result.wasFullDocument).toBe(c.expected.was_full_document);
            expect(result.warnings).toEqual(c.expected.warnings);
        });
    }
});

describe("splitHtmlDocument — robustness", () => {
    const nasty = [
        "<html><head>",
        "<html><head><style>unterminated",
        "<body></body>".repeat(100),
        "<<<<>>>>",
        "<html><head><style>" + "a".repeat(10000),
        '<script src="x.js">',
    ];
    it.each(nasty.map((h, i) => [i, h] as const))("never throws (%i)", (_i, html) => {
        const result = splitHtmlDocument(html);
        expect(typeof result.body).toBe("string");
    });
});

describe("slugifyTitle — twin of aidream _slugify", () => {
    it.each([
        ["Hello World", "hello-world"],
        ["  --Weird__Chars!!  ", "weird-chars"],
        ["", "page"],
        ["---", "page"],
        ["a".repeat(200), "a".repeat(80)],
    ])("%s → %s", (raw, expected) => {
        expect(slugifyTitle(raw)).toBe(expected);
    });
});
