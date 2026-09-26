/**
 * A PERSONAL WORKSPACE IS NOT AN ORGANIZATION — FOR EVERY KIND.
 *
 * 🚨 THE DEFECT (2026-09-26, mandate-sharing verification). Mandates hid "My organization" and
 * "Everyone in <workspace>" for a thing homed in its owner's personal workspace, because their two
 * hosts passed `personalHome`. Agents and workflows never did, so their Public tab still offered
 * "My organization" (a team that does not exist), and the "Add everyone in an organization" picker
 * listed the person's own personal workspace for every kind.
 *
 * THE FIX, in the shared layer:
 *   1. The share read (`getResourceVisibility`) returns the thing's own organization
 *      (`homeOrganizationId`), named by `get_share_capabilities.organization_column`.
 *   2. The Public tab never draws "My organization" when `offerOrganization` is false, and a stored
 *      `internal` reads as the private choice it equals (agents and workflows are born `internal`).
 *   3. "Add everyone in an organization" never lists the viewer's personal workspace, and is
 *      absent when that is the only one.
 *
 * RED before the fix: (1) no homeOrganizationId; (2) "My organization" drawn and checked for an
 * `internal` agent; (3) the button rendered with only the personal workspace to offer.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AGENT = "0b7c7a0e-5b1e-4f3e-9d51-3f1f2a0c9e11";
const PERSONAL = "7d0f6f55-0c8e-4a57-9a55-2a4b1a7f0d01";
const TEAM = "4c425bfe-9a08-402f-9496-488580623f42";

let capsAnswer: Record<string, unknown> = {};
let rowAnswer: Record<string, unknown> | null = null;
let navOrgs: { id: string; name: string }[] = [];
const from = jest.fn(() => ({
  select: () => ({
    eq: () => ({ maybeSingle: async () => ({ data: rowAnswer, error: null }) }),
  }),
}));

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ from }),
  supabase: {
    rpc: (name: string) =>
      Promise.resolve({
        data: name === "get_share_capabilities" ? capsAnswer : null,
        error: null,
      }),
    schema: () => ({ from }),
    from,
  },
}));
jest.mock("@/features/agent-context/hooks/useNavTree", () => ({
  useNavTree: () => ({ orgs: navOrgs, isLoading: false }),
}));
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));

import { getResourceVisibility } from "@/utils/permissions/service";
import { PublicAccessTab } from "@/features/sharing/components/tabs/PublicAccessTab";
import { AddEveryoneInOrg } from "@/features/sharing/components/AddEveryoneInOrg";
import { makeStore } from "@/lib/redux/store";
import { setPersonalOrganization } from "@/lib/redux/slices/appContextSlice";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  capsAnswer = {
    supports_public: true,
    is_link_shareable: false,
    public_state_column: "card_visibility",
    public_state_kind: "enum",
    organization_column: "organization_id",
  };
  rowAnswer = { card_visibility: "internal", organization_id: PERSONAL };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function storeWithPersonalOrg() {
  const store = makeStore();
  store.dispatch(setPersonalOrganization(PERSONAL));
  return store;
}

describe("1. the share read names the thing's own organization", () => {
  it("returns homeOrganizationId from the row", async () => {
    const v = await getResourceVisibility("agent" as never, AGENT);
    expect(v.visibility).toBe("internal");
    expect(v.homeOrganizationId).toBe(PERSONAL);
  });
});

describe("2. the Public tab never offers My organization in a personal workspace", () => {
  it("draws no My organization and shows internal as the private choice", async () => {
    await act(async () => {
      root.render(
        <Provider store={storeWithPersonalOrg()}>
          <PublicAccessTab
            isPublic={false}
            visibility="internal"
            onSetVisibility={async () => ({ success: true })}
            isOwner
            onMakePublic={async () => ({ success: true })}
            onRevokePublic={async () => ({ success: true })}
            resourceType={"agent" as never}
            resourceId={AGENT}
            resourceName="Weekly SEO digest"
            offerOrganization={false}
          />
        </Provider>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const group = host.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect(group!.textContent).not.toContain("My organization");
    const checked = group!.querySelector('[aria-checked="true"]');
    expect(checked?.textContent).toContain("Only people I share it with");
  });
});

describe("3. Add everyone never lists your personal workspace", () => {
  it("is absent when the personal workspace is the only one", async () => {
    navOrgs = [{ id: PERSONAL, name: "Alex Hart's Workspace" }];
    await act(async () => {
      root.render(
        <Provider store={storeWithPersonalOrg()}>
          <AddEveryoneInOrg
            level="viewer"
            grantPerson={async () => ({ success: true })}
          />
        </Provider>,
      );
    });
    expect(host.textContent).not.toContain("Add everyone in an organization");
  });

  it("never lists the nav tree's synthetic Personal bucket", async () => {
    navOrgs = [
      { id: "00000000-0000-0000-0000-000000000001", name: "Personal", is_personal: true } as never,
    ];
    await act(async () => {
      root.render(
        <Provider store={storeWithPersonalOrg()}>
          <AddEveryoneInOrg level="viewer" grantPerson={async () => ({ success: true })} />
        </Provider>,
      );
    });
    expect(host.textContent).not.toContain("Add everyone in an organization");
  });

  it("is offered when a real organization exists", async () => {
    navOrgs = [
      { id: PERSONAL, name: "Alex Hart's Workspace" },
      { id: TEAM, name: "Oak & River" },
    ];
    await act(async () => {
      root.render(
        <Provider store={storeWithPersonalOrg()}>
          <AddEveryoneInOrg
            level="viewer"
            grantPerson={async () => ({ success: true })}
          />
        </Provider>,
      );
    });
    expect(host.textContent).toContain("Add everyone in an organization");
  });
});
