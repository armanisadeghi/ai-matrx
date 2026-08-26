import { assertStarterPackDetail } from "./data";

const validDetail = () => ({
  pack: { id: "pack-1" },
  topics: [],
  value_bands: [],
  geo_bands: [],
  geo_areas: [],
  meaning: [],
});

describe("assertStarterPackDetail", () => {
  it("accepts the complete RPC collection contract", () => {
    expect(assertStarterPackDetail(validDetail())).toEqual(validDetail());
  });

  it.each(["topics", "value_bands", "geo_bands", "geo_areas", "meaning"])(
    "rejects a response without the %s collection before render",
    (key) => {
      const response: Record<string, unknown> = validDetail();
      delete response[key];

      expect(() => assertStarterPackDetail(response)).toThrow(
        `missing required collections: ${key}`,
      );
    },
  );

  it("reports every malformed collection in one boundary error", () => {
    expect(() =>
      assertStarterPackDetail({
        ...validDetail(),
        meaning: undefined,
        topics: null,
      }),
    ).toThrow("missing required collections: topics, meaning");
  });
});
