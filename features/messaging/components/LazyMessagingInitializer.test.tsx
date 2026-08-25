import { renderToStaticMarkup } from "react-dom/server";

import LazyMessagingInitializer from "@/features/messaging/components/LazyMessagingInitializer";
import { useAppSelector } from "@/lib/redux/hooks";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: jest.fn(),
}));

jest.mock("next/dynamic", () => () => {
  function StubMessagingInitializer() {
    return <div data-testid="messaging-initializer" />;
  }
  return StubMessagingInitializer;
});

const mockUseAppSelector = jest.mocked(useAppSelector);

function mockAuth(userId: string | null, accessToken: string | null): void {
  mockUseAppSelector.mockImplementation((selector) =>
    selector({
      userAuth: { id: userId, accessToken },
    } as never),
  );
}

describe("LazyMessagingInitializer", () => {
  afterEach(() => {
    mockUseAppSelector.mockReset();
  });

  it("does not mount the authenticated DM reader while identity exists without a session token", () => {
    mockAuth("user-1", null);

    const markup = renderToStaticMarkup(<LazyMessagingInitializer />);

    expect(markup).not.toContain("messaging-initializer");
  });

  it("mounts after both identity and the session token are ready", () => {
    mockAuth("user-1", "access-token");

    const markup = renderToStaticMarkup(<LazyMessagingInitializer />);

    expect(markup).toContain("messaging-initializer");
  });
});
