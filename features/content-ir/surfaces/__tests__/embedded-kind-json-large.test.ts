/**
 * A message holding a very large JSON value (hundreds of thousands of strings —
 * a data export pasted into chat) never crashes the splitter: the embedded-kind
 * scan collected its string ranges with a spread push, which overflowed the call
 * stack on a stored row (found by the RC-B4 round-9 splitter census).
 */
import { findEmbeddedKindJsonRegions } from "../embedded-kind-json";

it("scans a JSON value with 300k strings without a RangeError", () => {
  const big = `Here is the export:\n\n{"rows": [${Array.from({ length: 300_000 }, (_, i) => `"r${i}"`).join(",")}]}\n\nDone.`;
  expect(() => findEmbeddedKindJsonRegions(big)).not.toThrow();
});
