import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellCss = readFileSync(
  new URL("../../../../styles/shell.css", import.meta.url),
  "utf8",
);

test("Education keeps direct scroll owners full-height while reserving end runway", () => {
  assert.match(
    shellCss,
    /\.education-scroll-boundary:has\(> \.overflow-y-auto\),\s*\.education-scroll-boundary:has\(> \.overflow-auto\),\s*\.education-scroll-boundary:has\(\.scroll-page-end-space\)\s*\{[^}]*padding-block-end:\s*0;/s,
    "a padded route boundary must be neutralized whenever its direct child owns scrolling",
  );
  assert.match(
    shellCss,
    /\.education-scroll-boundary > \.overflow-y-auto,\s*\.education-scroll-boundary > \.overflow-auto\s*\{[^}]*padding-block-end:/s,
    "the real direct scroll owner must still receive the assistant runway",
  );
});
