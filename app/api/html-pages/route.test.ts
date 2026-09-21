/** @jest-environment node */

import { NextRequest } from "next/server";

type ListedPage = {
  id: string;
  meta_title: string;
  meta_description: string | null;
  is_indexable: boolean;
  created_at: string;
  updated_at: string;
  meta_keywords: string | null;
  og_image: string | null;
  canonical_url: string | null;
  artifact_id: string | null;
  source_message_id: string | null;
  source_conv_id: string | null;
};

type QueryResult = {
  data: ListedPage[] | null;
  error: { message: string; code?: string } | null;
  count: number | null;
};

const getClaimsUser = jest.fn();
const from = jest.fn();
const range = jest.fn<Promise<QueryResult>, [number, number]>();

type QueryBuilder = {
  select: jest.Mock<QueryBuilder, [string, { count: "exact" }]>;
  eq: jest.Mock<QueryBuilder, [string, string]>;
  order: jest.Mock<QueryBuilder, [string, { ascending: boolean }]>;
  range: (start: number, end: number) => Promise<QueryResult>;
};

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({})),
}));
jest.mock("@/utils/supabase/resolveUser", () => ({
  getClaimsUser: (...args: unknown[]) => getClaimsUser(...args),
}));
jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from }),
}));

process.env.NEXT_PUBLIC_SUPABASE_HTML_URL = "https://html.test.invalid";
process.env.SUPABASE_HTML_SECRET_KEY = "test-secret-not-a-real-key";

const { POST } = require("./route") as typeof import("./route");

function page(id: number): ListedPage {
  return {
    id: `page-${id}`,
    meta_title: `Page ${id}`,
    meta_description: null,
    is_indexable: true,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-02T00:00:00.000Z",
    meta_keywords: null,
    og_image: null,
    canonical_url: null,
    artifact_id: null,
    source_message_id: null,
    source_conv_id: null,
  };
}

function listRequest() {
  return new NextRequest("https://www.aimatrx.com/api/html-pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list" }),
  });
}

function setQueryResults(resultForRange: (from: number) => QueryResult) {
  from.mockImplementation(() => {
    let builder: QueryBuilder;
    builder = {
      select: jest.fn<QueryBuilder, [string, { count: "exact" }]>(
        () => builder,
      ),
      eq: jest.fn<QueryBuilder, [string, string]>(() => builder),
      order: jest.fn<QueryBuilder, [string, { ascending: boolean }]>(
        () => builder,
      ),
      range: (start: number, end: number) => range(start, end),
    };
    return builder;
  });
  range.mockImplementation(async (start) => resultForRange(start));
}

beforeEach(() => {
  jest.clearAllMocks();
  getClaimsUser.mockResolvedValue({
    data: { user: { id: "owner-1" } },
    error: null,
  });
});

it("returns every counted page past PostgREST's 1,000-row cap", async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => page(index));
  const lastPage = [page(1000)];
  setQueryResults((start) => {
    if (start === 0) return { data: firstPage, error: null, count: 1001 };
    if (start === 1000) return { data: lastPage, error: null, count: 1001 };
    throw new Error(`unexpected page offset ${start}`);
  });

  const response = await POST(listRequest());
  const body = (await response.json()) as { pages: ListedPage[] };

  expect(response.status).toBe(200);
  expect(body.pages).toHaveLength(1001);
  expect(body.pages.at(-1)?.id).toBe("page-1000");
  expect(range.mock.calls).toEqual([
    [0, 999],
    [1000, 1999],
  ]);

  const firstBuilder = from.mock.results[0]?.value;
  expect(firstBuilder.eq).toHaveBeenCalledWith("user_id", "owner-1");
  expect(firstBuilder.order).toHaveBeenNthCalledWith(1, "updated_at", {
    ascending: false,
  });
  expect(firstBuilder.order).toHaveBeenNthCalledWith(2, "id", {
    ascending: false,
  });
  expect(firstBuilder.select).toHaveBeenCalledWith(
    expect.any(String),
    { count: "exact" },
  );
});

it("refuses to claim a complete library when a later page fails", async () => {
  setQueryResults((start) => {
    if (start === 0) {
      return {
        data: Array.from({ length: 1000 }, (_, index) => page(index)),
        error: null,
        count: 1001,
      };
    }
    return {
      data: null,
      error: { message: "connection interrupted" },
      count: null,
    };
  });

  const consoleError = jest.spyOn(console, "error").mockImplementation();
  const response = await POST(listRequest());
  const body = (await response.json()) as { error: string };

  expect(response.status).toBe(500);
  expect(body.error).toContain("readAllRows(html_pages owner-scoped list)");
  expect(body.error).toContain("connection interrupted");
  expect(range.mock.calls).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
  expect(consoleError).toHaveBeenCalledWith(
    "[html-pages API] list error:",
    expect.any(Error),
  );
  consoleError.mockRestore();
});

it("keeps the owner-scoped legacy-column fallback complete", async () => {
  const legacyRows = [page(1)];
  let currentColumnsFailed = false;
  setQueryResults(() => {
    if (!currentColumnsFailed) {
      currentColumnsFailed = true;
      return {
        data: null,
        error: { message: "meta_keywords does not exist", code: "42703" },
        count: null,
      };
    }
    return { data: legacyRows, error: null, count: 1 };
  });

  const response = await POST(listRequest());
  const body = (await response.json()) as {
    pages: Array<ListedPage & { meta_keywords: null }>;
  };

  expect(response.status).toBe(200);
  expect(body.pages).toHaveLength(1);
  expect(body.pages[0]?.meta_keywords).toBeNull();
  expect(from).toHaveBeenCalledTimes(2);
  for (const builderResult of from.mock.results) {
    expect(builderResult.value.eq).toHaveBeenCalledWith("user_id", "owner-1");
    expect(builderResult.value.select).toHaveBeenCalledWith(
      expect.any(String),
      { count: "exact" },
    );
  }
});

export {};
