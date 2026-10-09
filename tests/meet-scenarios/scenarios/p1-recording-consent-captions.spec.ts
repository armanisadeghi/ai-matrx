/** P1 — catalog category "recording-consent-captions". */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { createMeetingWithProfile, seeUntil, setMeetingPolicy, walkIn } from "../lib/meeting";
import { hasButton, press, seeNotice } from "../lib/p1";
import { scenario, unproven } from "../lib/scenario";
import { GUEST, GUEST_2, admitWaiting, callWithGuest } from "../lib/stories";

async function startRecording(host: import("../lib/actor").Actor): Promise<void> {
  await press(host, "Start recording", host.page.getByRole("button", { name: /^Start recording$/ }), 10_000);
  await seeUntil(host, "recording on", (o) => o.recording === true, 60_000);
}

scenario("rec-late-joiner", async ({ cast }) => {
  const { host } = await callWithGuest(cast);
  await startRecording(host);
  const late = await cast.add({ label: "late guest", seat: "guest", displayName: GUEST_2 });
  await walkIn(late, cast.meeting!, { until: ["knocking", "in-call"] });
  await admitWaiting(host, late, GUEST_2);
  // On the very first frame in the room, not after a poll: the first in-call reading already says recording.
  const first = await seeUntil(late, "the first in-call reading", (o) => o.phase === "in-call", 30_000);
  expect(first.recording, "the recording indicator is on the first frame the late joiner sees in the room").toBe(true);
  await seeNotice(late, "recording-started", /recording|being recorded/i, 5000);
});

scenario("rec-consent-gate", async ({ cast }) => {
  // Zoom rules: OK or Leave. Then Teams rules: view-only until the person agrees.
  const host = await cast.add({ label: "host", seat: "admin" });
  for (const [profile, note] of [["zoom", "ok_or_leave"], ["teams", "view_only_until_agree"]] as const) {
    cast.meeting = await createMeetingWithProfile(host, profile);
    await setMeetingPolicy(cast.meeting, "recording_consent", note);
    await walkIn(host, cast.meeting, { until: ["in-call"] });
    const guest = await cast.add({ label: `guest (${profile})`, seat: "guest", displayName: GUEST });
    await walkIn(guest, cast.meeting, { until: ["knocking", "in-call"] });
    await admitWaiting(host, guest, GUEST);
    await startRecording(host);
    if (profile === "zoom") {
      await press(guest, "OK on the consent dialog", guest.page.getByRole("button", { name: /^(OK|I agree|Continue)$/ }), 15_000);
      expect(await hasButton(guest.page, /^Leave( meeting)?$/), "the consent dialog offers Leave").toBe(true);
    } else {
      // Until they agree they cannot unmute, start video or share.
      const o = await seeUntil(guest, "view-only until consent", (x) => x.microphone === "locked" || /agree|consent/i.test(x.text), TIMEOUTS.noticeMs);
      expect(await hasButton(guest.page, /^Unmute\b/), `Unmute is not available before consent; saw ${o.text.slice(0, 120)}`).toBe(false);
      await press(guest, "I agree", guest.page.getByRole("button", { name: /^(I agree|Agree|OK)$/ }), 8000);
      await seeUntil(guest, "controls back after consent", (x) => x.microphone !== "locked", TIMEOUTS.noticeMs);
    }
    await press(host, "Stop recording", host.page.getByRole("button", { name: /^Stop recording$/ }), 10_000);
    if (profile === "zoom") await host.page.getByRole("button", { name: /^Leave$/ }).click().catch(() => undefined);
  }
});

scenario("rec-auto-stop", async ({ cast }) => {
  // The cap is the same path as the 8 h cap, shortened to one minute through the meeting's own rule.
  const { host, guest } = await callWithGuest(cast);
  await setMeetingPolicy(cast.meeting!, "max_recording_minutes", 1);
  await startRecording(host);
  await seeNotice(host, "recording-stopped", /recording (has )?stopped|stopped recording/i, 150_000);
  await seeUntil(guest, "the indicator cleared for the guest too", (o) => o.recording === false, TIMEOUTS.noticeMs);
  await seeUntil(host, "the indicator cleared", (o) => o.recording === false, TIMEOUTS.noticeMs);
});

scenario("rec-processing", async ({ cast }) => {
  const { host } = await callWithGuest(cast);
  await startRecording(host);
  await host.page.waitForTimeout(12_000);
  await press(host, "Stop recording", host.page.getByRole("button", { name: /^Stop recording$/ }), 10_000);
  await seeUntil(host, "a 'being processed' state", (o) => /processing|being processed|getting ready/i.test(o.text), 60_000);
  await press(host, "the link to the finished recording", host.page.getByRole("link", { name: /view recording|open recording|watch|download/i }), 240_000);
});

scenario("notes-ai-notice", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await press(host, "start AI notes", host.page.getByRole("button", { name: /^(Start |Turn on )?(AI )?(notes|note-?taker)\b|take notes/i }), 10_000);
  for (const p of [host, guest]) {
    await seeNotice(p, "notes-started", /(ai )?(notes|note-?taker|transcript)[^.]*(started|on|listening)|transcription has started/i, 45_000);
  }
  await seeUntil(guest, "an AI indicator that stays visible", (o) => /ai (notes|note-?taker)|notes (are )?on|transcribing/i.test(o.text) || o.participants.some((p) => /AI/.test(p.role ?? "")), TIMEOUTS.noticeMs);
});

scenario("captions-toggle", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await press(guest, "Turn on captions", guest.page.getByRole("button", { name: /^(Turn on captions|Captions|CC)\b/i }), 10_000);
  const pressed = await guest.page.getByRole("button", { name: /captions|^CC/i }).first().getAttribute("aria-pressed");
  expect(pressed, "the guest's captions control reports it is on").toBe("true");
  // Just for them: the host's screen has no captions and nothing changed for the host.
  expect(await host.page.getByRole("button", { name: /captions|^CC/i }).first().getAttribute("aria-pressed"), "the host's own captions control is untouched").not.toBe("true");
  await press(guest, "Turn off captions", guest.page.getByRole("button", { name: /^(Turn off captions|Captions|CC)\b/i }), 5000);
});

scenario("captions-unavailable", async ({ cast }) => {
  const { guest } = await callWithGuest(cast);
  await press(guest, "Turn on captions", guest.page.getByRole("button", { name: /^(Turn on captions|Captions|CC)\b/i }), 10_000);
  // Either captions work (this run cannot prove the failure screen), or the person is told why not.
  const deadline = Date.now() + 45_000;
  let seenText = "";
  while (Date.now() < deadline) {
    seenText = (await guest.page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    if (/captions (are )?unavailable|captions aren.t available|captions (didn.t|couldn.t)/i.test(seenText)) return;
    await guest.page.waitForTimeout(1000);
  }
  if (await guest.page.locator("[data-meet-caption], [aria-live] [class*='caption' i]").count()) unproven("captions are working in this run, so the unavailable screen cannot be produced (the transcription agent was healthy)");
  expect(false, "captions were turned on and nothing said they were unavailable or showed a caption within 45 s; a silent failure").toBe(true);
});
