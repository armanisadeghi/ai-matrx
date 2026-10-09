/** P1 — catalog category "mobile-browser". */
import { endForEveryone, seePhase } from "../lib/meeting";
import { scenario, unproven } from "../lib/scenario";
import { callWithGuest } from "../lib/stories";

scenario("tab-hidden-throttle", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  const state = await guest.background();
  if (state !== "hidden") unproven(`the browser kept the page visible (visibilityState=${state}) after another tab took the foreground, so a hidden-tab state cannot be produced here`);
  // While the tab is hidden the meeting ends; no timer can have noticed it.
  await endForEveryone(host);
  await guest.page.waitForTimeout(20_000);
  await guest.foreground();
  await seePhase(guest, ["ended"], 6000);
});

scenario("mobile-background-camera", async () => {
  unproven("needs a phone's OS to suspend the camera when the app is backgrounded or the screen locks; a desktop browser cannot raise that event");
});

scenario("mobile-call-interrupt", async () => {
  unproven("needs the operating system to take audio focus (a phone call or alarm) and mute the microphone track; a script cannot cause that honestly");
});

scenario("codec-ua-gating", async () => {
  unproven("needs the real browsers named in the situation (Intel Mac Safari, Firefox with AV1) to see green or frozen video; only Chromium runs in this harness");
});
