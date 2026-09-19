/** @jest-environment node */

import { toolApiErrorMessage } from "./tool-definition.service";

describe("tool registry API errors", () => {
  it("keeps the database detail that explains a rejected write", async () => {
    const response = Response.json(
      {
        error: "Failed to create tool",
        details: "Version must be a positive integer",
      },
      { status: 500 },
    );

    await expect(
      toolApiErrorMessage(response, "Failed to create tool"),
    ).resolves.toBe(
      "Failed to create tool: Version must be a positive integer",
    );
  });

  it("names the HTTP status when the server did not return JSON", async () => {
    const response = new Response("upstream unavailable", { status: 502 });

    await expect(
      toolApiErrorMessage(response, "Failed to save"),
    ).resolves.toBe("Failed to save (HTTP 502).");
  });
});
