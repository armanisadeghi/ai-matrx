// features/crm/compliance/message-compliance.ts
//
// THE COMPLIANCE ENVELOPE — what every commercial message must carry, built in
// one place so no send path can forget a piece of it.
//
// Pure functions on purpose: no Supabase, no fetch, no Redux. The same logic has
// to run in the browser (preview) and on the server (the actual send), and a
// preview that disagrees with what ships is worse than no preview.
//
// What the law requires in every message, verified 2026-08-14:
//   • a working opt-out mechanism                    CAN-SPAM §7704(a)(3), CASL, Spam Act
//   • the sender's valid physical postal address      CAN-SPAM §7704(a)(5), CASL, Spam Act
//   • honest identification of the sender             all four regimes
//   • RFC 8058 one-click headers for bulk marketing   Gmail + Yahoo + Microsoft
//   • where we got their details, at first contact    GDPR art. 14 (EEA/UK)
//
// Register: /Users/armanisadeghi/code/common-docs/systems/outreach-compliance/

import type { ConsentBasis } from "./types";

/** Where the unsubscribe endpoints live. Path, not host — the caller supplies the origin. */
export const UNSUBSCRIBE_PAGE_PATH = "/unsubscribe";
export const UNSUBSCRIBE_POST_PATH = "/api/unsubscribe";

export type PostalAddress = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  code?: string | null;
  country?: string | null;
};

export type ComplianceEnvelopeInput = {
  /** Absolute origin of this deployment, e.g. https://aimatrx.com. No trailing slash. */
  origin: string;
  /** From crm.issue_unsubscribe_token(). */
  unsubscribeToken: string;
  /** Identity override first, org default second — resolved by the caller. */
  postal: PostalAddress;
  /** Display name of the sending organization. */
  senderName: string;
  /**
   * Set for EEA/UK recipients (jurisdiction_policy.requires_source_disclosure)
   * on the FIRST message only. Omit and the art. 14 block is not rendered.
   */
  sourceDisclosure?: {
    /** The page the address was published on, or a description of the source. */
    source: string;
    consentBasis: ConsentBasis;
    /** The customer's own privacy notice. */
    privacyNoticeUrl?: string | null;
  } | null;
};

export type ComplianceEnvelope = {
  /** SMTP headers. Both MUST be covered by the DKIM signature (RFC 8058 §3.1). */
  headers: Record<string, string>;
  /** The URL a human clicks in the body. */
  unsubscribeUrl: string;
  /** Plain-text footer, appended after the message body. */
  textFooter: string;
  /** HTML footer, appended inside the message body. */
  htmlFooter: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "Acme Ltd, 1 High St, Suite 2, London, SW1A 1AA, GB" — omitting empty parts. */
export function formatPostalAddress(postal: PostalAddress): string {
  return [
    postal.name,
    postal.line1,
    postal.line2,
    postal.city,
    postal.region,
    postal.code,
    postal.country,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

/**
 * A postal address is a hard legal requirement, so an incomplete one is a
 * refusal condition, not a formatting problem. The DB gate checks the same two
 * fields (`no_postal_address`); this is the client-side twin so a preview can
 * say so before the send is attempted.
 */
export function isPostalAddressUsable(postal: PostalAddress): boolean {
  return Boolean(postal.line1?.trim()) && Boolean(postal.country?.trim());
}

const BASIS_SOURCE_PHRASE: Record<ConsentBasis, string> = {
  conspicuous_publication:
    "We found your professional contact details published at",
  legitimate_interest: "We obtained your professional contact details from",
  express: "You gave us these details at",
  implied_ebr: "We have these details from our previous business with you via",
  implied_inquiry: "We have these details from your enquiry via",
  soft_opt_in: "You gave us these details at",
  none: "We obtained your contact details from",
};

/**
 * Builds everything a compliant commercial message must carry.
 *
 * 🚨 Do NOT assemble any of these pieces anywhere else. A second implementation
 * is how one send path ends up missing the postal address, and there is no build
 * error for a missing legal footer.
 */
export function buildComplianceEnvelope(
  input: ComplianceEnvelopeInput,
): ComplianceEnvelope {
  const origin = input.origin.replace(/\/+$/, "");
  const token = encodeURIComponent(input.unsubscribeToken);
  const unsubscribeUrl = `${origin}${UNSUBSCRIBE_PAGE_PATH}/${token}`;
  const oneClickUrl = `${origin}${UNSUBSCRIBE_POST_PATH}/${token}`;
  const address = formatPostalAddress(input.postal);

  // RFC 8058. The receiving provider POSTs to the List-Unsubscribe URI and the
  // unsubscribe MUST complete with no further interaction. Gmail and Yahoo
  // render this as a native button; Microsoft expects a working unsubscribe too.
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${oneClickUrl}>, <${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };

  const lines: string[] = [];
  const htmlParts: string[] = [];

  // GDPR art. 14 — where we got their details. First contact only; the caller
  // decides that from crm.contact_medium.source_disclosed_at.
  if (input.sourceDisclosure) {
    const { source, consentBasis, privacyNoticeUrl } = input.sourceDisclosure;
    const phrase = BASIS_SOURCE_PHRASE[consentBasis] ?? BASIS_SOURCE_PHRASE.none;
    const sentence = `${phrase} ${source}. You can ask us to stop contacting you at any time using the link below${
      privacyNoticeUrl ? `, and you can read how we handle your data at ${privacyNoticeUrl}` : ""
    }.`;
    lines.push(sentence);
    htmlParts.push(
      `<p style="margin:0 0 8px">${escapeHtml(phrase)} ${escapeHtml(source)}. ` +
        `You can ask us to stop contacting you at any time using the link below` +
        (privacyNoticeUrl
          ? `, and you can read how we handle your data <a href="${escapeHtml(privacyNoticeUrl)}">here</a>`
          : "") +
        `.</p>`,
    );
  }

  lines.push(`Unsubscribe: ${unsubscribeUrl}`);
  htmlParts.push(
    `<p style="margin:0 0 8px"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p>`,
  );

  // Legally required, and the reason the gate refuses without it.
  lines.push(`${input.senderName}${address ? ` · ${address}` : ""}`);
  htmlParts.push(
    `<p style="margin:0;color:#6b7280;font-size:12px">${escapeHtml(input.senderName)}` +
      (address ? ` &middot; ${escapeHtml(address)}` : "") +
      `</p>`,
  );

  return {
    headers,
    unsubscribeUrl,
    textFooter: `\n\n—\n${lines.join("\n")}\n`,
    htmlFooter:
      `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;` +
      `font-family:system-ui,sans-serif;font-size:13px;color:#6b7280">` +
      htmlParts.join("") +
      `</div>`,
  };
}

/**
 * THE MERGE-FIELD RULE (outreach handoff §7, G3): an unresolved variable is a
 * refusal, never an empty string. "Hi {{first_name}}," or "Hi ," is the single
 * most recognizable automated-spam tell, and it is a rendering bug we can make
 * impossible.
 *
 * Returns the unresolved variable names; empty means the message is safe to send.
 */
export function findUnresolvedMergeFields(rendered: string): string[] {
  const found = new Set<string>();
  for (const match of rendered.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    found.add(match[1]);
  }
  return [...found];
}
