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
import type { ApprovalItem, ApprovalKind } from "@/features/approvals/types";

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

jest.mock("../google-door", () => ({
  applyGoogleApproval: (...args: unknown[]) => mockApply(...(args as [])),
  rejectGoogleApproval: (...args: unknown[]) => mockReject(...(args as [])),
}));
jest.mock("../data", () => ({
  APPROVAL_SURFACE: "matrx-user/approval-queue",
  APPROVAL_PAGE_SIZE: 50,
  listPendingProposals: async (_userId: string, kindId: string) => ({
    proposals: [
      {
        assist: {
          id: "assist-1",
          title: `a ${kindId} proposal`,
          createdAt: "2026-09-17T00:00:00Z",
        },
        proposalKind: kindId,
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

  it("contact_import shows the field map, value by value", async () => {
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
          { person_field: "display_name", value: "Dana Reed", source: "google_contacts" },
          {
            person_field: "emails",
            value: ["dana@example.com"],
            source: "google_contacts",
          },
        ],
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
