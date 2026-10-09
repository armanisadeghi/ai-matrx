/** P1 — catalog category "large-meetings". */
import { expect } from "@playwright/test";
import { keepsSeeing, seeUntil } from "../lib/meeting";
import { summarize } from "../lib/observe";
import { bodyText, openLink, setPolicies } from "../lib/p1";
import { scenario, unproven } from "../lib/scenario";
import { GUEST, hostWithMeeting } from "../lib/stories";
import { walkIn } from "../lib/meeting";

scenario("meeting-full", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  await setPolicies(cast.meeting!, [["max_participants", 2]]);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  // The cap counts DEVICES: the host's second tab takes the second seat, so a guest is refused (the host is not kicked).
  const second = await host.openSecondTab(cast.meeting!.path);
  await walkIn(host, cast.meeting!, { until: ["in-call"], page: second });
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  const o = await openLink(guest, cast.meeting!);
  expect(o.phase, `a full meeting is refused with its own screen; saw ${summarize(o)}`).toBe("refused:meeting_full");
  expect(/full|capacity/i.test(await bodyText(guest.page)), "the screen says the meeting is full").toBe(true);
  await keepsSeeing(host, "the people already in are not kicked", (x) => x.phase === "in-call", 5000);
  await seeUntil(host, "no one queued", (x) => (x.lobbyCount ?? 0) === 0, 5000);
});

scenario("plan-concurrency-limit", async () => {
  unproven("needs the whole LiveKit project at its concurrency limit; the project is shared with production and cannot be driven to its quota from a browser test");
});

scenario("gallery-paging", async () => {
  unproven("needs more people than one gallery page holds (tens of live participants); a shared machine cannot run that many real browsers, and a bulk-publisher is not a browser");
});
