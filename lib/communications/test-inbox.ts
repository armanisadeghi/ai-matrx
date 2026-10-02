/**
 * A test account's email goes to the ONE designated test inbox — never to admin.com / test.com.
 *
 * `admin@admin.com` and `test@test.com` log in with addresses on domains strangers own, so an
 * invitation, RSVP notice or recap to them left the building. `sendEmail`
 * (`lib/email/client.ts`, the one app-email seam) calls `redirectToTestInbox` before Resend and
 * delivers to `info@aimatrx.com` (Arman, 2026-10-01) with the original recipient named in the
 * subject and an `X-Matrx-Original-Recipient` header — never dropped.
 *
 * 🚨 MIRROR of `aidream/aidream/designated_test_recipients.py` (the single home; a new test
 * account is added THERE, on Arman's word, then here). `test-inbox.test.ts` and aidream's
 * `scripts/check_test_accounts_never_email_a_stranger.py` fail when the two copies disagree.
 */

/** The ONE safe inbox for test-account mail. We own aimatrx.com. */
export const DESIGNATED_TEST_INBOX = "info@aimatrx.com";

/** Test-account login email → auth user id (identical on production and the nightly clone). */
export const TEST_ACCOUNT_USER_IDS: Readonly<Record<string, string>> = {
  "admin@admin.com": "87a6e699-3622-4869-8843-d0867456c0dd",
  "test@test.com": "4060701e-706a-4c76-b3ca-0bbc69fa5a14",
};

/** The header every redirected message carries, naming who it was really for. */
export const ORIGINAL_RECIPIENT_HEADER = "X-Matrx-Original-Recipient";

const TEST_EMAILS = new Set(Object.keys(TEST_ACCOUNT_USER_IDS));

/** `"Name <a@b.com>"` or `"a@b.com"` → `"a@b.com"`, lowercased and trimmed. */
export function bareAddress(address: string): string {
  const text = (address ?? "").trim();
  const angle = text.match(/<([^<>]+)>\s*$/);
  return (angle ? angle[1] : text).trim().toLowerCase();
}

/** The test account an address belongs to, or null for a real person. */
export function redirectToTestInbox(address: string): string | null {
  const bare = bareAddress(address);
  return TEST_EMAILS.has(bare) ? bare : null;
}

export function redirectedSubject(subject: string, original: string): string {
  return `[Test → ${original}] ${subject ?? ""}`.trimEnd();
}

export interface TestInboxRouting {
  to: string[];
  subject: string;
  /** The test accounts that were redirected; empty when every recipient is a real person. */
  redirected: string[];
  headers?: Record<string, string>;
}

/** Route a whole recipient list: test accounts → the test inbox (deduplicated), others untouched. */
export function routeRecipients(to: string | string[], subject: string): TestInboxRouting {
  const redirected: string[] = [];
  const routed: string[] = [];
  for (const recipient of Array.isArray(to) ? to : [to]) {
    const account = redirectToTestInbox(recipient);
    if (account) redirected.push(account);
    const destination = account ? DESIGNATED_TEST_INBOX : recipient;
    if (!routed.includes(destination)) routed.push(destination);
  }
  if (redirected.length === 0) return { to: routed, subject, redirected };
  const named = redirected.join(", ");
  return {
    to: routed,
    subject: redirectedSubject(subject, named),
    redirected,
    headers: { [ORIGINAL_RECIPIENT_HEADER]: named },
  };
}
