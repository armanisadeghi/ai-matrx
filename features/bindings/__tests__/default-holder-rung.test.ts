/**
 * THE BOTTOM RUNG — the mandate's OWN default holder — CAN BE SET, AND SAYS WHO
 * MAY SET IT.
 *
 * 🚨 THE FINDING (FIX-R3/W3, a fresh Sonnet walk of v0.4.1718). A mandate's
 * bottom rung is `mandate.definition.default_holder_*`; `mandate._rungs`
 * returns it as the `system` rung, and per FIX-R1 its principal is the
 * mandate's HOME organization — everybody, for a system-homed mandate; that one
 * organization, for an org-homed one. Two defects, one finding:
 *
 *   1. it could not be set from the UI at all — there was no client seam and no
 *      control, only the admin console writing `mandate.definition` through
 *      PostgREST;
 *   2. `ScopeHolderBar` told every reader the bottom rung *"is a super-admin
 *      decision, so it is not offered here"* — TRUE for a system-homed mandate,
 *      and WRONG for an org-homed one, whose bottom rung belongs to that
 *      organization's own administrators.
 *
 * THE CLASS, not the instance: this guard drives the REAL predicate function
 * over the whole authority matrix, and reads the shipped copy census off the
 * source rather than a snapshot — a snapshot would pass the moment somebody
 * re-typed the same wrong sentence somewhere else on the page.
 *
 * Everything new is required LAZILY, so this file still LOADS against the code
 * as it shipped: the copy census then fails on the sentence that was really
 * there, instead of the whole suite dying on an unresolvable import.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";

jest.mock("@/lib/api/call-api", () => ({
  callApi: jest.fn((config: unknown) => config),
}));

jest.mock("@/features/mandates/service", () => ({
  invalidateMandateCache: jest.fn(),
}));

const callApiMock = jest.mocked(callApi);

const BINDINGS_DIR = join(__dirname, "..");
const SCOPE_HOLDER_BAR = join(BINDINGS_DIR, "ScopeHolderBar.tsx");

function rungModule(): typeof import("../default-holder-rung") {
  return require("../default-holder-rung");
}
function overridesModule(): typeof import("@/features/mandates/overrides") {
  return require("@/features/mandates/overrides");
}

const SYSTEM_ORG = "39c38960-d30c-4840-b0c1-c9960de95582";
const ACME = "11111111-2222-3333-4444-555555555555";

function dispatchWith(data: unknown): AppDispatch {
  return jest.fn().mockResolvedValue({ data }) as unknown as AppDispatch;
}
function dispatchRefusing(error: unknown): AppDispatch {
  return jest.fn().mockResolvedValue({ error }) as unknown as AppDispatch;
}

// ── 1. THE BLANKET SENTENCE IS GONE ─────────────────────────────────────────

describe("the bottom rung's copy", () => {
  it("no longer tells every reader the bottom rung is a super-admin decision", () => {
    const source = readFileSync(SCOPE_HOLDER_BAR, "utf8");
    expect(source).not.toContain(
      "The system rung — the answer everybody gets",
    );
    expect(source).not.toContain("so it is not offered here");
  });

  it("refuses an org-homed mandate by naming THAT organization's administrators", () => {
    const offer = rungModule().defaultHolderRungOffer({
      homeOrganizationId: ACME,
      homeOrganizationName: "Acme Robotics",
      homeOrganizationRole: "member",
      isSuperAdmin: false,
    });
    expect(offer.offered).toBe(false);
    const refusal = offer.refusal ?? "";
    expect(refusal).toContain("Acme Robotics");
    expect(refusal).toMatch(/administrator/i);
    // …and what the reader CAN do instead, which is the half a refusal without
    // a remedy always loses.
    expect(refusal).toMatch(/your own answer/i);
    // It must NOT claim this is a super-admin decision — that is the lie.
    expect(refusal).not.toMatch(/super.?admin/i);
  });

  it("refuses a system-homed mandate by naming the platform administrator and the blast radius", () => {
    const offer = rungModule().defaultHolderRungOffer({
      homeOrganizationId: SYSTEM_ORG,
      homeOrganizationName: "Matrx System",
      homeOrganizationRole: null,
      isSuperAdmin: false,
    });
    expect(offer.offered).toBe(false);
    const refusal = offer.refusal ?? "";
    expect(refusal).toMatch(/every user on the platform/i);
    expect(refusal).toMatch(/platform administrator/i);
    expect(refusal).toMatch(/your own answer/i);
  });
});

// ── 2. WHO IS OFFERED THE RUNG — the whole matrix, through the real predicate ─

describe("who may set the mandate's own default", () => {
  const CASES: ReadonlyArray<{
    name: string;
    home: string;
    role: string | null;
    superAdmin: boolean;
    offered: boolean;
  }> = [
    {
      name: "system-homed + super admin",
      home: SYSTEM_ORG,
      role: null,
      superAdmin: true,
      offered: true,
    },
    {
      name: "system-homed + owner of some other organization",
      home: SYSTEM_ORG,
      role: "owner",
      superAdmin: false,
      offered: false,
    },
    {
      name: "system-homed + nobody in particular",
      home: SYSTEM_ORG,
      role: null,
      superAdmin: false,
      offered: false,
    },
    {
      name: "org-homed + owner of the home organization",
      home: ACME,
      role: "owner",
      superAdmin: false,
      offered: true,
    },
    {
      name: "org-homed + admin of the home organization",
      home: ACME,
      role: "admin",
      superAdmin: false,
      offered: true,
    },
    {
      name: "org-homed + plain member of the home organization",
      home: ACME,
      role: "member",
      superAdmin: false,
      offered: false,
    },
    {
      name: "org-homed + not a member at all",
      home: ACME,
      role: null,
      superAdmin: false,
      offered: false,
    },
    {
      name: "org-homed + super admin",
      home: ACME,
      role: null,
      superAdmin: true,
      offered: true,
    },
  ];

  it.each(CASES)("$name → offered: $offered", ({ home, role, superAdmin, offered }) => {
    const result = rungModule().defaultHolderRungOffer({
      homeOrganizationId: home,
      homeOrganizationName: home === SYSTEM_ORG ? "Matrx System" : "Acme Robotics",
      homeOrganizationRole: role,
      isSuperAdmin: superAdmin,
    });
    expect(result.offered).toBe(offered);
    // Offered or not, exactly one of the two is present — a rung that is
    // neither offered nor explained is the dead control this campaign kills.
    expect(result.offered ? result.refusal === null : result.refusal !== null).toBe(
      true,
    );
  });

  it("names the HOME organization in the label, never the caller's active one", () => {
    const offer = rungModule().defaultHolderRungOffer({
      homeOrganizationId: ACME,
      homeOrganizationName: "Acme Robotics",
      homeOrganizationRole: "admin",
      isSuperAdmin: false,
    });
    expect(offer.label).toBe("Default for Acme Robotics");
    expect(
      rungModule().defaultHolderRungOffer({
        homeOrganizationId: SYSTEM_ORG,
        homeOrganizationName: "Matrx System",
        homeOrganizationRole: null,
        isSuperAdmin: true,
      }).label,
    ).toBe("System default");
  });

  it("says so, rather than guessing, while the home is still unread", () => {
    const offer = rungModule().defaultHolderRungOffer({
      homeOrganizationId: null,
      homeOrganizationName: null,
      homeOrganizationRole: null,
      isSuperAdmin: true,
    });
    expect(offer.offered).toBe(false);
    expect(offer.refusal).toMatch(/home/i);
  });
});

// ── 3. THE SAVE GOES THROUGH THE DOOR, AND CARRIES THE HOLDER ONLY ──────────

describe("saving at the bottom rung", () => {
  beforeEach(() => callApiMock.mockClear());

  it("writes through PUT /mandates/{mandate_key}/default-holder", async () => {
    await overridesModule().putMandateDefaultHolder(
      dispatchWith({
        mandate_key: "podcast.multihost_script",
        home_organization_id: ACME,
        holder_type: "agent",
        holder_id: "agent-1",
        holder_version_id: null,
        use_latest: true,
        applies_in: "Everyone in organization … runs this by default.",
      }),
      "podcast.multihost_script",
      {
        holderType: "agent",
        agentId: "agent-1",
        agentVersionId: null,
        useLatest: true,
        holderId: null,
        holderVersionId: null,
      },
    );

    expect(callApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/mandates/{mandate_key}/default-holder",
        method: "PUT",
        pathParams: { mandate_key: "podcast.multihost_script" },
      }),
    );
  });

  it("sends the holder and NOTHING a definition default cannot hold", async () => {
    await overridesModule().putMandateDefaultHolder(
      dispatchWith({ home_organization_id: ACME, use_latest: true }),
      "podcast.multihost_script",
      {
        holderType: "agent",
        agentId: "agent-1",
        agentVersionId: null,
        useLatest: true,
        holderId: null,
        holderVersionId: null,
      },
    );

    const body = (callApiMock.mock.calls[0][0] as { body: Record<string, unknown> })
      .body;
    // The definition default has no map, no settings, no auto-run and no
    // principal — a control that appears to save one is the class this kills.
    for (const forbidden of [
      "consumption_map",
      "config_overrides",
      "auto_run",
      "is_enabled",
      "principal_type",
    ]) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
    expect(body.agent_id).toBe("agent-1");
    expect(body.use_latest).toBe(true);
  });

  it("never sends both the agent and a pinned version", async () => {
    await overridesModule().putMandateDefaultHolder(
      dispatchWith({ home_organization_id: ACME, use_latest: false }),
      "podcast.multihost_script",
      {
        holderType: "agent",
        agentId: "agent-1",
        agentVersionId: "version-9",
        useLatest: false,
        holderId: null,
        holderVersionId: null,
      },
    );
    const body = (callApiMock.mock.calls[0][0] as { body: Record<string, unknown> })
      .body;
    expect(body.agent_version_id).toBe("version-9");
    expect(body.agent_id).toBeNull();
  });

  it("reads the server's own applies_in sentence back, and never invents one", async () => {
    const report = await overridesModule().putMandateDefaultHolder(
      dispatchWith({
        home_organization_id: ACME,
        use_latest: true,
        applies_in: "Everyone in Acme Robotics runs this unless something above it is set.",
      }),
      "podcast.multihost_script",
      {
        holderType: "agent",
        agentId: "agent-1",
        agentVersionId: null,
        useLatest: true,
        holderId: null,
        holderVersionId: null,
      },
    );
    expect(report.appliesIn).toBe(
      "Everyone in Acme Robotics runs this unless something above it is set.",
    );

    const silent = await overridesModule().putMandateDefaultHolder(
      dispatchWith({ home_organization_id: ACME, use_latest: true }),
      "podcast.multihost_script",
      {
        holderType: "agent",
        agentId: "agent-1",
        agentVersionId: null,
        useLatest: true,
        holderId: null,
        holderVersionId: null,
      },
    );
    expect(silent.appliesIn).toBeNull();
  });
});

// ── 4. THE DOOR'S REFUSAL REACHES THE SCREEN INTACT ─────────────────────────

describe("the door's refusals", () => {
  beforeEach(() => callApiMock.mockClear());

  it.each([
    [
      403,
      "mandate_default_holder_org_admin_required",
      "'podcast.multihost_script' is homed in organization 1111…, and its default decides for everyone in that organization — so only an administrator of that organization (or a platform administrator) can set it.",
    ],
    [
      409,
      "mandate_default_holder_containment",
      "Holder \"Slide Maker\" is not runnable by the organization this job is homed in.",
    ],
    [
      422,
      "mandate_binding_ambiguous_holder",
      "Choose either the agent (always its latest version) or one pinned version — not both.",
    ],
  ])("carries the %s sentence out whole", async (status, code, sentence) => {
    await expect(
      overridesModule().putMandateDefaultHolder(
        dispatchRefusing({
          message: "Request failed",
          status,
          serverDetail: {
            error: code,
            code,
            message: sentence,
            user_message: sentence,
          },
        }),
        "podcast.multihost_script",
        {
          holderType: "agent",
          agentId: "agent-1",
          agentVersionId: null,
          useLatest: true,
          holderId: null,
          holderVersionId: null,
        },
      ),
    ).rejects.toThrow(sentence);
  });
});
