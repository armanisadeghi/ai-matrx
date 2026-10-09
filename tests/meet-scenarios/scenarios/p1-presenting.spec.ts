/**
 * P1 — catalog category "presenting". The share picker cannot be driven headless: every sharer gets a
 * canvas stream from an init script (lib/p1.ts shareSourceInit) that the product publishes as a real track,
 * and "the browser's Stop sharing bar" is that track ending. Recorded as a lever in the report.
 */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { keepsSeeing, seeUntil, setMeetingPolicy, walkIn } from "../lib/meeting";
import { endShare, hasButton, press, seeNotice, shareSourceInit } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { GUEST, admitWaiting, callWithGuest } from "../lib/stories";
import type { Actor } from "../lib/actor";

async function withShareSource(a: Actor, audio: boolean): Promise<void> {
  await a.context.addInitScript(shareSourceInit, audio);
  a.note(`lever: init script — getDisplayMedia answers with a canvas stream${audio ? " plus an audio track" : " (no audio)"}`);
}

scenario("share-stopped-by-browser", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await withShareSource(guest, false);
  await guest.refresh();
  await walkIn(guest, cast.meeting!, { until: ["in-call", "knocking"] });
  await press(guest, "Share screen", guest.page.getByRole("button", { name: /^Share screen$/ }), 15_000);
  await seeUntil(host, "the share on screen", (o) => /presenting|is sharing|screen/i.test(o.text), TIMEOUTS.noticeMs);
  await endShare(guest.page);
  await seeUntil(guest, "back to the normal layout with a Share screen control", (o) => o.phase === "in-call", 8000);
  await press(guest, "Share screen again", guest.page.getByRole("button", { name: /^Share screen$/ }), 5000);
  expect(await hasButton(guest.page, /^Stop sharing$/), "the Stop sharing control is gone").toBe(false);
  await seeUntil(host, "the share gone from the host's stage", (o) => !/is presenting|is sharing/i.test(o.text), 8000);
});

scenario("share-takeover", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await withShareSource(host, false);
  await withShareSource(guest, false);
  await host.refresh();
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await guest.refresh();
  await walkIn(guest, cast.meeting!, { until: ["in-call", "knocking"] });
  await press(guest, "Share screen", guest.page.getByRole("button", { name: /^Share screen$/ }), 15_000);
  await seeUntil(host, `${GUEST} presenting`, (o) => /presenting|is sharing/i.test(o.text), TIMEOUTS.noticeMs);
  await press(host, "Share screen", host.page.getByRole("button", { name: /^Share screen$/ }), 8000);
  // One presenter at a time: the second is asked, and taking over ends the first.
  await press(host, "Present instead", host.page.getByRole("button", { name: /present instead|take over|share anyway/i }), 8000);
  await seeNotice(guest, "share-ended", /(stopped|ended)[^.]*present|is now (presenting|sharing)|replaced/i, TIMEOUTS.noticeMs);
  expect(await hasButton(guest.page, /^Stop sharing$/), "the first presenter is no longer sharing").toBe(false);
});

scenario("share-who-can", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await withShareSource(guest, false);
  await guest.refresh();
  await walkIn(guest, cast.meeting!, { until: ["in-call", "knocking"] });
  await press(guest, "Share screen (everyone may share by default)", guest.page.getByRole("button", { name: /^Share screen$/ }), 15_000);
  void host;
  // The host restricts sharing to hosts while the guest is presenting: the guest is told, and the share ends.
  await setMeetingPolicy(cast.meeting!, "share_who_can", "host_only");
  await seeNotice(guest, "share-unavailable", /sharing (is )?(turned off|disabled|not allowed)|only (the )?host[^.]*(can )?(share|present)/i, 30_000);
  expect(await hasButton(guest.page, /^(Share screen|Stop sharing)$/), "no share control for someone who may not share").toBe(false);
});

scenario("share-audio", async ({ cast }) => {
  const { guest } = await callWithGuest(cast);
  await withShareSource(guest, false);
  await guest.refresh();
  await walkIn(guest, cast.meeting!, { until: ["in-call", "knocking"] });
  await press(guest, "Share screen", guest.page.getByRole("button", { name: /^Share screen$/ }), 15_000);
  // The source has no sound: the person is told, and told what to do about it.
  await seeNotice(guest, "share-audio-missing", /sound not shared|no (sound|audio)|share audio/i, TIMEOUTS.noticeMs);
  await keepsSeeing(guest, "sharing continues", (x) => x.phase === "in-call", 3000);
});

scenario("share-unsupported-mobile", async ({ cast }) => {
  const { host } = await callWithGuest(cast);
  void host;
  const phone = await cast.add({ label: "phone guest", seat: "guest", displayName: "Daniel Okafor", faults: { noScreenShare: true } });
  const cdp = await phone.context.newCDPSession(phone.page);
  await cdp.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
  await phone.page.setViewportSize({ width: 390, height: 844 });
  phone.note("lever: mobile user agent, 390x844 viewport, no getDisplayMedia");
  await walkIn(phone, cast.meeting!, { until: ["knocking", "in-call"] });
  await admitWaiting(host, phone, "Daniel Okafor");
  expect(await hasButton(phone.page, /^Share screen$/), "no Share screen button on a phone").toBe(false);
  await press(phone, "the more menu", phone.page.getByRole("button", { name: /^More options$/ }), 8000);
  await seeUntil(phone, "a pointer to a computer", (o) => /from a (computer|desktop)|on a (computer|desktop)/i.test(o.text), TIMEOUTS.noticeMs);
});
