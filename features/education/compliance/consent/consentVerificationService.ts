// features/education/compliance/consent/consentVerificationService.ts
//
// Client service for the GUARDIAN-side verifiable-consent flow. The card path
// starts a Stripe Checkout via the Next API route (secret Stripe work must stay
// server-side); confirmation happens server-side in the webhook — the returned
// URL is just where the parent completes the card step. Never throws.

"use client";

// REC-62 (W1-ORG-APPLY, 2026-09-22): a Stripe customer, subscription and payout
// account belong to an ORGANIZATION, and nothing on the server picks one. These
// calls therefore go through `fetchWithOrganization`, which carries the person's
// selected organization in `X-Organization-Id` and — when the server answers the
// standard organization_required envelope — opens the picker, waits for their
// answer and replays the call once. Cancelling leaves nothing written.
import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";

export interface StartVerificationResult {
  url: string | null;
  error: string | null;
}

export const consentVerificationService = {
  /**
   * Start card verification for a linked child (caller must be the guardian on an
   * active link). Returns the Stripe Checkout URL to redirect the parent to. The
   * guardian_link is marked verified only by the webhook after Stripe confirms a
   * successful card authorization — never by this client call.
   */
  async startCardVerification(
    studentUserId: string,
  ): Promise<StartVerificationResult> {
    try {
      const res = await fetchWithOrganization("/api/education/coppa-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentUserId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !body.url) {
        return { url: null, error: body.error ?? "Could not start verification" };
      }
      return { url: body.url, error: null };
    } catch (e) {
      return {
        url: null,
        error: e instanceof Error ? e.message : "Could not start verification",
      };
    }
  },
};
