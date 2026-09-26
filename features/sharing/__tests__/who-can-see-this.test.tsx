/**
 * 🚨 SHARE-LANE-CONTROL (VERIFIER-23 item 3): "there is no 'Only people I share it with' control
 * anywhere in the UI … The store door exists; the person cannot reach it."
 *
 * What these tests hold:
 *   1. STATE READ — the record store's lane door (`store_door_lane`) is read into `whoCanSee`: the
 *      lane, the object's own organization, the level its member default grants (said even on
 *      "mine"), and "Anyone with the link" only when the world lane would accept it. A kind whose
 *      public state is an agent's CARD (`card_visibility`) gets no control: that column is not who
 *      may open the thing.
 *   2. WRITE — a choice goes through `custom.share_lane_set` with the object's organization.
 *   3. CONFIRM — "Only people I share it with" while members reach it says one sentence and applies
 *      only on confirm; every other change applies at once.
 *   4. OWNER-ONLY — someone who cannot change sharing sees the state as text, never buttons.
 *   5. AGREEMENT — Current Access shows the organization-default row under "Everyone in <org>" and
 *      not under "Only people…", and never lists the organization's own lane row a second time.
 *
 * RED before this lane (no WhoCanSeeThis, no whoCanSee on the reader); GREEN now.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABLE = "5ebcf5ec-c40e-4621-b181-d96d2a7a017b";
const ORG = "4c425bfe-9a08-402f-9496-488580623f42";

let answer: Record<string, unknown> = {};
const rpc = jest.fn(async (..._args: unknown[]) => ({ data: answer, error: null }));
const customRpc = jest.fn(async (..._args: unknown[]) => ({
  data: { lane: "mine", message: "Only the people it is shared with reach this table now." },
  error: null,
}));
let capsAnswer: Record<string, unknown> = {};
let rowAnswer: Record<string, unknown> | null = null;
const from = jest.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rowAnswer, error: null }) }) }),
}));
const schema = jest.fn(() => ({ rpc: customRpc, from }));

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ rpc, schema, from }),
  supabase: {
    rpc: (name: string, args: unknown) =>
      name === "get_share_capabilities" ? Promise.resolve({ data: capsAnswer, error: null }) : rpc(name, args),
    schema,
    from,
  },
}));
jest.mock("@/features/agent-context/hooks/useNavTree", () => ({
  useNavTree: () => ({ orgs: [{ id: ORG, name: "Oak & River", is_personal: false }], isLoading: false }),
}));

import { getResourceVisibility, setStoreLane, type WhoCanSee } from "@/utils/permissions/service";
import { WhoCanSeeThis } from "@/features/sharing/components/WhoCanSeeThis";
import { OrgAvailabilityNote } from "@/features/sharing/components/OrgAvailabilityNote";

const door = (over: Record<string, unknown>) => ({
  found: true,
  lane: "organization",
  choice: "organization",
  is_public: false,
  discoverable: false,
  organization_id: ORG,
  organization_name: "Oak & River",
  member_default_level: "viewer",
  world_open: false,
  organization_default: { level: "viewer", organization_id: ORG, organization_name: "Oak & River" },
  ...over,
});

describe("1. the lane is read from the store's lane door", () => {
  it("a table nobody chose a lane for is Everyone in its organization, at the member default", async () => {
    answer = door({});
    const v = await getResourceVisibility("record" as never, TABLE);
    expect(v.whoCanSee).toEqual({
      source: "store",
      choice: "organization",
      organizationId: ORG,
      organizationName: "Oak & River",
      memberDefaultLevel: "viewer",
      membersReachNow: true,
      worldOffered: false,
    });
  });

  it("on mine it still names the organization and what switching back gives", async () => {
    answer = door({ lane: "mine", choice: "mine", organization_default: null });
    const v = await getResourceVisibility("record" as never, TABLE);
    expect(v.whoCanSee).toMatchObject({ choice: "mine", organizationName: "Oak & River", memberDefaultLevel: "viewer", membersReachNow: false });
    expect(v.organizationDefault).toBeNull();
  });

  it("offers Anyone with the link only when the world lane is open", async () => {
    answer = door({ world_open: true });
    expect((await getResourceVisibility("record" as never, TABLE)).whoCanSee?.worldOffered).toBe(true);
  });

  it("draws no control on an agent, whose public state is its card, not who may open it", async () => {
    capsAnswer = { supports_public: true, is_link_shareable: true, public_state_kind: "enum", public_state_column: "card_visibility" };
    rowAnswer = { card_visibility: "internal" };
    const v = await getResourceVisibility("agent" as never, TABLE);
    expect(v.whoCanSee ?? null).toBeNull();
  });

  it("a site, whose reach IS its visibility enum, reads personal as mine", async () => {
    capsAnswer = { supports_public: true, is_link_shareable: true, public_state_kind: "enum", public_state_column: "visibility" };
    rowAnswer = { visibility: "personal" };
    const v = await getResourceVisibility("web_site" as never, TABLE);
    expect(v.whoCanSee).toMatchObject({ source: "visibility", choice: "mine", worldOffered: false });
  });
});

describe("2. a choice is written through custom.share_lane_set", () => {
  it("names the object's organization, the thing and the lane", async () => {
    const r = await setStoreLane(ORG, TABLE, "mine");
    expect(schema).toHaveBeenCalledWith("custom");
    expect(customRpc).toHaveBeenCalledWith("share_lane_set", { p_organization_id: ORG, p_subject_id: TABLE, p_choice: "mine" });
    expect(r).toEqual({ success: true, message: "Only the people it is shared with reach this table now." });
  });
});

describe("the control and Current Access", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  };
  const radio = (lane: string) => host.querySelector<HTMLButtonElement>(`[data-lane-choice="${lane}"]`);
  const btn = (text: string) =>
    Array.from(host.querySelectorAll("button")).find((b) => b.textContent === text);

  const orgLane: WhoCanSee = {
    source: "store",
    choice: "organization",
    organizationId: ORG,
    organizationName: "Oak & River",
    memberDefaultLevel: "viewer",
    membersReachNow: true,
    worldOffered: false,
  };

  it("shows the current state: Everyone in Oak & River selected, as Viewer, the organization's default; no world choice", () => {
    act(() => root.render(<WhoCanSeeThis whoCanSee={orgLane} canChange onChoose={jest.fn()} />));
    expect(radio("organization")?.getAttribute("aria-checked")).toBe("true");
    expect(radio("organization")?.textContent).toContain("Everyone in Oak & River");
    expect(radio("organization")?.textContent).toContain("Every member, as Viewer. This is the organization's default.");
    expect(radio("mine")?.textContent).toContain("Only people I share it with");
    expect(radio("mine")?.getAttribute("aria-checked")).toBe("false");
    expect(radio("world")).toBeNull();
    expect(host.textContent).not.toContain("Anyone with the link");
  });

  it("a thing homed in its owner's personal workspace is not offered Everyone in <workspace>", () => {
    const mineLane: WhoCanSee = { ...orgLane, choice: "mine", membersReachNow: false };
    act(() =>
      root.render(
        <WhoCanSeeThis whoCanSee={mineLane} canChange onChoose={jest.fn()} offerOrganization={false} />,
      ),
    );
    expect(radio("mine")?.getAttribute("aria-checked")).toBe("true");
    expect(radio("organization")).toBeNull();
    expect(host.textContent).not.toContain("Everyone in");
  });

  it("…but when it is already in that lane, the current state is still shown", () => {
    act(() =>
      root.render(
        <WhoCanSeeThis whoCanSee={orgLane} canChange onChoose={jest.fn()} offerOrganization={false} />,
      ),
    );
    expect(radio("organization")?.getAttribute("aria-checked")).toBe("true");
  });

  it("3. Only people I share it with, while members reach it, asks in one sentence and applies on confirm", async () => {
    const onChoose = jest.fn(async () => ({ success: true, message: "Only the people it is shared with reach this table now." }));
    act(() => root.render(<WhoCanSeeThis whoCanSee={orgLane} canChange onChoose={onChoose} />));
    act(() => radio("mine")!.click());
    expect(onChoose).not.toHaveBeenCalled();
    expect(host.querySelector("[data-lane-confirm]")?.textContent).toContain(
      "Everyone in Oak & River who is not named below loses access, including the organization's owners.",
    );
    act(() => btn("Keep it")!.click());
    expect(host.querySelector("[data-lane-confirm]")).toBeNull();
    expect(onChoose).not.toHaveBeenCalled();
    act(() => radio("mine")!.click());
    act(() => btn("Only people I share it with")!.click());
    await flush();
    expect(onChoose).toHaveBeenCalledWith("mine");
    expect(host.querySelector("[data-lane-said]")?.textContent).toBe("Only the people it is shared with reach this table now.");
  });

  it("back to Everyone in <org> applies at once, and a refusal is said in words", async () => {
    const onChoose = jest.fn(async () => ({ success: false, error: "You do not have access to this record." }));
    act(() =>
      root.render(
        <WhoCanSeeThis whoCanSee={{ ...orgLane, choice: "mine", membersReachNow: false }} canChange onChoose={onChoose} />,
      ),
    );
    act(() => radio("organization")!.click());
    await flush();
    expect(onChoose).toHaveBeenCalledWith("organization");
    expect(host.querySelector("[data-lane-confirm]")).toBeNull();
    expect(host.querySelector("[data-lane-said]")?.textContent).toBe("You do not have access to this record.");
  });

  it("offers Anyone with the link where the world lane is open", () => {
    act(() => root.render(<WhoCanSeeThis whoCanSee={{ ...orgLane, worldOffered: true }} canChange onChoose={jest.fn()} />));
    expect(radio("world")?.textContent).toContain("Anyone with the link");
  });

  it("4. a person who cannot change sharing reads the state as text, with no buttons", () => {
    act(() => root.render(<WhoCanSeeThis whoCanSee={{ ...orgLane, choice: "mine", membersReachNow: false }} canChange={false} onChoose={jest.fn()} />));
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.querySelector("[data-who-can-see-text]")?.textContent).toContain("Only people I share it with.");
  });

  it("a kind with no lane door draws nothing", () => {
    act(() => root.render(<WhoCanSeeThis whoCanSee={null} canChange onChoose={jest.fn()} />));
    expect(host.innerHTML).toBe("");
  });

  it("5. Current Access agrees: the default row under Everyone, none under Only people, the lane row never twice", () => {
    const laneRow = {
      id: "p1",
      grantedToOrganizationId: ORG,
      grantedToOrganization: { name: "Oak & River" },
    } as never;
    act(() =>
      root.render(
        <OrgAvailabilityNote
          permissions={[laneRow]}
          organizationDefault={{ level: "viewer", organizationName: "Oak & River", organizationId: ORG }}
        />,
      ),
    );
    expect(host.querySelector("[data-organization-default]")?.textContent).toContain(
      "Everyone in Oak & River can view this through the organization's default.",
    );
    expect(host.querySelector("[data-org-availability]")).toBeNull();
    act(() => root.render(<OrgAvailabilityNote permissions={[]} organizationDefault={null} />));
    expect(host.textContent).toBe("");
  });
});
