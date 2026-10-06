/**
 * @jest-environment jsdom
 */
// The share dialog's magnifier searched the organization's roster only, so an existing person
// OUTSIDE it (typed email works, magnifier found nothing) was never offered. A full email typed
// in the field is now resolved by the same lookup_user_by_email the share itself uses and offered
// as a candidate to the picker.

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OUTSIDER = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const rpc = jest.fn(async (_fn: string, args: { lookup_email: string }) => ({
  data: args.lookup_email === "outsider@example.com" ? [{ user_id: OUTSIDER, user_email: "outsider@example.com" }] : [],
  error: null,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ rpc }) }));
jest.mock("@/features/messaging/hooks/useUserConnections", () => ({
  useUserConnections: () => ({ connections: [], isLoading: false, error: null, partialFailures: [], refresh: jest.fn() }),
}));
jest.mock("@/features/messaging/components/ConnectionsReadNotice", () => ({ ConnectionsReadNotice: () => null }));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/features/sharing/components/AddEveryoneInOrg", () => ({ AddEveryoneInOrg: () => null }));

const seen: Array<Array<{ id: string; email: string | null }>> = [];
let setTyped: (v: string) => void = () => {};
jest.mock("@/features/user-search/UserSearchField", () => ({
  UserSearchField: (props: { candidates: Array<{ id: string; email: string | null }>; onValueChange: (v: string) => void; inputType?: string }) => {
    if (props.inputType === "email") {
      seen.push(props.candidates);
      setTyped = props.onValueChange;
    }
    return null;
  },
}));

import { ShareWithUserTab } from "../components/tabs/ShareWithUserTab";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  jest.useFakeTimers();
  seen.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

async function typeEmail(value: string) {
  act(() => {
    root.render(
      <ShareWithUserTab
        onShare={async () => ({ success: true })}
        onSuccess={() => {}}
        resourceType={"note" as never}
        resourceId="r1"
        organizationId="o1"
      />,
    );
  });
  await act(async () => {
    setTyped(value);
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

describe("the share picker finds an existing person outside the roster", () => {
  it("offers a person found by their full email", async () => {
    await typeEmail("outsider@example.com");
    const last = seen[seen.length - 1] ?? [];
    expect(last.map((c) => c.id)).toEqual([OUTSIDER]);
  });

  it("offers nobody for an address that belongs to no account", async () => {
    await typeEmail("nobody@example.com");
    expect((seen[seen.length - 1] ?? []).length).toBe(0);
  });
});
