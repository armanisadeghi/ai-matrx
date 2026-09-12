/**
 * inline-json — THE one way any of our HTML documents carries JSON inside a
 * `<script>` element.
 *
 * WHY IT EXISTS (V-27, 2026-09-12). The S1 acceptance harness wrote live
 * component bodies into an inline `<script>` with a bare `JSON.stringify`. One
 * live body — `podcast_episode_vite`, `content_ir.kind_component`, 41,488
 * bytes — contains the literal text `</script>`. The HTML parser ends a script
 * element at the first `</script` in the byte stream no matter what quoting the
 * JavaScript believes it is inside, so the document was truncated mid-array,
 * the rest of the page became text, and the harness rendered NOTHING with no
 * error anywhere. The data did not have to be hostile; it only had to be real.
 *
 * The fix is not "escape `</script>`". It is: a `<` inside inlined JSON is
 * never emitted as a `<`. `>` and `&` follow so a value can never close or
 * open any markup construct, and U+2028/U+2029 because they terminate a
 * JavaScript line. All five become `\uXXXX` escapes, which JSON.parse and the
 * JS parser read back as the identical characters — the value is unchanged,
 * only its spelling in the byte stream is.
 *
 * Use this anywhere JSON goes into a script element. `KindHtmlFrame` uses it
 * for the kind-data slot it hands organization-authored HTML documents.
 */

const ESCAPES: Record<string, string> = {
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029",
};

/**
 * Serialize `value` so the result is safe to place between `<script>` and
 * `</script>`. Returns `"null"` for `undefined`, and throws on a cyclic value
 * exactly as `JSON.stringify` does — a caller inlining a cycle has a bug worth
 * seeing.
 */
export function inlineJson(value: unknown): string {
    return JSON.stringify(value ?? null).replace(
        /[<>&\u2028\u2029]/g,
        (char) => ESCAPES[char] ?? char,
    );
}
