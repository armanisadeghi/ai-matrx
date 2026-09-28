/**
 * A CHOICE WIDER THAN ITS COLUMN SAYS ITS WHOLE WORDS (DATA-V2-BASICS-2 F30).
 * Harbor Dental's Status chip "Pending verification" was cut by the cell's edge to
 * "Pending verificatio" with no ellipsis and nothing on hover. The chip now truncates with an
 * ellipsis (its words in a `truncate` span, the chip allowed to shrink) and its title is the
 * whole label.
 * RED before: the chip had no title and no truncating child.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormattedFieldValue } from "../FormattedFieldValue";

it("the chip carries its whole words as its title and truncates inside itself", () => {
  const html = renderToStaticMarkup(
    <FormattedFieldValue
      value="Pending verification"
      dataType="string"
      format={{ id: "choice", options: { choices: [{ value: "Pending verification", color: "amber" }] } }}
    />,
  );
  expect(html).toContain('title="Pending verification"');
  expect(html).toMatch(/max-w-full[^"]*"[^>]*><span class="truncate">Pending verification<\/span>/);
});
