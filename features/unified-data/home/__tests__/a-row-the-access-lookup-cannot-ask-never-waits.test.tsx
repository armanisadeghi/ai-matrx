/**
 * NO ROW WAITS FOREVER (lane TABLE-ACTIONS wave 1 fix round). A table shared with this person and
 * not accepted yet has no organization (`dataHomeRows.ts`, shared-with-me), so the access lookup
 * (`custom.my_levels`, asked in an organization) never asks about it. Its menu resolved to
 * "Checking your access…" on every entry, Open included, for good ("Tool checkout log" from Elm
 * Street Workshop). It now resolves at once: Open goes to the invitation's accept screen, the star
 * works, everything else says to accept first.
 *
 * The break this names: an invitation row routed through the level lookup (or any row with no
 * answer coming) — its entries sit in the checking state.
 */
import { ACTION_CHECKING_ACCESS_REASON } from "@ai-matrx/records-ui/object-actions";
import { ACCEPT_FIRST_REASON, actionsForHomeTable } from "../useDataHomeRowMenus";
import { row } from "./fixtures";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const opened: string[] = [];
const host = {
  open: () => void opened.push("open"),
  copyText: () => {},
  rename: () => {},
  share: () => {},
  archive: () => {},
  toggleFavorite: () => {},
};

const invitation = row({
  name: "Tool checkout log",
  organizationId: null,
  organizationName: "Elm Street Workshop",
  sharedWithMe: true,
  member: false,
  access: "shared",
  href: "/invitations/table/accept/3f1c9e7a5b2d",
});

it("an invitation row never shows the checking state, before or without any level", () => {
  const actions = actionsForHomeTable(invitation, invitation.tableId as string, undefined, host);
  expect(actions.filter((a) => a.disabledReason === ACTION_CHECKING_ACCESS_REASON)).toEqual([]);
  const byId = Object.fromEntries(actions.map((a) => [a.id, a.disabledReason ?? null]));
  expect(byId).toMatchObject({ open: null, favorite: null, rename: ACCEPT_FIRST_REASON, share: ACCEPT_FIRST_REASON, archive: ACCEPT_FIRST_REASON });
  void actions.find((a) => a.id === "open")!.run();
  expect(opened).toEqual(["open"]);
});

it("a row in an organization waits for its answer, then follows it — the two cases differ", () => {
  const member = row({ name: "Referral Intake Queue" });
  const waiting = actionsForHomeTable(member, member.tableId as string, undefined, host);
  expect(waiting.find((a) => a.id === "open")?.disabledReason).toBe(ACTION_CHECKING_ACCESS_REASON);
  const answered = actionsForHomeTable(member, member.tableId as string, "admin", host);
  expect(answered.find((a) => a.id === "rename")?.disabledReason).toBeUndefined();
});
