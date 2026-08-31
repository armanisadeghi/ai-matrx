// textareaMeasure — on-demand measurement of where a character offset sits
// vertically inside a wrapping <textarea>.
//
// A textarea exposes no per-character geometry, so we build a transient hidden
// mirror <div> with the same text-flow styles and content width, drop a marker
// span at the offset, read its offsetTop, and remove the mirror. This runs ONLY
// on an explicit user action (an outline click) — never per keystroke or per
// render — so the O(content) DOM build is a non-issue (freeze-loop doctrine).
//
// The persistent find-highlight mirror in FindMatchOverlay.tsx solves a
// different problem (a live overlay that must track scroll each frame); this
// helper is the throwaway, measure-once variant.

// Every style that affects text flow. Borders are deliberately NOT copied:
// the mirror's width is set to the textarea's clientWidth (padding + content,
// no border, no scrollbar), so with border-box sizing and zero border the
// mirror's content width equals the textarea's exactly and lines wrap the same.
const FLOW_STYLES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "tabSize",
  "wordSpacing",
  "wordBreak",
  "overflowWrap",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "direction",
] as const;

/**
 * Returns the pixel offset (from the top of the textarea's scrollable content)
 * of the character at `charOffset`. Returns null when measurement is impossible
 * (detached node, SSR).
 */
export function measureTextareaCharTop(
  textarea: HTMLTextAreaElement,
  charOffset: number,
): number | null {
  if (typeof window === "undefined" || !textarea.isConnected) return null;
  const value = textarea.value;
  const clamped = Math.max(0, Math.min(charOffset, value.length));

  const mirror = document.createElement("div");
  const cs = window.getComputedStyle(textarea);
  for (const prop of FLOW_STYLES) {
    mirror.style[prop] = cs[prop];
  }
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.left = "-99999px";
  mirror.style.top = "0";
  mirror.style.boxSizing = "border-box";
  mirror.style.border = "0";
  mirror.style.margin = "0";
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = "auto";
  mirror.style.overflow = "hidden";
  // Textarea-compatible wrapping.
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";

  mirror.appendChild(document.createTextNode(value.slice(0, clamped)));
  const marker = document.createElement("span");
  // A zero-width space keeps the marker measurable at end-of-content.
  marker.textContent = value.slice(clamped, clamped + 1) || "​";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return top;
}
