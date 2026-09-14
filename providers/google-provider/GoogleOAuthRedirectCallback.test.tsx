import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { connectGoogle } from "@/features/marketing/google/service";
import { GoogleOAuthRedirectCallback } from "./GoogleOAuthRedirectCallback";
import {
  buildGoogleOAuthRedirectPending,
  readGoogleOAuthRedirectPending,
  storeGoogleOAuthRedirectPending,
} from "./oauthRedirect";

jest.mock("@/features/marketing/google/service", () => ({
  connectGoogle: jest.fn(),
}));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({
  OrganizationRequiredNotice: () => <div>Organization required</div>,
}));

const mockConnectGoogle = jest.mocked(connectGoogle);
const STATE = "callback-state";
const USER = "user-1";
const ORG = "org-1";
let host: HTMLDivElement;
let root: Root;
let mockFetch: jest.Mock;

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function seedPending() {
  const pending = buildGoogleOAuthRedirectPending(
    STATE,
    {
      initiatingUserId: USER,
      returnTo: "/settings/integrations",
      owner: { type: "user" },
      organizationContextId: ORG,
    },
    window.location.origin,
  );
  storeGoogleOAuthRedirectPending(window.sessionStorage, pending);
  return pending;
}

async function renderCallback() {
  await act(async () => {
    root.render(
      <GoogleOAuthRedirectCallback
        code="google-code"
        state={STATE}
        providerError={null}
        providerErrorDescription={null}
      />,
    );
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.sessionStorage.clear();
  mockConnectGoogle.mockReset();
  mockFetch = jest.fn();
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: mockFetch,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
});

it("keeps the pending continuation and does not exchange on retryable auth failure", async () => {
  const pending = seedPending();
  mockFetch.mockResolvedValue(
    jsonResponse(
      {
        valid: false,
        retryable: true,
        error:
          "Your AI Matrx session could not be verified yet. Refresh and try again.",
      },
      503,
    ),
  );
  await renderCallback();
  expect(host.textContent).toContain("session could not be verified yet");
  expect(host.textContent).not.toContain("session changed");
  expect(mockConnectGoogle).not.toHaveBeenCalled();
  expect(
    readGoogleOAuthRedirectPending(
      window.sessionStorage,
      STATE,
      window.location.origin,
    ),
  ).toEqual(pending);
});

it.each([
  ["a network failure", () => Promise.reject(new Error("offline"))],
  [
    "a malformed success response",
    () => Promise.resolve(jsonResponse(null, 200)),
  ],
])("keeps pending state after %s", async (_name, response) => {
  const pending = seedPending();
  mockFetch.mockImplementation(response);
  await renderCallback();
  expect(host.textContent).toContain("session could not be verified yet");
  expect(mockConnectGoogle).not.toHaveBeenCalled();
  expect(
    readGoogleOAuthRedirectPending(
      window.sessionStorage,
      STATE,
      window.location.origin,
    ),
  ).toEqual(pending);
});

it("clears pending state and exchanges exactly once after same-user validation", async () => {
  seedPending();
  mockFetch.mockResolvedValue(
    jsonResponse({ valid: true, userId: USER }, 200),
  );
  mockConnectGoogle.mockImplementation(() => new Promise(() => undefined));
  await renderCallback();
  expect(mockConnectGoogle).toHaveBeenCalledTimes(1);
  expect(mockConnectGoogle).toHaveBeenCalledWith(
    "google-code",
    { type: "user" },
    "general",
    {
      redirectUri: window.location.origin,
      organizationContextId: ORG,
      expectedUserId: USER,
    },
  );
  expect(
    readGoogleOAuthRedirectPending(
      window.sessionStorage,
      STATE,
      window.location.origin,
    ),
  ).toBeNull();
});

it("consumes a confirmed foreign-user continuation without exchanging", async () => {
  seedPending();
  mockFetch.mockResolvedValue(
    jsonResponse(
      {
        valid: false,
        error:
          "Your AI Matrx session changed while Google authorization was open.",
      },
      409,
    ),
  );
  await renderCallback();
  expect(host.textContent).toContain("session changed");
  expect(mockConnectGoogle).not.toHaveBeenCalled();
  expect(
    readGoogleOAuthRedirectPending(
      window.sessionStorage,
      STATE,
      window.location.origin,
    ),
  ).toBeNull();
});
