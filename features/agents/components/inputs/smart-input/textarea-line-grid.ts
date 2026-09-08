/**
 * Line-grid height for an auto-growing textarea.
 *
 * A composer's height is a function of its LINE COUNT, never of the raw
 * `scrollHeight` sample. Sub-pixel drift in the sample (font hinting, a
 * fractional line-height, a caret-reveal scroll mid-measurement) must not
 * move the box: the only heights that exist are `chrome + n × lineHeight`,
 * so a keystroke that keeps the line count keeps the height, exactly.
 *
 * `contentHeight` is the textarea's `scrollHeight` measured at a zero block
 * size (content only). `chrome` is vertical padding + borders, which
 * `scrollHeight` includes. When the line height is unknown (`normal`) the
 * sample is returned unchanged rather than guessed.
 */
export function snapToLineGrid(
  contentHeight: number,
  lineHeight: number,
  chrome: number,
): number {
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return contentHeight;
  const safeChrome = Number.isFinite(chrome) && chrome > 0 ? chrome : 0;
  const lines = Math.max(
    1,
    Math.round((contentHeight - safeChrome) / lineHeight),
  );
  return lines * lineHeight + safeChrome;
}

/** Vertical padding + border widths, read from computed style. */
export function readVerticalChrome(style: CSSStyleDeclaration): number {
  const sum =
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom) +
    parseFloat(style.borderTopWidth) +
    parseFloat(style.borderBottomWidth);
  return Number.isFinite(sum) ? sum : 0;
}
