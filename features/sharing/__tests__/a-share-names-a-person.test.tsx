/**
 * 🚨 SHARE-PEOPLE-ONLY (owner ruling, Arman 2026-09-23: access is personal).
 *
 * The Share dialog used to carry an "Organizations" tab reading "Share with Organization. All
 * members of the organization will have access". That wrote ONE grant to a whole organization,
 * so a person who joined later was let in without anyone naming them. VERIFIER-21 found it still
 * live on a record-store table on 2026-09-25.
 *
 * What these tests hold:
 *   1. The dialog has no Organizations tab. No share surface imports an organization grant form,
 *      and no client code calls the retired organization share door.
 *   2. "Add everyone in <organization>" lists the CURRENT members of the chosen organization by
 *      name, each ticked, never the viewer. It grants each PERSON through the same door as the
 *      single-person form. It says in one sentence that later joiners are not added, and it
 *      skips people who already have access.
 *
 * RED against the previous dialog (the tab present, no "Add everyone"); GREEN now.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const PRIYA = "a1c3e5f7-0000-4000-8000-00000000b001";
const OWEN = "a1c3e5f7-0000-4000-8000-00000000b002";
const ORG = "4c425bfe-9a08-402f-9496-488580623f42";

const rpc = jest.fn(async (name: string) => {
  if (name === "get_organization_members_with_users") {
    return {
      data: [
        { user_id: ME, user_email: "test@test.com", user_display_name: "Alex Hart" },
        { user_id: ADMIN, user_email: "admin@admin.com", user_display_name: "Morgan Reyes" },
        { user_id: PRIYA, user_email: "priya.nair@oakandriver.co", user_display_name: "Priya Nair" },
        { user_id: OWEN, user_email: "owen.brandt@oakandriver.co", user_display_name: "Owen Brandt" },
      ],
      error: null,
    };
  }
  return { data: null, error: null };
});

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ rpc }),
  supabase: { rpc },
}));
jest.mock("@/features/agent-context/hooks/useNavTree", () => ({
  useNavTree: () => ({ orgs: [{ id: ORG, name: "Oak & River", is_personal: false }], isLoading: false }),
}));
jest.mock("@/lib/redux/hooks", () => ({
  // The viewer has a personal workspace that is not ORG, so the picker still offers ORG.
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ appContext: { personal_organization_id: "personal-workspace-of-the-viewer" } }),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => ME }));

import { AddEveryoneInOrg } from "@/features/sharing/components/AddEveryoneInOrg";
import { forgetOrganizationMemberRows } from "@/features/organizations/service/orgMemberRows";

// The roster read is shared for 30 s across callers; each test starts cold.
beforeEach(() => forgetOrganizationMemberRows());

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
const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

describe("Add everyone in <organization> names people", () => {
  it("lists the current members by name, ticked, never the viewer, and grants each person", async () => {
    const grantPerson = jest.fn(async () => ({ success: true as const }));
    const onDone = jest.fn();
    act(() =>
      root.render(
        <AddEveryoneInOrg
          grantPerson={grantPerson}
          level="viewer"
          defaultOrgId={ORG}
          alreadySharedUserIds={[OWEN]}
          onDone={onDone}
        />,
      ),
    );
    act(() => button("Add everyone in an organization")!.click());
    await flush();

    const text = host.textContent ?? "";
    expect(text).toContain("Add everyone in Oak & River");
    expect(text).toContain("People who join later are not added.");
    expect(text).toContain("Morgan Reyes");
    expect(text).toContain("Priya Nair");
    expect(text).not.toContain("Alex Hart"); // the viewer is never listed
    expect(text).toContain("Already has access"); // Owen, skipped

    const rows = Array.from(host.querySelectorAll("[data-member]"));
    expect(rows.map((r) => r.getAttribute("data-member"))).toEqual([
      "admin@admin.com",
      "priya.nair@oakandriver.co",
      "owen.brandt@oakandriver.co",
    ]);
    const checked = rows.map((r) => r.querySelector('[role="checkbox"]')?.getAttribute("data-state"));
    expect(checked).toEqual(["checked", "checked", "unchecked"]);

    act(() => button("Share with 2 people")!.click());
    await flush();

    expect(grantPerson).toHaveBeenCalledTimes(2);
    expect(grantPerson.mock.calls.map((c) => (c as unknown as [{ userId: string }])[0].userId)).toEqual([ADMIN, PRIYA]);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Shared");
  });

  it("says a refusal on the person's own row", async () => {
    const grantPerson = jest.fn(async (p: { userId: string }) =>
      p.userId === PRIYA
        ? { success: false as const, error: "That person is not in this organization, so they cannot be given access to this table yet." }
        : { success: true as const },
    );
    act(() => root.render(<AddEveryoneInOrg grantPerson={grantPerson} level="editor" defaultOrgId={ORG} />));
    act(() => button("Add everyone in an organization")!.click());
    await flush();
    act(() => button("Share with 3 people")!.click());
    await flush();
    const priya = host.querySelector('[data-member="priya.nair@oakandriver.co"]');
    expect(priya?.textContent).toContain("That person is not in this organization");
    expect(grantPerson.mock.calls.every((c) => (c as unknown as [unknown, string])[1] === "editor")).toBe(true);
  });
});

describe("no share surface grants to an organization", () => {
  // SHARE_PEOPLE_ROOT points the scan at another tree (the RED run reads the pre-lane tree).
  const ROOT = process.env.SHARE_PEOPLE_ROOT ?? resolve(__dirname, "../../..");
  const SURFACES = [
    "features/sharing/components/ShareModal.tsx",
    "features/window-panels/windows/ShareModalWindow.tsx",
    "features/agents/components/sharing/AgentSharePanel.tsx",
    "features/marketing/components/access/SiteAccessWorkspace.tsx",
  ];

  it.each(SURFACES)("%s has no Organizations tab and no organization grant form", (rel) => {
    const src = readFileSync(join(ROOT, rel), "utf8");
    expect(src).not.toMatch(/ShareWithOrgTab/);
    expect(src).not.toMatch(/value="organizations"|id: "organizations"|=== "organizations"/);
    expect(src).not.toMatch(/\bshareWithOrg\b/);
  });

  it("no client file calls the retired organization share door", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".") || name === "__tests__") continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !name.includes("database.types")) {
          if (/rpc\(\s*["']share_resource_with_org["']/.test(readFileSync(full, "utf8"))) hits.push(full);
        }
      }
    };
    for (const top of ["features", "utils", "components", "lib", "app", "hooks"]) {
      try { walk(join(ROOT, top)); } catch { /* a tree without that directory */ }
    }
    expect(hits).toEqual([]);
  });
});
