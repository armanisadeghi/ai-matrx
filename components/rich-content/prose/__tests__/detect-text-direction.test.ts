/**
 * Text direction: the fast scan agrees with the original per-character rule.
 * (Rewritten 2026-09-26 — nine regex tests per character cost 206 ms of every
 * 1 MB paste.)
 */
import { detectTextDirection } from "../prose-prepare";

/** The original rule, kept here as the oracle. */
function oracle(text: string): "rtl" | "ltr" {
  const rtl = [/[\u0590-\u05FF]/, /[\u0600-\u06FF]/, /[\u0750-\u077F]/, /[\u08A0-\u08FF]/, /[\uFB50-\uFDFF]/, /[\uFE70-\uFEFF]/, /[\u200F]/, /[\u202E]/];
  let r = 0;
  let l = 0;
  for (const ch of text) {
    if (rtl.some((x) => x.test(ch))) r++;
    else if (/[a-zA-Z]/.test(ch)) l++;
  }
  return r + l === 0 ? "ltr" : r / (r + l) > 0.1 ? "rtl" : "ltr";
}

const cases: Array<[string, "rtl" | "ltr"]> = [
  ["", "ltr"],
  ["Hello world", "ltr"],
  ["שלום עולם", "rtl"],
  ["مرحبا بالعالم", "rtl"],
  ["Mostly English with one word עברית here and more English text follows", "ltr"],
  ["Short English עברית עברית", "rtl"],
  ["English text ".repeat(50) + "א", "ltr"],
  ["‏", "rtl"],
  ["12345 !!!", "ltr"],
  ["😀 emoji only", "ltr"],
];

it.each(cases)("%j is %s, as the original rule says", (text, dir) => {
  expect(oracle(text)).toBe(dir);
  expect(detectTextDirection(text)).toBe(dir);
});

it("a 1 MB left-to-right document is detected in well under 50 ms", () => {
  const big = "The quick brown fox jumps over the lazy dog. ".repeat(23000);
  const t0 = performance.now();
  expect(detectTextDirection(big)).toBe("ltr");
  expect(performance.now() - t0).toBeLessThan(50);
});
