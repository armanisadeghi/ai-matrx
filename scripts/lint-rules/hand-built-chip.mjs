/**
 * THE CHIP LAW — a hand-built tinted chip/tag/pill is a defect (owner, 2026-10-05: "little colored
 * pills … all different sizes … absolutely sloppy"). The one chip is `Chip` / `ChipSet` from
 * `@ai-matrx/design-system/controls` (one 24px height, one radius, named tones from tokens; a
 * feature maps its kinds to a `ChipTone` in ONE table); a static status mark is the `Badge`.
 *
 * ONE predicate, shared by ESLint `matrx/no-hand-built-chip` (below) and the census
 * `check:ui-drift` rule `hand-built-chip` (scripts/ui-drift/check-ui-drift.mjs → `pnpm findings`,
 * shrink-only baseline). A site is an element whose className carries ALL of:
 *   a tinted fill (a palette `bg-<hue>-N` or a semantic `bg-<role>/N`),
 *   a tinted ink (a palette `text-<hue>-N` or a semantic `text-<role>`),
 *   a radius, horizontal padding, and small text (text-xs / text-[9-12px] / text-[0.6-0.75rem]).
 * Responsive / dark / hover variants count as the same class. A callout box (unvariated py-1.5+,
 * p-N, w-full, block, grid, flex-col) is not a chip. Never an eslint-disable.
 * Self-test: node --test scripts/lint-rules/hand-built-chip.selftest.mjs
 */
// Local (not one-control.mjs's): that module imports the ui-drift census, which imports this one.
function isExemptFile(file) {
  const f = String(file).replace(/\\/g, "/");
  return /(^|\/)node_modules\//.test(f) || /\.(test|spec|selftest)\.[cm]?[jt]sx?$/.test(f) || /\/__tests__\//.test(f);
}

export const HAND_BUILT_CHIP_FIX =
  "Use THE chip: `<Chip tone=\"…\" label=\"…\" icon={…} />` (or `variant=\"add\"`, `asChild` on a link) in a `<ChipSet>` from @ai-matrx/design-system/controls; map kinds to a ChipTone in one table. A static status mark is `<Badge tone>`.";

const HUE = "(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)";
const ROLE = "(?:primary|secondary|success|warning|destructive|info|accent|danger|error)";
const TINT_BG = new RegExp(`^bg-(?:${HUE}-\\d{2,3}(?:\\/\\d+)?|${ROLE}\\/(?:\\d+|\\[[^\\]]+\\]))$`);
const TINT_TEXT = new RegExp(`^text-(?:${HUE}-\\d{2,3}|${ROLE})(?:\\/\\d+)?$`);
const RADIUS = /^rounded(?:-(?:sm|md|lg|xl|full|\[[^\]]+\]))?$/;
const PAD_X = /^px-/;
// A callout/alert box (a block with real vertical padding or full width) is not a chip.
const BLOCK = /^(?:py-(?:1\.5|[2-9]|1\d|\[)|p-(?:\d|\[)|w-full|block|grid|flex-col)/;
const SMALL_TEXT = /^text-(?:xs|\[(?:9|10|11|12)px\]|\[0\.(?:5|6|7)\d*rem\])$/;

/** The base of one class token: drops `dark:` / `sm:` / `hover:` variants and a `!`. */
export function baseOf(token) {
  const parts = String(token).split(":");
  return parts[parts.length - 1].replace(/^!/, "");
}

/** Is this class list a hand-built tinted chip? Returns the tokens that make it one, or null. */
export function handBuiltChipTokens(classText) {
  const toks = String(classText).split(/\s+/).filter(Boolean);
  const pick = (re) => toks.filter((t) => re.test(baseOf(t)));
  const bg = pick(TINT_BG);
  const fg = pick(TINT_TEXT);
  const radius = pick(RADIUS);
  const pad = pick(PAD_X);
  const small = pick(SMALL_TEXT);
  if (!bg.length || !fg.length || !radius.length || !pad.length || !small.length) return null;
  if (toks.some((t) => t === baseOf(t) && BLOCK.test(t))) return null;
  return [...new Set([...bg, ...fg, ...radius, ...pad, ...small])];
}

function strings(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.type === "Literal" && typeof node.value === "string") out.push(node.value);
  else if (node.type === "TemplateElement") out.push(node.value.cooked ?? node.value.raw ?? "");
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const child = node[key];
    if (Array.isArray(child)) for (const c of child) strings(c, out);
    else if (child && typeof child === "object" && typeof child.type === "string") strings(child, out);
  }
  return out;
}

export const noHandBuiltChip = {
  meta: {
    type: "suggestion",
    docs: { description: "A hand-built tinted chip/tag/pill; use the design-system Chip." },
    schema: [],
    messages: { chip: `Hand-built tinted chip \`{{tokens}}\` — ${HAND_BUILT_CHIP_FIX}` },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    if (isExemptFile(filename)) return {};
    return {
      JSXOpeningElement(node) {
        const cls = node.attributes.find((a) => a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && a.name.name === "className");
        if (!cls?.value) return;
        const toks = handBuiltChipTokens(strings(cls.value).join(" "));
        if (toks) context.report({ node: cls, messageId: "chip", data: { tokens: toks.join(" ") } });
      },
    };
  },
};
