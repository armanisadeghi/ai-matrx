/**
 * FORCING TEST — `contact_import` renders the PLAN's own count and sentence,
 * not a count re-derived from the field map.
 *
 * aidream lane B-15 (commit `90e10777a`) changed what the producer writes:
 * `preview.would_write.promise` and `.writes`/`.contact_points` are now the
 * card's numbers, `preview.would_write.plan` is the full review (kept,
 * refused and unchanged rows included, each with the server's own sentence),
 * and an empty `field_map` means "already here or kept", never "the agent
 * needs fixing". `would_write` is now REQUIRED — no live proposal has ever
 * lacked it (`platform.assists` has held zero `contact_import` rows across
 * four rounds of hostile verification), so a payload without it is not "the
 * old shape" but a shape this build cannot read, and gets the same honest,
 * Approve-less row every other unreadable Google payload gets. This drives
 * the REAL `contactImportKind`; only the store seam
 * (`listPendingProposals`) and the network door are mocked.
 *
 * Bugbot round 19 (PR 228, comment 4042012328): the matched Person and every
 * ambiguous candidate are named from `would_write` but neither opened — a
 * named identity with no door is a dead end (`no-dead-ends` skill). Both now
 * render through `EntityRef` (`token: "party"`), the same door the contacts
 * import panel already uses for the same plan's Person — never a second one.
 *
 * Bugbot round 20 (PR 228, comment 4042104821): this card also mounts inside
 * a window panel, where a same-tab click loses the queue underneath it —
 * both doors now pass `openInNewTab`, the in-place mode `EntityRef` actually
 * offers for `party` (no peek is registered for it). The mock below renders
 * `target`/`rel` only when that prop is set, so a call site that dropped it
 * fails these assertions too.
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

let mockPayload: Json = null;

jest.mock("../google-door", () => ({
  applyGoogleApproval: (...args: unknown[]) => mockApply(...(args as [])),
  rejectGoogleApproval: (...args: unknown[]) => mockReject(...(args as [])),
}));
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
          result: null,
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
  recordApprovalDecision: jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-1",
}));
// Same stub `google-kinds.test.tsx` uses for the ONE entity door — a real
// `EntityRef` pulls in the peek registry and the route registry, which this
// suite has no business exercising; it only needs to prove the door is
// rendered, carrying the Person's id, AND — Bugbot round 20 (PR 228, comment
// 4042104821) — that it does not navigate the current tab away from a card
// that may be inside a window panel. `target`/`rel` are set only when
// `openInNewTab` is true, exactly as the real `EntityRef` renders them, so
// a call site that dropped the prop would fail this mock's assertions too.
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({
    token,
    id,
    name,
    openInNewTab,
  }: {
    token: string;
    id: string;
    name?: string;
    openInNewTab?: boolean;
  }) => (
    <a
      data-testid="entity-ref"
      data-token={token}
      data-id={id}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener noreferrer" : undefined}
    >
      {name ?? id}
    </a>
  ),
}));

/* eslint-disable import/first -- after the mocks above */
import { contactImportKind } from "./contact-import";
/* eslint-enable import/first */

const SCOPE = { key: "user-1", organizationId: "org-1", userId: "user-1" };

interface Harness {
  items: ApprovalItem[];
}

let harness: Harness | null = null;

function Probe({ kind }: { kind: ApprovalKind }) {
  const source = kind.useSource(SCOPE);
  harness = { items: source.items };
  return (
    <div>
      {source.items.map((item) => (
        <div key={item.key} data-testid="row">
          <div data-testid="headline">{item.headline}</div>
          <div data-testid="accept-effect">{item.acceptEffect}</div>
          <div data-testid="blocked-reason">{item.blocked?.reason ?? ""}</div>
          <div data-testid="blocked-who">{item.blocked?.whoCan ?? ""}</div>
          <div data-testid="body">{item.body}</div>
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

async function mount(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <Probe kind={contactImportKind} />
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
  mockApply.mockClear();
  mockReject.mockClear();
});

function text(node: HTMLElement, testId: string): string {
  return node.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
}

describe("contact_import renders B-15's plan, not a client-derived count", () => {
  it("counts from would_write, shows the server's promise, and the full plan table", async () => {
    mockPayload = {
      __kind: "contact_import_dry_run",
      preview: {
        action: "import_contact",
        google_account: "arman@example.com",
        contacts: [{ contact_id: "people/c1", name: "Dana Chen", emails: ["dana@bright.example"] }],
        // Only the LANDING row — job_title is kept manual, so it never lands.
        field_map: [
          {
            key: "display_name",
            person_field: "display_name",
            person_label: "Name",
            value: "Dana Chen",
            current_value: null,
            action: "create",
            current_state: "empty",
            explanation: "Name will be set to Dana Chen.",
          },
        ],
        would_write: {
          writes: 1,
          contact_points: 0,
          promise: "Writes 1 field onto Dana Chen. 1 value(s) changed here are kept. Google Contacts is not changed.",
          reimport_policy: "manual_wins",
          kept_fields: ["job_title"],
          refused_fields: [],
          person_id: "party-1",
          person_name: "Dana Chen",
          matched_by: "email",
          warnings: [],
          plan: [
            {
              key: "display_name",
              person_field: "display_name",
              person_label: "Name",
              value: "Dana Chen",
              current_value: null,
              action: "create",
              current_state: "empty",
              explanation: "Name will be set to Dana Chen.",
            },
            {
              key: "job_title",
              person_field: "job_title",
              person_label: "Job title",
              value: "Clinical Director",
              current_value: "Owner and Clinic Director",
              action: "kept_manual",
              current_state: "manual",
              explanation:
                "Job title was changed here to Owner and Clinic Director after the last import, so the import leaves it alone.",
            },
          ],
        },
        dry_run: true,
        imported: false,
      },
      arguments: { contact: "dana@bright.example" },
    } as unknown as Json;

    const node = await mount();
    // The card's count is the PLAN's count (1), never the count of rows this
    // screen could render (the field map here also holds 1, but the promise
    // and the kept-value line prove it read `would_write`, not the map).
    expect(text(node, "accept-effect")).toBe(
      "Writes 1 field onto Dana Chen. 1 value(s) changed here are kept. Google Contacts is not changed.",
    );
    const body = text(node, "body");
    // The FULL review — including the row that did NOT land — is on screen.
    expect(body).toContain("Name will be set to Dana Chen.");
    expect(body).toContain(
      "Job title was changed here to Owner and Clinic Director after the last import, so the import leaves it alone.",
    );
    expect(body).toContain("Matches Dana Chen");
    expect(body).toContain("its email address");
    expect(body).toContain("manual wins");
    expect(text(node, "blocked-reason")).toBe("");
    // Bugbot round 19 (PR 228, comment 4042012328): the matched Person is
    // named — it must also OPEN. A door carrying the plan's `person_id`,
    // never a name with nowhere to go.
    const matchedDoor = node.querySelector('[data-testid="entity-ref"][data-id="party-1"]');
    expect(matchedDoor).not.toBeNull();
    expect(matchedDoor?.getAttribute("data-token")).toBe("party");
    expect(matchedDoor?.textContent).toBe("Dana Chen");
    // Bugbot round 20 (PR 228, comment 4042104821): this card can mount
    // inside a window panel, so the door must not navigate the CURRENT tab
    // away from the queue underneath it — the in-place attribute (new tab)
    // is present, never a bare same-tab `href` click.
    expect(matchedDoor?.getAttribute("target")).toBe("_blank");
    expect(matchedDoor?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("an empty field_map with would_write.writes=0 says 'already here or kept', never 'the agent needs fixing'", async () => {
    mockPayload = {
      __kind: "contact_import_dry_run",
      preview: {
        action: "import_contact",
        google_account: "arman@example.com",
        contacts: [{ contact_id: "people/c1", name: "Dana Chen", emails: ["dana@bright.example"] }],
        field_map: [],
        would_write: {
          writes: 0,
          contact_points: 0,
          promise:
            "Writes nothing: everything Google has about this contact is already on Dana Chen, or is kept as it is here. Google Contacts is not changed.",
          reimport_policy: "manual_wins",
          kept_fields: ["job_title"],
          refused_fields: [],
          person_id: "party-1",
          person_name: "Dana Chen",
          matched_by: "email",
          warnings: [],
          plan: [
            {
              key: "job_title",
              person_field: "job_title",
              person_label: "Job title",
              value: "Clinical Director",
              current_value: "Owner and Clinic Director",
              action: "kept_manual",
              current_state: "manual",
              explanation:
                "Job title was changed here to Owner and Clinic Director after the last import, so the import leaves it alone.",
            },
          ],
        },
        dry_run: true,
        imported: false,
      },
      arguments: { contact: "dana@bright.example" },
    } as unknown as Json;

    const node = await mount();
    expect(text(node, "blocked-reason")).toBe(
      "Everything Google has about this contact is already here, or is kept as it is — approving this proposal would import nothing.",
    );
    expect(text(node, "blocked-reason")).not.toContain("agent");
    expect(text(node, "blocked-who")).not.toContain("needs fixing");
  });

  it("a missing knob's warning is shown, never swallowed", async () => {
    mockPayload = {
      __kind: "contact_import_dry_run",
      preview: {
        action: "import_contact",
        google_account: "arman@example.com",
        contacts: [{ contact_id: "people/c1", name: "Dana Chen", emails: ["dana@bright.example"] }],
        field_map: [
          {
            key: "display_name",
            person_field: "display_name",
            person_label: "Name",
            value: "Dana Chen",
            current_value: null,
            action: "create",
            current_state: "empty",
            explanation: "Name will be set to Dana Chen.",
          },
        ],
        would_write: {
          writes: 1,
          contact_points: 0,
          promise: "Writes 1 field onto Dana Chen. Google Contacts is not changed.",
          reimport_policy: "manual_wins",
          kept_fields: [],
          refused_fields: [],
          person_id: "party-1",
          person_name: "Dana Chen",
          matched_by: "email",
          warnings: [
            "google.contacts.reimport_policy is not registered in this database, so this import kept every value that was changed here and never overwrote one.",
          ],
          plan: [
            {
              key: "display_name",
              person_field: "display_name",
              person_label: "Name",
              value: "Dana Chen",
              current_value: null,
              action: "create",
              current_state: "empty",
              explanation: "Name will be set to Dana Chen.",
            },
          ],
        },
        dry_run: true,
        imported: false,
      },
      arguments: { contact: "dana@bright.example" },
    } as unknown as Json;

    const node = await mount();
    expect(text(node, "body")).toContain(
      "google.contacts.reimport_policy is not registered in this database",
    );
  });

  it("an ambiguous-Person refusal names the candidates and offers no Approve", async () => {
    mockPayload = {
      __kind: "contact_import_dry_run",
      preview: {
        action: "import_contact",
        google_account: "arman@example.com",
        error_type: "contact_ambiguous",
        contacts: [{ contact_id: "people/c1", name: "Dana Chen", emails: ["dana@bright.example"] }],
        candidates: [
          { person_id: "party-a", person_name: "Dana Chen", matched_by: "email" },
          { person_id: "party-b", person_name: "D. Chen", matched_by: "external_id:google_people" },
        ],
        field_map: [],
        would_write: {
          choice_required: true,
          candidates: [
            { person_id: "party-a", person_name: "Dana Chen", matched_by: "email" },
            { person_id: "party-b", person_name: "D. Chen", matched_by: "external_id:google_people" },
          ],
        },
        dry_run: true,
        imported: false,
      },
      arguments: { contact: "dana@bright.example" },
    } as unknown as Json;

    const node = await mount();
    expect(text(node, "blocked-reason")).toContain("reaches 2 People");
    const body = text(node, "body");
    expect(body).toContain("Dana Chen");
    expect(body).toContain("D. Chen");
    expect(body).toContain("its email address");
    expect(body).toContain("its Google Contacts id");
    expect(text(node, "accept-effect")).toContain("Nothing");
    // Bugbot round 19 (PR 228, comment 4042012328): every named candidate is
    // a door — a refusal that names a Person with no way to open them is a
    // dead end even though there is no Approve to click.
    const doorA = node.querySelector('[data-testid="entity-ref"][data-id="party-a"]');
    const doorB = node.querySelector('[data-testid="entity-ref"][data-id="party-b"]');
    expect(doorA?.getAttribute("data-token")).toBe("party");
    expect(doorA?.textContent).toBe("Dana Chen");
    expect(doorB?.getAttribute("data-token")).toBe("party");
    expect(doorB?.textContent).toBe("D. Chen");
    // Bugbot round 20: a refusal that names Persons with no in-place door is
    // still a dead end, panel or not.
    expect(doorA?.getAttribute("target")).toBe("_blank");
    expect(doorB?.getAttribute("target")).toBe("_blank");
  });

  it("a proposal with no would_write (no such row exists live — the pre-B-15 shape is dead, not a fallback) gets the honest unrenderable row, never a client-derived count", async () => {
    mockPayload = {
      __kind: "contact_import_dry_run",
      preview: {
        action: "import_contact",
        google_account: "arman@example.com",
        contacts: [
          { contact_id: "people/c1", name: "Dana Reed", emails: ["dana@example.com"], phones: [] },
        ],
        field_map: [
          { person_field: "display_name", value: "Dana Reed", source: "google_contacts" },
          { person_field: "emails", value: ["dana@example.com"], source: "google_contacts" },
        ],
        dry_run: true,
        imported: false,
      },
      arguments: { contact: "dana@example.com" },
    } as unknown as Json;

    const node = await mount();
    // The headline still names the contact (read off `contacts`, independent
    // of the plan) — but nothing here promises a count it cannot back.
    expect(text(node, "headline")).toContain("Dana Reed");
    expect(text(node, "accept-effect")).toBe("Nothing — this proposal cannot be read.");
    expect(text(node, "blocked-reason")).toBe(
      "This proposal does not carry the import's plan, so this screen cannot say how many fields it writes or what happens to each one.",
    );
    expect(text(node, "blocked-who")).toContain("ask for the import again");
    // No client-derived count anywhere in the body — the old "Writes 2 fields"
    // read off `field_map` must never appear again.
    expect(text(node, "body")).not.toMatch(/Writes \d+ fields?/);
  });
});
