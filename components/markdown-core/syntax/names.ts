// The directive names the core renders (besides the callout types in
// callout-types.ts). Anything else written as a directive is either a
// neutral container (`:::name` — its content still renders) or, for inline
// `:name[…]` / leaf `::name` directives, restored to the literal text it was
// (so "ratio 3:2", "10:30" and "key:value" never lose a character).

/** `:::name` containers with their own rendering. */
export const CONTAINER_DIRECTIVES = new Set([
  "details",
  "columns",
  "column",
  "tabs",
  "tab",
  "figure",
  "table",
  "aside",
  "toc",
]);

/** `::name` leaf directives. */
export const LEAF_DIRECTIVES = new Set(["toc"]);

/** `:name[text]{…}` inline directives. */
export const TEXT_DIRECTIVES = new Set(["span", "mark", "kbd", "abbr", "sup", "sub"]);
