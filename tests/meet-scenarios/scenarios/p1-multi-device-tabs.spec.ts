/** P1 — catalog category "multi-device-tabs". One scenario, run for the profiles whose rules differ. */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { createMeetingWithProfile, seeControl, seeUntil, walkIn } from "../lib/meeting";
import { summarize } from "../lib/observe";
import { press } from "../lib/p1";
import { scenario } from "../lib/scenario";

scenario("second-device-switch-or-add", async ({ cast }) => {
  const host = await cast.add({ label: "host", seat: "admin" });
  const choices: [("meet" | "teams"), RegExp, RegExp][] = [
    ["meet", /^Switch here$/, /^Join here too$/],
    ["teams", /^Transfer here$/, /^Add this device$/],
  ];
  for (const [profile, switchRe, addRe] of choices) {
    cast.meeting = await createMeetingWithProfile(host, profile);
    await walkIn(host, cast.meeting, { until: ["in-call"] });
    const second = await host.openSecondTab(cast.meeting.path);
    // The second tab is offered the profile's two choices before anything happens.
    await seeControl(host, `${profile}: the 'switch' choice`, second.getByRole("button", { name: switchRe }), 45_000, second);
    await press(host, `${profile}: the 'also join' choice`, second.getByRole("button", { name: addRe }), 5000, second);
    const o = await seeUntil(host, "the second tab in the call", (x) => x.phase === "in-call", 45_000, second);
    // The companion joins with its microphone and speaker off, and the roster shows the person once.
    expect(o.microphone, `the companion device joins with the microphone off; saw ${summarize(o)}`).not.toBe("on");
    const first = await seeUntil(host, "the first tab still in the call", (x) => x.phase === "in-call", TIMEOUTS.noticeMs, host.page);
    expect(first.participants.filter((p) => p.self).length, `one person is listed once across two devices; saw ${summarize(first)}`).toBe(1);
    await second.close();
  }
});
