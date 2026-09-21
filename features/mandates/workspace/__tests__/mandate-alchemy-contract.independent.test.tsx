import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Json, Source } from "@ai-matrx/alchemy/core";
import type { MandateDefinitionRow } from "@/lib/supabase/mandateStorage";
import type { ProvisionOffer } from "../../provisions";
import type { MandateWorkspaceData } from "../useMandateWorkspaceData";

type MenuProps = {
  source: Source;
  variants: readonly { id: string; source: Source }[];
};

let latestMenuProps: MenuProps | null = null;

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/alchemy/react", () => ({
  ContentTransferMenu: (props: MenuProps) => {
    latestMenuProps = props;
    return null;
  },
}));

import {
  MandateAlchemy,
  MandateAlchemyCaptureProvider,
  buildMandateDefinitionCore,
  useMandateAlchemyTabCapture,
  type MandateAlchemyCapture,
} from "../MandateAlchemy";

const HARBOR_DENTAL_MANDATE = {
  accepts_user_input: true,
  auto_context_disabled: false,
  code_path: "services/dental/mandates.py",
  created_at: "2026-09-20T19:00:00.000Z",
  created_by: null,
  default_holder_id: null,
  default_holder_type: "agent",
  default_holder_version_id: null,
  deleted_at: null,
  description: "Routes a new-patient intake to the right dental team.",
  draft_inputs: [],
  fallback_mandate_key: null,
  goal: "Keep A & B <safe> while preserving \"quoted\" and 'apostrophe' text.",
  goal_grounding: "H",
  id: "d534f048-e93c-4f6e-95d2-fb657c935ac5",
  input_source: null,
  input_waiver: null,
  is_enabled: true,
  label: "New-patient intake triage",
  mandate_key: "dental.patient_intake_triage",
  metadata: { output_constraints: "One decision & one rationale <500 chars" },
  organization_id: "b26a3eb4-48cf-40dc-8130-84133a995663",
  origin: "code",
  output_kind: "patient_intake_decision",
  output_waiver: null,
  pinned_context: [],
  pins: {},
  provision_key: "dental.patient_intake",
  renamed_from_key: null,
  required_context_policies: [],
  required_output_keys: ["team", "urgency"],
  source_mandate_id: null,
  updated_at: "2026-09-20T19:30:00.000Z",
  updated_by: null,
  version: 4,
  visibility: "public",
} satisfies MandateDefinitionRow;

const HARBOR_DENTAL_OFFER = {
  id: "7e0c9219-2ed0-47dc-9de1-1c17ac151d45",
  provisionKey: "dental.patient_intake",
  label: "New-patient intake",
  description: "Fields available when a dental practice receives an intake.",
  offerKindSlug: "dental.patient_intake.offer",
  values: [
    {
      name: "intake_form",
      kind: "patient_intake_form",
      guaranteed: true,
      lazy: false,
      description: "Symptoms & requested care <as submitted>",
      example: "Cleaning & sensitivity",
    },
  ],
  isEnabled: true,
  codePath: "services/dental/provisions.py",
} satisfies ProvisionOffer;

function workspaceData(input: {
  mandate?: MandateDefinitionRow;
  offer?: ProvisionOffer | null;
  provisionKey?: string | null;
} = {}): MandateWorkspaceData {
  return {
    mandate: input.mandate ?? HARBOR_DENTAL_MANDATE,
    contract: {
      requiredVariables: [],
      requiredContextPolicyKeys: [],
      requiredOutputKeys: ["team", "urgency"],
      spillVariables: [],
    },
    provisionKey:
      input.provisionKey === undefined
        ? HARBOR_DENTAL_MANDATE.provision_key
        : input.provisionKey,
    pins: {},
    pinnedContext: [],
    offer: input.offer === undefined ? HARBOR_DENTAL_OFFER : input.offer,
    bindings: [],
    agentsById: {},
    versionsById: {},
  };
}

function capturePayload(source: Source): Promise<Json | string> {
  return source
    .capture({ scope: "target", signal: new AbortController().signal })
    .then(({ snapshot }) => {
      if (snapshot.payload.kind === "json") return snapshot.payload.value;
      if (snapshot.payload.kind === "text") return snapshot.payload.text;
      throw new Error(`Unexpected payload kind: ${snapshot.payload.kind}`);
    });
}

function registeredMenu(): MenuProps {
  if (!latestMenuProps) throw new Error("Alchemy menu did not register its sources.");
  return latestMenuProps;
}

async function renderHarness(children: ReactNode): Promise<{
  rerender(next: ReactNode): Promise<void>;
  unmount(): Promise<void>;
}> {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => root.render(children));
  return {
    async rerender(next) {
      await act(async () => root.render(next));
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function TabPart({
  tab,
  partId,
  capture,
}: {
  tab: "test" | "notes";
  partId: string;
  capture: MandateAlchemyCapture;
}) {
  useMandateAlchemyTabCapture(tab, capture, partId);
  return null;
}

function AlchemyHarness({ children, activeTab = "test" }: { children?: ReactNode; activeTab?: "definition" | "test" | "notes" }) {
  return (
    <MandateAlchemyCaptureProvider>
      {children}
      <MandateAlchemy
        data={workspaceData()}
        activeTab={activeTab}
        tabs={[activeTab]}
        perspective="system"
        organizationName={null}
        buildTab={() => ({ status: "error", message: "required contribution absent" })}
      />
    </MandateAlchemyCaptureProvider>
  );
}

beforeEach(() => {
  latestMenuProps = null;
});

describe("Mandate Definition Core export contract", () => {
  it.each([
    ["system", null, true, "System"],
    ["organization", "Harbor Dental Group", false, "Harbor Dental Group"],
  ] as const)(
    "emits exactly the seven core keys for the %s perspective",
    (perspective, organizationName, acceptsUserInput, expectedScope) => {
      const mandate = {
        ...HARBOR_DENTAL_MANDATE,
        accepts_user_input: acceptsUserInput,
      } satisfies MandateDefinitionRow;

      const core = buildMandateDefinitionCore(
        workspaceData({ mandate }),
        perspective,
        organizationName,
      ) as Record<string, Json>;

      expect(Object.keys(core)).toEqual([
        "scope",
        "feature",
        "enabled",
        "goal",
        "provision",
        "human_input",
        "output",
      ]);
      expect(core.scope).toBe(expectedScope);
      expect(core.feature).toBe("dental");
      expect(core.human_input).toBe(acceptsUserInput);
    },
  );

  it("refuses to describe a named provision as an empty list when its row is unavailable", () => {
    expect(() =>
      buildMandateDefinitionCore(
        workspaceData({ offer: null, provisionKey: "dental.patient_intake" }),
        "system",
        null,
      ),
    ).toThrow(/provision/i);
  });

  it("preserves a saved draft input example when no code provision is declared", () => {
    const mandate = {
      ...HARBOR_DENTAL_MANDATE,
      provision_key: null,
      draft_inputs: [
        {
          name: "chief_concern",
          description: "The reason the patient requested care.",
          kind: "text",
          required: true,
          example: "Sensitivity when drinking cold water",
        },
      ],
    } satisfies MandateDefinitionRow;

    const core = buildMandateDefinitionCore(
      workspaceData({ mandate, offer: null, provisionKey: null }),
      "system",
      null,
    ) as Record<string, Json>;

    expect(core.provision).toEqual([
      {
        name: "chief_concern",
        description: "The reason the patient requested care.",
        kind: "text",
        required: true,
        example: "Sensitivity when drinking cold water",
      },
    ]);
  });

  it("produces readable XML while escaping every XML-significant character", async () => {
    const view = await renderHarness(<AlchemyHarness activeTab="definition" />);
    const xmlSource = registeredMenu().variants.find(({ id }) => id === "core-xml")?.source;
    if (!xmlSource) throw new Error("Core XML source was not registered.");

    const payload = await capturePayload(xmlSource);

    expect(payload).toContain("\n  <scope>System</scope>\n");
    expect(payload).toContain("\n  <provision>\n    <item>\n");
    expect(payload).toContain(
      "<goal>Keep A &amp; B &lt;safe&gt; while preserving &quot;quoted&quot; and &apos;apostrophe&apos; text.</goal>",
    );
    expect(payload).toContain(
      "<description>Symptoms &amp; requested care &lt;as submitted&gt;</description>",
    );
    expect(payload).toContain("<human_input>true</human_input>");
    expect(payload).toContain("\n  <output>\n");
    await view.unmount();
  });
});

describe("Mandate tab capture contract", () => {
  it("preserves semantic part IDs instead of emitting order-based part numbers", async () => {
    const view = await renderHarness(
      <AlchemyHarness>
        <TabPart tab="test" partId="comparison" capture={{ status: "ready", data: { candidates: 2 } }} />
        <TabPart tab="test" partId="run_once" capture={{ status: "ready", data: { running: false } }} />
      </AlchemyHarness>,
    );

    await expect(capturePayload(registeredMenu().source)).resolves.toEqual({
      tab: "test",
      saved_only: false,
      data: {
        comparison: { candidates: 2 },
        run_once: { running: false },
      },
    });
    await view.unmount();
  });

  it("refuses capture while a required contribution is loading or unavailable", async () => {
    const view = await renderHarness(
      <AlchemyHarness>
        <TabPart tab="test" partId="comparison" capture={{ status: "loading" }} />
      </AlchemyHarness>,
    );
    await expect(capturePayload(registeredMenu().source)).rejects.toThrow(/still loading/i);

    await view.rerender(
      <AlchemyHarness>
        <TabPart tab="test" partId="comparison" capture={{ status: "error", message: "Test cases could not be read." }} />
      </AlchemyHarness>,
    );
    await expect(capturePayload(registeredMenu().source)).rejects.toThrow(
      /Test cases could not be read/,
    );
    await view.unmount();
  });

  it("carries saved-only disclosure into the all-tabs artifact", async () => {
    const view = await renderHarness(
      <AlchemyHarness activeTab="notes">
        <TabPart
          tab="notes"
          partId="saved_notes"
          capture={{ status: "ready", savedOnly: true, data: { notes: [{ body: "Confirm insurance before the visit." }] } }}
        />
      </AlchemyHarness>,
    );
    const allTabs = registeredMenu().variants.find(({ id }) => id === "all-tabs")?.source;
    if (!allTabs) throw new Error("All-tabs source was not registered.");

    await expect(capturePayload(allTabs)).resolves.toEqual({
      tabs: {
        notes: {
          saved_only: true,
          data: {
            saved_notes: {
              notes: [{ body: "Confirm insurance before the visit." }],
            },
          },
        },
      },
    });
    await view.unmount();
  });
});
