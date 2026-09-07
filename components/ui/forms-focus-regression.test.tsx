import { renderToString } from "react-dom/server";
import { CopyInput, DeleteInput } from "./input";
import { BasicTextarea, CopyTextarea, TextareaWithPrefix } from "./textarea";

describe("form control keyboard and theme styling", () => {
  it("keeps focus-visible rings on textarea variants", () => {
    const html = renderToString(
      <>
        <BasicTextarea />
        <CopyTextarea />
        <TextareaWithPrefix prefix="Prefix" />
      </>,
    );

    expect(html.match(/focus-visible:ring-2/g)).toHaveLength(4);
    expect(html.match(/text-foreground/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps focus-visible rings on embedded copy and delete actions", () => {
    const html = renderToString(
      <>
        <CopyInput defaultValue="copy" />
        <DeleteInput defaultValue="delete" onDelete={() => undefined} />
      </>,
    );

    expect(html.match(/focus-visible:ring-2/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('aria-label="Copy to clipboard"');
    expect(html).toContain('aria-label="Delete field"');
  });
});
