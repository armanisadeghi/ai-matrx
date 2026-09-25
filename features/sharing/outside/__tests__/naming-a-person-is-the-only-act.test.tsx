/**
 * 🚨 SHARE-GATE-OFF — the Share dialog never puts a switch in front of the invite.
 *
 * Owner ruling (Arman, 2026-09-23): "If I'm manually sharing something with
 * people, this cannot possibly be a factor… I hate bullshit fake gates that do
 * nothing but cause problems for users."
 *
 * Until this lane the outside-share panel drew "Turn on sharing with people
 * outside" (plus a whole-organization confirm dialog) in every organization
 * that had never touched `custom/external_principal_enabled`, because that
 * knob defaulted to false. The knob now defaults on (store file
 * sharegate_naming_a_person_is_the_only_act.sql) and stays only as an
 * administrator's setting in the settings editor. This suite holds the panel to
 * that, in the three states the store can answer, INCLUDING the one where the
 * viewer is the administrator who could have flipped it — the case the old
 * button was drawn for.
 *
 * Forcing function: pointed at the pre-SHARE-GATE-OFF panel
 * (PANEL_UNDER_TEST=<path>), the "no button ever" cases fail.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockRead = jest.fn();

jest.mock("../outsideShareService", () => ({
  __esModule: true,
  absoluteInviteUrl: (p: string) => `https://app.test${p}`,
  shareWithOutsidePerson: jest.fn(),
  resendOutside: jest.fn(),
  revokeOutside: jest.fn(),
  openOutsideLane: jest.fn(),
  readOutsideShare: (...args: unknown[]) => mockRead(...args),
}));
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn(async () => false) }));
jest.mock("@/components/matrx/buttons/markdown-copy-utils", () => ({ copyToClipboard: jest.fn(async () => true) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const panelModule = require(process.env.PANEL_UNDER_TEST ?? "../OutsideSharePanel");
const OutsideSharePanel = panelModule.OutsideSharePanel as React.ComponentType<{
  organizationId: string;
  tableId: string;
  tableName: string;
}>;
const LANE_CLOSED_SAY: string =
  panelModule.LANE_CLOSED_SAY ??
  "This organization's administrator has turned off sharing with people outside it.";

// Rincon Plumbing Co's Jobs table — the everyday case: a plumber gives one
// customer read access to the job they are waiting on.
const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99";
const TABLE = "3c1f4d2a-8b7e-4a51-9d0c-2f6e8a41b7c3";

function answer(over: Record<string, unknown>) {
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
    invitations: [
      {
        invitation_id: "b7e2c9f0-4a1d-4e6b-8c3f-1d2a9e5b7c40",
        email: "dana.whitfield@harborviewpm.net",
        level: "viewer",
        level_label: "Viewer",
        status: "pending",
        joined: false,
        say: "dana.whitfield@harborviewpm.net is invited and has not joined yet.",
        expires_at: null,
        invited_at: "2026-09-23T18:00:00Z",
        expired: false,
        accept_path: "/invitations/table/accept/tok",
      },
    ],
    say: "Invite somebody outside this organization by email. They will see this table and nothing else here, at the level you choose.",
    email_delivery: { channel: "email", answer: "yes", configured: true, checked_at: null, say: "" },
    email_say: "They get an email with the link.",
    ...over,
  };
}

async function draw(state: Record<string, unknown>) {
  mockRead.mockResolvedValue(state);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<OutsideSharePanel organizationId={ORG} tableId={TABLE} tableName="Jobs" />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  const text = host.textContent ?? "";
  const buttons = Array.from(host.querySelectorAll("button")).map((b) => (b.textContent ?? "").trim());
  const hasEmailField = !!host.querySelector("#outside-email");
  act(() => root.unmount());
  host.remove();
  return { text, buttons, hasEmailField };
}

const TURN_ON = /turn (it )?on|sharing with people outside/i;

describe("the outside-share panel never draws a switch in front of the invite", () => {
  it("in the ordinary case (lane on by default) draws the invite and the people list, and no switch", async () => {
    const seen = await draw(answer({}));
    expect(seen.hasEmailField).toBe(true);
    expect(seen.buttons).toContain("Share");
    expect(seen.text).toContain("dana.whitfield@harborviewpm.net");
    expect(seen.buttons.some((b) => TURN_ON.test(b))).toBe(false);
  });

  it("when an administrator turned it off, says so in one sentence — even to an administrator — with no button", async () => {
    const seen = await draw(
      answer({
        lane_open: false,
        may_open_lane: true,
        invitations: [],
        say: "Sharing with people outside this organization is turned off. You can turn it on — it applies to the whole organization.",
      }),
    );
    expect(seen.text).toContain(LANE_CLOSED_SAY);
    // The store's old sentence promised a control; the panel never repeats it.
    expect(seen.text).not.toMatch(/you can turn it on/i);
    expect(seen.buttons.some((b) => TURN_ON.test(b))).toBe(false);
    expect(seen.buttons).not.toContain("Share");
    expect(seen.hasEmailField).toBe(false);
  });

  it("when an administrator turned it off, a non-administrator gets the same sentence and no button", async () => {
    const seen = await draw(answer({ lane_open: false, may_open_lane: false, may_invite: false, invitations: [] }));
    expect(seen.text).toContain(LANE_CLOSED_SAY);
    expect(seen.buttons.some((b) => TURN_ON.test(b))).toBe(false);
  });
});

describe("nothing in the share flow writes the outside-sharing switch", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sources(full);
      return /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }
  it("no file under features/sharing calls knob_override_set for custom/external_principal_enabled", () => {
    const offenders = sources(join(__dirname, "..", "..")).filter((file) => {
      const body = readFileSync(file, "utf8");
      return body.includes("knob_override_set") && body.includes("external_principal_enabled");
    });
    expect(offenders).toEqual([]);
  });
});
