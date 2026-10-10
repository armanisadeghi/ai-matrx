/**
 * The "Share with User" box takes an email. For a custom table the host hands it the OUTSIDE door
 * (`grantEveryonePerson`), which grants an account inside or outside the organization and invites an
 * address with no account. So an address outside the organization is offered the outside share in the
 * same box, never refused with "That person is not in this organization" and never "No user found".
 * RED before: the typed address went to `onShare` (the member-only door) or stopped at "No user found".
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rpc = jest.fn(async () => ({ data: [], error: null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ rpc }), supabase: { rpc } }));
jest.mock("@/features/messaging/hooks/useUserConnections", () => ({
  useUserConnections: () => ({ connections: [], isLoading: false, error: null }),
  CONNECTION_SOURCE_LABELS: {},
}));
jest.mock("@/features/user-search/UserSearchField", () => ({
  UserSearchField: ({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) => (
    <input aria-label="email" value={value} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/features/messaging/components/ConnectionsReadNotice", () => ({ ConnectionsReadNotice: () => null }));
jest.mock("@/features/sharing/components/AddEveryoneInOrg", () => ({ AddEveryoneInOrg: () => null }));

import { ShareWithUserTab } from "@/features/sharing/components/tabs/ShareWithUserTab";

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
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
};

it("sends an outside address through the outside door, not the member-only one", async () => {
  const onShare = jest.fn(async () => ({ success: false as const, error: "That person is not in this organization" }));
  const grant = jest.fn(async () => ({ success: true as const, message: "Given access" }));
  act(() =>
    root.render(
      <ShareWithUserTab
        onShare={onShare}
        onSuccess={() => {}}
        resourceType={"custom_table" as never}
        resourceId="t1"
        grantEveryonePerson={grant}
      />,
    ),
  );
  const input = host.querySelector("input[aria-label=email]") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, "outsider@elsewhere.com");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const share = Array.from(host.querySelectorAll("button")).find((b) => /^\s*Share\b/.test(b.textContent ?? "") && !b.disabled);
  expect(share).toBeDefined();
  await act(async () => share!.click());
  await flush();
  expect(onShare).not.toHaveBeenCalled();
  expect(grant).toHaveBeenCalledTimes(1);
  expect((grant.mock.calls[0] as unknown as [{ email: string }])[0].email).toBe("outsider@elsewhere.com");
  expect(host.textContent).not.toContain("not in this organization");
  expect(host.textContent).not.toContain("No user found");
});
