/**
 * Cheap hot-path gate for the "Save to my Shapes" message action — its own
 * tiny module so the menu registry can import it WITHOUT dragging the heavy
 * extraction stack (splitter + parser live in ./message-kind-instances.ts,
 * lazy-imported on click).
 */

/** Does this text even carry a `__kind` marker? (Registry resolution is lazy.) */
export function messageMayContainKindBlock(text: string): boolean {
  return text.includes('"__kind"');
}
