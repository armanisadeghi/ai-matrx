/**
 * THE BENCH MUST OPEN — pinned against the REAL live registry rows.
 *
 * On 2026-08-24 Arman opened `/shapes/topic_assignment_batch_v1/test` and the
 * bench refused him:
 *
 *     "generated data-only machine contract — machines fill it, humans never do."
 *
 * Nothing about that row was generated. Eight seeders had stamped
 * `metadata.family = "agent_io"` — the io_contract mint's namespace — onto 16
 * hand-authored SEO/research agent outputs, and `metadata.data_only = true`
 * onto the 12 `search`/`primitive` demo shapes. Two fixes landed:
 *
 *   - `58975daee2` (frontend): `data_only` ANNOTATES; it no longer quarantines.
 *   - `repair_kind_metadata_labels.py` (aidream, applied 2026-08-25): the DATA
 *     that made the gate misfire, plus `isDataOnlyKindMetadata` no longer
 *     derives "machine-produced" from a FAMILY NAME.
 *
 * The `metadata` objects below are VERBATIM copies of the live rows in
 * `content_ir.kind_definition` (Matrx Main, read 2026-08-25 after the repair).
 * That is the point: a unit test over invented metadata would have passed
 * happily on 2026-08-24 too. These fixtures are the shapes Arman actually
 * clicks, so this test fails if the registry regresses OR if the resolver does.
 */

import {
  decideKindInputPath,
  GENERIC_INPUT_COMPONENT_KEY,
} from "../input/kind-input-resolution";
import type { ComponentResolution } from "../registry/component-registry";

/** The compiled input floor every ACTIVE display root resolves to. */
const COMPILED_FLOOR: ComponentResolution = {
  componentKey: GENERIC_INPUT_COMPONENT_KEY,
  isActive: true,
  source: "system",
  resolvedBy: "compiled",
} as ComponentResolution;

/** Verbatim `kind_definition.metadata`, live, 2026-08-25 (post-repair). */
const LIVE = {
  // A hand-seeded SEO agent output. Family repaired `agent_io` -> `seo`;
  // `data_only` KEPT, because a mandate really is what produces it.
  topic_assignment_batch_v1: {
    family: "seo",
    data_only: true,
    direction: "output",
    generated: false,
    fingerprint:
      "85dd4902084156e3a7d8db99f46b12cc064a03521b39db7381251e6760e331a8",
    source_name: "seo.topic_assigner",
    activation_note: "seo keyword pipeline kind seed",
  },
  // An ordinary search shape. `data_only` DROPPED — a person can author one.
  web_result: {
    pilot: "search-kinds-2026-08-20",
    family: "search",
    category: "data",
    maturity: "verified",
    generated: false,
    fingerprint:
      "1092486a35cff058621d44b6a7f6af6830cae66dbab22ad7bd7ab2140b01a533",
    source_name: "search_kinds",
    activation_note: "kind_sdk publisher",
  },
  // An ordinary primitive. Same repair.
  rating: {
    pilot: "search-kinds-2026-08-20",
    family: "primitive",
    category: "data",
    maturity: "verified",
    generated: false,
    fingerprint:
      "819157300f267b8ba34c2bad55c571aba73e3d4426176d206ad3048ddc090812",
    source_name: "search_kinds",
    activation_note: "kind_sdk publisher",
  },
  // A CURATED `workflow_io` kind that ships an active human input component.
  // Untouched by the repair, and the reason the family leg had to go: a person
  // filling in `text` was being told a machine fills it.
  text: {
    family: "workflow_io",
    generic: true,
    category: "data",
    maturity: "verified",
    description: "Plain text.",
    activation_note:
      "Named-shapes campaign 2026-08-09 (features-to-workflows item 6): gate verified via evaluate_kind_activation before activation.",
  },
} as const;

describe("the Shape test bench opens, against live registry rows", () => {
  it("topic_assignment_batch_v1 renders its form — never refused", () => {
    const path = decideKindInputPath(
      "topic_assignment_batch_v1",
      COMPILED_FLOOR,
      null,
    );
    // THE REGRESSION THIS FILE EXISTS FOR.
    expect(path.mode).not.toBe("refused");
    expect(path.mode).toBe("instance-json");
  });

  it.each([["web_result"], ["rating"]] as const)(
    "%s renders its form",
    (slug) => {
      const path = decideKindInputPath(slug, COMPILED_FLOOR, null);
      expect(path.mode).toBe("instance-json");
    },
  );

  it("the curated workflow_io kind `text` opens the instance editor", () => {
    const path = decideKindInputPath("text", COMPILED_FLOOR, null);
    expect(path.mode).toBe("instance-json");
  });

  /**
   * THE FORCING FUNCTION THIS FILE WAS MISSING.
   *
   * These 13 curated `workflow_io` kinds have NO `role='input'` kind_component
   * row and NO compiled-floor entry — verified live 2026-08-25 — and every one
   * carries an `emitted_json_schema`. Until 2026-08-25 they reached the
   * instance-JSON bench only because `dataOnly` was derived from their FAMILY
   * NAME and `dataOnly` happened to also unlock the null-resolution fallback.
   *
   * Removing the family leg silently took the fallback with it: all 13 would
   * have started refusing AND filing a `captureError` incident on a surface
   * that worked the day before. An adversarial review caught it; the test
   * suite could not, because the suite had no case where resolution is null
   * and `dataOnly` is false.
   *
   * A REGISTERED SHAPE WITH A CONTRACT IS NEVER A DEAD END.
   */
  const NO_INPUT_ROW_NO_FLOOR = [
    "agent_result",
    "criteria_gate_result",
    "criterion_coverage",
    "graphql_response",
    "ingested_sources",
    "office_extraction_result",
    "office_file_result",
    "parsed_json",
    "rendered_text",
    "saved_row",
    "table_rows",
    "user_inputs",
    "web_search_results",
  ] as const;

  it.each(NO_INPUT_ROW_NO_FLOOR.map((k) => [k]))(
    "%s has no input component and still opens its bench, never refuses",
    (slug) => {
      const path = decideKindInputPath(
        slug,
        null, // the resolver genuinely answers null for these
        null, // no reconstructed field schema either
        true, // it carries an emitted_json_schema
      );
      expect(path.mode).not.toBe("refused");
      expect(path.mode).toBe("instance-json");
    },
  );

  it("still refuses — loudly — when there is genuinely nothing to edit", () => {
    // The fallback must not become a validator that cannot fail: a row with no
    // component, no field schema AND no emitted schema is a real registry gap.
    const path = decideKindInputPath("some_empty_kind", null, null, false);
    expect(path.mode).toBe("refused");
    if (path.mode === "refused") {
      expect(path.reason).toContain("emitted_json_schema");
    }
  });

  it("no live fixture wears a reserved contract family name", () => {
    // Mirrors aidream's `scripts/check_kind_family_law.py`. `workflow_io` is
    // the grandfathered exception and is deliberately absent from this set.
    const reserved = new Set(["action_io", "tool_io", "agent_io"]);
    for (const [slug, metadata] of Object.entries(LIVE)) {
      expect([slug, reserved.has(metadata.family)]).toEqual([slug, false]);
    }
  });
});
