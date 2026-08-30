import { act } from "react";
import { createRoot } from "react-dom/client";
import { FileInput } from "lucide-react";

import { EmptyState } from "./EmptyState";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Files EmptyState registered promises", () => {
  it("renders the registry copy and stage for a file-request placeholder", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <EmptyState
          icon={FileInput}
          title="stale title"
          description="stale description"
          comingSoonId="files.file-requests"
        />,
      );
    });

    expect(container.textContent).toContain("File Requests");
    expect(container.textContent).toContain(
      "Collect files from anyone through a shareable request link",
    );
    expect(container.textContent).toContain("planned");
    expect(container.textContent).not.toContain("stale description");

    await act(async () => root.unmount());
    container.remove();
  });
});
