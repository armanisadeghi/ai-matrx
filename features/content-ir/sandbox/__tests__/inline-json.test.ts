/**
 * The forcing test for the inline-JSON class (V-27 finding A, 2026-09-12).
 *
 * It does not assert on the escaper's spelling. It builds a real HTML document
 * the way the acceptance harness builds one, hands it to a real HTML parser,
 * and asserts the page SURVIVES — which is the only thing that matters and the
 * exact thing that failed: one live component body contains a literal
 * `</script>`, the parser ended the script element there, and the harness
 * rendered nothing at all with no error anywhere.
 *
 * THE FIXTURE IS LIVE TEXT, not an invention. It is the substring read on
 * 2026-09-12 from `content_ir.kind_component.component_source` where
 * `component_key = 'podcast_episode_vite'` (41,488 bytes, updated_at
 * 2026-09-10 01:34:04.848651+00) — the body that broke the harness.
 */
import { inlineJson } from "../inline-json";

/** Verbatim from the live row (see the header for its provenance). */
const LIVE_BODY_FRAGMENT =
    '(scriptText) L.push("  <script>\\n" + esc(scriptText) + "\\n  </script>");';

function documentWith(serialized: string): Document {
    const html = `<!doctype html><html><head></head><body>
<div id="after"></div>
<script>window.__PAYLOAD__ = ${serialized};</script>
<div id="last"></div>
</body></html>`;
    return new DOMParser().parseFromString(html, "text/html");
}

describe("inlineJson — a live body may not end the script element", () => {
    it("RED SHAPE: a bare JSON.stringify truncates the document", () => {
        // This is the code the harness used to run. Kept as an assertion so
        // the failure mode is a fact in the suite, not a memory.
        const naive = JSON.stringify({ body: LIVE_BODY_FRAGMENT });
        expect(naive).toContain("</script>");

        const doc = documentWith(naive);
        // The parser closed the script element at the literal `</script`, so
        // the statement inside it is truncated and never terminates, and the
        // markup that followed the payload never parsed at all.
        const script = doc.scripts[0].textContent ?? "";
        // Cut mid-string: the statement never terminates, so nothing in it
        // can be read back, and the markup after the payload never parsed.
        expect(script).not.toContain("};");
        expect(() =>
            JSON.parse(/__PAYLOAD__ = (.*)/s.exec(script)?.[1] ?? ""),
        ).toThrow();
        // And the tail of the payload became visible page text instead of
        // data — the "the page renders the wrong thing, silently" half.
        expect(doc.body.innerHTML).toContain("esc(scriptText)");
    });

    it("GREEN: inlineJson keeps the document whole and the value identical", () => {
        const safe = inlineJson({ body: LIVE_BODY_FRAGMENT });
        expect(safe).not.toContain("<");
        expect(safe).not.toContain(">");

        const doc = documentWith(safe);
        // One intact script, and the document after it survived.
        expect(doc.scripts).toHaveLength(1);
        expect(doc.getElementById("last")).not.toBeNull();

        // The script still carries the WHOLE value, byte-identical once the
        // JS/JSON layer reads the escapes back.
        const script = doc.scripts[0].textContent ?? "";
        const serialized = /__PAYLOAD__ = (.*);/s.exec(script)?.[1] ?? "";
        expect(JSON.parse(serialized)).toEqual({ body: LIVE_BODY_FRAGMENT });
    });

    it("escapes the two line terminators a JS parser would trip on", () => {
        const value = { a: `x\u2028y\u2029z` };
        const safe = inlineJson(value);
        expect(safe).not.toMatch(/[\u2028\u2029]/);
        expect(JSON.parse(safe)).toEqual(value);
    });

    it("serializes undefined as null rather than emitting nothing", () => {
        expect(inlineJson(undefined)).toBe("null");
    });
});
