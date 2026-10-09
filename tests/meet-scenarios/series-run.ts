/**
 * One-off proof driver (not a scenario): create a DAILY recurring meeting as admin@admin.com through
 * the product's schedule function (`communication.meet_schedule_meeting`), run its first occurrence
 * with two participants for a minute (a chat line so the run is not silent), then end the RUN (the
 * series stays). Run:  pnpm exec tsx tests/meet-scenarios/series-run.ts
 * Prints the series slug and the run's session row. The second occurrence is a later, separate run.
 */
import { chromium } from "@playwright/test";
import { Cast, CHROMIUM_ARGS_BASE } from "./lib/scenario";
import { supabasePublic, baseURL } from "./lib/env";
import { endForEveryone, walkIn, seeUntil, type Meeting } from "./lib/meeting";
import { GUEST, admitWaiting } from "./lib/stories";

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: "chromium", args: CHROMIUM_ARGS_BASE });
  const cast = new Cast(browser, CHROMIUM_ARGS_BASE);
  try {
    const host = await cast.add({ label: "host", seat: "admin" });
    const s = await host.session();
    if (!s) throw new Error("no admin session");
    const { url, key } = supabasePublic();
    const org = process.env.SERIES_ORG ?? "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
    const startsAt = new Date(Date.now() + 4 * 60_000);
    startsAt.setSeconds(0, 0);
    const res = await fetch(`${url}/rest/v1/rpc/meet_schedule_meeting`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${s.token}`, "Content-Type": "application/json", "Content-Profile": "communication", "Accept-Profile": "communication" },
      body: JSON.stringify({
        p_organization_id: org,
        p_host_user_id: s.userId,
        p_title: "Daily product standup",
        p_scheduled_for: startsAt.toISOString(),
        p_time_zone: "America/Los_Angeles",
        p_duration_minutes: 15,
        p_agenda: "Yesterday, today, blockers.",
        p_recurrence_rule: "FREQ=DAILY",
        p_settings: {},
      }),
    });
    const body = await res.text();
    console.log("meet_schedule_meeting", res.status, body.slice(0, 600));
    if (!res.ok) throw new Error("schedule failed");
    const out = JSON.parse(body) as { slug?: string } | { slug?: string }[];
    const slug = (Array.isArray(out) ? out[0] : out)?.slug;
    if (!slug) throw new Error("no slug in answer");
    const meeting: Meeting = { slug, path: `/meet/${slug}`, host };
    cast.meeting = meeting;
    console.log("SERIES", slug, "first occurrence", startsAt.toISOString());
    await walkIn(host, meeting, { until: ["in-call"] });
    const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
    await walkIn(guest, meeting, { until: ["knocking", "in-call"], gesture: true });
    if ((await guest.page.locator("[data-meet-root]").getAttribute("data-meet-phase").catch(() => "")) !== "in-call") await admitWaiting(host, guest, GUEST);
    // A chat line from the host, so the run is not silent.
    await host.page.getByRole("button", { name: /^Chat\b|chat/i }).first().click({ timeout: 15_000 });
    const box = host.page.getByRole("textbox").last();
    await box.fill("Morning everyone: yesterday I finished the intake form, today I start the review queue, no blockers.");
    await box.press("Enter");
    await host.page.waitForTimeout(60_000);
    await seeUntil(host, "still in the call", (o) => o.phase === "in-call", 10_000);
    await endForEveryone(host);
    await host.page.waitForTimeout(5000);
    console.log("RUN ENDED", slug);
  } finally {
    // Cast.dispose only; the series row is NOT cancelled and no ensureEnded sweep (the series is not "live").
    await cast.dispose().catch(() => undefined);
    await browser.close();
  }
  void baseURL;
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
