import { buildTableImpactPageQuery } from "./queryBuilders";
import { fetchAllTableImpactRows } from "./tableImpactPagination";

const row = (index: number) => ({
  function_sig: `public.fn_${index}()`,
  dependency: "catalog",
  currently_broken: index % 2 === 0,
  referenced_columns: [`column_${index}`],
});

describe("table impact pagination", () => {
  it("reads all 1,001 counted impact rows instead of accepting a 1,000-row first response", async () => {
    const source = Array.from({ length: 1001 }, (_, index) => row(index));
    const offsets: number[] = [];
    const request = async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { offset: number };
      offsets.push(body.offset);
      const rows = source.slice(body.offset, body.offset + 500);
      const nextOffset =
        body.offset + rows.length < source.length
          ? body.offset + rows.length
          : null;
      return Response.json({ rows, total: source.length, nextOffset });
    };

    await expect(
      fetchAllTableImpactRows({ schema: "public", table: "orders" }, request),
    ).resolves.toEqual({
      rows: source,
      total: 1001,
    });
    expect(offsets).toEqual([0, 500, 1000]);
  });

  it("keeps the count and ordered page in one materialized source statement", () => {
    const query = buildTableImpactPageQuery("public", "orders", 1000);
    expect(query).toContain("with impact as materialized");
    expect(query).toContain("select count(*) from impact");
    expect(query).toContain("limit 500 offset 1000");
    expect(query).toContain("order by function_sig asc nulls last");
  });
});
