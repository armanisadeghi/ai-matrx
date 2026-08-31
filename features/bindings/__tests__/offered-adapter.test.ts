/**
 * The adapter that lets the ONE shared binding row render a mandate's offered
 * inventory. Held because the alternative to a correct translation is a second
 * picker, which is the exact duplication this whole build exists to end.
 */

import type { OfferedValue } from "@/features/mandates/provision-shapes";
import {
  offeredKindIsMedia,
  offeredKindIsRegistered,
  offeredKindIsScalar,
  offeredKindToValueType,
  offeredValueToSurfaceValue,
  offeredValuesToSurfaceValues,
} from "@/features/bindings/offered-adapter";

describe("offeredKindToValueType", () => {
  it.each([
    ["text", "string"],
    ["string", "string"],
    ["markdown", "string"],
    ["number", "number"],
    ["integer", "number"],
    ["boolean", "boolean"],
    ["string_list", "array"],
    ["file_list", "array"],
    ["file", "document"],
    ["json", "object"],
  ])("%s → %s", (kind, expected) => {
    expect(offeredKindToValueType(kind)).toBe(expected);
  });

  it("calls an unknown (registered content) kind structured, which is the honest answer", () => {
    expect(offeredKindToValueType("matrx.session_context")).toBe("object");
    expect(offeredKindIsRegistered("matrx.session_context")).toBe(true);
    expect(offeredKindIsRegistered("json")).toBe(false);
  });
});

describe("the kind predicates mirror aidream's vocabulary", () => {
  it("scalars are the prompt-substitutable set", () => {
    expect(offeredKindIsScalar("markdown")).toBe(true);
    expect(offeredKindIsScalar("file")).toBe(false);
    expect(offeredKindIsScalar("json")).toBe(false);
  });
  it("media is its own channel", () => {
    expect(offeredKindIsMedia("file")).toBe(true);
    expect(offeredKindIsMedia("file_list")).toBe(true);
    expect(offeredKindIsMedia("text")).toBe(false);
  });
});

describe("offeredValueToSurfaceValue", () => {
  const value: OfferedValue = {
    name: "cleaned_transcript_text",
    kind: "text",
    guaranteed: false,
    lazy: true,
    description: "The transcript after cleanup.",
  };

  it("turns snake_case into the prose the picker shows", () => {
    expect(offeredValueToSurfaceValue(value).label).toBe(
      "Cleaned Transcript Text",
    );
  });

  it("maps guaranteed onto alwaysAvailable — the picker's '· sometimes' suffix", () => {
    expect(offeredValueToSurfaceValue(value).alwaysAvailable).toBe(false);
    expect(
      offeredValueToSurfaceValue({ ...value, guaranteed: true }).alwaysAvailable,
    ).toBe(true);
  });

  it("declares no size hint rather than inventing one", () => {
    // A provision does not carry a size today. 0 renders as absent everywhere;
    // a made-up number would be a stand-in that lies.
    expect(offeredValueToSurfaceValue(value).typicalCharCount).toBe(0);
  });

  it("keeps the name as the storage key — the wire binds by name", () => {
    expect(offeredValueToSurfaceValue(value).name).toBe(value.name);
  });

  it("maps a whole inventory in order", () => {
    const values = offeredValuesToSurfaceValues([
      value,
      { ...value, name: "session_title" },
    ]);
    expect(values.map((v) => v.name)).toEqual([
      "cleaned_transcript_text",
      "session_title",
    ]);
  });
});
