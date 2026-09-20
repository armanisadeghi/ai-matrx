/**
 * FORCING TEST — the CMS content-exception kind shows the producer's OWN row,
 * decides through the ONE server door, and says what Approve really costs.
 *
 * The fixture is not an invented shape: it is what
 * `aidream/services/cms/exception_proposals.py` → `_payload` writes, field for
 * field, from a `client_content_exceptions` row. That payload IS the contract
 * between the two repos, so a fixture that drifts from it is the defect this
 * suite exists to catch. Only the store seam (`listPendingProposals`) and the
 * network door are mocked; the reader, the narrowing and the card are real.
 *
 * Three classes it holds shut:
 *   1. a field the screen invents rather than reads (every assertion names a
 *      value that exists ONLY in the fixture);
 *   2. an Approve whose sentence hides that it is a STANDING rule, not a
 *      one-time pass — the deleted CMS panel's Approve said nothing at all;
 *   3. a second executor — the kind writing the CMS row itself, or recording
 *      the decision, instead of going through the server door.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Json } from "@/types/database.types";
import type { ApprovalItem, ApprovalKind } from "@/features/approvals/types";

const mockApprove = jest.fn(async () => ({
  approval_id: "assist-1",
  status: "accepted",
  applied_now: true,
  receipt: { state: "applied" },
  sentence: "Approved — this rule no longer blocks matching content in that scope.",
}));
const mockReject = jest.fn(async () => ({
  approval_id: "assist-1",
  status: "dismissed",
  applied_now: true,
  receipt: { state: "rejected" },
  sentence: "Rejected — the content stays blocked and nothing changed.",
}));
const mockRecordDecision = jest.fn();

let mockPayload: Json = null;

jest.mock("../cms-door", () => ({
  approveCmsException: (...args: unknown[]) => mockApprove(...(args as [])),
  rejectCmsException: (...args: unknown[]) => mockReject(...(args as [])),
}));
jest.mock("../data", () => ({
  APPROVAL_SURFACE: "matrx-user/approval-queue",
  APPROVAL_PAGE_SIZE: 50,
  listPendingProposals: async (_userId: string, kind: { id: string }) => ({
    proposals: [
      {
        assist: {
          id: "assist-1",
          title: `a ${kind.id} proposal`,
          createdAt: "2026-09-19T00:00:00Z",
          result: null,
        },
        proposalKind: kind.id,
        mode: "mode_4",
        autoApplyAt: null,
        proposerLabel: "An agent running cms_page",
        proposerAgentId: null,
        proposerRunId: null,
        operatorUserId: "user-1",
        payload: mockPayload,
        blocked: null,
        subject: null,
      },
    ],
    total: 1,
    unrenderable: [],
  }),
  recordApprovalDecision: (...args: unknown[]) => mockRecordDecision(...(args as [])),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-1",
}));

/* eslint-disable import/first -- after the mocks above */
import { cmsContentExceptionKind } from "../kinds/cms-content-exception";
import { APPROVAL_KINDS } from "../registry";
/* eslint-enable import/first */

const SCOPE = { key: "user-1", organizationId: "org-1", userId: "user-1" };

/** What aidream's producer writes for a page-scoped request. */
const PRODUCER_PAYLOAD = {
  __kind: "cms_content_exception_review",
  exception_id: "exc-77",
  rule_id: "no_inline_script",
  severity: "block",
  node_path: "body > script",
  excerpt: "<script>track()</script>",
  fix_hint: "Move it into the site's script settings.",
  note: "The vendor widget needs it.",
  scope_site_id: "site-9",
  scope_page_id: "page-4",
  match_node_path_prefix: null,
  match_excerpt_contains: null,
  site_label: "Acme marketing site",
  page_label: "Pricing",
  requested_by: "user-1",
  requested_at: "2026-09-19T00:00:00Z",
} as unknown as Json;

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
          <div data-testid="reject-effect">{item.rejectEffect}</div>
          <div data-testid="blocked">{item.blocked?.reason ?? ""}</div>
          <div data-testid="mode">{item.mode}</div>
          <div data-testid="body">{item.body}</div>
          <div data-testid="doors">{item.doors}</div>
        </div>
      ))}
    </div>
  );
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
  mockApprove.mockClear();
  mockReject.mockClear();
  mockRecordDecision.mockClear();
});

function text(node: HTMLElement, testId: string): string {
  return node.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
}

describe("the CMS content-exception kind", () => {
  it("is registered in THE one registry", () => {
    expect(APPROVAL_KINDS.map((kind) => kind.id)).toContain(
      "cms_content_exception",
    );
  });

  it("shows the blocked content, the rule and the scope the producer wrote", async () => {
    mockPayload = PRODUCER_PAYLOAD;
    const node = await mount(cmsContentExceptionKind);
    const body = text(node, "body");
    expect(body).toContain("no_inline_script");
    expect(body).toContain("<script>track()</script>");
    expect(body).toContain("Move it into the site's script settings.");
    expect(body).toContain("The vendor widget needs it.");
    // The scope is the PAGE, named — not "a site", not the raw id.
    expect(text(node, "headline")).toContain("Pricing");
    expect(text(node, "mode")).toBe("mode_4");
  });

  it("says out loud that Approve is a STANDING rule, not a one-time pass", async () => {
    mockPayload = PRODUCER_PAYLOAD;
    const node = await mount(cmsContentExceptionKind);
    const accept = text(node, "accept-effect");
    expect(accept).toContain("standing rule");
    expect(accept).toContain("not a one-time pass");
    expect(accept).toContain("Future content");
    expect(text(node, "reject-effect")).toContain("stays blocked");
  });

  it("opens the site and the page it concerns (THE DOOR LAW)", async () => {
    mockPayload = PRODUCER_PAYLOAD;
    const node = await mount(cmsContentExceptionKind);
    const hrefs = [...node.querySelectorAll('[data-testid="doors"] a')].map(
      (anchor) => anchor.getAttribute("href"),
    );
    expect(hrefs).toContain("/cms/site-9");
    expect(hrefs).toContain("/cms/site-9/pages/page-4?tab=code");
  });

  it("names a GLOBAL request as binding every site, in the headline", async () => {
    mockPayload = {
      ...(PRODUCER_PAYLOAD as Record<string, unknown>),
      scope_site_id: null,
      scope_page_id: null,
      site_label: null,
      page_label: null,
    } as unknown as Json;
    const node = await mount(cmsContentExceptionKind);
    expect(text(node, "headline")).toContain("EVERY site and page");
    // Nothing to open, so there is no door — never a dead one.
    expect(node.querySelector('[data-testid="doors"] a')).toBeNull();
  });

  it("decides through the ONE server door, on the EXCEPTION id, and records nothing itself", async () => {
    mockPayload = PRODUCER_PAYLOAD;
    await mount(cmsContentExceptionKind);
    const outcome = await act(async () => harness!.accept(harness!.items));
    expect(mockApprove).toHaveBeenCalledWith("exc-77", "org-1");
    expect(mockRecordDecision).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ applied: 1, failures: [] });

    await act(async () => harness!.reject(harness!.items, "Use the settings."));
    expect(mockReject).toHaveBeenCalledWith("exc-77", "org-1", "Use the settings.");
    expect(mockRecordDecision).not.toHaveBeenCalled();
  });

  it("reads the door's answer instead of counting a reply as success", async () => {
    mockPayload = PRODUCER_PAYLOAD;
    // The door is idempotent: a second approve performs nothing and says so.
    mockApprove.mockImplementationOnce(async () => ({
      approval_id: "assist-1",
      status: "accepted",
      applied_now: false,
      receipt: { state: "applied" },
      sentence: "This was already approved and the exception is already in force.",
    }));
    await mount(cmsContentExceptionKind);
    const outcome = (await act(async () =>
      harness!.accept(harness!.items),
    )) as { applied: number; alreadyDecided?: { message: string }[] };
    expect(outcome.applied).toBe(0);
    expect(outcome.alreadyDecided?.[0]?.message).toContain("already approved");
  });

  it("shows a payload it cannot read as an honest row with no Approve", async () => {
    mockPayload = { __kind: "something_else" } as unknown as Json;
    const node = await mount(cmsContentExceptionKind);
    expect(text(node, "blocked")).toContain("does not recognise");
    expect(text(node, "accept-effect")).toContain("Nothing");
  });
});
