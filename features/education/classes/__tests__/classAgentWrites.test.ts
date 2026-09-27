import {
  parseClassWriteFields,
  parseCreateClassesValue,
  parseDeleteClassesValue,
  parseNewClassDraftValue,
  parseUpdateClassesValue,
  type CurrentClass,
} from "../classAgentWrites";

describe("create_classes value", () => {
  it("creates a list with every field, defaulting access to closed", () => {
    const inputs = parseCreateClassesValue(
      [
        {
          name: "Physics 101",
          teacher: "Dr. Chen",
          term: "Fall 2026",
          period: 2,
          exam_dates: [{ title: "Midterm", date: "2026-10-15" }],
        },
        { name: "Spanish II", access_mode: "paid", price: 29 },
        { name: "History 210", access_mode: "Open" },
      ],
      [],
    );
    expect(inputs.map((i) => i.name)).toEqual([
      "Physics 101",
      "Spanish II",
      "History 210",
    ]);
    expect(inputs[0].settings).toMatchObject({
      teacher: "Dr. Chen",
      term: "Fall 2026",
      period: "2",
      accessMode: "closed",
      examDates: [{ title: "Midterm", date: "2026-10-15" }],
    });
    expect(inputs[1].settings).toMatchObject({
      accessMode: "paid",
      priceCents: 2900,
    });
    expect(inputs[2].settings?.accessMode).toBe("open");
  });

  it("accepts { classes: [...] } as well as a bare array", () => {
    expect(
      parseCreateClassesValue({ classes: [{ name: "Art" }] }, []),
    ).toHaveLength(1);
  });

  it("refuses the whole list when one entry is bad", () => {
    expect(() =>
      parseCreateClassesValue([{ name: "Ok" }, { name: "" }], []),
    ).toThrow(/create_classes\[1\]\.name/);
    expect(() =>
      parseCreateClassesValue(
        [{ name: "Ok", exam_dates: [{ title: "Final", date: "2026-02-30" }] }],
        [],
      ),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      parseCreateClassesValue([{ name: "Ok", access_mode: "paid" }], []),
    ).toThrow(/needs price/);
    expect(() =>
      parseCreateClassesValue([{ name: "Ok", price: 10 }], []),
    ).toThrow(/only a "paid" class/);
    expect(() =>
      parseCreateClassesValue([{ name: "Ok", colour: "red" }], []),
    ).toThrow(/does not accept colour/);
  });

  it("refuses duplicates in the list and names the person already has", () => {
    expect(() =>
      parseCreateClassesValue([{ name: "Art" }, { name: "art " }], []),
    ).toThrow(/more than once/);
    expect(() =>
      parseCreateClassesValue([{ name: "Physics 101" }], ["physics 101"]),
    ).toThrow(/already has "Physics 101"/);
  });

  it("refuses a non-list, an empty list and an oversized list", () => {
    expect(() => parseCreateClassesValue({ name: "Art" }, [])).toThrow(
      /ARRAY/,
    );
    expect(() => parseCreateClassesValue([], [])).toThrow(/at least one/);
    expect(() =>
      parseCreateClassesValue(
        Array.from({ length: 26 }, (_, i) => ({ name: `C${i}` })),
        [],
      ),
    ).toThrow(/at most 25/);
  });
});

describe("new_class_draft value", () => {
  it("reads only the fields given", () => {
    expect(
      parseClassWriteFields("new_class_draft", {
        access_mode: "paid",
        price: "$19.99",
      }),
    ).toEqual({ accessMode: "paid", price: 19.99 });
  });

  it("refuses an empty draft", () => {
    expect(() => parseNewClassDraftValue({})).toThrow(/at least one field/);
    expect(parseNewClassDraftValue({ name: "Art" })).toEqual({ name: "Art" });
  });
});

const chem: CurrentClass = {
  id: "c-chem",
  slug: "chemistry-h",
  name: "Chemistry (H)",
  description: "Wrong text",
  settings: {
    examDates: [{ id: "e1", title: "Midterm", date: "2026-10-01" }],
    teacher: "Dr. Lee",
    term: "Fall 2026",
    period: "4",
    color: "#ff0000",
    accessMode: "closed",
  },
};
const spanish: CurrentClass = {
  id: "c-span",
  slug: "spanish-ii",
  name: "Spanish II",
  description: "",
  settings: { examDates: [], accessMode: "paid", priceCents: 2900 },
};
const oldArt: CurrentClass = {
  id: "c-art",
  slug: "art",
  name: "Art",
  description: "",
  settings: { examDates: [], accessMode: "open", archived: true },
};
const current = [chem, spanish, oldArt];

describe("update_classes value", () => {
  it("changes only the fields sent and merges onto current settings", () => {
    const [plan] = parseUpdateClassesValue(
      [
        {
          id: "c-chem",
          description: "Honors chemistry",
          exam_dates: [{ title: "Final", date: "2026-12-15" }],
        },
      ],
      current,
    );
    expect(plan.patch.name).toBeUndefined();
    expect(plan.patch.description).toBe("Honors chemistry");
    expect(plan.patch.settings).toMatchObject({
      teacher: "Dr. Lee",
      term: "Fall 2026",
      period: "4",
      color: "#ff0000",
      accessMode: "closed",
      examDates: [{ title: "Final", date: "2026-12-15" }],
    });
    expect(plan.patch.settings.examDates).toHaveLength(1);
    expect(plan.accessModeChanged).toBe(false);
    expect(plan.changed).toEqual(["description", "exam_dates"]);
  });

  it("clears a text field sent as an empty string", () => {
    const [plan] = parseUpdateClassesValue(
      [{ id: "c-chem", teacher: "" }],
      current,
    );
    expect(plan.patch.settings.teacher).toBeUndefined();
    expect(plan.patch.settings.term).toBe("Fall 2026");
  });

  it("archives and restores, and updates an archived class", () => {
    const plans = parseUpdateClassesValue(
      [
        { id: "c-chem", archived: true },
        { id: "c-art", archived: false, name: "Art History" },
      ],
      current,
    );
    expect(plans[0].patch.settings.archived).toBe(true);
    expect(plans[1].patch.settings.archived).toBe(false);
    expect(plans[1].patch.name).toBe("Art History");
    expect(() =>
      parseUpdateClassesValue([{ id: "c-art", archived: "yes" }], current),
    ).toThrow(/archived must be true/);
  });

  it("keeps the current price for a paid class and drops it when leaving paid", () => {
    const [keep] = parseUpdateClassesValue(
      [{ id: "c-span", term: "Spring 2027" }],
      current,
    );
    expect(keep.patch.settings.priceCents).toBe(2900);
    const [open] = parseUpdateClassesValue(
      [{ id: "c-span", access_mode: "open" }],
      current,
    );
    expect(open.patch.settings).toMatchObject({ accessMode: "open" });
    expect(open.patch.settings.priceCents).toBeUndefined();
    expect(open.accessModeChanged).toBe(true);
    const [paid] = parseUpdateClassesValue(
      [{ id: "c-chem", access_mode: "paid", price: 15 }],
      current,
    );
    expect(paid.patch.settings.priceCents).toBe(1500);
  });

  it("refuses paid without a price and a price on a non-paid class", () => {
    expect(() =>
      parseUpdateClassesValue([{ id: "c-chem", access_mode: "paid" }], current),
    ).toThrow(/no price/);
    expect(() =>
      parseUpdateClassesValue([{ id: "c-chem", price: 10 }], current),
    ).toThrow(/only a "paid" class/);
    expect(() =>
      parseUpdateClassesValue(
        [{ id: "c-span", access_mode: "closed", price: 10 }],
        current,
      ),
    ).toThrow(/would be "closed"/);
  });

  it("refuses unknown ids, repeated ids, a missing id and an empty change", () => {
    expect(() =>
      parseUpdateClassesValue([{ id: "nope", name: "X" }], current),
    ).toThrow(/"nope" is not one of the person's classes/);
    expect(() =>
      parseUpdateClassesValue(
        [
          { id: "c-chem", name: "A" },
          { id: "c-chem", term: "B" },
        ],
        current,
      ),
    ).toThrow(/more than once/);
    expect(() =>
      parseUpdateClassesValue([{ name: "X" }], current),
    ).toThrow(/id is required/);
    expect(() =>
      parseUpdateClassesValue([{ id: "c-chem" }], current),
    ).toThrow(/changes nothing/);
    expect(() =>
      parseUpdateClassesValue([{ id: "c-chem", colour: "red" }], current),
    ).toThrow(/does not accept colour/);
  });

  it("refuses a rename onto another class's name, but allows a swap", () => {
    expect(() =>
      parseUpdateClassesValue([{ id: "c-chem", name: "spanish ii" }], current),
    ).toThrow(/another class \(c-span\) is named "Spanish II"/);
    expect(() =>
      parseUpdateClassesValue([{ id: "c-chem", name: "art" }], current),
    ).toThrow(/is named "Art"/);
    expect(
      parseUpdateClassesValue(
        [
          { id: "c-chem", name: "Spanish II" },
          { id: "c-span", name: "Chemistry (H)" },
        ],
        current,
      ),
    ).toHaveLength(2);
    expect(
      parseUpdateClassesValue([{ id: "c-chem", name: "chemistry (h)" }], current),
    ).toHaveLength(1);
  });

  it("refuses a non-list", () => {
    expect(() =>
      parseUpdateClassesValue({ id: "c-chem", name: "X" }, current),
    ).toThrow(/ARRAY/);
    expect(() => parseUpdateClassesValue([], current)).toThrow(/at least one/);
  });
});

describe("delete_classes value", () => {
  it("accepts ids and { id } objects, archived classes included", () => {
    expect(
      parseDeleteClassesValue(["c-chem", { id: "c-art" }], current).map(
        (c) => c.name,
      ),
    ).toEqual(["Chemistry (H)", "Art"]);
    expect(parseDeleteClassesValue({ ids: ["c-span"] }, current)).toHaveLength(1);
  });

  it("refuses unknown ids, repeats and a non-list", () => {
    expect(() => parseDeleteClassesValue(["c-chem", "zzz"], current)).toThrow(
      /"zzz" is not one of the person's classes/,
    );
    expect(() =>
      parseDeleteClassesValue(["c-chem", { id: "c-chem" }], current),
    ).toThrow(/more than once/);
    expect(() => parseDeleteClassesValue("c-chem", current)).toThrow(/ARRAY/);
    expect(() => parseDeleteClassesValue([], current)).toThrow(/at least one/);
  });
});
