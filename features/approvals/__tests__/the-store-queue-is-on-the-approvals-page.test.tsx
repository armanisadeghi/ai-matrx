/**
 * FORCING TEST — `/approvals` is ONE queue: the record store's `work_approval` rows sit beside
 * the assists, and they are decided only through `custom.work_approval_decide`
 * (chair ruling, 2026-10-03).
 *
 * The break it names: the page's registry (`APPROVAL_KINDS`) carries no reader for the store's
 * queue, so a change an agent asked to make to a Cedar Ridge Physical Therapy table waits in
 * `custom.work_inbox` and `/approvals` says nothing about it. Red on the code before lane
 * VISION-REACH W4 (the rows are absent), green after.
 *
 * What is real: `ApprovalQueue`, THE registry, the `store_change` kind, its reader
 * (`store-door.ts`), `@ai-matrx/records`' client, `resolveObjectOrganization`, the chat card's
 * change reader (`waitFromQueueRow` / `approvalChangeFor`) and the one decide function
 * (`decideRecordApproval`). What is stubbed: the network — the database doors answer the shapes
 * their SQL bodies build (`custom.work_inbox` columns, `custom.work_approval_read` =
 * `data || {approval_id, approvers, may_decide, decided_by_name}`), and the assists reader answers
 * an empty page so the other kinds stay quiet.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── the database, as the doors answer it ────────────────────────────────────────────────────
const ORG = "6b1f0d2e-4c3a-4e59-9a7b-1c2d3e4f5a6b";
const TABLE = "2f8e7d6c-5b4a-4392-8a1b-0c9d8e7f6a5b";
const VISIT = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const CONVERSATION = "c0ffee00-1234-4abc-8def-001122334455";
const FIELD_APPROVAL = "a1a1a1a1-0000-4000-8000-000000000001";
const RECORDS_APPROVAL = "a1a1a1a1-0000-4000-8000-000000000002";
const PATCH_APPROVAL = "a1a1a1a1-0000-4000-8000-000000000003";

function inboxRow(id: string, title: string, subjectId: string) {
  return {
    item_id: id,
    kind: "proposal",
    origin: "agent",
    title,
    subject_id: subjectId,
    subject_kind: subjectId === TABLE ? "table" : "record",
    summary: null,
    state: "pending",
    due_on: null,
    due_state: null,
    actionable: true,
    requested_by: "user-1",
    requested_by_name: "Dana Whitfield",
    at: "2026-10-03T15:04:00Z",
    table_id: TABLE,
    table_name: "Patient visits",
    decided_by: null,
    decided_by_name: null,
    decided_at: null,
    outcome: null,
    snoozed_until: null,
    cleared_at: null,
    snoozed_count: 0,
    cleared_count: 0,
    undo_seconds: 5,
    undo_refusal: null,
  };
}

const APPROVERS = [{ user_id: "user-1", name: "Dana Whitfield", why: "Owner of the organization" }];

const approvals: Record<string, Record<string, unknown>> = {
  [FIELD_APPROVAL]: {
    subject_id: TABLE,
    subject_kind: "table",
    subject_table_id: "00000000-0000-4000-8000-0000000000aa",
    subject_title: "Patient visits",
    change: {
      kind: "field_add",
      field: { key: "referring_physician", label: "Referring physician", type: "text", parity_type: "text" },
    },
    origin: "agent",
    conversation_id: CONVERSATION,
    requested_by: "user-1",
    requested_at: "2026-10-03T15:04:00.000Z",
    state: "pending",
  },
  [RECORDS_APPROVAL]: {
    subject_id: TABLE,
    subject_kind: "table",
    subject_table_id: "00000000-0000-4000-8000-0000000000aa",
    subject_title: "Patient visits",
    change: {
      kind: "record_add",
      rows: [{ patient: "Maria Gonzalez", visit_date: "2026-10-06", copay: 35 }],
    },
    origin: "agent",
    conversation_id: CONVERSATION,
    requested_by: "user-1",
    requested_at: "2026-10-03T15:05:00.000Z",
    state: "pending",
  },
  [PATCH_APPROVAL]: {
    subject_id: VISIT,
    subject_kind: "record",
    subject_table_id: TABLE,
    subject_title: "Robert Chen",
    change: { kind: "record_patch", patch: { status: "Completed" } },
    origin: "agent",
    requested_by: "user-1",
    requested_at: "2026-10-03T15:06:00.000Z",
    state: "pending",
  },
};

let pending: string[] = [];
const decideCalls: Array<Record<string, unknown>> = [];

const TITLES: Record<string, [string, string]> = {
  [FIELD_APPROVAL]: ["Add Referring physician to Patient visits", TABLE],
  [RECORDS_APPROVAL]: ["Change Patient visits", TABLE],
  [PATCH_APPROVAL]: ["Change Robert Chen", VISIT],
};

async function mockRpc(fn: string, args: Record<string, unknown>) {
  switch (fn) {
    case "work_inbox":
      // `custom.work_inbox(NULL)` = every organization the person belongs to.
      if (args.p_organization_id !== null) return { data: [], error: null };
      return {
        data: pending.map((id) => inboxRow(id, TITLES[id]![0], TITLES[id]![1])),
        error: null,
      };
    case "where_id_opens":
      return { data: { organization_id: ORG, kind: "record", path: null, live: true }, error: null };
    case "work_approval_read": {
      const row = approvals[String(args.p_approval_id)];
      return {
        data: { ...row, approval_id: args.p_approval_id, approvers: APPROVERS, may_decide: true, decided_by_name: null },
        error: null,
      };
    }
    case "read_record":
      return args.p_record_id === VISIT
        ? { data: { id: VISIT, patient: "Robert Chen", status: "Scheduled" }, error: null }
        : { data: null, error: null };
    case "work_approval_decide":
      decideCalls.push(args);
      pending = pending.filter((id) => id !== args.p_approval_id);
      return {
        data: { approval_id: args.p_approval_id, state: args.p_approve ? "approved" : "declined", message: "Done." },
        error: null,
      };
    default:
      return { data: null, error: { message: `unexpected door ${fn}`, code: "XX000" } };
  }
}

function mockTable(rows: Array<Record<string, unknown>>) {
  const chain = {
    select: () => chain,
    in: async () => ({ data: rows, error: null }),
  };
  return chain;
}

function mockFakeClient() {
  return {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
    from: () => mockTable([]),
    schema: (name: string) => ({
      rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
      from: (table: string) =>
        name === "chat" && table === "conversation"
          ? mockTable([{ id: CONVERSATION, title: "New patient intake, October", initial_agent_id: "agent-7" }])
          : name === "agent" && table === "definition"
            ? mockTable([{ id: "agent-7", name: "Intake assistant" }])
            : mockTable([]),
    }),
  };
}

jest.mock("@/utils/supabase/client", () => ({
  get supabase() {
    return mockFakeClient();
  },
  createClient: () => mockFakeClient(),
}));
jest.mock("@ai-matrx/records-ui", () => ({
  ...jest.requireActual("@ai-matrx/records-ui"),
  recordsDataSource: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
    schema: () => ({ from: () => mockTable([]) }),
  }),
}));
// The assists ledger answers an empty page: this suite is about the store's rows.
jest.mock("../data", () => ({
  APPROVAL_SURFACE: "matrx-user/approval-queue",
  APPROVAL_PAGE_SIZE_KNOB: { feature: "approvals", key: "queue_page_size" },
  listPendingProposals: async () => ({ proposals: [], total: 0, unrenderable: [] }),
  countPendingProposals: async () => 0,
  readProposalStatus: async () => ({ status: "missing" }),
  recordApprovalDecision: jest.fn(),
}));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({ ensureEffectiveKnob: async () => 72 }));
jest.mock("@/lib/scoped-config/effectiveKnobs.client", () => ({ useEffectiveKnob: () => 50 }));
jest.mock("@/features/ai-models/translation/data", () => ({
  isPlatformAdmin: async () => false,
  readTranslationBundle: async () => ({ status: "missing" }),
  saveTranslationCell: jest.fn(),
  archiveTranslationCell: jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user-1" }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ token, id, name }: { token: string; id: string; name?: string }) => (
    <a data-testid="entity-ref" data-token={token} data-id={id}>
      {name ?? id}
    </a>
  ),
}));
jest.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({ open, onConfirm, confirmLabel }: { open: boolean; onConfirm: () => void; confirmLabel: string }) =>
    open ? (
      <button data-testid="confirm" onClick={() => onConfirm()}>
        {confirmLabel}
      </button>
    ) : null,
}));

/* eslint-disable import/first -- after the mocks above */
import { ApprovalQueue } from "../ApprovalQueue";
import { APPROVAL_KINDS } from "../registry";
/* eslint-enable import/first */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function settle(times = 30) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Wait on the condition itself; the error names what never happened. */
async function until(what: string, ok: () => boolean, timeoutMs = 10_000) {
  const start = Date.now();
  while (!ok()) {
    if (Date.now() - start > timeoutMs) throw new Error(`never happened: ${what}`);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

async function mountPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <ApprovalQueue
          scope={{ key: "user-1", organizationId: null, userId: "user-1" }}
          registry={APPROVAL_KINDS}
          title="Waiting on your approval"
          defaultExpanded
          hideWhenEmpty={false}
        />
      </QueryClientProvider>,
    );
  });
  await until("the store's rows were drawn", () => rowOf(FIELD_APPROVAL) !== null);
  await settle();
}

function rowOf(approvalId: string): HTMLElement | null {
  return container!.querySelector(`#approval-row-store_change-${approvalId}`);
}

function buttonIn(row: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(row.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`no "${label}" button on the row — it offers: ${Array.from(row.querySelectorAll("button")).map((b) => b.textContent?.trim()).join(" | ")}`);
  return found as HTMLButtonElement;
}

beforeEach(() => {
  pending = [FIELD_APPROVAL, RECORDS_APPROVAL, PATCH_APPROVAL];
  decideCalls.length = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("/approvals shows the record store's waiting changes beside the assists", () => {
  it("lists each waiting change in its own words, read from the row the store filed", async () => {
    await mountPage();
    const page = container!.textContent ?? "";
    expect(page).toContain("Add the column Referring physician to Patient visits");
    expect(page).toContain("Add 1 record to Patient visits");
    expect(page).toContain("Change Robert Chen in Patient visits");
  });

  it("says who asked — the agent and the person it ran for — and opens the conversation", async () => {
    await mountPage();
    const row = rowOf(FIELD_APPROVAL);
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("Intake assistant for Dana Whitfield");
    const door = row!.querySelector('[data-token="conversation"]');
    expect(door?.getAttribute("data-id")).toBe(CONVERSATION);
    expect(door?.textContent).toBe("New patient intake, October");
  });

  it("shows a change to a record as the value it has now beside the value it would get", async () => {
    await mountPage();
    const row = rowOf(PATCH_APPROVAL)!;
    // "Scheduled" exists only in the record read; "Completed" only in the filed change.
    expect(row.textContent).toContain("Scheduled");
    expect(row.textContent).toContain("Completed");
    // A change filed in a conversation-less run names the agent without a person-less guess.
    expect(row.textContent).toContain("An agent for Dana Whitfield");
  });

  it("approves one through custom.work_approval_decide and the row leaves the waiting list", async () => {
    await mountPage();
    await act(async () => buttonIn(rowOf(FIELD_APPROVAL)!, "Approve").click());
    await act(async () => (container!.querySelector('[data-testid="confirm"]') as HTMLButtonElement).click());
    await until("the decision reached the door and the list was read again", () => rowOf(FIELD_APPROVAL) === null);
    expect(decideCalls).toEqual([
      { p_organization_id: ORG, p_approval_id: FIELD_APPROVAL, p_approve: true, p_note: null },
    ]);
    expect(rowOf(FIELD_APPROVAL)).toBeNull();
    expect(rowOf(RECORDS_APPROVAL)).not.toBeNull();
  });

  it("declines one through the same door, as a decision, and leaves the others waiting", async () => {
    await mountPage();
    await act(async () => buttonIn(rowOf(RECORDS_APPROVAL)!, "Decline").click());
    await act(async () => (container!.querySelector('[data-testid="confirm"]') as HTMLButtonElement).click());
    await until("the decision reached the door and the list was read again", () => rowOf(RECORDS_APPROVAL) === null);
    expect(decideCalls).toEqual([
      { p_organization_id: ORG, p_approval_id: RECORDS_APPROVAL, p_approve: false, p_note: null },
    ]);
    expect(rowOf(RECORDS_APPROVAL)).toBeNull();
    expect(rowOf(FIELD_APPROVAL)).not.toBeNull();
  });
});
