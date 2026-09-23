import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { InteractionRow } from "../../types";
import { InteractionTimeline } from "./InteractionTimeline";

const capturedCopyButtons: Array<Record<string, unknown>> = [];

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("./CrmRecordCopyButtons", () => ({
  CrmRecordCopyButtons: (props: Record<string, unknown>) => {
    capturedCopyButtons.push(props);
    return null;
  },
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
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  useSurfaceWriteHandlers: () => undefined,
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

const HOSTILE = "gmail-secret-token-prepare-must-never-send";
const INTERACTION = {
  address_id: null,
  approval_assist_id: null,
  approved_at: null,
  approved_by: null,
  assigned_to: null,
  attempt_number: null,
  attributes: {
    outreach_inbound: { label: "interested", evidence: HOSTILE },
  },
  body: HOSTILE,
  channel_code: "note",
  channel_id: null,
  contact_point_id: null,
  created_at: "2026-09-22T08:00:00+00:00",
  created_by: null,
  custom_fields: {},
  deal_id: null,
  deleted_at: null,
  direction: "outbound",
  drafted_by_agent_id: null,
  drafted_by_label: null,
  drafted_by_run_id: null,
  duration_seconds: null,
  id: "11111111-1111-4111-8111-111111111111",
  in_reply_to: null,
  message_id: null,
  metadata: {},
  occurred_at: "2026-09-22T08:00:00+00:00",
  organization_id: "22222222-2222-4222-8222-222222222222",
  outcome_id: null,
  outreach_list_id: null,
  party_id: "33333333-3333-4333-8333-333333333333",
  performed_by: null,
  program_key: null,
  provider: "microsoft_365",
  provider_account_id: null,
  provider_interaction_id: null,
  provider_recording_id: null,
  provider_status: null,
  provider_status_at: null,
  provider_status_sequence: null,
  recording_channels: null,
  recording_custody_at: null,
  recording_duration_seconds: null,
  recording_file_id: null,
  recording_owner_id: null,
  recording_source: null,
  recording_started_at: null,
  recording_status: null,
  recording_status_at: null,
  recording_track: null,
  recording_url: null,
  scheduled_at: null,
  status: "completed",
  subject: HOSTILE,
  thread_key: null,
  updated_at: "2026-09-22T08:00:00+00:00",
  updated_by: null,
  version: 1,
} satisfies InteractionRow;

describe("InteractionTimeline model-transfer seam", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    capturedCopyButtons.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("prepares only opaque IDs even when editable fields relabel Gmail content", () => {
    act(() => {
      root.render(
        <InteractionTimeline
          partyId={INTERACTION.party_id}
          orgId={INTERACTION.organization_id}
          interactions={[INTERACTION]}
          onChanged={async () => undefined}
          copyParent={{
            type: "party",
            id: INTERACTION.party_id,
            label: "Harbor Dental",
          }}
        />,
      );
    });

    expect(capturedCopyButtons).toHaveLength(2);
    for (const props of capturedCopyButtons) {
      // The package's Prepare action selects json before agent. There must be
      // no JSON candidate at this seam, so it can only consume the ID-only
      // agent payload.
      expect(props.json).toBeUndefined();
      expect(props.aiVariants).toBeUndefined();
      const automatic = (props.agent as () => unknown)();
      const modelBoundSnapshot = {
        content_label: props.label,
        content: automatic,
      };
      expect(JSON.stringify(modelBoundSnapshot)).toContain(INTERACTION.id);
      expect(JSON.stringify(modelBoundSnapshot)).not.toContain(HOSTILE);
      expect(JSON.stringify(modelBoundSnapshot)).not.toContain("microsoft_365");
      expect((props.human as () => string)()).toContain(HOSTILE);
    }
  });
});
