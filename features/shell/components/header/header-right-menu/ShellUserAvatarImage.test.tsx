import fs from "node:fs";
import path from "node:path";
import { ShellUserAvatarImage } from "./ShellUserAvatarImage";

describe("ShellUserAvatarImage", () => {
  it("makes every mounted shell avatar an explicit high-priority eager image", () => {
    const image = ShellUserAvatarImage({
      src: "https://example.test/avatar.jpg",
      alt: "Test user",
      sizes: "32px",
    });

    expect(image.props).toMatchObject({
      preload: true,
      loading: "eager",
      fetchPriority: "high",
      unoptimized: true,
    });
  });

  it("keeps both shell avatar callers on the canonical image boundary", () => {
    const directory = __dirname;
    const triggerSource = fs.readFileSync(
      path.join(directory, "UserMenuTrigger.tsx"),
      "utf8",
    );
    const profileSource = fs.readFileSync(
      path.join(directory, "UserProfileHeader.tsx"),
      "utf8",
    );

    for (const source of [triggerSource, profileSource]) {
      expect(source).toContain("ShellUserAvatarImage");
      expect(source).not.toContain('from "next/image"');
    }
  });
});
