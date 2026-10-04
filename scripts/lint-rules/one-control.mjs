/**
 * THE ONE CONTROL — the predicates shared by the editor rules (`matrx/one-control`,
 * `matrx/no-styled-raw-button`, ./one-control-rule.mjs) and the `one-control` findings check
 * (scripts/one-control/check-one-control.mjs), so the two can never disagree.
 *
 * The controls are `@ai-matrx/design-system/controls` (FEATURE.md § THE ONE CONTROL in the
 * package): one 28px geometry, no size prop, every visual declaration locked in the package's
 * first CSS layer. A call site owns PLACEMENT only — width included, because a field's width is
 * layout. The visual-vs-placement table is the ONE table in scripts/ui-drift (`category`).
 */
import { category } from "../ui-drift/check-ui-drift.mjs";

export const CONTROLS_MODULE = "@ai-matrx/design-system/controls";

export const ONE_CONTROL_FIX =
  "Use the controls from @ai-matrx/design-system/controls as they are — Button (variant primary|quiet|outline|danger), Field/SearchField, Select, SegmentedControl, Tabs, Badge, Switch, ControlRow — and keep className to placement (width, flex, grid, position). A new look is a variant added IN the package, never a class at the call site.";

export const PROTOTYPE_FIX =
  "The `uc-*` classes were the decision-board prototype of the one control; they are retired. Render the package control instead (@ai-matrx/design-system/controls).";

export const RAW_BUTTON_FIX =
  "A styled raw <button> is a hand-rolled control. Use Button from @ai-matrx/design-system/controls (or a tap button for an icon on a floating bar).";

export const isControlsModule = (src) => src === CONTROLS_MODULE;

/** Layout containers from the controls module: they hold controls and may carry a row's own
 *  border/padding. Every other export is a control or a locked surface. */
export const LAYOUT_EXPORTS = new Set(["ControlRow", "ControlScope"]);

/** The retired prototype classes: `uc-btn`, `uc-field`, `uc-select`, `uc-seg(-item)`, `uc-row`, … */
export function prototypeTokens(text) {
  return [...new Set(String(text).split(/[\s"'`]+/).map((t) => t.split(":").pop()).filter((t) => t === "uc" || /^uc-[a-z][a-z-]*$/.test(t)))];
}

function base(token) {
  let depth = 0;
  let cur = "";
  for (const ch of token) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === ":" && depth === 0) {
      cur = "";
      continue;
    }
    cur += ch;
  }
  return cur.replace(/^!/, "").replace(/!$/, "");
}

const WIDTH = /^(w-|min-w-|max-w-)/;
const VISUAL = new Set(["spacing", "size", "radius", "shadow", "typography", "border", "color"]);

/** Classes on a control that try to restyle it (anything visual except width, which is layout). */
export function controlVisualTokens(text) {
  return [...new Set(String(text).split(/\s+/).filter((t) => {
    if (!t) return false;
    const b = base(t);
    return !WIDTH.test(b) && VISUAL.has(category(b));
  }))];
}

/** Classes on a raw <button> that make it a hand-rolled control. */
export function rawButtonVisualTokens(text) {
  return [...new Set(String(text).split(/\s+/).filter((t) => t && VISUAL.has(category(base(t)))))];
}

/** Style keys on a control that restyle it (width-family keys are placement). */
const VISUAL_STYLE = /^(height|minHeight|maxHeight|padding\w*|margin\w*|fontSize|fontWeight|lineHeight|borderRadius|border\w*|background\w*|color|boxShadow|gap)$/;
export const isVisualStyleKey = (key) => VISUAL_STYLE.test(key);

export function isExemptFile(file) {
  const f = String(file).replace(/\\/g, "/");
  return /(^|\/)node_modules\//.test(f) || /\.(test|spec|selftest)\.[cm]?[jt]sx?$/.test(f) || /\/__tests__\//.test(f);
}
