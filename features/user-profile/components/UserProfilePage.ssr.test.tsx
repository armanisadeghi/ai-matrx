import React, { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import UserProfilePage from "@/features/user-profile/components/UserProfilePage";

const mockUseUserProfile = jest.fn();
const mockUseUserFormProfile = jest.fn();

jest.mock("@/features/user-profile/hooks/useUserProfile", () => ({
  useUserProfile: () => mockUseUserProfile(),
}));

jest.mock("@/features/user-profile/hooks/useUserFormProfile", () => ({
  useUserFormProfile: () => mockUseUserFormProfile(),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: jest.fn(() => {
    throw new Error("Profile identity must not render before hydration");
  }),
  useAppDispatch: jest.fn(),
}));

describe("UserProfilePage server render", () => {
  it.each([
    ["idle", "idle"],
    ["loading", "idle"],
    ["idle", "loading"],
  ] as const)(
    "renders a stable loading shell while account=%s and form=%s",
    (accountLoadState, formLoadState) => {
      mockUseUserProfile.mockReturnValue({ loadState: accountLoadState });
      mockUseUserFormProfile.mockReturnValue({ loadState: formLoadState });

      const html = renderToString(<UserProfilePage />);

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Loading profile"');
      expect(html).not.toContain("Account information");
    },
  );

  it("hydrates the idle loading shell without reading client identity text", async () => {
    mockUseUserProfile.mockReturnValue({ loadState: "idle" });
    mockUseUserFormProfile.mockReturnValue({ loadState: "idle" });
    const container = document.createElement("div");
    container.innerHTML = renderToString(<UserProfilePage />);
    document.body.appendChild(container);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const root = hydrateRoot(container, <UserProfilePage />);
    await act(async () => undefined);

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="Loading profile"]')).not.toBeNull();

    root.unmount();
    consoleError.mockRestore();
    container.remove();
  });
});
