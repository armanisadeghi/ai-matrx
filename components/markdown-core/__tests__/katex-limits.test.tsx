/**
 * FORCING FUNCTION: math from anyone (a shared note, a public page) cannot
 * inflate or script the page. The ONE core's KaTeX options carry the limits.
 *
 * The break (verifier F3, 2026-09-25): `$$\rule{1000em}{1000em}$$` in a shared
 * note rendered a 1000em box — the signed-out share page grew to ~27,800px
 * and the box covered the content. Also held here: `\href`/`\url` never
 * become links (trust off) and macro expansion is bounded.
 *
 * Use case: a public physics study note — the attacker's line sits between a
 * real formula and a real sentence, which must both still render.
 */
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("server-only", () => ({}));

import MarkdownCoreServer from "@/components/markdown-core/MarkdownCoreServer";
import { REHYPE_KATEX_OPTIONS } from "@/components/markdown-core/math-normalizer";

function render(source: string): string {
  return renderToStaticMarkup(
    <MarkdownCoreServer preset="chat">{source}</MarkdownCoreServer>,
  );
}

/** Every em length KaTeX wrote into a style attribute. */
function emLengths(html: string): number[] {
  return [...html.matchAll(/:\s*(-?[\d.]+)em/g)].map((m) => Math.abs(Number(m[1])));
}

describe("KaTeX limits in the one core", () => {
  it("bounds a giant \\rule so it cannot cover the page", () => {
    const html = render(
      "Momentum is $$p = mv$$\n\n$$\\rule{1000em}{1000em}$$\n\nThen check the units.",
    );
    expect(html).toContain("Then check the units.");
    expect(html).toContain('class="katex');
    // A fixed page-safe bound, NOT the option's own value — a test that
    // compares against the option passes when the option is Infinity.
    expect(Math.max(...emLengths(html))).toBeLessThanOrEqual(20);
  });

  it("never turns \\href or \\url into a link (trust off)", () => {
    const html = render("$$\\href{javascript:alert(1)}{click} + \\url{https://evil.example}$$");
    expect(html).not.toMatch(/<a[\s>]/);
    // The source text survives only inside the inert MathML annotation.
    expect(html).not.toMatch(/\shref=/);
    expect(REHYPE_KATEX_OPTIONS.trust).toBe(false);
  });

  it("stops runaway macro expansion instead of hanging", () => {
    const bomb = "$$\\def\\a{\\a\\a}\\a$$";
    const started = Date.now();
    const html = render(bomb);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(html).toContain("katex-error");
  });
});
