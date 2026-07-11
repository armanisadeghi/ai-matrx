/**
 * USER-FACING name for the serving-tier concept (`ai.model_offering.served_via`
 * — the branded endpoint names "Matrx Lightning" / "Matrx Fast" / "Matrx
 * Standard"). The product word is "Service". Every user-visible surface
 * (filter labels, detail-card headings, availability chips) MUST read these
 * constants so the owner can rename the concept in ONE place.
 *
 * Reminder: the value shown next to this label is always the BRANDED
 * `served_via` name — real serving vendors (ai.endpoint.vendor) are secret and
 * live only behind the super-admin `admin_model_catalog` RPC.
 */
export const SERVICE_LABEL = "Service";
export const SERVICE_LABEL_PLURAL = "Services";

/** Availability chip text, e.g. "3 services". */
export function serviceCountLabel(count: number): string {
  const noun = (count === 1 ? SERVICE_LABEL : SERVICE_LABEL_PLURAL).toLowerCase();
  return `${count} ${noun}`;
}
