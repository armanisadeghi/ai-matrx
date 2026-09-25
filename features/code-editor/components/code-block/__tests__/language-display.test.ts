/**
 * The code block header names the language the author wrote.
 *
 * The break this guards (verify-RC-B7 nit): ```ts fences were labelled
 * "Code" because the raw alias never matched the map, and unknown languages
 * (`nginx`) also read "Code" — a label that lies about what the block is.
 */
import { resolveLanguageInfo } from "../LanguageDisplay";

describe("resolveLanguageInfo", () => {
  it.each([
    ["ts", "TypeScript"],
    ["typescript", "TypeScript"],
    ["TS", "TypeScript"],
    ["py", "Python"],
    ["yml", "YAML"],
    ["sh", "Bash"],
    ["diff", "Diff"],
    ["nginx", "nginx"],
    ["text", "Code"],
  ])("%s → %s", (language, name) => {
    expect(resolveLanguageInfo(language).name).toBe(name);
  });
});
