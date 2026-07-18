/**
 * The hardcoded loading-component library: slug selection + early-key
 * rendering. The library must always answer (generic default), render the
 * early keys (title / loading_message / subtext) when present, and render
 * sensibly with none of them.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_KIND_LOADING_SLUG,
  KIND_LOADING_COMPONENTS,
  resolveKindLoadingComponent,
} from "../react/loading/kind-loading-registry";
import { GenericLoading } from "../react/loading/kind-loading-components";
import { earlyKeysFromValue } from "../react/loading/kind-loading.types";

describe("resolveKindLoadingComponent", () => {
  it("resolves every declared slug and defaults unknown/missing to generic", () => {
    for (const slug of Object.keys(KIND_LOADING_COMPONENTS)) {
      expect(resolveKindLoadingComponent(slug)).toBe(
        KIND_LOADING_COMPONENTS[slug],
      );
    }
    expect(resolveKindLoadingComponent(null)).toBe(GenericLoading);
    expect(resolveKindLoadingComponent(undefined)).toBe(GenericLoading);
    expect(resolveKindLoadingComponent("no_such_loader")).toBe(GenericLoading);
    expect(KIND_LOADING_COMPONENTS[DEFAULT_KIND_LOADING_SLUG]).toBe(
      GenericLoading,
    );
  });

  it("ships a meaningful library (~20 loaders)", () => {
    expect(Object.keys(KIND_LOADING_COMPONENTS).length).toBeGreaterThanOrEqual(
      20,
    );
  });
});

describe("early-key rendering", () => {
  const EARLY = {
    kind: "wine_tasting",
    title: "Opus One 2019",
    loadingMessage: "Pouring your tasting…",
    loadingSubtext: "Swirling the details",
    count: 3,
  };

  it("every loader renders without crashing — with AND without early keys", () => {
    for (const [slug, Loading] of Object.entries(KIND_LOADING_COMPONENTS)) {
      const bare = renderToStaticMarkup(<Loading />);
      expect(bare.length).toBeGreaterThan(0);
      const keyed = renderToStaticMarkup(<Loading {...EARLY} />);
      expect(keyed).toContain("Opus One 2019");
      // Every loader is honest about being busy.
      expect(`${slug}:${keyed}`).toContain("wine_tasting");
    }
  });

  it("the shell surfaces loading_message + subtext alongside the title", () => {
    const html = renderToStaticMarkup(<GenericLoading {...EARLY} />);
    expect(html).toContain("Opus One 2019");
    expect(html).toContain("Pouring your tasting…");
    expect(html).toContain("Swirling the details");
  });
});

describe("earlyKeysFromValue (the envelope → props bridge)", () => {
  it("maps the documented default key set and drops non-scalars/empties", () => {
    expect(
      earlyKeysFromValue(
        {
          title: "T",
          description: "D",
          loading_message: "L",
          loading_subtext: "S",
          icon: "table",
          count: 4,
          extra_object: { nope: true },
          empty: "",
        },
        "wine_tasting",
      ),
    ).toEqual({
      kind: "wine_tasting",
      title: "T",
      description: "D",
      loadingMessage: "L",
      loadingSubtext: "S",
      icon: "table",
      count: 4,
    });
  });

  it("tolerates null/missing values entirely", () => {
    expect(earlyKeysFromValue(null)).toEqual({});
    expect(earlyKeysFromValue({ count: Number.NaN })).toEqual({});
  });
});
