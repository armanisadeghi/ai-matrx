import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FIXTURE_PROFILES } from "../fixtures";
import { ProfileSelector } from "./ProfileSelector";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ProfileSelector", () => {
  it("stays controlled while the active profile hydrates", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const render = async (activeProfileId: string | null) => {
      await act(async () => {
        root.render(
          <ProfileSelector
            profiles={FIXTURE_PROFILES}
            activeProfileId={activeProfileId}
            quota={null}
            onSelect={() => undefined}
          />,
        );
      });
    };

    await render(null);
    await render(FIXTURE_PROFILES[0].id);

    expect(
      warning.mock.calls.some(([message]) =>
        String(message).includes("changing from uncontrolled to controlled"),
      ),
    ).toBe(false);

    warning.mockRestore();
    await act(async () => root.unmount());
    container.remove();
  });
});
