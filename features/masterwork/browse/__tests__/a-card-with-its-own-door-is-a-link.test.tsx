/**
 * @jest-environment jsdom
 */
/**
 * THE GUARD: AN APPROACH THAT CANNOT BEGIN A RULEBOOK *HERE* BUT HAS A DOOR OF
 * ITS OWN IS A LINK — AND THE WHOLE CARD IS THAT LINK.
 *
 * ## The defect this exists to catch (cold walk 7, finding 4, 2026-09-17)
 *
 * On step 2 of the guided start, twenty-one Approach cards responded to a click
 * anywhere on the card. Two — the Vision Interview and the Oracle tap — did
 * not: both are fully built lanes whose door is their own PAGE
 * (`metadata.launch_href`) rather than a `/masterwork/[id]` query param, so the
 * wizard marked them `inert` ("cannot be the lane Start begins with") and the
 * card read that as "has nowhere to go". They rendered as
 * `<div aria-disabled="true">`, in exactly the clothes of the twenty-one live
 * ones, with the only working target a ~150px inline link at the very bottom.
 *
 * The walk clicked the Vision Interview card's title, its blurb and its "You
 * bring:" line, got nothing from any of them, pressed Start, was handed the
 * DEFAULT interview instead, and reported the product broken. A control is
 * absent or honest, never dead.
 *
 * ## What this forces, for the class
 *
 * It is written against the CARD PRIMITIVE, not against the Vision Interview,
 * because the primitive is what every consumer renders (the guided start, the
 * catalog page, the Rulebook's picker dialog). Any registry row — today's or
 * tomorrow's — whose only door is a `launch_href` gets a whole-card link
 * wherever it is shown inert.
 *
 * Proven red before green (2026-09-17): against the previous
 * `reachable = state.reachable && !inert && Boolean(href ?? onSelect)`, the
 * first three cases fail — the card is still an `aria-disabled` div with no
 * link role, and the body still carried an `<a>` that would become a nested
 * anchor the moment the card itself became one.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ApproachCard } from "../ApproachCard";
import type { DistillationApproach } from "../approaches";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function approach(
  over: Partial<DistillationApproach> & Pick<DistillationApproach, "key">,
): DistillationApproach {
  return {
    id: `id-${over.key}`,
    label: "A lane",
    blurb: "What it is.",
    whatItNeeds: "Twenty minutes.",
    costTimeShape: "Start now.",
    mandateKey: "masterwork.test",
    intakeQuery: {},
    sortOrder: 1,
    enabled: false,
    availability: "available",
    launchHref: null,
    catalogNumber: null,
    ...over,
  };
}

/** The live shape of the two rows the walk hit, as `platform.approach` holds
 *  them: built, available, not startable by the funnel, own page. */
const VISION_INTERVIEW = approach({
  key: "vision_interview",
  label: "Vision Interview",
  enabled: false,
  availability: "available",
  launchHref: "/masterwork/vision-interview/new",
});

const ORACLE_TAP = approach({
  key: "oracle_tap",
  label: "The Oracle tap",
  enabled: false,
  availability: "partial",
  launchHref: "/chat",
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function show(node: React.ReactElement): void {
  act(() => {
    root.render(node);
  });
}

/** The card element itself — whichever of the three shapes it took. */
function card(): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    'a[class*="rounded-2xl"], button[class*="rounded-2xl"], div[class*="rounded-2xl"]',
  );
  if (!el) throw new Error("no card rendered");
  return el;
}

describe("an inert Approach with its own page", () => {
  it("is a link over the WHOLE card, never an aria-disabled div", () => {
    show(<ApproachCard approach={VISION_INTERVIEW} inert />);

    const el = card();
    expect(el.tagName).toBe("A");
    expect(el.getAttribute("href")).toBe("/masterwork/vision-interview/new");
    // The click target is the card itself, not a fragment of it: the title,
    // the blurb and the "You bring:" line all live inside it.
    expect(el.textContent).toContain("Vision Interview");
    expect(el.textContent).toContain("What it is.");
    expect(el.textContent).toContain("You bring:");
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });

  it("does the same for a `partial` lane whose door is a page", () => {
    show(<ApproachCard approach={ORACLE_TAP} inert />);
    const el = card();
    expect(el.tagName).toBe("A");
    expect(el.getAttribute("href")).toBe("/chat");
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });

  it("says in words that it opens its own page, with no nested anchor", () => {
    show(<ApproachCard approach={VISION_INTERVIEW} inert />);
    expect(card().textContent).toContain(
      "not a way to begin — it has its own page",
    );
    // An <a> inside an <a> is invalid HTML and React will not hydrate it; the
    // old card shipped exactly that shape the moment the outer card became a
    // link.
    expect(container.querySelectorAll("a a").length).toBe(0);
  });
});

describe("an Approach with genuinely nowhere to go", () => {
  it("stays inert and says so — absent or honest, never dead", () => {
    show(
      <ApproachCard
        approach={approach({
          key: "not_built",
          label: "Something we named",
          availability: "coming_soon",
        })}
        inert
      />,
    );
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
    expect(container.textContent).toContain("Coming soon");
    expect(container.querySelector("a")).toBeNull();
  });

  it("names the refusal when it is live but has no door at all", () => {
    show(
      <ApproachCard
        approach={approach({ key: "doorless", label: "No door" })}
        inert
      />,
    );
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
    expect(container.textContent).toContain(
      "cannot start a Rulebook — pick another way to begin",
    );
  });
});

describe("a startable Approach is untouched", () => {
  it("is still a button that selects, not a link", () => {
    const onSelect = jest.fn();
    show(
      <ApproachCard
        approach={approach({
          key: "triad_game",
          label: "The Triad game",
          enabled: true,
          intakeQuery: { triad: "1" },
        })}
        onSelect={onSelect}
      />,
    );
    const el = card();
    expect(el.tagName).toBe("BUTTON");
    act(() => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelector("a")).toBeNull();
  });
});
