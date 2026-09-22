/**
 * FORCING TEST — the six Google proposal kinds show the producer's OWN dry run,
 * and every one of them decides through the ONE server door.
 *
 * 🚨 The fixtures below are not invented shapes: each one is transcribed from
 * the aidream tool that produces it (`aidream/services/google_workspace/
 * tools.py`, the `dry_run` branch of `_append_document`, `_create_document`,
 * `_create_sheet`, `_import_contact`, `_import_tasks`) wrapped exactly as
 * `approvals.py` → `build_payload` wraps it: `{__kind, preview, arguments}`.
 * That wrapping IS the contract between the two repos, so a fixture that
 * drifts from it is the defect this suite exists to catch. Only the store seam
 * (`listPendingProposals`) and the network door are mocked — the readers, the
 * narrowing and every kind's own component are the real ones.
 *
 * Three classes it holds shut:
 *   1. a preview field the screen invents rather than reads (each assertion
 *      names a value that exists ONLY in the fixture);
 *   2. a kind that renders nothing for a payload it cannot read, instead of
 *      saying so and offering only Reject;
 *   3. a second executor — a kind writing to Google from the browser, or
 *      recording a decision itself, instead of going through apply/reject.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Json } from "@/types/database.types";
import type {
  ApprovalItem,
  ApprovalKind,
  ApprovalOutcome,
} from "@/features/approvals/types";

const mockApply = jest.fn(async () => ({
  approval_id: "a1",
  status: "accepted",
  applied_now: true,
  receipt: {},
}));
const mockReject = jest.fn(async () => ({
  approval_id: "a1",
  status: "dismissed",
  applied_now: false,
  receipt: {},
}));
const mockWriteGoogleSheet = jest.fn();
const mockRecordDecision = jest.fn();

let mockPayload: Json = null;
/** A receipt on the STILL-PENDING row — what a failed or in-flight apply leaves. */
let failedReceiptOnRow: Json = null;

jest.mock("../google-door", () => ({
  applyGoogleApproval: (...args: unknown[]) => mockApply(...(args as [])),
  rejectGoogleApproval: (...args: unknown[]) => mockReject(...(args as [])),
}));
jest.mock("../data", () => ({
  APPROVAL_SURFACE: "matrx-user/approval-queue",
  APPROVAL_PAGE_SIZE_KNOB: { feature: "approvals", key: "queue_page_size" },
  // The seam takes the asking kind itself (§ A-N5), so the stub reads its id.
  listPendingProposals: async (_userId: string, kind: { id: string }) => ({
    proposals: [
      {
        assist: {
          id: "assist-1",
          title: `a ${kind.id} proposal`,
          createdAt: "2026-09-17T00:00:00Z",
          result: failedReceiptOnRow,
        },
        proposalKind: kind.id,
        mode: "mode_4",
        autoApplyAt: null,
        proposerLabel: "Research agent",
        proposerAgentId: null,
        proposerRunId: null,
        operatorUserId: "user-1",
        payload: mockPayload,
        blocked: null,
        subject: null,
      },
    ],
    total: 1,
  }),
  recordApprovalDecision: (...args: unknown[]) =>
    mockRecordDecision(...(args as [])),
}));
jest.mock("@/features/google-workspace/service", () => ({
  writeGoogleSheet: (...args: unknown[]) => mockWriteGoogleSheet(...(args as [])),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-1",
}));
/**
 * A module that DOES NOT EXIST in any commit on this branch:
 * `features/surfaces/manifests/registry.ts` imports `./barcode-preview.manifest`
 * and the file was never written. Every module that reaches the surface
 * manifest registry therefore fails to resolve — which the approvals registry
 * does twice over, through the Gmail review card and through `AssistCard`.
 * It is an unrelated, pre-existing break (logged in FOUND_DEFECTS.md); this
 * virtual stub keeps it out of THIS suite without papering over it anywhere
 * else. Nothing below asserts anything about surface manifests.
 */
jest.mock(
  "../../surfaces/manifests/barcode-preview.manifest",
  () => ({
    barcodePreviewManifest: {
      surfaceName: "matrx-user/barcode-preview-missing-module-stub",
      readiness: "draft",
      label: "Barcode preview",
      urlPattern: "/",
      intro: "",
      groups: [],
      values: [],
    },
  }),
  { virtual: true },
);
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ token, id, name }: { token: string; id: string; name?: string }) => (
    <a data-testid="entity-ref" data-token={token} data-id={id}>
      {name ?? id}
    </a>
  ),
}));

/* eslint-disable import/first -- after the mocks above */
import { contactImportKind } from "../kinds/contact-import";
import { documentAppendKind } from "../kinds/document-append";
import { documentCreateKind } from "../kinds/document-create";
import { sheetWriteKind } from "../kinds/sheet-write";
import { spreadsheetCreateKind } from "../kinds/spreadsheet-create";
import { taskImportKind } from "../kinds/task-import";
import { APPROVAL_KINDS } from "../registry";
/* eslint-enable import/first */

const SCOPE = { key: "user-1", organizationId: "org-1", userId: "user-1" };

interface Harness {
  items: ApprovalItem[];
  accept: (items: ApprovalItem[]) => Promise<unknown>;
  reject: (items: ApprovalItem[], reason: string | null) => Promise<unknown>;
}

let harness: Harness | null = null;

function Probe({ kind }: { kind: ApprovalKind }) {
  const source = kind.useSource(SCOPE);
  const decisions = kind.useDecisions(SCOPE);
  harness = {
    items: source.items,
    accept: (items) => decisions.acceptItems(items, null),
    reject: (items, reason) => decisions.rejectItems(items, reason, null),
  };
  return (
    <div>
      {source.items.map((item) => (
        <div key={item.key} data-testid="row">
          <div data-testid="headline">{item.headline}</div>
          <div data-testid="accept-effect">{item.acceptEffect}</div>
          <div data-testid="blocked">{item.blocked?.reason ?? ""}</div>
          <div data-testid="body">{item.body}</div>
          <div data-testid="doors">{item.doors}</div>
        </div>
      ))}
    </div>
  );
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(kind: ApprovalKind): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <Probe kind={kind} />
      </QueryClientProvider>,
    );
  });
  // Let the kind's react-query read settle. It resolves on a microtask AND
  // notifies on a macrotask, so one flush is not enough — wait until the row
  // is really there rather than asserting into a still-loading list.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (harness && harness.items.length > 0) break;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  harness = null;
  mockApply.mockClear();
  mockReject.mockClear();
  mockWriteGoogleSheet.mockClear();
  mockRecordDecision.mockClear();
});

function text(node: HTMLElement, testId: string): string {
  return node.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
}

describe("the Google proposal kinds render the producer's dry run", () => {
  it("document_append shows the exact block and where it lands", async () => {
    mockPayload = {
      __kind: "document_append_dry_run",
      preview: {
        action: "append_document",
        dry_run: true,
        file_id: "doc-9",
        title: "Q3 retro",
        total_chars: 4821,
        open_in_google: "https://docs.google.com/document/d/doc-9",
        would_append: {
          position: "end_of_document",
          after_char: 4821,
          text: "\nDecision: ship the kiosk build on Friday.",
          document_ends_with: "…owner: Arman.",
        },
      },
      arguments: { file_id: "doc-9", text: "Decision: ship the kiosk build on Friday." },
    } as unknown as Json;
    const node = await mount(documentAppendKind);
    const body = text(node, "body");
    expect(body).toContain("Decision: ship the kiosk build on Friday.");
    expect(body).toContain("…owner: Arman.");
    expect(body).toContain("after character 4,821");
    expect(body).toContain("Q3 retro");
    expect(text(node, "headline")).toContain("Q3 retro");
    expect(
      node.querySelector('[data-testid="doors"] a')?.getAttribute("href"),
    ).toBe("https://docs.google.com/document/d/doc-9");
  });

  it("document_create shows the title and the first lines it starts with", async () => {
    mockPayload = {
      __kind: "document_create_dry_run",
      preview: {
        action: "create_document",
        dry_run: true,
        would_create: {
          title: "Kiosk rollout plan",
          kind: "doc",
          starting_chars: 62,
          in_google_drive_of: "the connected Google account",
        },
      },
      arguments: {
        title: "Kiosk rollout plan",
        text: "Week 1: pair the devices\nWeek 2: train the crew",
      },
    } as unknown as Json;
    const node = await mount(documentCreateKind);
    expect(text(node, "headline")).toContain("Kiosk rollout plan");
    const body = text(node, "body");
    expect(body).toContain("Week 1: pair the devices");
    expect(body).toContain("Week 2: train the crew");
    // Nothing exists yet, so there is no door to the file (a link would be dead).
    expect(node.querySelector('[data-testid="doors"] a')).toBeNull();
  });

  it("spreadsheet_create shows the title and the first rows", async () => {
    mockPayload = {
      __kind: "spreadsheet_create_dry_run",
      preview: {
        action: "create_sheet",
        dry_run: true,
        would_create: {
          title: "Payroll check",
          kind: "sheet",
          starting_rows: 2,
          first_row: ["Name", "Hours"],
        },
      },
      arguments: {
        title: "Payroll check",
        rows: [
          ["Name", "Hours"],
          ["Dana", "38"],
        ],
      },
    } as unknown as Json;
    const node = await mount(spreadsheetCreateKind);
    expect(text(node, "headline")).toContain("Payroll check");
    const body = text(node, "body");
    expect(body).toContain("Hours");
    expect(body).toContain("Dana");
  });

  it("contact_import shows the plan's rows, value by value", async () => {
    // 🚨 aidream lane B-15 (commit `90e10777a`): the producer's dry run now
    // carries the plan under `preview.would_write` — `platform.assists` has
    // held zero `contact_import` rows across four rounds of hostile
    // verification, so there is no live payload shaped without it, and the
    // kind no longer renders one (F-36 follow-up).
    mockPayload = {
      __kind: "contact_import_dry_run",
      preview: {
        action: "import_contact",
        google_account: "arman@example.com",
        contacts: [
          {
            contact_id: "people/c1",
            name: "Dana Reed",
            emails: ["dana@example.com"],
            phones: [],
          },
        ],
        field_map: [
          {
            key: "display_name",
            person_field: "display_name",
            person_label: "Name",
            value: "Dana Reed",
            current_value: null,
            action: "create",
            explanation: "Name will be set to Dana Reed.",
          },
          {
            key: "emails",
            person_field: "emails",
            person_label: "Email",
            value: ["dana@example.com"],
            current_value: null,
            action: "added",
            explanation: "dana@example.com will be added as email.",
          },
        ],
        would_write: {
          writes: 1,
          contact_points: 1,
          promise: "Writes 1 field and 1 contact point onto a new Person. Google Contacts is not changed.",
          reimport_policy: "manual_wins",
          kept_fields: [],
          refused_fields: [],
          warnings: [],
          plan: [
            {
              key: "display_name",
              person_field: "display_name",
              person_label: "Name",
              value: "Dana Reed",
              current_value: null,
              action: "create",
              explanation: "Name will be set to Dana Reed.",
            },
            {
              key: "emails",
              person_field: "emails",
              person_label: "Email",
              value: ["dana@example.com"],
              current_value: null,
              action: "added",
              explanation: "dana@example.com will be added as email.",
            },
          ],
        },
        dry_run: true,
        imported: false,
      },
      arguments: { contact: "dana@example.com" },
    } as unknown as Json;
    const node = await mount(contactImportKind);
    expect(text(node, "headline")).toContain("Dana Reed");
    const body = text(node, "body");
    expect(body).toContain("Name");
    expect(body).toContain("Dana Reed");
    expect(body).toContain("Email");
    expect(body).toContain("dana@example.com");
    expect(body).toContain("arman@example.com");
  });

  it("contact_import with no plan renders the honest unrenderable row, never a client-derived count", async () => {
    // The shape `contact_import shows the plan's rows, value by value` used
    // to exercise before B-15 — a `field_map` with no `would_write` at all.
    // No such row has ever reached `platform.assists`, so it is no longer a
    // fallback; it is a shape this build cannot review.
    mockPayload = {
      __kind: "contact_import_dry_run",
      preview: {
        action: "import_contact",
        google_account: "arman@example.com",
        contacts: [
          { contact_id: "people/c1", name: "Dana Reed", emails: ["dana@example.com"] },
        ],
        field_map: [
          { person_field: "display_name", value: "Dana Reed", source: "google_contacts" },
        ],
        dry_run: true,
        imported: false,
      },
      arguments: { contact: "dana@example.com" },
    } as unknown as Json;
    const node = await mount(contactImportKind);
    expect(text(node, "headline")).toContain("Dana Reed");
    expect(text(node, "accept-effect")).toBe("Nothing — this proposal cannot be read.");
    expect(text(node, "blocked")).toContain("does not carry the import's plan");
  });

  it("task_import marks the rows already here and opens them", async () => {
    mockPayload = {
      __kind: "task_import_dry_run",
      preview: {
        action: "import_tasks",
        google_account: "arman@example.com",
        count: 2,
        tasks: [
          {
            task_id: "g1",
            task_list_id: "list-1",
            task_list: "Launch",
            title: "Book the venue",
            notes: null,
            due_at: null,
            status: "needsAction",
            already_imported: true,
            matrx_task_id: "11111111-1111-1111-1111-111111111111",
          },
          {
            task_id: "g2",
            task_list_id: "list-1",
            task_list: "Launch",
            title: "Order the badges",
            notes: "500 of them",
            due_at: null,
            status: "needsAction",
            already_imported: false,
          },
        ],
        already_imported: [{ task_id: "g1" }],
        dry_run: true,
      },
      arguments: { task_list_id: "list-1", task_ids: ["g1", "g2"] },
    } as unknown as Json;
    const node = await mount(taskImportKind);
    const body = text(node, "body");
    expect(body).toContain("Book the venue");
    expect(body).toContain("Already here");
    expect(body).toContain("Order the badges");
    expect(body).toContain("1 of 2 already here");
    // THE DOOR LAW: the task that is already here can be opened and checked.
    const door = node.querySelector('[data-testid="entity-ref"]');
    expect(door?.getAttribute("data-token")).toBe("task");
    expect(door?.getAttribute("data-id")).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    // And the headline must not claim it will create the one already here.
    expect(text(node, "accept-effect")).toContain("Creates 1 task");
  });

  it("an import that would create nothing is blocked, not offered", async () => {
    mockPayload = {
      __kind: "task_import_dry_run",
      preview: {
        tasks: [
          {
            task_id: "g1",
            task_list_id: "list-1",
            task_list: "Launch",
            title: "Book the venue",
            already_imported: true,
            matrx_task_id: "11111111-1111-1111-1111-111111111111",
          },
        ],
        already_imported: [{ task_id: "g1" }],
      },
      arguments: { task_list_id: "list-1", task_ids: ["g1"] },
    } as unknown as Json;
    const node = await mount(taskImportKind);
    expect(text(node, "blocked")).toContain("already imported");
  });

  it("a payload this build cannot read is SHOWN, blocked, never dropped", async () => {
    mockPayload = { __kind: "something_else", preview: {} } as unknown as Json;
    const node = await mount(documentAppendKind);
    expect(node.querySelectorAll('[data-testid="row"]').length).toBe(1);
    expect(text(node, "blocked")).toContain("does not recognise");
    expect(text(node, "accept-effect")).toContain("Nothing");
  });
});

/**
 * One READABLE payload per kind — the smallest preview each one accepts that
 * still describes a real change. Deliberately not `{preview: {}}`: an empty
 * preview is now a BLOCKED row (a click that would do nothing says so), and a
 * batch test driven on blocked rows would prove the door is called for rows the
 * queue never offers Approve on.
 */
const READABLE_PAYLOAD: Record<string, Json> = {
  sheet_write: {
    __kind: "sheet_write_dry_run",
    connectionId: "conn-1",
    fileId: "sheet-1",
    fileLabel: "Payroll",
    rangeA1: "Sheet1!A1:A1",
    values: [["after"]],
    before: [["before"]],
  } as unknown as Json,
  document_append: {
    __kind: "document_append_dry_run",
    preview: {
      title: "Q3 retro",
      total_chars: 10,
      would_append: { after_char: 10, text: "More." },
    },
    arguments: { file_id: "doc-9", text: "More." },
  } as unknown as Json,
  document_create: {
    __kind: "document_create_dry_run",
    preview: { would_create: { title: "Plan", starting_chars: 4 } },
    arguments: { title: "Plan", text: "Body" },
  } as unknown as Json,
  spreadsheet_create: {
    __kind: "spreadsheet_create_dry_run",
    preview: { would_create: { title: "Sheet", starting_rows: 1 } },
    arguments: { title: "Sheet", rows: [["a"]] },
  } as unknown as Json,
  contact_import: {
    __kind: "contact_import_dry_run",
    preview: {
      contacts: [{ name: "Dana Reed" }],
      field_map: [
        { person_field: "display_name", value: "Dana Reed", source: "google_contacts" },
      ],
    },
    arguments: { contact: "dana@example.com" },
  } as unknown as Json,
  task_import: {
    __kind: "task_import_dry_run",
    preview: {
      tasks: [
        {
          task_id: "g2",
          task_list_id: "list-1",
          task_list: "Launch",
          title: "Order the badges",
          already_imported: false,
        },
      ],
      already_imported: [],
    },
    arguments: { task_list_id: "list-1", task_ids: ["g2"] },
  } as unknown as Json,
};

describe("there is ONE approve path", () => {
  const googleKinds: ApprovalKind[] = [
    sheetWriteKind,
    documentAppendKind,
    documentCreateKind,
    spreadsheetCreateKind,
    contactImportKind,
    taskImportKind,
  ];

  it.each(googleKinds.map((kind) => [kind.id, kind] as const))(
    "%s approves through the server door and writes nothing itself",
    async (_id, kind) => {
      mockPayload = READABLE_PAYLOAD[kind.id];
      await mount(kind);
      const items = harness!.items;
      expect(items.length).toBe(1);
      await act(async () => {
        await harness!.accept(items);
      });
      expect(mockApply).toHaveBeenCalledWith("assist-1");
      // No browser-side Google write, and no second decision record: the door
      // claims the row, runs the change and stores the receipt in one place.
      expect(mockWriteGoogleSheet).not.toHaveBeenCalled();
      expect(mockRecordDecision).not.toHaveBeenCalled();
    },
  );

  it("reject carries the person's reason to the door", async () => {
    mockPayload = READABLE_PAYLOAD.document_append;
    await mount(documentAppendKind);
    await act(async () => {
      await harness!.reject(harness!.items, "not this quarter");
    });
    expect(mockReject).toHaveBeenCalledWith("assist-1", "not this quarter");
    expect(mockRecordDecision).not.toHaveBeenCalled();
  });

  it("no Google kind asks for a note its Approve cannot keep", () => {
    for (const kind of googleKinds) {
      // The apply door takes the approval id and nothing else.
      expect(kind.accept.keepsReason).toBe(false);
      // Reject does store one (`decision_note`), so it may ask.
      expect(kind.reject.keepsReason).toBe(true);
    }
  });
});

describe("the registry and the producer agree", () => {
  it("registers every proposal kind aidream produces", () => {
    // `PROPOSAL_KIND_BY_ACTION` in aidream's
    // `services/google_workspace/approvals.py`. A row of a kind missing here is
    // durable and INVISIBLE, which is the defect this lane closed.
    const produced = [
      "sheet_write",
      "document_append",
      "document_create",
      "spreadsheet_create",
      "contact_import",
      "task_import",
    ];
    const registered = APPROVAL_KINDS.map((kind) => kind.id);
    for (const kind of produced) expect(registered).toContain(kind);
  });

  it("gives every Google kind the operator scope requirement", () => {
    // They are addressed to ONE person — the only one the server lets apply
    // them — so a site-scoped mount must name them, never repeat them.
    for (const kind of APPROVAL_KINDS.filter((entry) =>
      [
        "sheet_write",
        "document_append",
        "document_create",
        "spreadsheet_create",
        "contact_import",
        "task_import",
      ].includes(entry.id),
    )) {
      expect(kind.scopeRequirement?.field).toBe("userId");
    }
  });
});

/**
 * FORCING TESTS for the Bugbot MEDIUM on frontend PR 228: the door's answer is
 * READ, not assumed.
 *
 * `useGoogleApprovalDecisions` counted every non-throwing reply as applied and
 * threw `status` and `applied_now` away. The door is idempotent on purpose — a
 * second approve writes nothing to Google and returns the first call's receipt,
 * and a row somebody already REJECTED answers an approve just as quietly — so
 * the screen said "Approved 1 proposal" over a change that was never made, and
 * "Rejected 1" over a message that had already gone out.
 *
 * The replies below are the producer's own, field for field
 * (`apply_google_approval` / `reject_google_approval` in
 * `aidream/services/google_workspace/approvals.py`), including the asymmetry
 * that a FRESH reject also answers `applied_now: false` — which is why the
 * verdict is taken from `status` on both paths.
 */
describe("the door's answer is read, not assumed", () => {
  const readyItems = async () => {
    mockPayload = READABLE_PAYLOAD.document_append;
    await mount(documentAppendKind);
    return harness!.items;
  };

  it("counts an approve the door actually performed", async () => {
    const items = await readyItems();
    mockApply.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "accepted",
      applied_now: true,
      receipt: {},
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.accept(items)) as ApprovalOutcome;
    });
    expect(outcome!.applied).toBe(1);
    expect(outcome!.alreadyDecided ?? []).toHaveLength(0);
    expect(outcome!.failures).toHaveLength(0);
  });

  it("does not claim an approve that only replayed an earlier one", async () => {
    const items = await readyItems();
    mockApply.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "accepted",
      applied_now: false,
      // The producer's own receipt for a change that DID land.
      receipt: {
        __kind: "google_workspace_approval_receipt",
        state: "applied",
        action: "append_document",
        output: {},
      },
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.accept(items)) as ApprovalOutcome;
    });
    expect(outcome!.applied).toBe(0);
    expect(outcome!.alreadyDecided?.[0]?.message).toContain(
      "had already been approved",
    );
    expect(outcome!.failures).toHaveLength(0);
  });

  it("never reports an approve over a row that was already REJECTED", async () => {
    const items = await readyItems();
    mockApply.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "dismissed",
      applied_now: false,
      receipt: {},
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.accept(items)) as ApprovalOutcome;
    });
    expect(outcome!.applied).toBe(0);
    const said = outcome!.alreadyDecided?.[0]?.message ?? "";
    expect(said).toContain("had already been rejected");
    expect(said).toContain("NOT approved");
  });

  it("counts a fresh reject, whose reply carries applied_now: false", async () => {
    const items = await readyItems();
    mockReject.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "dismissed",
      applied_now: false,
      receipt: {},
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.reject(items, null)) as ApprovalOutcome;
    });
    // Gating reject on `applied_now` would report every successful reject as a
    // no-op: the producer never sets it true on that path.
    expect(outcome!.applied).toBe(1);
    expect(outcome!.alreadyDecided ?? []).toHaveLength(0);
  });

  it("never reports a reject over a row that was already approved and MADE", async () => {
    const items = await readyItems();
    mockReject.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "accepted",
      applied_now: false,
      // The producer's receipt for a change that DID land — the only evidence
      // that justifies sending a person to undo something.
      receipt: {
        __kind: "google_workspace_approval_receipt",
        state: "applied",
        action: "append_document",
        output: {},
      },
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.reject(items, null)) as ApprovalOutcome;
    });
    expect(outcome!.applied).toBe(0);
    expect(outcome!.alreadyDecided?.[0]?.message).toContain(
      "had already been APPROVED",
    );
    expect(outcome!.alreadyDecided?.[0]?.message).toContain(
      "Undo it where it landed",
    );
  });

  it("a reject over an approved row with NO readable receipt does not claim it landed", async () => {
    // The finding: this exact reply printed "the change was made… Undo it where
    // it landed" while the accept path, over the same reply, said the record
    // does not say (Bugbot round 10 #2). Both paths now read the receipt.
    const items = await readyItems();
    mockReject.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "accepted",
      applied_now: false,
      receipt: {},
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.reject(items, null)) as ApprovalOutcome;
    });
    expect(outcome!.applied).toBe(0);
    const said = outcome!.alreadyDecided?.[0]?.message ?? "";
    expect(said).toContain("does not say");
    expect(said).not.toContain("Undo it where it landed");
  });

  it("treats a status it cannot read as a failure, naming it", async () => {
    const items = await readyItems();
    mockApply.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "superseded",
      applied_now: false,
      receipt: {},
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.accept(items)) as ApprovalOutcome;
    });
    expect(outcome!.applied).toBe(0);
    expect(outcome!.failures[0]?.message).toContain("superseded");
  });
});

/**
 * FORCING TESTS for the worst finding of the round-2 hostile verification
 * (common-docs `/projects/google-native/VERIFY-U-P4-U-M1-R2.md` § A-iii): THE
 * FRONTEND NEVER READ `receipt.state`.
 *
 * aidream's `apply_google_approval` claims the row, runs the action, and on
 * failure stores `{state: "failed", error}` — and the door's reply carries that
 * same receipt. Reading only `status` + `applied_now`, the queue answered a
 * FAILED receipt with, verbatim, "had already been approved, so nothing was
 * done again — the change was made by that first approval, not by this click",
 * and said the same while an apply was still `applying`. Nobody was ever told
 * the change did not happen.
 *
 * The replies below are the producer's, field for field, including the `pending`
 * status aidream lane B-8 returns a failed apply with so the person can retry
 * from the queue.
 */
describe("the receipt says what happened, and the screen says the same", () => {
  const readyItems = async () => {
    mockPayload = READABLE_PAYLOAD.document_append;
    await mount(documentAppendKind);
    return harness!.items;
  };

  it("a FAILED receipt is a failure that names the refusal and offers a retry", async () => {
    const items = await readyItems();
    mockApply.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "accepted",
      applied_now: false,
      receipt: {
        __kind: "google_workspace_approval_receipt",
        state: "failed",
        action: "append_document",
        error: "Google refused the request: the document is read-only.",
        failed_at: "2026-09-17T00:00:00Z",
      },
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.accept(items)) as ApprovalOutcome;
    });
    expect(outcome!.applied).toBe(0);
    expect(outcome!.alreadyDecided ?? []).toHaveLength(0);
    const said = outcome!.failures[0]?.message ?? "";
    expect(said).toContain("NOT made");
    expect(said).toContain("read-only");
    expect(said).toContain("Try again");
    // The sentence that was printed over this exact receipt must be gone.
    expect(said).not.toContain("the change was made");
  });

  it("B-8's contract — a failed apply returned to `pending` — reads the same", async () => {
    const items = await readyItems();
    mockApply.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "pending",
      applied_now: false,
      receipt: {
        __kind: "google_workspace_approval_receipt",
        state: "failed",
        action: "append_document",
        error: "The Google token expired mid-write.",
      },
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.accept(items)) as ApprovalOutcome;
    });
    expect(outcome!.applied).toBe(0);
    expect(outcome!.failures[0]?.message).toContain("NOT made");
  });

  it("an APPLYING receipt is neither applied nor already-decided", async () => {
    const items = await readyItems();
    mockApply.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "accepted",
      applied_now: false,
      receipt: {
        __kind: "google_workspace_approval_receipt",
        state: "applying",
        started_at: "2026-09-17T00:00:00Z",
      },
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.accept(items)) as ApprovalOutcome;
    });
    expect(outcome!.applied).toBe(0);
    const said = outcome!.alreadyDecided?.[0]?.message ?? "";
    expect(said).toContain("being applied now");
    expect(said).not.toContain("the change was made");
  });

  it("a reject over a row whose apply FAILED does not claim the change landed", async () => {
    const items = await readyItems();
    mockReject.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "accepted",
      applied_now: false,
      receipt: {
        __kind: "google_workspace_approval_receipt",
        state: "failed",
        error: "Sheets refused the range.",
      },
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.reject(items, null)) as ApprovalOutcome;
    });
    // The old reject path said "had already been APPROVED and the change was
    // made, so it could not be rejected. Undo it where it landed." — over a
    // change that never landed (§ A-v, second gap).
    expect(outcome!.applied).toBe(0);
    const said =
      (outcome!.failures[0]?.message ?? "") +
      (outcome!.alreadyDecided?.[0]?.message ?? "");
    expect(said).toContain("NOT made");
    expect(said).not.toContain("Undo it where it landed");
  });

  it("an approve with no readable receipt says the record does not say", async () => {
    const items = await readyItems();
    mockApply.mockResolvedValueOnce({
      approval_id: "assist-1",
      status: "accepted",
      applied_now: false,
      receipt: {},
    });
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = (await harness!.accept(items)) as ApprovalOutcome;
    });
    expect(outcome!.applied).toBe(0);
    const said = outcome!.alreadyDecided?.[0]?.message ?? "";
    expect(said).toContain("does not say");
    expect(said).not.toContain("the change was made");
  });

  it("a pending row carrying a FAILED receipt renders as a retry, not as waiting", async () => {
    mockPayload = READABLE_PAYLOAD.document_append;
    failedReceiptOnRow = {
      __kind: "google_workspace_approval_receipt",
      state: "failed",
      error: "Google refused the request: the document is read-only.",
    };
    try {
      await mount(documentAppendKind);
      const item = harness!.items[0]!;
      expect(item.lastAttempt?.state).toBe("failed");
      expect(item.lastAttempt?.sentence).toContain("NOT made");
      expect(item.inFlight ?? null).toBeNull();
    } finally {
      failedReceiptOnRow = null;
    }
  });

  it("a pending row whose apply is IN FLIGHT offers no decision at all", async () => {
    mockPayload = READABLE_PAYLOAD.document_append;
    failedReceiptOnRow = {
      __kind: "google_workspace_approval_receipt",
      state: "applying",
      started_at: "2026-09-17T00:00:00Z",
    };
    try {
      await mount(documentAppendKind);
      const item = harness!.items[0]!;
      expect(item.inFlight?.sentence).toContain("being applied now");
      expect(item.lastAttempt ?? null).toBeNull();
    } finally {
      failedReceiptOnRow = null;
    }
  });
});
