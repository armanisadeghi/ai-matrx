/**
 * 🚨 SHARE-TAILS (chair ruling 2026-09-25): a record-store thing with no sharing choice is the
 * ORGANIZATION DEFAULT, never "mine". Every member reaches it without a share, so the Share dialog
 * says so under Current Access instead of leaving "Not shared with anyone" as the whole truth.
 *
 *   1. getResourceVisibility carries the lane door's `organization_default` (level + name) for a
 *      record-store table, and null when the door names none (the owner chose "Only people I
 *      share it with").
 *   2. OrgAvailabilityNote draws one line naming the organization and what members can do, and
 *      draws nothing when there is no default and no availability row.
 *
 * RED before this change (the reader dropped the field; the note had no such line); GREEN now.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABLE = "5ebcf5ec-c40e-4621-b181-d96d2a7a017b";
let answer: Record<string, unknown> = {};
const rpc = jest.fn(async () => ({ data: answer, error: null }));

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ rpc }),
  supabase: { rpc },
}));

import { getResourceVisibility } from "@/utils/permissions/service";
import { OrgAvailabilityNote } from "@/features/sharing/components/OrgAvailabilityNote";

describe("a record-store thing with no lane row is the organization default", () => {
  it("the reader carries the organization default the lane door names", async () => {
    answer = {
      found: true,
      lane: "organization",
      choice: "organization",
      is_public: false,
      organization_default: { level: "viewer", organization_name: "Oak & River" },
    };
    const v = await getResourceVisibility("record" as never, TABLE);
    expect(rpc).toHaveBeenCalledWith("store_door_lane", { p_resource_type: "record", p_resource_id: TABLE });
    expect(v.organizationDefault).toEqual({ level: "viewer", organizationName: "Oak & River" });
  });

  it("and none once the owner chose Only people I share it with", async () => {
    answer = { found: true, lane: "mine", choice: "mine", is_public: false, organization_default: null };
    const v = await getResourceVisibility("record" as never, TABLE);
    expect(v.organizationDefault).toBeNull();
  });

  describe("the note under Current Access", () => {
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

    it("names the organization and what every member can do", () => {
      act(() =>
        root.render(
          <OrgAvailabilityNote
            permissions={[]}
            organizationDefault={{ level: "viewer", organizationName: "Oak & River" }}
          />,
        ),
      );
      const line = host.querySelector("[data-organization-default]");
      expect(line?.textContent).toContain("Everyone in Oak & River can view this through the organization's default.");
    });

    it("says nothing when membership reaches nothing", () => {
      act(() => root.render(<OrgAvailabilityNote permissions={[]} organizationDefault={null} />));
      expect(host.textContent).toBe("");
    });
  });
});
