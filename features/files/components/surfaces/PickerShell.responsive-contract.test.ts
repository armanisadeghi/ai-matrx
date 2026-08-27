import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("PickerShell responsive contract", () => {
  it("keeps both picker footer actions at the 44px touch floor", () => {
    const source = readFileSync(join(__dirname, "PickerShell.tsx"), "utf8");
    const footer = source.slice(source.indexOf("function PickerFooter"));

    expect(footer.match(/inline-flex min-h-11/g)).toHaveLength(2);
  });
});
