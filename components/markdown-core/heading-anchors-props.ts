// Environment-neutral: recognizes the element props of a heading hover anchor
// (the `<a data-heading-anchor>` rehype-matrx-syntax adds after a heading),
// so element maps on the server and the client can drop it where its section
// is not on screen. The on/off context lives in heading-anchors-context.ts.

/** True for the element props of a heading hover anchor. */
export function isHeadingAnchorProps(props: object): boolean {
  return "data-heading-anchor" in props;
}
