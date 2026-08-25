/**
 * THE LIFE CHECK — every loader in the library carries a touch of color, and
 * the ones that advertise a count actually react to it.
 *
 * Arman, 2026-08-24, reviewing the gallery: "they have no life to them … we
 * need to make sure that everything has a little touch of color so things feel
 * and look alive. Not overdoing it, but having just a touch of it is really
 * important." A loader that renders in pure greyscale is the defect this
 * catches; a loader that ignores the live `count` key is the second one.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  KIND_LOADING_COMPONENTS,
  KIND_LOADING_SLUGS,
} from "../react/loading/kind-loading-registry";

/** Any Tailwind color-family utility (excludes the neutral/semantic tokens). */
const COLOR_UTILITY =
  /(?:bg|text|border|from|via|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/;

const EARLY_KEYS = {
  kind: "demo_kind",
  title: "Cell Biology Fundamentals",
  loadingMessage: "Crafting your questions…",
};

describe("every loader carries a touch of color", () => {
  it.each(KIND_LOADING_SLUGS)("%s renders at least one accent", (slug) => {
    const Loader = KIND_LOADING_COMPONENTS[slug];
    const markup = renderToStaticMarkup(<Loader {...EARLY_KEYS} />);
    expect(markup).toMatch(COLOR_UTILITY);
  });

  // "Not overdoing it" is about coherence, not a pixel budget: one accent
  // family (plus at most one deliberate contrast, e.g. map's rose pins on an
  // emerald field) reads as designed. A third family reads as a rainbow.
  it.each(KIND_LOADING_SLUGS)("%s uses at most two color families", (slug) => {
    const Loader = KIND_LOADING_COMPONENTS[slug];
    const markup = renderToStaticMarkup(<Loader {...EARLY_KEYS} />);
    const families = [
      ...new Set(
        (markup.match(new RegExp(COLOR_UTILITY, "g")) ?? []).map(
          (util) => util.split("-")[1],
        ),
      ),
    ];
    expect(families.length).toBeLessThanOrEqual(2);
  });
});

describe("count-driven loaders react to the live count key", () => {
  // These loaders repeat an item per `count`; the early `count` key steps up
  // as items stream in, so their body must grow with it.
  const COUNTERS = ["list", "form", "gallery", "stat-grid", "progress"] as const;

  it.each(COUNTERS)("%s renders more items as count grows", (slug) => {
    const Loader = KIND_LOADING_COMPONENTS[slug];
    const small = renderToStaticMarkup(<Loader {...EARLY_KEYS} count={2} />);
    const large = renderToStaticMarkup(<Loader {...EARLY_KEYS} count={6} />);
    const divs = (markup: string) => (markup.match(/<div/g) ?? []).length;
    expect(divs(large)).toBeGreaterThan(divs(small));
  });
});
