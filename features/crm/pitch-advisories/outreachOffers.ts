// features/crm/pitch-advisories/outreachOffers.ts
//
// The one-click local offers a campaign message can perform (the PR floor's
// "offer" column), shared by every surface that holds a campaign member and
// its template:
//
//   schedule_at / hold_until → hold the member until that time; the cadence
//                              sends then (E7 wait, E10 hold, E12 embargo lift)
//   strip_tracking           → remove the tracking image from the template (E16)
//   rewrite_line             → swap the coverage promise for the rewritten line (E13)
//   label_cold               → go ahead, recorded as a cold pitch (E6)
//
// An offer whose inputs are absent (no member, no `at`, a line that comes from
// a merge field) is reported as not performable, so the panel shows it as
// guidance instead of a button that would do nothing.

import {
  getTemplateById,
  updateTemplate,
} from "@/features/message-templates/services/message-templates-service";
import { scheduleMember } from "@/features/crm/outreach-lists/service";
import type { AdvisoryOffer } from "./service";

const PIXEL =
  /<img\b[^>]*(?:width\s*=\s*["']?1["'\s>/]|height\s*=\s*["']?1["'\s>/]|(?:track|pixel|beacon|open)[^"'>]*\.(?:gif|png))[^>]*>/gi;

export function stripTrackingPixels(content: string): string {
  return content.replace(PIXEL, "");
}

function detailString(offer: AdvisoryOffer, key: string): string | null {
  const value = offer.detail?.[key];
  return typeof value === "string" && value ? value : null;
}

export function offerTime(offer: AdvisoryOffer): string | null {
  return offer.action === "hold_until"
    ? detailString(offer, "until")
    : offer.action === "schedule_at"
      ? detailString(offer, "at")
      : null;
}

export interface OutreachOfferTarget {
  memberId: string | null;
  templateId: string | null;
}

export function canPerformOutreachOffer(
  target: OutreachOfferTarget,
  offer: AdvisoryOffer,
): boolean {
  switch (offer.action) {
    case "label_cold":
      return true;
    case "schedule_at":
    case "hold_until":
      return Boolean(target.memberId && offerTime(offer));
    case "strip_tracking":
      return Boolean(target.templateId);
    case "rewrite_line":
      return Boolean(
        target.templateId &&
          detailString(offer, "original") &&
          detailString(offer, "replacement"),
      );
    default:
      return false;
  }
}

/** Perform the offer. Returns the sentence to show the person. */
export async function performOutreachOffer(
  target: OutreachOfferTarget,
  offer: AdvisoryOffer,
): Promise<string> {
  if (offer.action === "label_cold") return "Noted as a cold pitch.";
  if (offer.action === "schedule_at" || offer.action === "hold_until") {
    const at = offerTime(offer);
    if (!target.memberId || !at) throw new Error("There is no time or recipient to hold.");
    await scheduleMember(target.memberId, at);
    return `Held until ${new Date(at).toLocaleString()} — the cadence sends it then.`;
  }
  if (!target.templateId) throw new Error("This message has no template to edit.");
  const template = await getTemplateById(target.templateId);
  if (!template?.content) throw new Error("The template could not be read.");
  if (offer.action === "strip_tracking") {
    const stripped = stripTrackingPixels(template.content);
    if (stripped === template.content) {
      return "The tracking image is not in the template itself — it comes from a merge field; edit the record it comes from.";
    }
    await updateTemplate({ id: template.id, content: stripped });
    return "Tracking image removed from the template. Preview again to see the new message.";
  }
  if (offer.action === "rewrite_line") {
    const original = detailString(offer, "original") ?? "";
    const replacement = detailString(offer, "replacement") ?? "";
    if (!template.content.includes(original)) {
      return "That line comes from a merge field, not the template text; edit the record it comes from.";
    }
    await updateTemplate({ id: template.id, content: template.content.replace(original, replacement) });
    return "Line rewritten in the template. Preview again to see the new message.";
  }
  throw new Error(`“${offer.label}” is not something this screen can do.`);
}
