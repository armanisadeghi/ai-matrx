import {
  parseClassWriteFields,
  parseCreateClassesValue,
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
});
