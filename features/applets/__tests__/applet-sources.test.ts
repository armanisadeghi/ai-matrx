/**
 * appletSources keeps every arm of the record's sources — including a table the draft asks for.
 *
 * Found 2026-10-07 (lane P): it dropped `new_table` sources, so editing sources in Settings on an
 * undeployed draft saved the record WITHOUT its pending tables — "Use it" then had nothing to make
 * and the app read aliases no source declared.
 */
import { appletSources, type AppletDefinition } from "../types";
import type { Json } from "@/types/database.types";

const brands = { name: "Brands", label_singular: "Brand", title_field: "name", fields: [{ key: "name", label: "Name", type: "text" }] };

function app(sources: unknown): Pick<AppletDefinition, "sources"> {
  return { sources: sources as Json };
}

test("a declared table survives, beside her table and a record type", () => {
  const out = appletSources(
    app([
      { alias: "brands", new_table: brands },
      { alias: "clients", table_id: "t-1", organization_id: "o-1" },
      { alias: "notes", entity: "note" },
    ]),
  );
  expect(out).toEqual([
    { alias: "brands", new_table: brands },
    { alias: "clients", table_id: "t-1", organization_id: "o-1" },
    { alias: "notes", entity: "note" },
  ]);
});

test("the empty arms a strict provider wire fills in never decide", () => {
  const out = appletSources(
    app([
      // A declaration the wire padded with empty ids: the named declaration wins.
      { alias: "posts", entity: "", table_id: "", organization_id: "", new_table: { ...brands, name: "Posts" } },
      // A bound table the wire padded with an empty declaration: the table wins.
      { alias: "clients", entity: "", table_id: "t-1", organization_id: "o-1", new_table: { name: "", fields: [] } },
    ]),
  );
  expect(out).toEqual([
    { alias: "posts", new_table: { ...brands, name: "Posts" } },
    { alias: "clients", table_id: "t-1", organization_id: "o-1" },
  ]);
});

test("a source with no alias, or nothing to read, is not invented", () => {
  expect(appletSources(app([{ table_id: "t-1", organization_id: "o-1" }, { alias: "x" }, "junk"]))).toEqual([]);
});
