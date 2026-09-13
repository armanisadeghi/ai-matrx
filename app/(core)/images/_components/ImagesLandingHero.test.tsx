import fs from "node:fs";
import path from "node:path";

describe("Images landing terminal clearance", () => {
  it("reserves space for global fixed controls on the real scroll owner", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "app/(core)/images/_components/ImagesLandingHero.tsx",
      ),
      "utf8",
    );

    expect(source).toContain(
      'className="h-full overflow-y-auto overscroll-contain pb-20"',
    );
  });
});
