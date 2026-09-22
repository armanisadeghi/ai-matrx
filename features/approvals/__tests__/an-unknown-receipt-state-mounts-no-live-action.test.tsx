/**
 * FORCING TEST — A RECEIPT STATE THIS BUILD HAS NEVER HEARD OF OFFERS NOTHING.
 *
 * Round-4 hostile verification, finding V14-4 (2026-09-17). The verifier put
 * `state: "claimed"` and then `state: "queued_for_retry"` on one row of each of
 * the six produced Google kinds and measured the buttons:
 *
 *     "claimed"       buttons: Add it | Create it | Import them | Leave it alone
 *     "queued…"       buttons: Add it | Create it | Import them | Leave it alone
 *
 * A live Approve over a row whose last attempt is in a state nobody here can
 * read is the § A-iii failure returning: the click could be a duplicate append,
 * a second Doc, or nothing at all, and the screen has no way to know which.
 *
 * So an unreadable STATE is now its own row state (`../receipt.ts` →
 * `unrecognized`), distinct from an absent receipt: `receiptRowMarks` returns an
 * `unknownState` mark, `noLiveAction` refuses every control over it, and the row
 * NAMES the state it cannot read. This suite drives that through the real
 * `ApprovalQueue` with a real Google kind, on the real receipt shapes the
 * verifier used.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Json } from "@/types/database.types";

/** What the row's stored `result` holds for this render. */
let result: Json | null = null;

jest.mock("../data", () => ({
  APPROVAL_SURFACE: "matrx-user/approval-queue",
  APPROVAL_PAGE_SIZE_KNOB: { feature: "approvals", key: "queue_page_size" },
  listPendingProposals: async (_userId: string, kind: { id: string }) => ({
    proposals: [
      {
        assist: {
          id: "assist-1",
          title: `a ${kind.id} proposal`,
          createdAt: "2026-09-17T00:00:00Z",
          result,
        },
        proposalKind: kind.id,
        mode: "mode_4",
        autoApplyAt: null,
        proposerLabel: "Research agent",
        proposerAgentId: null,
        proposerRunId: null,
        operatorUserId: "user-1",
        payload: {
          __kind: "document_append_dry_run",
          preview: {
            action: "append_document",
            dry_run: true,
            file_id: "doc-9",
            title: "Q3 retro",
            total_chars: 10,
            open_in_google: "https://docs.google.com/document/d/doc-9",
            would_append: {
              position: "end_of_document",
              after_char: 10,
              text: "one line",
              document_ends_with: "…end.",
            },
          },
          arguments: { file_id: "doc-9", text: "one line" },
        },
        blocked: null,
        subject: null,
      },
    ],
    total: 1,
  }),
  readProposalStatus: async () => ({ status: "unknown" }),
  recordApprovalDecision: jest.fn(),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ id }: { id: string }) => <a>{id}</a>,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-1",
}));
jest.mock("../registry", () => ({ APPROVAL_KINDS: [] }));
jest.mock("@/lib/toast", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));

// eslint-disable-next-line import/first -- after the mocks above
import { ApprovalQueue } from "../ApprovalQueue";
// eslint-disable-next-line import/first -- after the mocks above
import { documentAppendKind } from "../kinds/document-append";

const SCOPE = { key: "user-1", organizationId: "org-1", userId: "user-1" };

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  result = null;
});

async function renderQueue(): Promise<{ text: string; labels: string[] }> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ApprovalQueue
          scope={SCOPE}
          registry={[documentAppendKind]}
          defaultExpanded
          hideWhenEmpty={false}
        />
      </QueryClientProvider>,
    );
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((container.textContent ?? "").includes("Q3 retro")) break;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return {
    text: container.textContent ?? "",
    labels: [...container.querySelectorAll("button")].map(
      (button) => button.textContent ?? "",
    ),
  };
}

/** The accept label `document_append` really prints, from its own contract. */
const ACCEPT_LABEL = documentAppendKind.accept.label;
const REJECT_LABEL = documentAppendKind.reject.label;

describe("a receipt state this build does not know", () => {
  it.each(["claimed", "queued_for_retry"])(
    "%s: no Approve, no Reject, and the row says which state it cannot read",
    async (state) => {
      result = {
        __kind: "google_workspace_approval_receipt",
        state,
      } as unknown as Json;
      const screen = await renderQueue();
      // The row is on screen — it is not hidden, and it is still counted.
      expect(screen.text).toContain("Q3 retro");
      // 🚨 THE FINDING: both doors used to be live over this row.
      expect(screen.labels).not.toContain(ACCEPT_LABEL);
      expect(screen.labels).not.toContain(REJECT_LABEL);
      // And it says so in words, naming the state (never a disabled-looking row).
      expect(screen.text).toContain("a state this screen does not know");
      expect(screen.text).toContain(state);
      expect(screen.text).toContain("refresh after the next release");
    },
  );

  it("a row with NO receipt keeps both doors — the ordinary waiting case", async () => {
    const screen = await renderQueue();
    expect(screen.labels).toContain(ACCEPT_LABEL);
    expect(screen.labels).toContain(REJECT_LABEL);
  });

  it("a state the server DOES declare still behaves as itself", async () => {
    // `failed` is the shape closest to the bug: the row comes back to the queue
    // and its Approve becomes an explicit retry. An unknown state must not be
    // read as this, and this must not be read as unknown.
    result = {
      __kind: "google_workspace_approval_receipt",
      state: "failed",
      error: "Google refused the request: the document is read-only.",
    } as unknown as Json;
    const screen = await renderQueue();
    expect(screen.labels).toContain("Try again");
    expect(screen.text).toContain("The change was NOT made");
    expect(screen.text).not.toContain("a state this screen does not know");
  });
});
