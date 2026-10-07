/**
 * `/documents/[id]` is the Univer editor. A content-store document reached
 * through a generic link (`/documents/{id}` share template) must leave for its
 * own editor; a Univer id stays.
 */
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

import { contentDocumentDoor } from "../useContentDocumentRedirect";

describe("contentDocumentDoor", () => {
  const id = "79e30bbd-5c9e-524d-9d38-c345701729f8";

  it("sends a markdown / working document to the Markdown Studio", async () => {
    await expect(contentDocumentDoor(id, async () => ({ format: "markdown" }))).resolves.toBe(
      `/markdown-studio?source=document&id=${id}`,
    );
  });

  it("sends a Space to its own page", async () => {
    await expect(contentDocumentDoor(id, async () => ({ format: "spaces" }))).resolves.toBe(`/spaces/${id}`);
  });

  it("leaves a Univer document (no content-store row) on /documents", async () => {
    await expect(contentDocumentDoor(id, async () => null)).resolves.toBeNull();
  });
});
