/**
 * THE GUEST LANE — a signed-out guest resolves its mandate on the server's
 * verdict alone (2026-10-02).
 *
 * Every feature is free for guests, and /chat is open to them. aidream's
 * `GET /mandates/{key}/resolution` admits the fingerprint lane
 * (`require_guest_or_above`, aidream eb8ec36a5b) and answers the signed-in
 * shape. `mandate.definition` is authenticated-only, so the guest lane must:
 *   - ask the door with NO organization (none is waited for or read);
 *   - read NO table (the definition and treatment rows would 42501 as anon);
 *   - hand back the verdict's agent, with `mandateId`/`organizationId` null.
 *
 * Before this lane, the resolver threw "mandate resolution requires an
 * authenticated session" and signed-out /chat/new painted "Chat is
 * unavailable right now".
 */
import type { MandateKey } from "@ai-matrx/agents/mandates";

const SYSTEM_AGENT = "11111111-2222-4333-8444-555555555555";
const KEY = "test.guest_lane" as MandateKey;

let signedInUserId: string | null = null;
let admissionAsked = 0;
let tablesRead: string[] = [];
let doorCalls: { path: string; organizationId: string | undefined }[] = [];

jest.mock("@/lib/python-client", () => ({
  getJson: async (path: string, opts: { organizationId?: string } = {}) => {
    doorCalls.push({ path, organizationId: opts.organizationId });
    return {
      data: {
        mandate_key: KEY,
        holder_type: "agent",
        agent_id: SYSTEM_AGENT,
        is_version: false,
        definition_agent_id: SYSTEM_AGENT,
        provenance: "system",
        config_overrides: null,
        contract: {},
        freshness: "fresh within 5 seconds",
        input_kind: null,
        output_kind: null,
        provision_key: null,
        consumption_map: null,
        auto_run: null,
      },
      meta: { requestId: "r", status: 200, serverRequestId: null },
    };
  },
}));

jest.mock("@/lib/api/organization-admission", () => ({
  waitForOrganizationAdmission: async () => {
    admissionAsked += 1;
    return "unresolved";
  },
  peekSelectedOrganizationId: () => null,
}));

function makeChain(table: string) {
  tablesRead.push(table);
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return chain;
}

jest.mock("@ai-matrx/chat/host/db", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/db"),
  ...jest.requireMock("@/utils/supabase/client"),
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({ from: (table: string) => makeChain(table) }),
    auth: withClaims({
      getUser: async () => ({
        data: { user: signedInUserId ? { id: signedInUserId } : null },
        error: null,
      }),
    }),
  }),
}));

import {
  invalidateMandateCache,
  resolveMandate,
} from "@ai-matrx/chat/mandates/service";
import { withClaims } from "@/test-utils/supabase-auth";
import { configureServerForTest } from "@ai-matrx/chat/host/__tests__/server-test-host";
import { appChatServerApi } from "@/lib/api/chat-server-api";

beforeAll(() => {
  configureServerForTest(appChatServerApi);
});

beforeEach(() => {
  signedInUserId = null;
  admissionAsked = 0;
  tablesRead = [];
  doorCalls = [];
  invalidateMandateCache();
});

describe("a signed-out guest resolves on the server's verdict", () => {
  it("asks the door with no organization and reads no table", async () => {
    const resolved = await resolveMandate(KEY);

    expect(resolved.agentId).toBe(SYSTEM_AGENT);
    expect(resolved.provenance).toBe("system");
    expect(resolved.organizationId).toBeNull();
    expect(resolved.mandateId).toBeNull();
    expect(doorCalls).toHaveLength(1);
    expect(doorCalls[0]?.path).toContain(encodeURIComponent(KEY));
    expect(doorCalls[0]?.organizationId).toBeUndefined();
    expect(tablesRead).toEqual([]);
    expect(admissionAsked).toBe(0);
  });

  it("CONTROL — a signed-in caller still waits for an organization", async () => {
    signedInUserId = "cccccccc-dddd-4eee-8fff-000000000000";
    await expect(resolveMandate(KEY)).rejects.toThrow();
    expect(admissionAsked).toBe(1);
    expect(doorCalls).toEqual([]);
  });
});
