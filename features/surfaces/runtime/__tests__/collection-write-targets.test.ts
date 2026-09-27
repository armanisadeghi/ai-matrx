import {
  collectionWriteHandlers,
  readCollectionList,
  refuseRepeats,
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
