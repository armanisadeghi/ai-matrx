/**
 * THE KIND SLOT + the placeholder phase + the slug-resolution trap.
 *
 * Three laws pinned here:
 *  1. An INVALID declared loading slug must not suppress derivation (it used
 *     to short-circuit straight to the shapeless generic skeleton, making a
 *     wrong declaration worse than no declaration).
 *  2. `reserved` holds the shape and stays STILL; `arriving` works visibly.
 *     Both render the SAME silhouette so the switch moves nothing.
 *  3. A slot's footprint floor is honoured in every phase, settled included —
 *     a short result must not shrink the slot and pull the page upward.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KindSlot, kindSlotPhase } from "../react/slot/KindSlot";
import {
  resolveLoadingSlugForKind,
  resetInvalidLoadingDeclarationReports,
} from "../react/loading/resolve-loading-slug";
import { kindRegistry } from "../registry/kind-registry";

/** A list-shaped kind: a title plus a list of structured items. */
const LIST_SCHEMA = {
  kind: "",
  fields: {
    title: { type: "string" as const, required: true },
    items: { type: "array" as const, itemKinds: ["slot_item"] },
  },
};

function registerKind(kind: string, loadingComponent: string | null) {
  kindRegistry.upsertDefinition({
    kind,
    schemaSource: "content_ir",
    tier: "cold",
    loadingComponent,
    schema: { ...LIST_SCHEMA, kind },
  });
}

beforeEach(() => {
  resetInvalidLoadingDeclarationReports();
});

describe("resolveLoadingSlugForKind", () => {
  it("uses a VALID declaration and reports it as declared", () => {
    registerKind("slot_declared_ok", "table");
    const result = resolveLoadingSlugForKind("slot_declared_ok");
    expect(result).toEqual({ slug: "table", origin: "declared" });
  });

  it("an INVALID declaration falls through to derivation instead of generic", () => {
    // The trap: `??` only advances on null, so a non-library slug used to win
    // and land on the shapeless generic skeleton.
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      registerKind("slot_declared_bogus", "report");
      const result = resolveLoadingSlugForKind("slot_declared_bogus");

      expect(result.slug).not.toBeNull();
      expect(result.origin).toBe("derived");
      expect(result.invalidDeclared).toBe("report");
      // And it SCREAMS — nothing else at runtime reports this.
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("screams once per kind, not once per render", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      registerKind("slot_declared_bogus_twice", "nope");
      resolveLoadingSlugForKind("slot_declared_bogus_twice");
      resolveLoadingSlugForKind("slot_declared_bogus_twice");
      resolveLoadingSlugForKind("slot_declared_bogus_twice");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("derives a silhouette for an undeclared kind", () => {
    registerKind("slot_underived", null);
    const result = resolveLoadingSlugForKind("slot_underived");
    expect(result.origin).toBe("derived");
    expect(result.slug).not.toBeNull();
  });

  it("an EMPTY declaration is 'not declared', not a bad declaration", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      kindRegistry.upsertDefinition({
        kind: "slot_declared_blank",
        schemaSource: "content_ir",
        tier: "cold",
        loadingComponent: "   ",
        schema: { ...LIST_SCHEMA, kind: "slot_declared_blank" },
      });
      const result = resolveLoadingSlugForKind("slot_declared_blank");
      expect(result.invalidDeclared).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("a late-arriving declaration MOVES the repaint key, so mounted slots refresh", () => {
    // The setters that record a Python-owned kind's declaration and emitted
    // schema did not bump the per-kind version, so a slot mounted before the
    // warm sweep kept rendering the generic skeleton for the whole run — the
    // exact case the slot exists for.
    const kind = "slot_late_arrival";
    const before = kindRegistry.getKindVersion(kind);
    kindRegistry.setDeclaredLoadingComponent(kind, "table");
    expect(kindRegistry.getKindVersion(kind)).toBeGreaterThan(before);
    expect(resolveLoadingSlugForKind(kind).slug).toBe("table");

    const afterDeclared = kindRegistry.getKindVersion(kind);
    kindRegistry.setEmittedJsonSchema(kind, { type: "object" });
    expect(kindRegistry.getKindVersion(kind)).toBeGreaterThan(afterDeclared);

    // Idempotent: re-recording the SAME value must not churn every subscriber.
    const settled = kindRegistry.getKindVersion(kind);
    kindRegistry.setDeclaredLoadingComponent(kind, "table");
    expect(kindRegistry.getKindVersion(kind)).toBe(settled);
  });

  it("answers generic for no kind at all", () => {
    expect(resolveLoadingSlugForKind(null)).toEqual({
      slug: null,
      origin: "generic",
    });
  });
});

describe("the placeholder phase", () => {
  beforeAll(() => registerKind("slot_phase_kind", "list"));

  const render = (phase: "reserved" | "arriving") =>
    renderToStaticMarkup(
      <KindSlot slotKey="s1" kind="slot_phase_kind" phase={phase} />,
    );

  it("reserved renders the kind's silhouette, still and unbusy", () => {
    const markup = render("reserved");
    expect(markup).toContain('data-kind-loading-phase="reserved"');
    // Still: no shimmer, no spinner.
    expect(markup).not.toContain("animate-pulse");
    expect(markup).not.toContain("animate-spin");
    // Alive: one slow breath.
    expect(markup).toContain("kind-slot-breathe");
    // Not announced as busy — nothing has started.
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).toContain("Coming up");
  });

  it("arriving shimmers and spins, and is busy", () => {
    const markup = render("arriving");
    expect(markup).toContain('data-kind-loading-phase="arriving"');
    expect(markup).toContain("animate-pulse");
    expect(markup).toContain("animate-spin");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain("kind-slot-breathe");
  });

  it("both phases render the SAME silhouette — the switch changes mood, not shape", () => {
    // With the same early keys, the two phases must be structurally identical:
    // same loader, same body rows. That is what makes the placeholder→loading
    // switch move nothing on screen.
    const withTitle = (phase: "reserved" | "arriving") =>
      renderToStaticMarkup(
        <KindSlot
          slotKey="s1"
          kind="slot_phase_kind"
          phase={phase}
          early={{ title: "Same Title" }}
        />,
      );
    const shapes = (markup: string) => (markup.match(/rounded/g) ?? []).length;
    expect(shapes(withTitle("reserved"))).toBe(shapes(withTitle("arriving")));
  });

  it("a BARE reserved slot still breathes — the host's header hides the usual one", () => {
    const bare = renderToStaticMarkup(
      <KindSlot
        slotKey="s-bare"
        kind="slot_phase_kind"
        phase="reserved"
        chrome="bare"
      />,
    );
    // No second header (the host draws it) …
    expect(bare).not.toContain("Coming up");
    // … but the body is alive rather than dead on the page.
    expect(bare).toContain("kind-slot-breathe");
    // Still, not working.
    expect(bare).not.toContain("animate-pulse");
    expect(bare).not.toContain("animate-spin");
  });

  it("the two phases render the SAME ROWS — no line appears in one and not the other", () => {
    // The 8px lurch: `reserved` always rendered a "Coming up" sub-line while a
    // keyless `arriving` rendered none, so the header changed height on the
    // switch — the page nudged up, then back down when a title arrived. Both
    // phases must occupy the same rows; only the words may differ.
    const rows = (markup: string) => (markup.match(/<p /g) ?? []).length;
    expect(rows(render("reserved"))).toBe(rows(render("arriving")));

    const titled = (phase: "reserved" | "arriving") =>
      renderToStaticMarkup(
        <KindSlot
          slotKey="s-eq"
          kind="slot_phase_kind"
          phase={phase}
          early={{ title: "T", loadingMessage: "M" }}
        />,
      );
    expect(rows(titled("reserved"))).toBe(rows(titled("arriving")));
  });

  it("with no title yet, reserved names the kind where arriving shimmers", () => {
    // The one deliberate structural difference, and it costs no height: both
    // sit in a header sized by the 28px icon chip, not by this element.
    expect(render("reserved")).toContain("Slot phase kind");
    expect(render("arriving")).toContain("animate-pulse");
  });
});

describe("KindSlot", () => {
  beforeAll(() => registerKind("slot_footprint_kind", "list"));

  it("keeps ONE root element across every phase — the container never remounts", () => {
    // The container surviving the swap is what preserves scroll position and
    // lets the transition animate rather than restart. Every phase must emit
    // the same identified root; only its children change.
    for (const phase of ["reserved", "arriving", "settled", "failed"] as const) {
      const markup = renderToStaticMarkup(
        <KindSlot
          slotKey="s2"
          kind="slot_footprint_kind"
          phase={phase}
          error={<span>failed</span>}
        >
          <span>tiny</span>
        </KindSlot>,
      );
      expect(markup).toContain('data-kind-slot="s2"');
      expect(markup).toContain(`data-kind-slot-phase="${phase}"`);
      expect(markup.indexOf("<div")).toBe(0);
    }
  });

  it("renders children only when settled, and the error only when failed", () => {
    const settled = renderToStaticMarkup(
      <KindSlot slotKey="s3" kind="slot_footprint_kind" phase="settled">
        <span>THE-REAL-THING</span>
      </KindSlot>,
    );
    expect(settled).toContain("THE-REAL-THING");
    expect(settled).not.toContain("data-kind-loading");

    const failed = renderToStaticMarkup(
      <KindSlot
        slotKey="s4"
        kind="slot_footprint_kind"
        phase="failed"
        error={<span>BROKE</span>}
      >
        <span>THE-REAL-THING</span>
      </KindSlot>,
    );
    expect(failed).toContain("BROKE");
    expect(failed).not.toContain("THE-REAL-THING");
  });

  it("carries its identity for every phase so a surface can find its slot", () => {
    const markup = renderToStaticMarkup(
      <KindSlot slotKey="invocation::root:0" kind="slot_footprint_kind" phase="reserved" />,
    );
    expect(markup).toContain('data-kind-slot="invocation::root:0"');
    expect(markup).toContain('data-kind-slot-phase="reserved"');
  });
});

describe("kindSlotPhase", () => {
  it("maps the two facts every producer has onto the four phases", () => {
    expect(kindSlotPhase({ started: false, settled: false })).toBe("reserved");
    expect(kindSlotPhase({ started: true, settled: false })).toBe("arriving");
    expect(kindSlotPhase({ started: true, settled: true })).toBe("settled");
    expect(kindSlotPhase({ started: true, settled: true, failed: true })).toBe(
      "failed",
    );
    // Failure wins even mid-flight.
    expect(kindSlotPhase({ started: true, settled: false, failed: true })).toBe(
      "failed",
    );
  });
});
