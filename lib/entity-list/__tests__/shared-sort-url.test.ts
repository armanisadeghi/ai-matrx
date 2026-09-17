import { readSortFromParams, sortToParamPatch } from "../urlQuery";

describe("a shared favorite sort does not inherit the recipient's preferences", () => {
  it.each(["asc", "desc"] as const)(
    "preserves explicit %s order",
    (direction) => {
      const selection = { sort: "favorite", direction };
      const patch = sortToParamPatch(selection);
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(patch)) {
        if (value !== null) params.set(key, value);
      }
      expect(
        readSortFromParams(params, {
          sort: "updated",
          direction: direction === "asc" ? "desc" : "asc",
        }),
      ).toEqual(selection);
    },
  );
});
