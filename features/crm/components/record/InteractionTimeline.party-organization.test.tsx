/**
 * An interaction belongs with its PARTY (coordinator ruling, 2026-09-25). The
 * deal record page mounts the timeline with `orgId = deal.organization_id`;
 * when a deal's organization has diverged from its party's, logging used the
 * DEAL's org and the database refused the row (it raises when an explicit
 * org differs from the party's). The party's org must win.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { logInteraction } from "../../service";
import { InteractionTimeline } from "./InteractionTimeline";


(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("./CrmRecordCopyButtons", () => ({
  CrmRecordCopyButtons: () => null,
}));
jest.mock("./SectionCard", () => ({
  SectionCard: ({
    action,
    children,
  }: {
    action: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <section>
      {action}
      {children}
    </section>
  ),
  SectionEmpty: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock("@/components/official/ProInput", () => ({
  ProInput: ({ value, onChange, "aria-label": label }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input aria-label={label} value={value} onChange={onChange} />
  ),
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({ value, onChange, onSubmit, submitDisabled }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    onSubmit: () => Promise<void>;
    submitDisabled: boolean;
  }) => (
    <>
      <textarea aria-label="Activity details" value={value} onChange={onChange} />
      <button type="button" disabled={submitDisabled} onClick={() => void onSubmit()}>Log activity</button>
    </>
  ),
}));
jest.mock("@/components/official/CollapsibleText", () => ({
  CollapsibleText: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleTextGroupControls: () => null,
}));
const capturedHandlers: Array<Record<string, (raw: unknown) => Promise<unknown>>> = [];
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  useSurfaceWriteHandlers: (
    _surface: unknown,
    handlers: Record<string, (raw: unknown) => Promise<unknown>>,
  ) => {
    capturedHandlers.push(handlers);
  },
}));
jest.mock("@/features/overlays/openers/gmailComposeWindow", () => ({
  useOpenGmailComposeWindow: () => jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("../../deals/useOrgMembers", () => ({
  useOrgMembers: () => ({ memberById: new Map() }),
}));
jest.mock("../../gmail/GmailSentRecordDetails", () => ({
  GmailSentRecordDetails: () => null,
}));
jest.mock("../../gmail/sent-record-facts", () => ({
  isGmailSentRecord: () => false,
}));
jest.mock("../../service", () => ({
  logInteraction: jest.fn(),
  removeInteraction: jest.fn(),
}));
jest.mock("../outreach-lists/badges", () => ({
  InboundLabelBadge: () => null,
}));


const PARTY_ID = "33333333-3333-4333-8333-333333333333";
const PARTY_ORG = "44444444-4444-4444-8444-444444444444";
const DEAL_ORG = "55555555-5555-4555-8555-555555555555";

describe("InteractionTimeline files an interaction in its party's organization", () => {
  // A provider-access operator must record a web inquiry as Other, not invent
  // an email/call. The mounted composer owns selection, state and save routing.
  it.each([
    { label: "Other", channel: "other", direction: "Outbound", code: "outbound", subject: "Warranty API web inquiry", body: "Contact form attempted; delivery unconfirmed." },
    { label: "Email", channel: "email", direction: "Inbound", code: "inbound", subject: "Warranty API eligibility reply", body: "Provider requests a customer sponsor." },
  ])("logs $label activity through the visible composer", async ({ label, channel, direction, code, subject, body }) => {
    jest.clearAllMocks();
    const changed = jest.fn(async () => undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() => root.render(
        <InteractionTimeline partyId={PARTY_ID} orgId={DEAL_ORG}
          partyOrganizationId={PARTY_ORG} interactions={[]} onChanged={changed}
          offerNoteChannel={false} showSendEmail={false} />,
      ));
      const channelButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(channelButton).not.toBeNull();
      const directionButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${direction}"]`);
      const subjectField = container.querySelector<HTMLInputElement>('input[aria-label="Activity subject"]');
      const bodyField = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Activity details"]');
      act(() => {
        channelButton!.click();
        directionButton!.click();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(subjectField, subject);
        subjectField!.dispatchEvent(new Event("input", { bubbles: true }));
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(bodyField, body);
        bodyField!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const logButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Log activity");
      await act(async () => logButton!.click());
      expect(logInteraction).toHaveBeenCalledTimes(1);
      expect(logInteraction).toHaveBeenCalledWith({ partyId: PARTY_ID, orgId: PARTY_ORG,
        channel, direction: code, subject, body, durationSeconds: null, dealId: null });
      expect(changed).toHaveBeenCalledTimes(1);
      expect(subjectField!.value).toBe("");
      expect(container.querySelector('button[aria-label="Note"]')).toBeNull();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("uses the party's org even when the host (a deal) passes another", async () => {
    capturedHandlers.length = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <InteractionTimeline
          partyId={PARTY_ID}
          orgId={DEAL_ORG}
          partyOrganizationId={PARTY_ORG}
          dealId="66666666-6666-4666-8666-666666666666"
          interactions={[]}
          onChanged={async () => undefined}
          writeSurfaceName="matrx-user/crm-record"
        />,
      );
    });
    const handlers = capturedHandlers[capturedHandlers.length - 1];
    await act(async () => {
      await handlers.log_interaction({
        channel: "call",
        direction: "outbound",
        subject: "Follow-up on the cleaning quote",
      });
    });
    expect((logInteraction as jest.Mock).mock.calls[0][0].orgId).toBe(PARTY_ORG);
    act(() => root.unmount());
    container.remove();
  });
});
