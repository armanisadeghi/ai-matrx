import {
  collectProblems,
  collectionWriteHandlers,
  formatProblems,
  ListLevelProblem,
  ProblemList,
  problemsOf,
  readCollectionList,
  refuseRepeats,
  repeatsProblem,
  WriteProblemsError,
} from "../collection-write-targets";

class Refusal extends Error {}
const refuse = (m: string): never => {
  throw new Refusal(m);
};

type Item = { name: string };
const parse = (value: unknown) => {
  const list = readCollectionList("create_things", "things", value) as Item[];
  refuseRepeats("create_things", list.map((i) => i.name), "name");
  return list;
};

describe("collectionWriteHandlers", () => {
  it("names the targets by record type and only for the operations given", () => {
    const h = collectionWriteHandlers(
      { plural: "things", singular: "thing", create: { parse, run: async () => ({ id: "1", name: "a" }), nameOf: (i: Item) => i.name } },
      refuse,
    );
    expect(Object.keys(h)).toEqual(["create_things"]);
  });

  it("validates the whole list before anything is saved", async () => {
    const run = jest.fn(async (i: Item) => ({ id: i.name, name: i.name }));
    const h = collectionWriteHandlers(
      { plural: "things", singular: "thing", create: { parse, run, nameOf: (i: Item) => i.name } },
      refuse,
    );
    expect(() => h.create_things.validate!([{ name: "a" }, { name: "A " }])).toThrow(/more than once/);
    expect(() => h.create_things.validate!("nope")).toThrow(/ARRAY/);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns what landed, with ids, for the agent", async () => {
    const h = collectionWriteHandlers(
      {
        plural: "things",
        singular: "thing",
        create: { parse, run: async (i: Item) => ({ id: `id-${i.name}`, name: i.name, slug: i.name }), nameOf: (i: Item) => i.name },
      },
      refuse,
    );
    const out = await h.create_things.apply([{ name: "a" }, { name: "b" }]);
    expect(out).toEqual({
      summary: 'Created 2 things: "a" (id id-a, slug a); "b" (id id-b, slug b).',
      data: { things: [{ id: "id-a", name: "a", slug: "a" }, { id: "id-b", name: "b", slug: "b" }] },
    });
  });

  it("a part-way failure names what was done and what was not attempted", async () => {
    const h = collectionWriteHandlers(
      {
        plural: "things",
        singular: "thing",
        create: {
          parse,
          run: async (i: Item) => {
            if (i.name === "b") throw new Error("db said no");
            return { id: `id-${i.name}`, name: i.name };
          },
          nameOf: (i: Item) => i.name,
        },
      },
      refuse,
    );
    await expect(h.create_things.apply([{ name: "a" }, { name: "b" }, { name: "c" }])).rejects.toThrow(
      'Created 1 of 3 things ("a" (id id-a)). "b" failed: db said no. Not attempted: c.',
    );
  });

  it("turns an error into a refusal only when nothing was saved yet", async () => {
    const h = collectionWriteHandlers(
      {
        plural: "things",
        singular: "thing",
        create: {
          parse,
          run: async () => {
            throw new Error("cancelled");
          },
          nameOf: (i: Item) => i.name,
          refusalFor: () => "ask which workspace",
        },
      },
      refuse,
    );
    await expect(h.create_things.apply([{ name: "a" }])).rejects.toBeInstanceOf(Refusal);
  });

  it("accepts { <plural>: [...] } and caps the list", () => {
    expect(readCollectionList("t", "things", { things: [1] })).toEqual([1]);
    expect(() => readCollectionList("t", "things", [])).toThrow(/at least one/);
    expect(() => readCollectionList("t", "things", new Array(26).fill(0))).toThrow(/at most 25/);
  });
});

describe("collectProblems (every problem at once)", () => {
  const checkOne = (raw: unknown, i: number) => {
    const item = raw as { name?: string; date?: string };
    if (!item.name) throw new Error(`t[${i}].name is required.`);
    if (item.date === "bad") throw new Error(`t[${i}].date must be YYYY-MM-DD.`);
    return item.name;
  };
  const nameOf = (raw: unknown) => (raw as { name?: string }).name;

  it("returns every result when nothing is wrong", () => {
    expect(collectProblems("t", [{ name: "a" }, { name: "b" }], checkOne, { nameOf })).toEqual(["a", "b"]);
  });

  it("lists per-item problems first, labelled by position and name, then list-level ones", () => {
    let message = "";
    try {
      collectProblems("t", [{ name: "a" }, { name: "g", date: "bad" }, { name: "G" }, {}], checkOne, {
        nameOf,
        listChecks: (items) => [
          repeatsProblem("t", items.map((i) => i.name), "name"),
          items.some((i) => i.name === "a") && 'The person already has "a".',
        ],
      });
    } catch (e) {
      expect(e).toBeInstanceOf(WriteProblemsError);
      expect((e as WriteProblemsError).problems).toHaveLength(4);
      message = (e as Error).message;
    }
    expect(message).toBe(
      [
        "t was refused: 4 problems.",
        '1. t[1] "g": date must be YYYY-MM-DD.',
        "2. t[3].name is required.",
        '3. t lists the same name more than once: "g" (at [1], [2]). Keep one of each.',
        '4. The person already has "a".',
        "Fix all of them and send the whole value again. Nothing was changed.",
      ].join("\n"),
    );
  });

  it("flattens a WriteProblemsError from one item and defers a ListLevelProblem", () => {
    const e = (() => {
      try {
        collectProblems("t", ["x", "y"], (raw, i) => {
          if (raw === "x") {
            const p = new ProblemList(`t[${i}]`);
            p.add(`t[${i}].a is bad.`);
            p.add(`t[${i}].b is bad.`);
            p.throwIfAny();
          }
          throw new ListLevelProblem(`t[${i}] "y" is not a known id. Nothing was deleted.`);
        });
      } catch (err) {
        return err as WriteProblemsError;
      }
      throw new Error("expected a refusal");
    })();
    expect(e.problems).toEqual(["t[0].a is bad.", "t[0].b is bad.", 't[1] "y" is not a known id. Nothing was deleted.']);
    // Each problem's own "Nothing was …" is folded into the one closing line.
    expect(e.message.match(/Nothing was/g)).toHaveLength(1);
    expect(e.message.endsWith("Nothing was changed.")).toBe(true);
  });

  it("a single problem reads as one sentence", () => {
    expect(() => collectProblems("t", [{}], checkOne)).toThrow(/^t\[0\]\.name is required\. Nothing was changed\.$/);
  });

  it("problemsOf reads plain errors too", () => {
    expect(problemsOf(new Error("x"))).toEqual(["x"]);
    expect(formatProblems("t", ["a. Nothing was saved.", "b."])).toContain("1. a.\n2. b.");
  });
});
