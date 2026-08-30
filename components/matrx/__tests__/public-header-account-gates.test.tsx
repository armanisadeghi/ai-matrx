import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSelector } from "react-redux";
import { PublicHeaderAuth } from "../PublicHeaderAuth";
import { PublicHeaderFeedback } from "../PublicHeaderFeedback";

jest.mock("react-redux", () => ({
  useSelector: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/hooks/use-is-mounted", () => ({
  useIsMounted: () => true,
}));

jest.mock("@/hooks/auth/useLoginHref", () => ({
  useLoginHref: () => "/login",
}));

jest.mock("@/features/feedback/FeedbackButton", () => ({
  __esModule: true,
  default: () => <button aria-label="Submit Feedback" />,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const useSelectorMock = jest.mocked(useSelector);

function reduxState(isAnonymous: boolean) {
  return {
    userAuth: {
      id: "session-user-id",
      createdAt: null,
      isAnonymous,
      email: isAnonymous ? null : "person@example.com",
      phone: null,
      emailConfirmedAt: null,
      lastSignInAt: null,
      appMetadata: { provider: null, providers: [] },
      identities: [],
      isAdmin: false,
      adminLevel: null,
      accessToken: "token",
      tokenExpiresAt: null,
      authReady: true,
    },
    userProfile: {
      userMetadata: {
        avatarUrl: null,
        fullName: null,
        name: null,
        preferredUsername: null,
        picture: null,
      },
      fingerprintId: null,
      shellDataLoaded: true,
    },
  };
}

async function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("public header account gates", () => {
  afterEach(() => {
    useSelectorMock.mockReset();
  });

  it("treats an anonymous Supabase UUID as a guest", async () => {
    const state = reduxState(true);
    useSelectorMock.mockImplementation((selector) => selector(state));

    const feedback = await render(<PublicHeaderFeedback />);
    expect(feedback.container.innerHTML).toBe("");
    await feedback.unmount();

    const auth = await render(<PublicHeaderAuth />);
    expect(
      auth.container.querySelector('[aria-label="Sign in"]'),
    ).not.toBeNull();
    expect(
      auth.container.querySelector('[aria-label="Open dashboard"]'),
    ).toBeNull();
    await auth.unmount();
  });

  it("keeps account-only controls for a registered user", async () => {
    const state = reduxState(false);
    useSelectorMock.mockImplementation((selector) => selector(state));

    const feedback = await render(<PublicHeaderFeedback />);
    expect(
      feedback.container.querySelector('[aria-label="Submit Feedback"]'),
    ).not.toBeNull();
    await feedback.unmount();

    const auth = await render(<PublicHeaderAuth />);
    expect(
      auth.container.querySelector('[aria-label="Open dashboard"]'),
    ).not.toBeNull();
    expect(auth.container.querySelector('[aria-label="Sign in"]')).toBeNull();
    await auth.unmount();
  });
});
