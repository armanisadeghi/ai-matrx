/**
 * Cheap hot-path gate for the "Save to my Shapes" message action — its own
 * tiny module so the menu registry can import it WITHOUT dragging the heavy
 * extraction stack (splitter + parser live in ./message-kind-instances.ts,
 * lazy-imported on click).
 */

import { hasKindKeyAnySpelling } from "@/features/content-ir/surfaces/json-kind-signal";

/** Does this text even carry a `__kind` marker, in any realistic spelling? (Registry resolution is lazy.) */
export function messageMayContainKindBlock(text: string): boolean {
  return text.includes("kind") && hasKindKeyAnySpelling(text);
}
