/**
 * UserPeek — the platform's person peek. A member of the viewer's active
 * organization shows name, role, joined date and an email action; anyone the
 * viewer cannot list reads as "not someone you can see", never leaked.
 *
 * Use case: a kiln studio's lead opens the @-mention of a glaze technician.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-footer="">{children}</div>,
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "org-kilnworks" }));
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import UserPeek from "../UserPeek";

async function renderPeek(id: string): Promise<HTMLElement> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  await act(async () => {
    createRoot(el).render(<UserPeek id={id} open onClose={() => undefined} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return el;
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: [{ user_id: "u-dana", user_email: "dana@kilnworks.example", user_display_name: "Dana Ruiz", user_avatar_url: null, role: "member", joined_at: "2026-03-01T00:00:00Z" }],
    error: null,
  });
});

it("shows a member of the viewer's organization, email as a secondary action, no false Open door", async () => {
  const el = await renderPeek("u-dana");
  expect(rpc).toHaveBeenCalledWith("get_organization_members_with_users", { p_org_id: "org-kilnworks" });
  expect(el.querySelector("h1")?.textContent).toContain("Dana Ruiz");
  expect(el.querySelector('a[href="mailto:dana@kilnworks.example"]')).not.toBeNull();
  expect(el.textContent).toContain("member");
  expect(el.querySelector("[data-footer]")).toBeNull();
});

it("someone outside the viewer's organization is not revealed", async () => {
  const el = await renderPeek("u-stranger");
  expect(el.querySelector("[data-user-peek-unavailable]")?.textContent).toMatch(/isn't someone you can see/);
  expect(el.textContent).not.toContain("dana@");
});
