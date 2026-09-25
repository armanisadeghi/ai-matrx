/**
 * MOVE-AND-OUTSIDER (VERIFIER-19 finding 3) — naming a person who already has an
 * account gives her the table at once; only an address with no account gets an
 * invitation.
 *
 * THE USE CASE. Elm Street Workshop keeps a "Tool checkout log". Its owner shares
 * it with the bookkeeper at another firm, who already has an AI Matrx account.
 * On production the Share dialog called `custom.table_share_outside_invite`, drew
 * "Invited, not yet joined", and when she opened the table she read "You have not
 * been given this table". The store already had the door for this —
 * `custom.table_share_outside_grant` (GRID-PRIMITIVES G14): an existing account is
 * granted at once and told; an address with no account is handed to the invite
 * door by the store itself.
 *
 * This suite drives the REAL panel and the REAL service against a recorded
 * Supabase client and asserts which door is called and what the host is told.
 * RED on the previous panel (it called `table_share_outside_invite` and never
 * told the host to re-read the people list); GREEN on this one.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "f980f202-0e4e-4e39-8411-facae6fab50e";
const TABLE = "3e0edb1d-abbe-483e-a021-6b7f3cd04a44";

const calls: { fn: string; args: Record<string, unknown> }[] = [];
let grantAnswer: Record<string, unknown> = {};

function stateAnswer() {
  return {
    lane_open: true,
    may_invite: true,
    may_open_lane: true,
    my_level: "admin",
    levels: [
      { level: "viewer", label: "Viewer", means: "See the table" },
      { level: "editor", label: "Editor", means: "Change rows" },
    ],
    who: "org_admins_and_table_owners",
    invitations: [],
    say: "Share with somebody outside this organization by email.",
    email_delivery: { channel: "email", answer: "yes", configured: true, checked_at: null, say: "" },
    email_say: "They get an email.",
  };
}

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === "table_share_outside") return { data: stateAnswer(), error: null };
        if (fn === "table_share_outside_grant") return { data: grantAnswer, error: null };
        return { data: null, error: { message: `unexpected door ${fn}` } };
      },
    }),
  }),
}));
const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn(async () => false) }));
jest.mock("@/components/matrx/buttons/markdown-copy-utils", () => ({ copyToClipboard: jest.fn(async () => true) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OutsideSharePanel } = require(process.env.PANEL_UNDER_TEST ?? "../OutsideSharePanel") as {
  OutsideSharePanel: React.ComponentType<{
    organizationId: string;
    tableId: string;
    tableName: string;
    onGranted?: () => void;
  }>;
};

async function flush() {
  for (let i = 0; i < 10; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function shareWith(email: string) {
  const onGranted = jest.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <OutsideSharePanel organizationId={ORG} tableId={TABLE} tableName="Tool checkout log" onGranted={onGranted} />,
    );
  });
  await flush();
  const input = host.querySelector("#outside-email") as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, email);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const press = Array.from(host.querySelectorAll("button")).find((b) =>
    /^(Share|Invite)$/.test((b.textContent ?? "").trim()),
  ) as HTMLButtonElement;
  await act(async () => press.click());
  await flush();
  act(() => root.unmount());
  host.remove();
  return { onGranted };
}

beforeEach(() => {
  calls.length = 0;
  mockToast.mockClear();
});

describe("the Share dialog's outside path", () => {
  it("gives an existing account the table at once, through the G14 door, and has the host re-read who has it", async () => {
    grantAnswer = {
      invited: false,
      granted: true,
      person: "outside_account",
      say: "bookkeeper@cedarledger.com already has an account, so they were given Tool checkout log as a viewer straight away and told so.",
    };
    const { onGranted } = await shareWith("bookkeeper@cedarledger.com");
    const doors = calls.map((c) => c.fn);
    expect(doors).toContain("table_share_outside_grant");
    expect(doors).not.toContain("table_share_outside_invite");
    const grant = calls.find((c) => c.fn === "table_share_outside_grant")!;
    expect(grant.args).toEqual({
      p_organization_id: ORG,
      p_table_id: TABLE,
      p_person: "bookkeeper@cedarledger.com",
      p_level: "viewer",
    });
    expect(onGranted).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: grantAnswer.say }));
  });

  it("an address with no account is still invited (the store hands it to the invite door)", async () => {
    grantAnswer = {
      invited: true,
      granted: false,
      person: "no_account",
      say: "An invitation to Tool checkout log was made for new.hire@cedarledger.com.",
      accept_path: "/invitations/table/accept/abc",
      delivery: { accept_path: "/invitations/table/accept/abc", queued: ["email"], skipped: [], email_answer: "yes", say: "Emailed." },
    };
    const { onGranted } = await shareWith("new.hire@cedarledger.com");
    expect(calls.map((c) => c.fn)).toContain("table_share_outside_grant");
    expect(onGranted).not.toHaveBeenCalled();
  });
});
