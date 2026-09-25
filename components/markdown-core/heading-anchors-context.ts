"use client";

// Whether heading hover anchors ("#" links to a section) render here.
//
// The extended syntax adds one after every heading so any section of a
// DOCUMENT can be linked to. In a preview — a clamped card, a collapsed
// analysis, a list row — the section is not on screen, so the anchor is a
// dead link that also reads as part of the title. A preview context turns
// them off with <HeadingAnchorsProvider value={false}> (or
// `<RichContent headingAnchors={false}>`); the inline level never renders
// them at all. Default: on.

import { createContext, useContext } from "react";

const HeadingAnchorsContext = createContext(true);

export const HeadingAnchorsProvider = HeadingAnchorsContext.Provider;

export function useHeadingAnchors(): boolean {
  return useContext(HeadingAnchorsContext);
}
