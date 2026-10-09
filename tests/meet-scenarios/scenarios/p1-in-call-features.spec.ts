/** P1 — catalog category "in-call-features": chat. */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { setMeetingPolicy, walkIn } from "../lib/meeting";
import { CHAT, bodyText, press, sendChat } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { GUEST_2, admitWaiting, callWithGuest } from "../lib/stories";

scenario("chat-late-join-history", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  for (const line of CHAT) await sendChat(host, line);
  const late = await cast.add({ label: "late guest", seat: "guest", displayName: GUEST_2 });
  await walkIn(late, cast.meeting!, { until: ["knocking", "in-call"] });
  await admitWaiting(host, late, GUEST_2);
  await press(late, "Chat", late.page.getByRole("button", { name: /^Chat\b|Open chat|Show chat/i }), 8000);
  for (const line of CHAT) await expect(late.page.getByText(line), `the late joiner sees "${line.slice(0, 30)}…"`).toBeVisible({ timeout: TIMEOUTS.noticeMs });
  // A reload keeps the history too.
  await guest.refresh();
  await walkIn(guest, cast.meeting!, { until: ["in-call", "knocking"] });
  await press(guest, "Chat", guest.page.getByRole("button", { name: /^Chat\b|Open chat|Show chat/i }), 8000);
  for (const line of CHAT) await expect(guest.page.getByText(line), `after a reload the guest still sees "${line.slice(0, 30)}…"`).toBeVisible({ timeout: TIMEOUTS.noticeMs });
});

scenario("chat-restrictions", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await setMeetingPolicy(cast.meeting!, "chat_mode", "hosts_only");
  await press(guest, "Chat", guest.page.getByRole("button", { name: /^Chat\b|Open chat|Show chat/i }), 8000);
  expect(await guest.page.getByRole("textbox", { name: /message|chat/i }).isEnabled().catch(() => false), "the guest has no live message box").toBe(false);
  const text = await bodyText(guest.page);
  expect(/chat (is )?(limited|restricted|turned off|disabled)|only (the )?host[^.]*(can )?(send|chat)/i.test(text), `a notice says why; saw: ${text.slice(0, 200)}`).toBe(true);
  // The host can still write.
  await sendChat(host, CHAT[0]);
});
