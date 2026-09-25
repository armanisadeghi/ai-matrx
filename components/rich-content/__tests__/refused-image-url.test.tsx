/**
 * FORCING FUNCTION: an image whose address the core refuses (javascript:,
 * data:text/html, vbscript:) renders NO <img> — an honest sentence instead.
 *
 * The break (verifier, 2026-09-25): `![x](javascript:alert(1))` on a share
 * page was sanitized to `src=""`, which drew a broken image and made React
 * log three console errors (an empty src re-requests the page).
 *
 * Use case: a shared field-inspection note where someone pasted a bad link
 * as an image between two real sentences.
 */
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("server-only", () => ({}));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({
  InlineCopyButton: () => null,
}));

import { RichContentServer } from "@/components/rich-content/server/RichContentServer";
import { RichContentStaticStandard } from "@/components/rich-content/RichContentStaticProse";

const NOTE = [
  "Inspection at the Harbor Commercial dock, bay 3.",
  "",
  "Photo: ![bay 3 pallets](javascript:alert(1)) taken at 9am.",
  "",
  "![](vbscript:msgbox(1))",
  "",
  "All pallets wrapped. Real photo: ![bay 3](https://example.com/bay3.jpg)",
].join("\n");

describe.each([
  ["server level", () => <RichContentServer level="standard" source={NOTE} />],
  ["static leaf", () => <RichContentStaticStandard source={NOTE} />],
  ["inline level", () => <RichContentServer level="inline" source={NOTE} />],
])("%s: refused image addresses", (_n, make) => {
  it("draws no <img> with an empty or unsafe src, and says so honestly", () => {
    const html = renderToStaticMarkup(make());
    expect(html).not.toMatch(/<img[^>]*src=""/);
    expect(html).not.toMatch(/<img(?![^>]*src="https:)[^>]*>/);
    expect(html).not.toMatch(/src="(javascript|vbscript):/i);
    expect(html).toContain("Image not shown");
    expect(html).toContain('src="https://example.com/bay3.jpg"');
    expect(html).toContain("All pallets wrapped.");
  });
});
