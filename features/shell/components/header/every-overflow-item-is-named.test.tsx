// EVERY "…" OVERFLOW ITEM IS A NAMED CONTROL (lane V25-UI-FIXES).
//
// VERIFIER-25 on production at 320px: `/education/flashcards` opened a "…" strip holding ONE empty
// 52×44 box — RouteHeader folded `<HeaderActions>` whole, its buttons sat in a wrapper hidden below
// `lg`, and the label reader looked only at the wrapper's own props. `/rag/library` opened a strip
// whose first item was empty — a `hidden` file input the Add menu opens, counted as an action.
//
// The label comes from what an action DECLARES, never from what its DOM happens to show: a
// component that stands for several actions declares them (`routeHeaderActions`), and a node that
// is never drawn stays mounted but is never an action.
//
// RED FIRST on the prior route-header-layout: HeaderActions flattened to one unnamed item; the
// hidden input was an item.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HeaderActions from "./variants/shared/HeaderActions";
import {
  flattenActions,
  isNeverDrawn,
  OverflowMenuItem,
  overflowItemLabel,
} from "./route-header-layout";

const noop = () => {};

/** The flashcards home's own header actions (FlashcardsHome.tsx). */
const FLASHCARD_ACTIONS = [
  { icon: "Flame", label: "Drill weak areas", onPress: noop },
  { icon: "CalendarClock", label: "Review due", onPress: noop },
  { icon: "TrendingUp", label: "Progress", onPress: noop },
  { icon: "CloudOff", label: "Downloaded & offline", onPress: noop },
  { icon: "Webhook", label: "AI steps", onPress: noop },
];

function TapButton(_: { ariaLabel?: string; label?: string; onClick?: () => void }) {
  return <button type="button">icon</button>;
}

/** Every action RouteHeader would fold, as it would draw it in the "…" strip. */
function strip(right: React.ReactNode) {
  return flattenActions(right)
    .filter((a) => !a.inert)
    .map((a) => ({ label: overflowItemLabel(a.node), html: renderToStaticMarkup(<OverflowMenuItem action={a} />) }));
}

describe("a component that stands for several actions declares them", () => {
  it("HeaderActions inside a RouteHeader is its five actions, each named by its declared label", () => {
    // EducationToolHeader's right: `<>{right}<HeaderActions actions=… /></>`.
    const items = strip(
      <>
        {null}
        <HeaderActions actions={FLASHCARD_ACTIONS} sheetTitle="Flashcard actions" />
      </>,
    );
    expect(items.map((i) => i.label)).toEqual([
      "Drill weak areas",
      "Review due",
      "Progress",
      "Downloaded & offline",
      "AI steps",
    ]);
    for (const item of items) {
      // The name is printed as text, and nothing in the item is hidden below `lg`.
      expect(item.html).toContain(`>${(item.label ?? "").replace("&", "&amp;")}</span>`);
      expect(item.html).not.toContain("hdr-actions-desktop");
    }
  });
});

describe("a node that is never drawn is never an action", () => {
  it("the Sources page's hidden file input stays mounted but is not an item", () => {
    const flat = flattenActions(
      <>
        <input id="sources-upload-input" type="file" className="hidden" onChange={noop} />
        <TapButton ariaLabel="Trash" />
        <TapButton ariaLabel="Add a Source" label="Add" />
      </>,
    );
    expect(flat.map((a) => Boolean(a.inert))).toEqual([true, false, false]);
    expect(strip(flat.map((a) => a.node)).map((i) => i.label)).toEqual(["Trash", "Add a Source"]);
  });

  it("`hidden lg:flex` is drawn on large screens; `hidden`, `type=hidden` and the attribute are never drawn", () => {
    expect(isNeverDrawn(<div className="hidden lg:flex" />)).toBe(false);
    expect(isNeverDrawn(<span className="hidden sm:inline-flex" />)).toBe(false);
    expect(isNeverDrawn(<input type="file" className="hidden" />)).toBe(true);
    expect(isNeverDrawn(<input type="hidden" />)).toBe(true);
    expect(isNeverDrawn(<div hidden />)).toBe(true);
    expect(isNeverDrawn(<TapButton ariaLabel="Trash" />)).toBe(false);
  });
});

describe("the declared name is read from the element, in the order a control declares it", () => {
  it("aria-label on a host element and title count as names", () => {
    expect(overflowItemLabel(<button aria-label="Export" />)).toBe("Export");
    expect(overflowItemLabel(<button title="Print" />)).toBe("Print");
  });
});
