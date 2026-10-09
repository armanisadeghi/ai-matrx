/**
 * P1 — catalog category "before-joining": link, code, schedule, access.
 * Each scenario asserts what the person at the door SEES (CORE-DESIGN §11 names the honest screen).
 */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { keepsSeeing, seeUntil, walkIn } from "../lib/meeting";
import { summarize } from "../lib/observe";
import { bodyText, openLink, press, rawAttr, rawPhase, scheduleMeeting, setPolicies } from "../lib/p1";
import { scenario, unproven } from "../lib/scenario";
import { GUEST, hostWithMeeting } from "../lib/stories";

const DAY = 24 * 60 * 60 * 1000;

scenario("link-expired", async ({ cast }) => {
  const host = await cast.add({ label: "host", seat: "admin" });
  // Zoom rules: a scheduled one-off link expires 30 days after its date. Scheduled 45 days ago through the product's own door.
  let meeting;
  try {
    meeting = await scheduleMeeting(host, { profile: "zoom", startsInMs: -45 * DAY });
  } catch (e) {
    unproven(`the scheduling door refused a start 45 days in the past, so an aged link cannot be produced from a browser: ${(e as Error).message.slice(0, 160)}`);
  }
  cast.meeting = meeting;
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  const o = await openLink(guest, meeting);
  expect(o.phase, `an old link must show the link-expired screen, not ${o.phase}; saw ${summarize(o)}`).toBe("expired");
  expect(await rawAttr(guest.page, "reason"), "the refusal reason the person is shown").toBe("expired");
  // Distinct from "no such meeting", and a way home.
  expect(/no meeting (for|found)|did not open|not found/i.test(await bodyText(guest.page)) && !/expired|old|no longer valid/i.test(await bodyText(guest.page)), "the expired screen must say the link EXPIRED, not that no meeting exists").toBe(false);
  await press(guest, "Go home on the expired screen", guest.page.getByRole("link", { name: /go home|home|my meetings/i }), 5000);
});

scenario("before-start-early-entry", async ({ cast }) => {
  const host = await cast.add({ label: "host", seat: "admin" });
  const later = await scheduleMeeting(host, { startsInMs: 2 * 60 * 60 * 1000 });
  cast.meeting = later;
  await setPolicies(later, [["early_entry_minutes", 10]]);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  const o = await openLink(guest, later);
  expect(o.phase, `two hours before the start with a 10-minute window the door is closed; saw ${summarize(o)}`).toBe("refused:too_early");
  const text = await bodyText(guest.page);
  expect(/\d{1,2}:\d{2}\s?(am|pm)?|opens (at|in)|starts (at|in)/i.test(text), `the too-early screen must say when the meeting opens; saw: ${text.slice(0, 200)}`).toBe(true);
  // Inside the window the same link is open to the guest.
  const soon = await scheduleMeeting(host, { startsInMs: 5 * 60 * 1000 });
  cast.meeting = soon;
  await setPolicies(soon, [["early_entry_minutes", 10]]);
  const guest2 = await cast.add({ label: "guest inside the window", seat: "guest", displayName: "Daniel Okafor" });
  const o2 = await openLink(guest2, soon);
  expect(String(o2.phase), `5 minutes before the start, inside a 10-minute window, the link must open; saw ${summarize(o2)}`).not.toMatch(/^refused:|expired|not-found/);
});

scenario("access-sign-in-required", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  // Google Meet: "Trusted" lets outsiders ASK; only with "Anyone with the link can ask to join" off is a signed-out person sent to sign in.
  await setPolicies(cast.meeting!, [["access_type", "trusted"], ["allow_ask_to_join", "false"]]);
  const guest = await cast.add({ label: "signed-out guest", seat: "guest", displayName: GUEST });
  const o = await openLink(guest, cast.meeting!);
  expect(o.phase, `a signed-out person at a signed-in-only meeting must be told to sign in; saw ${summarize(o)}`).toBe("refused:sign_in_required");
  await press(guest, "Sign in", guest.page.getByRole("link", { name: /sign in/i }).or(guest.page.getByRole("button", { name: /sign in/i })), 5000);
  // With asking back on, a signed-in person who is not in the host's organization is NOT refused: they may ask to join.
  await setPolicies(cast.meeting!, [["allow_ask_to_join", "true"]]);
  const outsider = await cast.add({ label: "signed-in outsider", seat: "member" });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const o2 = await openLink(outsider, cast.meeting!);
  expect(["knocking", "in-call", "prejoin"], `a signed-in outsider may ask to join a 'trusted' meeting; saw ${summarize(o2)}`).toContain(o2.phase);
});

scenario("access-wrong-account", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  await setPolicies(cast.meeting!, [["access_type", "restricted"], ["allow_ask_to_join", "false"]]);
  const outsider = await cast.add({ label: "signed-in outsider", seat: "member" });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const o = await openLink(outsider, cast.meeting!);
  expect(o.phase, `a signed-in account that is not allowed must see the wrong-account screen; saw ${summarize(o)}`).toBe("refused:wrong_account");
  const text = await bodyText(outsider.page);
  expect(/test@test\.com/i.test(text), `the screen must name the account that is signed in; saw: ${text.slice(0, 220)}`).toBe(true);
  await press(outsider, "Switch account", outsider.page.getByRole("button", { name: /switch account/i }).or(outsider.page.getByRole("link", { name: /switch account/i })), 5000);
});

scenario("access-restricted-not-invited", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await setPolicies(cast.meeting!, [["access_type", "restricted"], ["allow_ask_to_join", "false"]]);
  const guest = await cast.add({ label: "guest not on the invite", seat: "guest", displayName: GUEST });
  const o = await openLink(guest, cast.meeting!);
  expect(o.phase, `restricted with asking turned off: the guest is told they are not invited, never put in a queue; saw ${summarize(o)}`).toBe("refused:not_invited");
  await seeUntil(host, "nobody waiting in the host's lobby", (x) => (x.lobbyCount ?? 0) === 0, TIMEOUTS.noticeMs);
  // Asking turned back on: the same guest may knock.
  await setPolicies(cast.meeting!, [["allow_ask_to_join", "true"]]);
  const guest2 = await cast.add({ label: "second guest", seat: "guest", displayName: "Daniel Okafor" });
  const o2 = await openLink(guest2, cast.meeting!);
  expect(o2.phase, `with asking allowed the guest waits to be let in; saw ${summarize(o2)}`).toBe("knocking");
});

scenario("meeting-locked-join", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await press(host, "Lock meeting", host.page.getByRole("button", { name: /^Lock meeting$/ }), 10_000);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  const member = await cast.addOrgMember("colleague in the same organization");
  const og = await openLink(guest, cast.meeting!);
  expect(og.phase, `a locked meeting refuses a guest outright (not a place in the waiting room); saw ${summarize(og)}`).toBe("refused:locked");
  expect(/locked/i.test(await bodyText(guest.page)), "the screen says the meeting is locked").toBe(true);
  const om = await openLink(member, cast.meeting!);
  expect(om.phase, `the lock applies to organization members too; saw ${summarize(om)}`).toBe("refused:locked");
  await keepsSeeing(host, "the host still in the call and nobody waiting", (x) => x.phase === "in-call" && (x.lobbyCount ?? 0) === 0, 4000);
  // Unlock, then Try again lets the guest ask.
  await press(host, "Unlock meeting", host.page.getByRole("button", { name: /^Unlock meeting$/ }), 10_000);
  await press(guest, "Try again", guest.page.getByRole("button", { name: /^Try again$/ }), 10_000);
  await seeUntil(guest, "asking to join after the unlock", (x) => x.phase === "knocking" || x.phase === "in-call", 30_000);
});

scenario("browser-unsupported", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest in an in-app browser", seat: "guest", displayName: GUEST });
  // An in-app webview that has no WebRTC: the page cannot run a call at all.
  await guest.context.addInitScript(() => {
    for (const k of ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCSessionDescription"]) {
      try { Object.defineProperty(window, k, { value: undefined, configurable: true }); } catch { /* ignore */ }
    }
  });
  guest.note("lever: init script removes RTCPeerConnection (a webview without WebRTC)");
  await guest.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
  await guest.page.waitForTimeout(8000);
  expect(await rawPhase(guest.page), "the contract phase for a browser that cannot join").toBe("unsupported");
  const text = await bodyText(guest.page);
  expect(/open (this|it|the link)? ?in|use (chrome|safari|firefox|edge)|try (chrome|safari|firefox|edge)|different browser/i.test(text), `it must say what to open instead; saw: ${text.slice(0, 220)}`).toBe(true);
  expect(await guest.page.getByRole("button", { name: /^Join now$/ }).isVisible().catch(() => false), "no Join button that cannot work").toBe(false);
  void host;
});
