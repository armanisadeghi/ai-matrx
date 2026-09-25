// A standalone image with a TITLE — `![Kiln shelf](url "Cone 6 shelf layout")`
// — is a numbered FIGURE (the title is its caption, "Figure n."). The block
// splitters leave such a line in the text block (instead of the full-width
// image block) so the one core draws it as a figure at every level. Mirrored
// in aidream matrx-ai block_detector.py (`TITLED_IMAGE_LINE_RE`).

export const TITLED_IMAGE_LINE = /^[ \t]{0,3}!\[[^\]\n]*\]\(\s*<?[^\s)>]+>?\s+(?:"[^"\n]+"|'[^'\n]+')\s*\)[ \t]*$/;
