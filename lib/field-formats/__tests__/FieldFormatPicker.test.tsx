import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldFormatPicker } from "../FieldFormatPicker";

describe("FieldFormatPicker layout", () => {
  it("lets a dense parent place conditional controls on a separate rail", () => {
    const html = renderToStaticMarkup(
      <FieldFormatPicker
        dataType="datetime"
        value={{ id: "datetime", options: { dateStyle: "medium" } }}
        onChange={() => undefined}
        layout="embedded"
        label="Shows as"
        optionsClassName="order-last basis-full"
      />,
    );

    expect(html).toContain('class="contents"');
    expect(html).toContain("order-last basis-full");
    expect(html).toContain("Shows as");
    expect(html).toContain("Style");
    expect(html).toContain("Date &amp; time");
  });

  it("preserves the stacked layout as the default for existing callers", () => {
    const html = renderToStaticMarkup(
      <FieldFormatPicker
        dataType="datetime"
        value={{ id: "datetime", options: {} }}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('class="space-y-2"');
  });

  it("can keep format options in a popover without resizing a dense row", () => {
    const html = renderToStaticMarkup(
      <FieldFormatPicker
        dataType="datetime"
        value={{ id: "datetime", options: {} }}
        onChange={() => undefined}
        optionsPresentation="popover"
      />,
    );

    expect(html).toContain('aria-label="Format options for Date &amp; time"');
    expect(html).not.toContain(">Style<");
  });
});
