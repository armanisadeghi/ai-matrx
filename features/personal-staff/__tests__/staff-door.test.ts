/** @jest-environment node */
/**
 * The staff door's wire contract, pinned against the two ways it can silently
 * stop working.
 *
 * 1. THE BODY MUST NOT CARRY `organization_id`. aidream's
 *    `OpenStaffThreadRequest` declares `model_config = ConfigDict(extra="forbid")`,
 *    so a body copy of the organization comes back 422 and `/staff` shows a
 *    validation error instead of the person's thread. The repo's usual
 *    transport (`callApi`) injects that field unconditionally on the JWT lane,
 *    which is exactly why this door uses `BackendClient` with
 *    `sendScopeInBody: false`. Switch it back and this test goes red.
 *
 * 2. THE REFUSAL SENTENCE MUST BE THE SERVER'S. `door.py` writes each refusal
 *    for a person to read; the screen renders it verbatim. A parser that
 *    degraded FastAPI's `{"detail": {code, message}}` envelope to
 *    "Request failed (409)" would replace that sentence with noise.
 */

import { BackendApiError } from "@/lib/api/errors";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import {
  PERSONAL_STAFF_MANDATE_KEY,
  STAFF_DOOR_PATH,
  isStaffDoorCode,
  openStaffThread,
  staffDoorFailure,
} from "../staff-door";

const ORG_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const BASE_URL = "https://server.example.test";
const TOKEN = "test-token";

const THREAD = {
  conversation_id: "11111111-2222-3333-4444-555555555555",
  mandate_key: "personal_staff.front_line",
  agent_id: "66666666-7777-8888-9999-000000000000",
  agent_version_id: null,
  agent_name: "Chief of Staff",
  holder_provenance: "system",
  is_new: false,
  sandbox_instance_id: null,
  sandbox_note: "Your staff has no machine of its own yet.",
};

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function errorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("the staff door's request", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("names the organization in the HEADER and never in the body", async () => {
    const fetchMock = jest.fn(async () => okResponse(THREAD));
    global.fetch = fetchMock as unknown as typeof fetch;

    const thread = await openStaffThread({
      accessToken: TOKEN,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
    });

    expect(thread.conversation_id).toBe(THREAD.conversation_id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${BASE_URL}${STAFF_DOOR_PATH}`);
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["X-Organization-Id"]).toBe(ORG_ID);
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    // THE WHOLE POINT: `extra="forbid"` on the server side.
    expect(body).toEqual({ channel: "web" });
    expect(body).not.toHaveProperty("organization_id");
  });

  it("stamps the `web` channel — the signed-in door, not the guarded native one", async () => {
    const fetchMock = jest.fn(async () => okResponse(THREAD));
    global.fetch = fetchMock as unknown as typeof fetch;

    await openStaffThread({
      accessToken: TOKEN,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).channel).toBe("web");
  });
});

describe("the staff door's refusals", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ["organization_required", 409],
    ["no_holder", 409],
    ["holder_is_not_an_agent", 409],
  ])("renders the server's own sentence for %s", async (code, status) => {
    const message = `A sentence written for a person about ${code}.`;
    const fetchMock = jest.fn(async () =>
      errorResponse(status, { detail: { code, message } }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const failure = await openStaffThread({
      accessToken: TOKEN,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
    })
      .then(() => null)
      .catch((error: unknown) => staffDoorFailure(error));

    expect(failure).toEqual({ code, message, status });
    expect(isStaffDoorCode(String(failure?.code))).toBe(true);
  });

  it("still produces a code and a sentence when the transport itself dies", () => {
    const failure = staffDoorFailure(new TypeError("Failed to fetch"));
    expect(failure.code).toBe("unreachable");
    expect(failure.message).toBe("Failed to fetch");
    expect(failure.status).toBeNull();
  });

  it("keeps a BackendApiError's own code rather than flattening it", () => {
    const failure = staffDoorFailure(
      new BackendApiError({
        code: "no_holder" as never,
        detail: "Nobody is assigned to your front line yet.",
        userMessage: "Nobody is assigned to your front line yet.",
        status: 409,
      }),
    );
    expect(failure.code).toBe("no_holder");
    expect(failure.message).toBe("Nobody is assigned to your front line yet.");
  });
});

describe("the job this surface runs", () => {
  it("is the GENERATED key, never a literal", () => {
    // A literal here would survive a rename on the server as a 404 nobody
    // sees — which is the whole reason `check:mandate-keys` exists.
    expect(PERSONAL_STAFF_MANDATE_KEY).toBe(
      MANDATE_KEYS.personal_staff__front_line,
    );
    expect(PERSONAL_STAFF_MANDATE_KEY).toBe("personal_staff.front_line");
  });
});
