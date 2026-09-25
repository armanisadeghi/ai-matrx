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
  ProInput: () => null,
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: () => null,
}));
jest.mock("@/components/official/CollapsibleText", () => ({
  CollapsibleText: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleTextGroupControls: () => null,
}));
const capturedHandlers: Array<Record<string, (raw: unknown) => Promise<unknown>>> = [];
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
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
