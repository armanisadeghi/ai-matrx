/**
 * A LINE OF WORDS IS READ AS THE LIST IT IS, AND A LIST IS NEVER DRAWN AS JSON (BREAKER-3 B3-02).
 *
 * The use case: a clinic's "Body Areas" column held "Lower back, Hip", "Knee, Hip" and "Neck, Shoulder"
 * as Text and was changed to Multi-choice. Measured: the "Already in this column" offer listed
 * "Knee, Hip" as ONE option ("Add all 8" would have made it a choice), and a cell holding the stray list
 * printed ["Lower back, Hip"] in amber.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { severalChoiceSuggestions, splitListWords } from "../list-words";
import { FormattedFieldValue, strayChoiceWords } from "../FormattedFieldValue";

describe("a list of words", () => {
  it("splits on commas, semicolons and line breaks, once per word in any case", () => {
    expect(splitListWords("Lower back, Hip")).toEqual(["Lower back", "Hip"]);
    expect(splitListWords("Neck; Shoulder\nneck ,  ")).toEqual(["Neck", "Shoulder"]);
  });

  it("offers the single words already in the column, most used first", () => {
    const offered = severalChoiceSuggestions([
      { value: "Lower back, Hip", count: 3 },
      { value: "Knee, Hip", count: 2 },
      { value: "Neck, Shoulder", count: 1 },
    ]);
    expect(offered).toEqual([
      { value: "Hip", count: 5 },
      { value: "Lower back", count: 3 },
      { value: "Knee", count: 2 },
      { value: "Neck", count: 1 },
      { value: "Shoulder", count: 1 },
    ]);
  });

  it("draws a several-choice cell's stray words as words, never as a JSON list", () => {
    expect(strayChoiceWords(["Lower back, Hip"], '["Lower back, Hip"]')).toBe("Lower back, Hip");
    const html = renderToStaticMarkup(
      <FormattedFieldValue
        value={["Lower back, Hip"]}
        dataType="string"
        format={{ id: "multi_choice", options: { choices: [{ value: "Knee" }, { value: "Hip" }] } }}
      />,
    );
    expect(html).not.toContain("[&quot;");
    expect(html).not.toContain('["');
    expect(html).toContain("Lower back");
  });
});
