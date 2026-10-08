/**
 * FrameDesignSystemRoot — the Shape frame's `@ai-matrx/design-system` root.
 *
 * Every other export is the real package; the read-state primitives come from
 * FrameReadGate, whose failure surface needs no host Alchemy menu. Local
 * named exports outrank the star re-export, so the frame's versions win.
 * The build plugin resolves ONLY the bare root here, and sends this file's
 * own root import to the real package; subpaths stay the real package.
 */
export * from "@ai-matrx/design-system";
export {
  ReadGate,
  ReadEmpty,
  ReadStaleNotice,
  readOf,
  readStatusOf,
} from "./FrameReadGate";
export type { ReadOutcome, ReadStatus } from "./FrameReadGate";
