/**
 * Unit tests for the `matrx-user/marketing-site-media` write-target core.
 *
 * The two failure modes worth proving: (1) a `media_order` write must never
 * widen the preset vocabulary or silently coerce a bad dimension, and (2) a
 * `media_standards_slots` write must not be able to quietly empty the site's
 * standards or mint colliding slot names.
 */

import {
  EMPTY_MEDIA_ORDER_DRAFT,
  mergeMediaOrderWrite,
  validateMediaStandardsNotesWrite,
  validateMediaStandardsSlotsWrite,
  type MediaOrderDraft,
} from "@/features/marketing/lib/site-media-write-targets";
import { MEDIA_ORDER_PRESET_IDS } from "@/features/marketing/lib/media-order-presets";

const current: MediaOrderDraft = {
  type: "hero",
  brief: "A wide banner of the workshop floor.",
  style: "",
  width: "",
  height: "",
};

describe("mergeMediaOrderWrite", () => {
  it("merges only the provided keys and leaves the rest alone", () => {
    const next = mergeMediaOrderWrite(current, {
      brief: "  A calm studio portrait of the founder.  ",
    });
    expect(next).toEqual({
      ...current,
      brief: "A calm studio portrait of the founder.",
    });
  });

  it("accepts every id in the real preset vocabulary", () => {
    for (const id of MEDIA_ORDER_PRESET_IDS) {
      expect(mergeMediaOrderWrite(current, { type: id }).type).toBe(id);
    }
  });

  it("throws on a preset id outside the vocabulary", () => {
    expect(() => mergeMediaOrderWrite(current, { type: "banner" })).toThrow(
      /type must be one of/,
    );
  });

  it("throws on unknown fields rather than dropping them", () => {
    expect(() =>
      mergeMediaOrderWrite(current, { brief: "ok", prompt: "oops" }),
    ).toThrow(/unknown field\(s\) prompt/);
  });

  it("throws on an empty patch", () => {
    expect(() => mergeMediaOrderWrite(current, {})).toThrow(
      /provide at least one of/,
    );
  });

  it("throws on a non-object value", () => {
    expect(() => mergeMediaOrderWrite(current, "a hero image")).toThrow(
      /expects an object value/,
    );
  });

  it("refuses to clear the brief", () => {
    expect(() => mergeMediaOrderWrite(current, { brief: "   " })).toThrow(
      /non-empty string/,
    );
  });

  it("accepts numeric and string dimensions and stores digit strings", () => {
    const next = mergeMediaOrderWrite(current, { width: 1920, height: "640" });
    expect(next.width).toBe("1920");
    expect(next.height).toBe("640");
  });

  it("treats an empty dimension string as clearing the override", () => {
    const withOverride = { ...current, width: "1920" };
    expect(mergeMediaOrderWrite(withOverride, { width: "" }).width).toBe("");
  });

  it.each([0, -10, 12.5, "wide", 99999])(
    "throws on the invalid dimension %p instead of coercing it",
    (bad) => {
      expect(() => mergeMediaOrderWrite(current, { width: bad })).toThrow(
        /width must be/,
      );
    },
  );

  it("starts from a draft whose type is a real preset", () => {
    expect(MEDIA_ORDER_PRESET_IDS).toContain(EMPTY_MEDIA_ORDER_DRAFT.type);
  });
});

describe("validateMediaStandardsSlotsWrite", () => {
  const mint = () => {
    let n = 0;
    return () => `slot-${++n}`;
  };

  it("replaces the full list, minting ids and normalizing values", () => {
    const slots = validateMediaStandardsSlotsWrite(
      {
        slots: [
          {
            name: "  Hero  ",
            width: 1600,
            height: "900",
            format: " WEBP ",
            max_kb: 250,
            notes: " lead image ",
          },
          { name: "Thumbnail" },
        ],
      },
      mint(),
    );
    expect(slots).toEqual([
      {
        id: "slot-1",
        name: "Hero",
        width: 1600,
        height: 900,
        format: "webp",
        maxKb: 250,
        notes: "lead image",
      },
      {
        id: "slot-2",
        name: "Thumbnail",
        width: null,
        height: null,
        format: null,
        maxKb: null,
        notes: "",
      },
    ]);
  });

  it("refuses an empty slot list — wiping the standards stays human", () => {
    expect(() =>
      validateMediaStandardsSlotsWrite({ slots: [] }, mint()),
    ).toThrow(/must not be empty/);
  });

  it("throws when slots is not an array", () => {
    expect(() =>
      validateMediaStandardsSlotsWrite({ slots: "Hero, OG" }, mint()),
    ).toThrow(/slots must be an array/);
  });

  it("requires a name on every slot", () => {
    expect(() =>
      validateMediaStandardsSlotsWrite({ slots: [{ width: 100 }] }, mint()),
    ).toThrow(/slots\[0\]\.name must be a non-empty string/);
  });

  it("rejects duplicate slot names case-insensitively", () => {
    expect(() =>
      validateMediaStandardsSlotsWrite(
        { slots: [{ name: "Hero" }, { name: "hero" }] },
        mint(),
      ),
    ).toThrow(/duplicates an earlier slot/);
  });

  it("rejects unknown slot fields", () => {
    expect(() =>
      validateMediaStandardsSlotsWrite(
        { slots: [{ name: "Hero", maxKb: 250 }] },
        mint(),
      ),
    ).toThrow(/unknown field\(s\) maxKb/);
  });

  it("rejects a non-integer dimension", () => {
    expect(() =>
      validateMediaStandardsSlotsWrite(
        { slots: [{ name: "Hero", width: 12.5 }] },
        mint(),
      ),
    ).toThrow(/width must be a positive whole number/);
  });
});

describe("validateMediaStandardsNotesWrite", () => {
  it("returns the trimmed notes", () => {
    expect(
      validateMediaStandardsNotesWrite({ notes: "  Prefer webp.  " }),
    ).toBe("Prefer webp.");
  });

  it("allows clearing the notes", () => {
    expect(validateMediaStandardsNotesWrite({ notes: "" })).toBe("");
  });

  it("throws on a non-string", () => {
    expect(() => validateMediaStandardsNotesWrite({ notes: 42 })).toThrow(
      /notes must be a string/,
    );
  });

  it("throws on unknown fields", () => {
    expect(() =>
      validateMediaStandardsNotesWrite({ notes: "ok", slots: [] }),
    ).toThrow(/unknown field\(s\) slots/);
  });
});
