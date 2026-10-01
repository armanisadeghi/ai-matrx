// features/unified-data/__tests__/a-table-opens-in-its-own-organization.test.ts
//
// THE USE CASE. admin@admin.com opens "Heat Pump Field Research" from a link while working in a
// different organization. The table names its own organization (`custom.where_id_opens`), and that
// is the organization the store's doors are handed — never the one he is working in. A table he
// was never given is "nowhere"; a store that could not be asked is "unknown", never "nowhere".

import type { SupabaseClient } from "@supabase/supabase-js";

import { whereThisTableLives } from "../whereThisTableLives";

const HEAT_PUMP = "5d1c7e2a-4b6f-4c1d-9a2e-8f0b3c5d7e91";
const ADMIN_WORKSPACE = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

type Answer = { data: unknown; error: { code?: string; message: string } | null };

function clientAnswering(answer: "table" | "not-given" | Error): { client: SupabaseClient; asked: string[] } {
  const asked: string[] = [];
  const rpc = async (fn: string): Promise<Answer> => {
    asked.push(fn);
    if (fn !== "where_id_opens") return { data: null, error: { message: `unexpected door ${fn}` } };
    if (answer instanceof Error) return { data: null, error: { message: answer.message } };
    if (answer === "not-given") return { data: null, error: null };
    return { data: { kind: "table", organization_id: ADMIN_WORKSPACE, path: `/data-v2/${HEAT_PUMP}`, live: true }, error: null };
  };
  const client = { schema: () => ({ rpc }), rpc } as unknown as SupabaseClient;
  return { client, asked };
}

describe("a table opens in its own organization", () => {
  it("a table he may open answers its own organization, asked of one door", async () => {
    const { client, asked } = clientAnswering("table");
    const where = await whereThisTableLives(client, HEAT_PUMP);
    expect(where).toEqual({ kind: "record_store", href: `/data-v2/${HEAT_PUMP}`, organizationId: ADMIN_WORKSPACE });
    expect(asked).toEqual(["where_id_opens"]);
  });

  it("a table he was never given is nowhere", async () => {
    const { client } = clientAnswering("not-given");
    expect(await whereThisTableLives(client, HEAT_PUMP)).toEqual({ kind: "nowhere" });
  });

  it("a store that could not be asked says so, never 'nowhere'", async () => {
    const { client } = clientAnswering(new Error("connection reset"));
    const where = await whereThisTableLives(client, HEAT_PUMP);
    expect(where.kind).toBe("unknown");
  });
});
