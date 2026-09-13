/** @jest-environment node */
/**
 * The host adapter must be proved through the real supabase-js query builders.
 * A recording fetch is the network boundary; readAllRows, guardedUpdate and
 * the shared snapshot parser remain the installed package implementations.
 */
import type { TableViewSnapshot } from "@ai-matrx/design-system/data-table";
import type { Database } from "@/types/database.types";

type RecordedRequest = {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
  signal: AbortSignal;
};

type TransportResponse = {
  body: unknown;
  status?: number;
  headers?: HeadersInit;
};

const requests: RecordedRequest[] = [];
const responses: TransportResponse[] = [];
let waitForAbort = false;
let requestObserved: (() => void) | null = null;
let abortObserved: (() => void) | null = null;

async function mockRecordingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  const bodyText = await request.clone().text();
  requests.push({
    method: request.method,
    url: new URL(request.url),
    headers: request.headers,
    body: bodyText ? JSON.parse(bodyText) : null,
    signal: request.signal,
  });
  requestObserved?.();

  if (waitForAbort) {
    return new Promise<Response>((_resolve, reject) => {
      request.signal.addEventListener(
        "abort",
        () => {
          abortObserved?.();
          reject(new DOMException("The operation was aborted.", "AbortError"));
        },
        { once: true },
      );
    });
  }

  const response = responses.shift();
  if (!response)
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  return new Response(JSON.stringify(response.body), {
    status: response.status ?? 200,
    headers: { "content-type": "application/json", ...response.headers },
  });
}

jest.mock("@/utils/supabase/client", () => {
  const { createClient } = jest.requireActual<
    typeof import("@supabase/supabase-js")
  >("@supabase/supabase-js");
  return {
    supabase: createClient<Database>(
      "http://localhost:54321",
      "sb_publishable_test",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: mockRecordingFetch },
      },
    ),
  };
});

import {
  createPersonalTableView,
  listPersonalTableViews,
  updatePersonalTableView,
} from "./table-saved-views-service";

const actor = {
  userId: "actor-a",
  accessToken: "captured-token-a",
  organizationId: "org-a",
};
const tableId = "sandboxes/active";
const snapshot = {
  __kind: "matrx-table-view",
  version: 1,
  query: {
    pageSize: 25,
    search: "",
    anyOf: "",
    columnFilters: {},
    sort: null,
  },
  columns: { order: ["name"], hidden: [] },
} satisfies TableViewSnapshot;

function savedRow(id: string, version: number) {
  return {
    id,
    name: `View ${id}`,
    version,
    definition: {
      __kind: "matrx-table-view",
      version: 1,
      format: "canonical-table-snapshot",
      snapshot: JSON.stringify(snapshot),
    },
  };
}

function queryValues(request: RecordedRequest, key: string): string[] {
  return request.url.searchParams.getAll(key);
}

function expectCapturedIdentity(request: RecordedRequest) {
  expect(request.headers.get("authorization")).toBe("Bearer captured-token-a");
  expect(
    request.headers.get("accept-profile") ??
      request.headers.get("content-profile"),
  ).toBe("platform");
}

beforeEach(() => {
  requests.length = 0;
  responses.length = 0;
  waitForAbort = false;
  requestObserved = null;
  abortObserved = null;
});

describe("table saved view transport contract", () => {
  it("refuses a create without an explicit organization before sending a request", async () => {
    await expect(
      createPersonalTableView(
        { ...actor, organizationId: null },
        tableId,
        "My view",
        snapshot,
        new AbortController().signal,
      ),
    ).rejects.toThrow("Choose an organization");

    expect(requests).toEqual([]);
  });

  it("writes the captured actor, explicit organization, personal visibility, table key and tagged definition", async () => {
    responses.push({ body: savedRow("view-a", 1), status: 201 });

    await expect(
      createPersonalTableView(
        actor,
        tableId,
        " My view ",
        snapshot,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ id: "view-a", name: "View view-a", version: 1 });

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request.method).toBe("POST");
    expectCapturedIdentity(request);
    expect(request.body).toEqual(
      expect.objectContaining({
        name: "My view",
        organization_id: "org-a",
        created_by: "actor-a",
        surface_key: "matrx/table/sandboxes/active",
        visibility: "personal",
        definition_version: 1,
        definition: {
          __kind: "matrx-table-view",
          version: 1,
          format: "canonical-table-snapshot",
          snapshot: JSON.stringify(snapshot),
        },
      }),
    );
  });

  it("reads every exact-count page and retains only the actor's personal table views", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      savedRow(`view-${index}`, 1),
    );
    responses.push(
      {
        body: firstPage,
        status: 206,
        headers: { "content-range": "0-999/1001" },
      },
      {
        body: [savedRow("view-1000", 1)],
        status: 206,
        headers: { "content-range": "1000-1000/1001" },
      },
    );

    await expect(
      listPersonalTableViews(actor, tableId, new AbortController().signal),
    ).resolves.toHaveLength(1001);

    expect(requests).toHaveLength(2);
    expect(requests.map((request) => queryValues(request, "offset"))).toEqual([
      ["0"],
      ["1000"],
    ]);
    expect(requests.map((request) => queryValues(request, "limit"))).toEqual([
      ["1000"],
      ["1000"],
    ]);
    for (const request of requests) {
      expect(request.method).toBe("GET");
      expectCapturedIdentity(request);
      expect(queryValues(request, "surface_key")).toEqual([
        "eq.matrx/table/sandboxes/active",
      ]);
      expect(queryValues(request, "created_by")).toEqual(["eq.actor-a"]);
      expect(queryValues(request, "visibility")).toEqual(["eq.personal"]);
      expect(queryValues(request, "deleted_at")).toEqual(["is.null"]);
      expect(queryValues(request, "order")).toEqual(["name.asc,id.asc"]);
    }
  });

  it("refuses an exact-count list when the transport ends before its declared total", async () => {
    responses.push({
      body: [],
      status: 206,
      headers: { "content-range": "0-0/1" },
    });

    await expect(
      listPersonalTableViews(actor, tableId, new AbortController().signal),
    ).rejects.toThrow("Refusing to return a partial list");

    expect(requests).toHaveLength(1);
  });

  it("does not overwrite when a version-guarded update finds a newer personal view", async () => {
    responses.push({ body: [] }, { body: savedRow("view-a", 3) });

    await expect(
      updatePersonalTableView(
        actor,
        tableId,
        { id: "view-a", name: "View view-a", version: 2, snapshot },
        snapshot,
        new AbortController().signal,
      ),
    ).rejects.toThrow("changed elsewhere");

    expect(requests).toHaveLength(2);
    const [update, reread] = requests;
    expect(update.method).toBe("PATCH");
    expectCapturedIdentity(update);
    expect(queryValues(update, "id")).toEqual(["eq.view-a"]);
    expect(queryValues(update, "version")).toEqual(["eq.2"]);
    expect(queryValues(update, "created_by")).toEqual(["eq.actor-a"]);
    expect(queryValues(update, "surface_key")).toEqual([
      "eq.matrx/table/sandboxes/active",
    ]);
    expect(queryValues(update, "visibility")).toEqual(["eq.personal"]);
    expect(queryValues(update, "deleted_at")).toEqual(["is.null"]);
    expect(update.body).toEqual(
      expect.objectContaining({ version: 3, updated_by: "actor-a" }),
    );

    expect(reread.method).toBe("GET");
    expectCapturedIdentity(reread);
    expect(queryValues(reread, "id")).toEqual(["eq.view-a"]);
    expect(queryValues(reread, "version")).toEqual([]);
    expect(queryValues(reread, "created_by")).toEqual(["eq.actor-a"]);
    expect(queryValues(reread, "surface_key")).toEqual([
      "eq.matrx/table/sandboxes/active",
    ]);
    expect(queryValues(reread, "visibility")).toEqual(["eq.personal"]);
    expect(queryValues(reread, "deleted_at")).toEqual(["is.null"]);
  });

  it("binds the supplied abort signal before the terminal create request", async () => {
    waitForAbort = true;
    const controller = new AbortController();
    const observedRequest = new Promise<void>((resolve) => {
      requestObserved = resolve;
    });
    const observedAbort = new Promise<void>((resolve) => {
      abortObserved = resolve;
    });
    const create = createPersonalTableView(
      actor,
      tableId,
      "My view",
      snapshot,
      controller.signal,
    );
    const rejectedCreate = expect(create).rejects.toMatchObject({
      message: expect.stringContaining("AbortError"),
    });

    await observedRequest;
    expect(requests).toHaveLength(1);
    controller.abort();

    await observedAbort;
    await rejectedCreate;
  });
});
