/**
 * THE WRITE RECEIPT — the model must never read its own write as a value that
 * was already there.
 *
 * The incident (2026-09-27, /hr/settings/employer, admin@admin.com): three
 * writes (applicability_declarations, create_establishments,
 * update_establishments) each landed exactly once — version 1→2, fresh
 * timestamps — and the in-app agent told the person the rows "already
 * existed" / the value "was already there". The tool result only said
 * "applied and saved", and the resumed request carried the page values
 * RE-READ AFTER the write (ARE-010) with nothing saying so; the model's own
 * reasoning: "the returned ids match ones already shown in the overview … so
 * the overview was likely stale".
 *
 * Guarded here, end to end through the REAL seam (`applySurfaceWrite`), the
 * REAL tool-result thunk and the REAL `activeRequests` reducer:
 *  1. a success says the change was made by this call just now, with the page
 *     value as it stood BEFORE the write and what was written;
 *  2. when the page genuinely held the same value, the result says THAT — the
 *     only case where "already there" is true;
 *  3. the resumed request's context names the writes the re-read comes after.
 *
 * Faked: only the network funnel, the approval card and the agent-name lookup.
 */
const mockSubmitToolResult = jest.fn((payload: unknown) => ({
  type: "test/submitToolResult",
  payload,
}));
const mockGetManifest = jest.fn();

jest.mock("@/features/agents/api/submit-tool-results", () => ({
  submitToolResult: (payload: unknown) => mockSubmitToolResult(payload),
}));
jest.mock("@/features/agents/ui-first-tools/redux/request-approval", () => ({
  requestInlineApproval: async () => ({ kind: "approved" }),
}));
jest.mock("@/features/surfaces/hooks/useAgentNames", () => ({
  resolveAgentName: async () => "Employer setup",
}));
jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  selectAgentById: () => undefined,
}));
jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: mockGetManifest,
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

import { dispatchSurfaceWrite } from "../dispatch-surface-write.thunk";
import {
  registerSurfaceRuntime,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteTarget } from "@/features/surfaces/types";
import type { RootState } from "@/lib/redux/store";
import activeRequestsReducer, {
  createRequest,
} from "../../active-requests/active-requests.slice";
import {
  composeResumeContext,
  SURFACE_WRITES_NOTE_KEY,
} from "../../utils/surface-writes-note";

const createEstablishments = {
  name: "create_establishments",
  label: "Add establishments",
  description: "Creates establishments.",
  valueType: "array" as const,
  mode: "entity" as const,
  applyPolicy: "ask" as const,
  updatesValue: "establishments",
} satisfies SurfaceWriteTarget;

const declareApplicability = {
  name: "applicability_declarations",
  label: "Declare which laws apply",
  description: "Declares applicability flags.",
  valueType: "array" as const,
  mode: "entity" as const,
  applyPolicy: "ask" as const,
  updatesValue: "applicability_flags",
} satisfies SurfaceWriteTarget;

const IRVINE = { id: "1d1709ca-dba5-4f61-bcd3-e03f4eba9591", name: "PP test — Irvine site" };
const AUSTIN = { id: "b3dc00fe-7c1f-4b26-b3c1-dec10a6f4896", name: "PP test — Austin yard" };

interface Submitted {
  is_error: boolean;
  output: Record<string, unknown>;
}

/** Runs one agent write against a live page whose `getScope` reads `page`. */
async function write(
  target: SurfaceWriteTarget,
  page: Record<string, unknown>,
  handlers: SurfaceWriteHandlers,
  value: unknown,
): Promise<{ submitted: Submitted; actions: unknown[] }> {
  mockGetManifest.mockReturnValue({ writeTargets: [target] });
  const unregister = registerSurfaceRuntime(
    {
      surfaceName: "matrx-user/hr-employer",
      getScope: () => ({ ...page }),
      getWriteHandlers: () => handlers,
    },
    30,
  );
  try {
    const actions: unknown[] = [];
    const dispatch = jest.fn((action: unknown) => {
      actions.push(action);
      return action;
    });
    const getState = () =>
      ({
        conversations: { byConversationId: { c1: { agentId: "agent-1" } } },
      }) as unknown as RootState;
    await dispatchSurfaceWrite({
      conversationId: "c1",
      requestId: "r1",
      callId: "call-1",
      toolName: "apply_surface_write",
      args: { target: target.name, value },
    })(dispatch, getState, undefined);
    expect(mockSubmitToolResult).toHaveBeenCalledTimes(1);
    return {
      submitted: mockSubmitToolResult.mock.calls[0][0] as unknown as Submitted,
      actions,
    };
  } finally {
    unregister();
  }
}

beforeEach(() => jest.clearAllMocks());

it("a create says THIS call made the rows just now, with the page as it stood before", async () => {
  const page: Record<string, unknown> = { establishments: [IRVINE] };
  const { submitted } = await write(
    createEstablishments,
    page,
    {
      create_establishments: () => {
        // The page's own save refreshes the list — exactly what the resumed
        // request then re-reads.
        page.establishments = [AUSTIN, IRVINE];
        return {
          summary: `Created 1 establishment: "${AUSTIN.name}" (id ${AUSTIN.id}).`,
          data: { establishments: [AUSTIN] },
        };
      },
    },
    [{ name: AUSTIN.name, jurisdiction: "US-TX" }],
  );

  expect(submitted.is_error).toBe(false);
  const out = submitted.output;
  expect(out.status).toBe("applied_now");
  expect(typeof out.applied_at).toBe("string");
  const change = out.change as Record<string, unknown>;
  expect(change.page_value).toBe("establishments");
  // BEFORE is the page as the write found it: Irvine only, no Austin.
  expect(change.before).toContain(IRVINE.id);
  expect(change.before).not.toContain(AUSTIN.id);
  expect(change.written).toContain(AUSTIN.name);
  expect(change.same_as_before).toBeUndefined();
  const message = String(out.message);
  expect(message).toContain(`Created 1 establishment: "${AUSTIN.name}" (id ${AUSTIN.id}).`);
  expect(message).toContain("This call made this change just now");
  expect(message).toContain("it did not exist before this call");
  expect(message).toContain("already include it");
  expect(message).not.toMatch(/already (held|set|there|existed)/);
});

it("says the value was already there ONLY when the page really held it", async () => {
  const declared = [{ flag: "is_federal_contractor", applies: false, reason: "PP test — no covered federal contracts" }];
  const { submitted } = await write(
    declareApplicability,
    { applicability_flags: declared },
    { applicability_declarations: () => ({ summary: "Saved: Federal contractor does not apply." }) },
    declared,
  );
  const out = submitted.output;
  expect((out.change as Record<string, unknown>).same_as_before).toBe(true);
  expect(String(out.message)).toContain("The page already held exactly this value before this call");
  expect(String(out.message)).not.toContain("it did not exist before this call");
});

it("the resumed request labels the re-read page values as coming AFTER this conversation's writes", async () => {
  const page: Record<string, unknown> = { establishments: [IRVINE] };
  const { actions } = await write(
    createEstablishments,
    page,
    {
      create_establishments: () => {
        page.establishments = [AUSTIN, IRVINE];
        return { summary: `Created 1 establishment: "${AUSTIN.name}" (id ${AUSTIN.id}).` };
      },
    },
    [{ name: AUSTIN.name }],
  );

  // Feed what the thunk dispatched through the REAL reducer.
  let activeRequests = activeRequestsReducer(
    undefined,
    createRequest({ requestId: "r1", conversationId: "c1" }),
  );
  for (const action of actions) {
    const a = action as { type?: string };
    if (a.type?.startsWith("activeRequests/")) {
      activeRequests = activeRequestsReducer(activeRequests, a as never);
    }
  }
  const state = { activeRequests } as unknown as RootState;

  // What resumeInstance sends as the resumed request's `context`.
  const ambient = { organization: { id: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f" } };
  const context = composeResumeContext(state, "c1", ambient, undefined, "2026-09-27T11:54:42.326Z");
  expect(context?.organization).toEqual(ambient.organization);
  const note = context?.[SURFACE_WRITES_NOTE_KEY];
  expect(SURFACE_WRITES_NOTE_KEY).toBe("page_values_read_after_your_writes");
  expect(typeof note).toBe("string");
  expect(note).toContain("re-read at 2026-09-27T11:54:42.326Z, AFTER these writes you made");
  expect(note).toContain("create_establishments");
  expect(note).toContain(AUSTIN.id);
  expect(note).toContain("never as already there");
  // A conversation that wrote nothing gets no note — and no invented context.
  expect(composeResumeContext(state, "other-conversation", ambient, undefined)).toEqual(ambient);
  expect(composeResumeContext(state, "other-conversation", null, undefined)).toBeUndefined();
});
