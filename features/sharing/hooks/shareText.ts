import type { ShareLink } from "@/utils/permissions/shareLinks";

/** A deliberately title-free message for handing a canonical link to a person. */
export function createSafeShareMessage(url: string): string {
  return `I shared an AI Matrx item with you: ${url}`;
}

/** Refuses links the canonical resolver would reject or exhaust. */
export function shareLinkUnavailableReason(
  link: Pick<ShareLink, "isActive" | "expiresAt" | "maxUses" | "useCount">,
  now = Date.now(),
): string | null {
  if (!link.isActive) return "This link has been turned off.";

  if (link.expiresAt !== null) {
    const expiresAt = Date.parse(link.expiresAt);
    if (!Number.isFinite(expiresAt))
      return "This link's expiry can't be verified.";
    if (expiresAt <= now) return "This link has expired.";
  }

  if (link.maxUses !== null && link.useCount >= link.maxUses) {
    return "This link has reached its view limit.";
  }

  return null;
}

export function shareLinkSecurityStateMatches(
  a: ShareLink,
  b: ShareLink,
): boolean {
  const expiryMatches =
    a.expiresAt === null || b.expiresAt === null
      ? a.expiresAt === b.expiresAt
      : Date.parse(a.expiresAt) === Date.parse(b.expiresAt);

  return (
    a.id === b.id &&
    a.token === b.token &&
    a.shortToken === b.shortToken &&
    a.permissionLevel === b.permissionLevel &&
    a.isActive === b.isActive &&
    expiryMatches &&
    a.maxUses === b.maxUses &&
    a.useCount === b.useCount
  );
}

/**
 * A refreshed inactive/expired/exhausted link must be rejected before asking
 * the owner to review changed fields; otherwise the dialog can imply access
 * that has already been revoked.
 */
export function evaluateShareLinkHandoff(
  reviewed: ShareLink,
  current: ShareLink,
):
  | { status: "unavailable"; reason: string }
  | { status: "changed" }
  | { status: "ready" } {
  const unavailableReason = shareLinkUnavailableReason(current);
  if (unavailableReason)
    return { status: "unavailable", reason: unavailableReason };
  if (!shareLinkSecurityStateMatches(reviewed, current)) {
    return { status: "changed" };
  }
  return { status: "ready" };
}

export function describeShareLinkAccess(
  permissionLevel: ShareLink["permissionLevel"],
): string {
  return `Anyone with the link: ${permissionLevel} access`;
}

export function describeShareLinkExpiry(expiresAt: string | null): string {
  if (expiresAt === null) return "Does not expire";
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) return "Expiry could not be verified";
  return `Expires ${date.toLocaleString()}`;
}
