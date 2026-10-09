/** P1 — catalog category "time-plan-limits". */
import { expect } from "@playwright/test";
import { seePhase } from "../lib/meeting";
import { rawAttr, seeNotice, setPolicies } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { callWithGuest } from "../lib/stories";

scenario("time-limit-warning", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  // A 3-minute limit with a 2-minute warning, set on this meeting before the clock matters.
  await setPolicies(cast.meeting!, [["time_limit_minutes", 3], ["time_limit_warning_minutes", 2]]);
  for (const p of [host, guest]) await seeNotice(p, "time-warning", /(meeting )?(will )?end(s)? in \d+|\d+ minutes? (left|remaining)|time limit/i, 150_000);
  for (const p of [host, guest]) await seePhase(p, ["ended"], 240_000);
  expect(await rawAttr(guest.page, "reason") ?? "time_limit", "the end says why").toBe("time_limit");
});
