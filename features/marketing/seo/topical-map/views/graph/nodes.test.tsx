// WHAT A TOPIC AND A FACET VALUE ACTUALLY RENDER AS.
//
// Static markup, not a browser: `renderToStaticMarkup` is this repo's way of
// asserting on a component's real output without a DOM harness, and these
// bodies are deliberately plain components with no xy-flow dependency, so the
// canvas engine is never loaded here.
//
// Three classes are under test, each one a defect the first landing shipped:
//   1. the convergence fill was SOLID (`bg-opacity-*` is gone in Tailwind 4);
//   2. the card and the compact row ignored the legibility floor;
//   3. the hue bar on a topic and the hue bar on its facet value were never
//      proven to be the same colour, which is the whole promise of the legend.

import { renderToStaticMarkup } from "react-dom/server";

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

import type { FacetAxisValue } from "./facetAxis";
import { hueBar } from "./hue";
import {
  FacetValueBody,
  TopicCardBody,
  TopicCompactBody,
  intentFillClasses,
  type TopicNodeBodyData,
} from "./nodes";

// The REST of the capture store is kept real: `nodes.tsx` reaches `EntityRef`,
// whose module graph installs the session barrier through this same module, and
// a bare stub of it takes the whole suite down at import.
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(() => "captured"),
}));

const captureErrorMock = captureError as jest.MockedFunction<typeof captureError>;

beforeEach(() => {
  captureErrorMock.mockClear();
});

function topic(overrides: Partial<TopicNodeBodyData> = {}): TopicNodeBodyData {
  return {
    slug: "coffee-grinders",
    name: "Coffee grinders",
    status: "active",
    depth: 1,
    pageCount: 4,
    plannedCount: 2,
    keywordCount: 31,
    fillTone: null,
    convergenceColor: null,
    ringTier: 1,
    hueKey: null,
    scale: 1,
    selected: false,
    showLabel: true,
    ...overrides,
  };
}

function facetValue(overrides: Partial<FacetAxisValue> = {}): FacetAxisValue {
  return {
    id: "33333333-3333-4333-8333-000000000001",
    slug: "north-west",
    name: "North West",
    facet: "region",
    ref: null,
    isAll: false,
    topicIds: ["a", "b"],
    ...overrides,
  };
}

describe("the convergence fill", () => {
  it("tints the card rather than painting it solid", () => {
    const markup = renderToStaticMarkup(
      <TopicCardBody data={topic({ convergenceColor: "green" })} />,
    );
    expect(markup).toContain("bg-success/15");
    // `bg-opacity-*` does not exist in Tailwind 4 — a class that composes it
    // paints the tone at FULL strength with foreground text on top of it.
    expect(markup).not.toContain("bg-opacity");
  });

  it("gives every tone a fill of its own, none of them solid", () => {
    expect(intentFillClasses("green")).toContain("bg-success/15");
    expect(intentFillClasses("amber")).toContain("bg-warning/15");
    expect(intentFillClasses("blue")).toContain("bg-info/15");
    expect(intentFillClasses("red")).toContain("bg-destructive/15");
    expect(intentFillClasses("gray_dashed")).toContain("bg-transparent");
    expect(intentFillClasses("purple_dashed")).toContain("bg-transparent");
    for (const name of ["green", "amber", "blue", "red", "gray_dashed", "purple_dashed"]) {
      expect(intentFillClasses(name)).not.toContain("bg-opacity");
    }
  });

  it("draws a colour it does not know as the missing treatment, and reports it", () => {
    const markup = renderToStaticMarkup(
      <TopicCardBody data={topic({ convergenceColor: "bogus" })} />,
    );
    // The `missing` treatment is the dashed muted outline over no fill —
    // honest about not knowing, never an invisible or a wrong colour.
    expect(markup).toContain("bg-transparent");
    expect(markup).toContain("border-dashed");
    expect(markup).toContain("border-muted-foreground");
    expect(markup).not.toContain("bg-success");
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock.mock.calls[0][0].message).toContain("bogus");
  });
});

describe("the legibility floor", () => {
  it("hides the compact row's title and keeps its box and its count", () => {
    const shown = renderToStaticMarkup(<TopicCompactBody data={topic()} />);
    expect(shown).toContain("Coffee grinders");

    const hidden = renderToStaticMarkup(<TopicCompactBody data={topic({ showLabel: false })} />);
    expect(hidden).not.toContain("Coffee grinders");
    // The box survives — the shape of the map is what a zoomed-out drawing is
    // for — and so does the page count, which reads at a size a sentence does not.
    expect(hidden).toContain("rounded-lg");
    expect(hidden).toContain(">4<");
  });

  it("hides the card's title AND its counts, and keeps the frame", () => {
    const shown = renderToStaticMarkup(<TopicCardBody data={topic()} />);
    expect(shown).toContain("Coffee grinders");

    const hidden = renderToStaticMarkup(<TopicCardBody data={topic({ showLabel: false })} />);
    expect(hidden).not.toContain("Coffee grinders");
    // The counts are words-and-numbers at 11px; below the floor they are absent.
    expect(hidden).not.toContain("31");
    expect(hidden).toContain("rounded-xl");
  });
});

describe("the hue bar", () => {
  it("is deterministic — the same slug is always the same colour", () => {
    expect(hueBar("north-west")).toBe(hueBar("north-west"));
    expect(hueBar("north-west")).toMatch(/^bg-chart-[1-6]$/);
    expect(hueBar(null)).toBeNull();
  });

  it("puts the SAME bar on a facet value's pill and on the topics in it", () => {
    const value = facetValue();
    const pill = renderToStaticMarkup(
      <FacetValueBody data={{ value, facetLabel: "region", onFilter: () => {} }} />,
    );
    const card = renderToStaticMarkup(<TopicCardBody data={topic({ hueKey: value.slug })} />);

    const bar = hueBar(value.slug) as string;
    expect(pill).toContain(bar);
    expect(card).toContain(bar);
  });
});
