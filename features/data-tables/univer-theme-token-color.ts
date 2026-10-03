/**
 * Resolve a colour Univer hands its canvas — WITHOUT the dark-mode inversion.
 *
 * Univer 1.0 writes many of its own fills as THEME TOKENS, not colours: the
 * page is `"gray.0"`, the desk `"gray.100"`, the page outline `"gray.200"`,
 * default ink `"gray.900"` (engine-render 1.0.2 `DocBackground`, docs-ui
 * `resolveDocRenderBackground`). Its `CanvasColorService` turns a token into a
 * colour before anything reaches `ctx.fillStyle`; its `DumbCanvasColorService`
 * does NOT — it returns `"gray.0"` as-is. A canvas IGNORES a `fillStyle` it
 * cannot parse and keeps the previous one, which starts as `#000000`, so with
 * the dumb service every page came out solid black and the canvas element's
 * CSS background (`style.backgroundColor = "gray.100"`, also ignored) stayed
 * transparent — in every browser, headed or headless, light or dark.
 *
 * Pure (no Univer import) so the jest test and `check:univer-doc-theme` drive
 * the same function the editor installs.
 */

/** `palette.shade` — the shape Univer's theme tokens take (`gray.0`, `primary.600`). */
const THEME_TOKEN = /^[a-zA-Z]+\.[a-zA-Z0-9]+$/;

/**
 * @param color  What Univer is about to paint: a theme token or a real colour.
 * @param lookup The live theme (`ThemeService.getColorFromTheme`).
 * @returns the token's colour from the current theme; anything else unchanged.
 */
export function resolveUniverCanvasColor(
  color: string,
  lookup: (token: string) => unknown,
): string {
  if (!THEME_TOKEN.test(color)) return color;
  const resolved = lookup(color);
  return typeof resolved === "string" && resolved.length > 0 ? resolved : color;
}
