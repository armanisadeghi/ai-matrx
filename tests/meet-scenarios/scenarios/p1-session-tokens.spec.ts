/** P1 — catalog category "session-tokens". */
import { expect } from "@playwright/test";
import { keepsSeeing } from "../lib/meeting";
import { CHAT, sendChat } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { callWithGuest } from "../lib/stories";

// The room credential lives 10 minutes by default (`room_token_ttl_seconds` 600) and is the one a real call outlives.
// The meeting pass (`meeting_pass_ttl_seconds`, 6 h, organization-level only) cannot be shortened for one meeting, so its
// quiet refresh at 80% of its life is NOT exercised here (no 6 h wait, no organization-wide rule change from a test).
scenario("token-expiry", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  const requests: string[] = [];
  guest.page.on("request", (r) => { if (/\/v1\/meet\//.test(r.url())) requests.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  // 11 minutes in the call: past the room credential's whole life. Nothing visible may happen.
  await keepsSeeing(guest, "the guest in the call, no banner, no rejoin, through the credential's lifetime", (o) => o.phase === "in-call" && (o.connection === null || o.connection === "stable"), 11 * 60_000);
  await sendChat(guest, CHAT[2]);
  await keepsSeeing(host, "the guest present and the call undisturbed", (o) => o.participants.length >= 2, 3000);
  guest.note(`meet requests during the wait: ${requests.length}`);
  expect(await guest.page.getByText(CHAT[2]).first().isVisible(), "the guest's chat message went through after the credential's lifetime").toBe(true);
}, { timeoutMs: 15 * 60_000 });
