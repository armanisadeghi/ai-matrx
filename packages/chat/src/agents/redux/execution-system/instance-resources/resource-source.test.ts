import {
  refineBlockType,
  resourceDataToSource,
} from "./resource-source";

const FILE_ID = "11111111-1111-4111-8111-111111111111";
const SHARE_URL =
  "https://files.matrxserver.com/share/b7c881801367458db8e6a2d6804d6462";

describe("agent file resource source", () => {
  it("keeps a freshly uploaded image on the durable file-id path", () => {
    const data = {
      fileId: FILE_ID,
      url: SHARE_URL,
      mime_type: "image/jpeg",
    };

    expect(refineBlockType("document", data)).toBe("image");
    expect(resourceDataToSource("image", data)).toEqual({
      file_id: FILE_ID,
      mime_type: "image/jpeg",
    });
  });

  it("still identifies a URL-only image from MIME as a recovery path", () => {
    const data = {
      url: SHARE_URL,
      mime_type: "image/jpeg",
    };

    expect(refineBlockType("document", data)).toBe("image");
    expect(resourceDataToSource("image", data)).toEqual({
      url: SHARE_URL,
      mime_type: "image/jpeg",
    });
  });
});
