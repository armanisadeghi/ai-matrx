/**
 * Markdown → plain text, for places that must show WORDS rather than render a
 * document: table cells, tooltips, meta descriptions, chart labels, aria-labels,
 * exported slide text.
 *
 * This is NOT a renderer and never competes with one. When the surface can
 * afford real formatting, render the markdown through the canonical path
 * (`BasicMarkdownContent` / `MarkdownStream`) instead. Reach for this only when
 * a single line of text is the product — where a rendered `<strong>` cannot go
 * and raw `**asterisks**` would otherwise reach a user's eyes.
 *
 * Deliberately conservative: it unwraps the inline emphasis markers people
 * actually hit (bold, italic, inline code, strikethrough, links) and leaves
 * everything else alone. Stray, unpaired `*` and `_` survive untouched, because
 * a lone asterisk in prose is prose — mangling it would be worse than the
 * problem this solves.
 */

/** Ordered so the greedy double-marker forms resolve before the single ones. */
const INLINE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // [label](href) → label. Runs first so emphasis inside a label still unwraps.
  [/\[([^\]]+)\]\([^)]*\)/g, "$1"],
  [/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "$1"],
  [/___(?=\S)([\s\S]*?\S)___/g, "$1"],
  [/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1"],
  [/__(?=\S)([\s\S]*?\S)__/g, "$1"],
  [/~~(?=\S)([\s\S]*?\S)~~/g, "$1"],
  [/\*(?=\S)([^*\n]*?\S)\*/g, "$1"],
  // Underscore italics only between word boundaries: snake_case_names are not
  // emphasis, and mangling an identifier is a worse defect than a stray marker.
  [/(^|[\s(])_(?=\S)([^_\n]*?\S)_(?=[\s).,;:!?]|$)/g, "$1$2"],
  [/`([^`\n]+)`/g, "$1"],
];

/**
 * Math → readable words. Raw TeX is the exact opposite of what this module
 * promises, and a study card is where it bites hardest: a calculus card's
 * thumbnail read `\frac{dy}{dx}` to the learner it was meant to help.
 *
 * Conservative on purpose — it makes the common forms legible and leaves
 * anything it does not recognize alone (a half-translated formula is worse
 * than an untouched one). Never a substitute for KaTeX: when the surface can
 * render, it must render.
 */
/**
 * Structural forms whose arguments may themselves contain math. These are
 * resolved innermost-first, to a fixed point, BEFORE the generic rules below —
 * otherwise the catch-all single-argument rule swallows the outer `\frac`
 * before its own rule ever sees it and `\frac{\frac{a}{b}}{c}` collapses to
 * the nonsense `a/b{c}`.
 */
const MATH_STRUCTURAL: ReadonlyArray<readonly [RegExp, string]> = [
  [/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2"],
  [/\\sqrt\s*\{([^{}]*)\}/g, "√($1)"],
];

const MATH_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Environments (\begin{aligned} … \end{aligned}) carry no meaning in a
  // one-line preview; drop the wrapper, keep the contents. Without this the
  // catch-all below turned them into the word "aligned" twice.
  [/\\(?:begin|end)\s*\{[^{}]*\}/g, " "],
  // A TeX line break inside a preview is just a space.
  [/\\\\/g, " "],
  // \left\{ … \right\} — the escaped-brace forms, which the character-class
  // rule below cannot reach because the brace is preceded by a backslash.
  [/\\(?:left|right)\s*\\?([([\]|){}])/g, "$1"],
  // NOTE: every command below ends with (?![a-zA-Z]) and NOT \b. `_` is a WORD
  // character, so \b fails after `\sum_` — which silently left every
  // summation, integral and limit card reading as "sum_" / "int_".
  [/\\times(?![a-zA-Z])/g, "×"],
  [/\\div(?![a-zA-Z])/g, "÷"],
  [/\\pm(?![a-zA-Z])/g, "±"],
  [/\\cdot(?![a-zA-Z])/g, "·"],
  [/\\leq(?![a-zA-Z])/g, "≤"],
  [/\\geq(?![a-zA-Z])/g, "≥"],
  [/\\neq(?![a-zA-Z])/g, "≠"],
  [/\\approx(?![a-zA-Z])/g, "≈"],
  [/\\infty(?![a-zA-Z])/g, "∞"],
  [/\\pi(?![a-zA-Z])/g, "π"],
  [/\\theta(?![a-zA-Z])/g, "θ"],
  [/\\alpha(?![a-zA-Z])/g, "α"],
  [/\\beta(?![a-zA-Z])/g, "β"],
  [/\\Delta(?![a-zA-Z])/g, "Δ"],
  [/\\delta(?![a-zA-Z])/g, "δ"],
  [/\\sum(?![a-zA-Z])/g, "Σ"],
  [/\\prod(?![a-zA-Z])/g, "∏"],
  [/\\int(?![a-zA-Z])/g, "∫"],
  [/\\lim(?![a-zA-Z])/g, "lim"],
  [/\\(?:rightarrow|to)(?![a-zA-Z])/g, "→"],
  // Braces that only ever grouped a script or argument: ^{2} → ^2, _{i} → _i.
  [/([_^])\s*\{([^{}]*)\}/g, "$1$2"],
  // Any remaining single-argument command: \text{x} / \mathrm{x} → x.
  [/\\[a-zA-Z]+\s*\{([^{}]*)\}/g, "$1"],
  // Bare commands we did not translate: drop the backslash, keep the word.
  [/\\([a-zA-Z]+)/g, "$1"],
];

/**
 * The delimited regions that ARE math. The transforms above are applied ONLY
 * inside these — running them over the whole string would eat legitimate
 * backslashes in prose (a Windows path, an escaped character) and turn "$5"
 * into a math region. Scope is the difference between a fix and a new bug.
 *
 * Single-`$` is deliberately excluded: this repo's markdown engine sets
 * `singleDollarTextMath: false` so `$5` stays currency, and this helper must
 * agree with the renderer rather than invent a second dialect.
 */
const MATH_REGIONS: ReadonlyArray<RegExp> = [
  /\\\[([\s\S]*?)\\\]/g,
  /\\\(([\s\S]*?)\\\)/g,
  /\$\$([\s\S]*?)\$\$/g,
];

/** Make one math expression's INNER content readable as words. */
function mathToReadable(expression: string): string {
  let text = expression;
  // Structural forms to a fixed point (bounded, so a pathological input can
  // never spin): each pass resolves the innermost fraction/root, exposing the
  // one that contains it.
  for (let pass = 0; pass < 8; pass += 1) {
    const before = text;
    for (const [pattern, replacement] of MATH_STRUCTURAL) {
      text = text.replace(pattern, replacement);
    }
    if (text === before) break;
  }
  for (const [pattern, replacement] of MATH_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text.trim();
}

/**
 * Strip inline markdown emphasis so the text reads cleanly as prose.
 *
 * Returns "" for nullish input so callers can pass a possibly-absent DB column
 * straight in.
 */
export function markdownToPlainText(value: string | null | undefined): string {
  if (!value) return "";

  // MATH FIRST, and this order is load-bearing. Running the emphasis pass over
  // the whole string first let the italic rule eat multiplication asterisks
  // inside a formula: `$$a*b*c$$` came out as `abc`, silently deleting the
  // operator — and this helper also feeds slide export and SEO evidence text,
  // so that was not a flashcards-only bug. Math regions are lifted out and
  // rendered to words before any emphasis rule can see them, then re-inserted
  // via placeholders that contain no markdown-significant characters.
  const mathChunks: string[] = [];
  let text = value;
  for (const region of MATH_REGIONS) {
    text = text.replace(region, (_match, inner: string) => {
      mathChunks.push(mathToReadable(inner));
      return `\uE000MATH${mathChunks.length - 1}\uE001`;
    });
  }

  for (const [pattern, replacement] of INLINE_PATTERNS) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(
    /\uE000MATH(\d+)\uE001/g,
    (_m, index: string) => mathChunks[Number(index)] ?? "",
  );

  return text.replace(/[ \t]{2,}/g, " ").trim();
}
