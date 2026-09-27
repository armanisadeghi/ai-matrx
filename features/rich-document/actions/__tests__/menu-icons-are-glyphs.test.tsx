/**
 * EVERY MENU ROW'S ICON IS A GLYPH, NEVER A LETTER (ALC-15 round 4, finding D).
 * "Save to Files" carried the /files route favicon badge — an SVG whose only
 * content is the letter "F" — so the Save submenu read "F  Save to Files" and
 * the palette's text showed a stray "F". Menus draw Lucide glyphs.
 *
 * Break it names: any registered rich-document action whose icon renders text → red.
 */
import "../handlers";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ComponentType } from "react";
import { getAllActions } from "../provider";

it("no action icon renders a letter", () => {
  const lettered = getAllActions()
    .filter((a) => /<text[\s>]/.test(renderToStaticMarkup(createElement(a.icon as ComponentType<{ className?: string }>, { className: "h-4 w-4" }))))
    .map((a) => a.id);
  expect(lettered).toEqual([]);
});
