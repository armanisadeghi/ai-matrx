/**
 * The gate the PAID video metadata has to pass to be visible (D150 P0).
 *
 * Before this, the Videos view asked only "is `data.video_metadata` an
 * object?" and then rendered a badge. Now the whole block is read and shown,
 * so a reader that is wrong about a field silently hides work the user bought
 * — exactly the failure the detail was built to end. These cases are the real
 * shape `saveMetadata` writes, plus the partial shapes an older or a failed
 * run can leave behind.
 */

import { readVideoMetadata } from "@/features/marketing/lib/video-metadata";

const WRITTEN = {
  video_metadata: {
    title: "Core to Floor: EMSCULPT NEO and EMSELLA",
    description: "A walkthrough of the combined treatment protocol.",
    keywords: ["emsculpt neo", "emsella", "core to floor"],
    schema_org: {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: "Core to Floor",
    },
    generated_at: "2026-08-14T18:04:00.000Z",
  },
};

describe("readVideoMetadata", () => {
  it("reads every field the metadata agent writes", () => {
    const view = readVideoMetadata(WRITTEN);
    expect(view).not.toBeNull();
    expect(view?.title).toBe("Core to Floor: EMSCULPT NEO and EMSELLA");
    expect(view?.description).toBe(
      "A walkthrough of the combined treatment protocol.",
    );
    expect(view?.keywords).toEqual([
      "emsculpt neo",
      "emsella",
      "core to floor",
    ]);
    expect(view?.schemaOrg).toEqual(WRITTEN.video_metadata.schema_org);
    expect(view?.generatedAt).toBe("2026-08-14T18:04:00.000Z");
  });

  it("returns null only when there is genuinely no block", () => {
    expect(readVideoMetadata(null)).toBeNull();
    expect(readVideoMetadata({})).toBeNull();
    expect(readVideoMetadata({ video_metadata: null })).toBeNull();
    expect(readVideoMetadata({ video_metadata: "written" })).toBeNull();
    expect(readVideoMetadata([1, 2, 3])).toBeNull();
  });

  it("still surfaces a partial block instead of hiding the whole thing", () => {
    const view = readVideoMetadata({
      video_metadata: { title: "Only a title" },
    });
    expect(view).not.toBeNull();
    expect(view?.title).toBe("Only a title");
    expect(view?.description).toBeNull();
    expect(view?.keywords).toEqual([]);
    expect(view?.schemaOrg).toBeNull();
    expect(view?.generatedAt).toBeNull();
  });

  it("drops non-string keywords rather than rendering them", () => {
    const view = readVideoMetadata({
      video_metadata: { keywords: ["good", 42, null, "also good"] },
    });
    expect(view?.keywords).toEqual(["good", "also good"]);
  });

  it("ignores a schema_org that is not an object", () => {
    expect(
      readVideoMetadata({ video_metadata: { schema_org: "VideoObject" } })
        ?.schemaOrg,
    ).toBeNull();
  });
});
