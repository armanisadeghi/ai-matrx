/**
 * The class (ai.offering) a call runs on travels as `offering_id` beside the
 * model in LLM params / agent settings. No key = the server routes to the
 * preferred class, so clearing a pin REMOVES the key — never null or "".
 */
export function withOfferingPin<T extends object>(
  settings: T | null | undefined,
  offeringId: string | null | undefined,
): T {
  const next: Record<string, unknown> = { ...(settings ?? {}) };
  if (offeringId) {
    next.offering_id = offeringId;
  } else {
    delete next.offering_id;
  }
  return next as T;
}
