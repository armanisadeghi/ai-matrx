/**
 * @jest-environment node
 *
 * LIVE, READ-ONLY. A KIND'S COUNT IS THE LENGTH OF ITS LIST (A5-P, 2026-09-29).
 *
 * The real use case: the admin organization's workspace said "Files 6575", and the Files page under
 * it listed 500 rows — mostly thumbnails, provider payloads and recording chunks — and stopped. A
 * person could never reach the rest, and the number on the tile described files nobody would pick.
 * The count and the list now come from one database filter (`platform._inventory_filter`):
 * `entity_kind_counts` counts it and `reference_search_candidates` pages through it, recent first.
 *
 * Signed in as admin@admin.com with the publishable key — the person's own seat, no service key.
 * Nothing is written.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Read the real values from the files: jest.setup.ts seeds a dummy localhost Supabase URL into
// process.env for unit tests, so process.env cannot be trusted for a live suite.
function envFile(rel: string): Record<string, string> {
  const file = path.resolve(__dirname, rel);
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}
const ENV = { ...envFile("../../../../../aidream/.env"), ...envFile("../../../../.env.local") };
const URL_ = ENV.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = ENV.AI_ADMIN_USERNAME ?? "";
const PASSWORD = ENV.AI_ADMIN_PASSWORD ?? "";
const READY = Boolean(URL_ && KEY && EMAIL && PASSWORD);
const describeLive = READY ? describe : describe.skip;

/** The organization admin@admin.com works in (slug "admin") — the one with the large file library. */
const ADMIN_ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const PAGE = 200; // the server's page cap

let client: SupabaseClient;

type Scope = { p_mine: true } | { p_organization_id: string };

async function countOf(token: string, scope: Scope): Promise<number | null> {
  const { data, error } = await client.rpc("entity_kind_counts", { p_tokens: [token], ...scope });
  if (error) throw new Error(`entity_kind_counts ${token}: ${error.message}`);
  const row = (data as { token: string; n: number | null }[]).find((r) => r.token === token);
  return row ? row.n : null;
}

async function page(token: string, scope: Scope, offset: number, search?: string) {
  const { data, error } = await client.rpc("reference_search_candidates", {
    p_token: token,
    p_order: "recent",
    p_limit: PAGE,
    p_offset: offset,
    ...(search ? { p_search: search } : {}),
    ...scope,
  });
  if (error) throw new Error(`reference_search_candidates ${token}: ${error.message}`);
  return data as { id: string; title: string; updated_at: string | null }[];
}

async function everyId(token: string, scope: Scope): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await page(token, scope, offset);
    ids.push(...rows.map((r) => r.id));
    if (rows.length < PAGE) return ids;
  }
}

describeLive("a kind's count is the length of its list", () => {
  jest.setTimeout(180_000);

  beforeAll(async () => {
    client = createSupabaseClient(URL_, KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signed.error || !signed.data.user) throw new Error(`sign-in failed: ${signed.error?.message}`);
    expect(signed.data.user.email).toBe("admin@admin.com");
  });

  it("the organization's Files tile counts exactly the files its page can list, each once", async () => {
    const scope = { p_organization_id: ADMIN_ORG } as const;
    const counted = await countOf("file", scope);
    const ids = await everyId("file", scope);
    expect(counted).not.toBeNull();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(counted);
    // The large-library case this was built for: more than one page, so paging is exercised.
    expect(ids.length).toBeGreaterThan(PAGE);
  });

  it("every kind the Source input offers counts what 'mine' lists", async () => {
    const { data, error } = await client.rpc("entity_kind_counts", { p_mine: true });
    if (error) throw new Error(error.message);
    const rows = data as { token: string; n: number | null }[];
    expect(rows.map((r) => r.token).sort()).toEqual(
      ["dataset", "file", "note", "transcript", "udt_document", "workbook"],
    );
    for (const row of rows) {
      expect({ token: row.token, listed: (await everyId(row.token, { p_mine: true })).length }).toEqual({
        token: row.token,
        listed: row.n,
      });
    }
  });

  it("the list is most recent first", async () => {
    const rows = await page("file", { p_organization_id: ADMIN_ORG }, 0);
    const stamps = rows.map((r) => r.updated_at ?? "");
    expect(stamps).toEqual([...stamps].sort().reverse());
  });

  it("a name search finds an item that is not on the first page", async () => {
    const scope = { p_organization_id: ADMIN_ORG } as const;
    const second = await page("file", scope, PAGE);
    expect(second.length).toBeGreaterThan(0);
    const target = second[Math.floor(second.length / 2)]!;
    const found = await page("file", scope, 0, target.title);
    expect(found.map((r) => r.id)).toContain(target.id);
  });
});
