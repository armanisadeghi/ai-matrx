/**
 * FORCING FUNCTION: a ```markdown fence's document is IN THE SERVER HTML on
 * every static root — not filled in after the page loads.
 *
 * The client front door (MarkdownCore) is `ssr: false`: on the server it
 * renders nothing. This suite reproduces exactly that (MarkdownCore → null)
 * and renders the server level and the SSR'd static leaf the way the server
 * does (react-dom/server). Before 2026-09-25 the fenced document went to the
 * client MarkdownPreviewBlock → NestedRichContent → MarkdownCore, so the
 * README inside a shared note arrived as an empty card.
 *
 * Use case: a shared note holding the README for a recycling company's
 * pickup scheduler — a heading, a bold line, and a ```bash block.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("server-only", () => ({}));
// Production behaviour of the client front door during SSR: nothing.
jest.mock("@/components/markdown-core/MarkdownCore", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({
  InlineCopyButton: () => null,
}));

import { RichContentServer } from "@/components/rich-content/server/RichContentServer";
import { RichContentStaticStandard } from "@/components/rich-content/RichContentStaticProse";

const F = "```";
const NOTE = [
  "Setup notes for the pickup scheduler:",
  "",
  `${F}markdown`,
  "# Pickup Scheduler",
  "",
  "Routes run **Tuesday and Thursday**.",
  "",
  `${F}bash`,
  "pnpm install",
  F,
  F,
  "",
  "Tail paragraph with **bold**.",
].join("\n");

describe.each([
  ["server level", () => <RichContentServer level="standard" source={NOTE} />],
  ["static leaf (share pages)", () => <RichContentStaticStandard source={NOTE} />],
])("%s: the fenced document is in the server HTML", (_name, make) => {
  it("renders the document's heading, bold and inner code on the server", () => {
    const html = renderToStaticMarkup(make());
    expect(html).toMatch(/<h1[^>]*>Pickup Scheduler/);
    expect(html).toContain("Tuesday and Thursday</strong>");
    expect(html).toContain("pnpm install");
    expect(html).toContain("bold</strong>");
  });
});
