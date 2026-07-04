/**
 * content-ir rollout flags.
 *
 * CONTENT_IR_STREAM_ENABLED gates the accumulator's shadow delegation
 * (Phase 2): JSON regions are additionally parsed through the kind parser
 * and blocks carry a dark `metadata.__ir` envelope. Rendering stays
 * content-driven until the Phase 4 flip.
 *
 * Default: ON in dev, OFF in production. Override with
 * NEXT_PUBLIC_CONTENT_IR_STREAM=1|0.
 */
export const CONTENT_IR_STREAM_ENABLED = (() => {
  const raw = process.env.NEXT_PUBLIC_CONTENT_IR_STREAM;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return process.env.NODE_ENV !== "production";
})();
