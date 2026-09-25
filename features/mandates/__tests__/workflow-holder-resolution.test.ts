/**
 * WORKFLOW PARITY — "what runs for me" is an answer for a workflow too.
 *
 * A mandate is filled by an agent OR a workflow (MANDATE-SYSTEM §1). The
 * browser's `resolveMandate` narrows to an agent because its consumers LAUNCH
 * in the browser; the record page used it to SAY what runs, so every
 * workflow-held job showed "Mandate Holder: Not available · Unavailable"
 * while the server resolved and ran it (found live 2026-09-25 on
 * `wfparity.text_summary`). `resolveMandateHolder` is the same one ask,
 * painted as the server answered it.
 */
import type { MandateKey } from "@ai-matrx/agents/mandates";

const USER_ID = "cccccccc-dddd-4eee-8fff-000000000000";
const ORG = "aaaaaaaa-1111-4111-8111-111111111111";
const WF = "256695b0-537e-4e80-a4b2-8fdd91557e59";
const WF_V4 = "11111111-1111-4111-8111-111111111111";
const KEY = "test.workflow_holder" as MandateKey;

let verdict: Record<string, unknown> = {};

jest.mock("@/lib/api/errors", () => ({
  BackendApiError: class extends Error {
    status: number;
    constructor(init: { status: number }) {
      super("backend");
      this.status = init.status;
    }
  },
}));
jest.mock("@/lib/python-client", () => ({
  getJson: async () => ({
    data: verdict,
    meta: { requestId: "r", status: 200, serverRequestId: null },
  }),
}));
jest.mock("@/lib/api/organization-admission", () => ({
  waitForOrganizationAdmission: async () => "ready",
  peekSelectedOrganizationId: () => ORG,
}));
jest.mock("@/utils/supabase/client", () => {
  const { withClaims } = jest.requireActual("@/test-utils/supabase-auth");
  return {
    createClient: () => ({
      schema: () => ({ from: () => ({}) }),
      auth: withClaims({
        getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
      }),
    }),
  };
});

import { invalidateMandateCache, resolveMandate, resolveMandateHolder } from "../service";

function workflowVerdict(pin: { id: string; n: number } | null) {
  return {
    mandate_key: KEY,
    holder_type: "workflow",
    agent_id: null,
    is_version: false,
    definition_agent_id: null,
    workflow_id: WF,
    workflow_version_id: pin?.id ?? null,
    version_number: pin?.n ?? null,
    provenance: "user",
    config_overrides: null,
    contract: {},
    freshness: "fresh within 5 seconds",
    input_kind: null,
    output_kind: "markdown",
    provision_key: null,
    consumption_map: null,
    auto_run: null,
  };
}

beforeEach(() => invalidateMandateCache());

test("a workflow winner is an ANSWER to 'what runs', not a refusal", async () => {
  verdict = workflowVerdict(null);
  const holder = await resolveMandateHolder(KEY);
  expect(holder).toMatchObject({
    holderType: "workflow",
    holderId: WF,
    versionId: null,
    isVersion: false,
    provenance: "user",
    organizationId: ORG,
  });
});

test("a pinned workflow names its version", async () => {
  verdict = workflowVerdict({ id: WF_V4, n: 4 });
  const holder = await resolveMandateHolder(KEY);
  expect(holder).toMatchObject({ versionId: WF_V4, isVersion: true, versionNumber: 4 });
});

test("the LAUNCH resolver still refuses a workflow — the browser cannot run one", async () => {
  verdict = workflowVerdict(null);
  await expect(resolveMandate(KEY)).rejects.toThrow(/can only run an agent/);
});

test("an agent winner reads the same through the holder-neutral door", async () => {
  verdict = {
    ...workflowVerdict(null),
    holder_type: "agent",
    agent_id: "22222222-2222-4222-8222-222222222222",
    definition_agent_id: "22222222-2222-4222-8222-222222222222",
    workflow_id: null,
  };
  const holder = await resolveMandateHolder(KEY);
  expect(holder).toMatchObject({
    holderType: "agent",
    holderId: "22222222-2222-4222-8222-222222222222",
  });
});
