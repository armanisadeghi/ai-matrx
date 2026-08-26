import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "../InputActionButtons.tsx"),
  "utf8",
);

describe("responsive chat run controls", () => {
  it("keeps Stop and Send/Queue at 44px through tablet widths", () => {
    expect(source).toContain(
      'className="h-11 w-11 lg:h-9 lg:w-9 p-0 shrink-0 rounded-full bg-muted',
    );

    const responsiveSendClasses = source.match(
      /h-11 w-11 lg:h-9 lg:w-9 p-0 shrink-0 rounded-full/g,
    );
    expect(responsiveSendClasses).toHaveLength(3);
  });
});
