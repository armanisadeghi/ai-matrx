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
  Button: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));
jest.mock(
  "@/features/organizations/components/OrganizationRequiredNotice",
  () => ({
    OrganizationRequiredNotice: () => <div>Organization required</div>,
  }),
);

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

function seedCapabilityPending() {
  const pending = buildGoogleOAuthRedirectPending(
    STATE,
    {
      initiatingUserId: USER,
      returnTo: "/settings/integrations",
      owner: { type: "user" },
      organizationContextId: ORG,
      connectionPurpose: "google_capability",
      targetConnectionId: "connection-contacts",
      capabilityKey: "contacts",
    },
    window.location.origin,
  );
  storeGoogleOAuthRedirectPending(window.sessionStorage, pending);
  return pending;
}

function seedProductsPending() {
  storeGoogleOAuthRedirectPending(window.sessionStorage,
    buildGoogleOAuthRedirectPending(STATE, {
      initiatingUserId: USER,
      owner: { type: "user" },
      organizationContextId: ORG,
      connectionPurpose: "google_products",
      targetConnectionId: "review-mailbox",
      capabilityKeys: ["gmail_modify"],
      scopes: ["openid", "https://www.googleapis.com/auth/gmail.modify"],
    }, window.location.origin));
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
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
  mockFetch.mockResolvedValue(jsonResponse({ valid: true, userId: USER }, 200));
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

it("passes the stored capability target to the canonical exchange", async () => {
  seedCapabilityPending();
  mockFetch.mockResolvedValue(jsonResponse({ valid: true, userId: USER }, 200));
  mockConnectGoogle.mockImplementation(() => new Promise(() => undefined));
  await renderCallback();
  expect(mockConnectGoogle).toHaveBeenCalledWith(
    "google-code",
    { type: "user" },
    "google_capability",
    {
      redirectUri: window.location.origin,
      organizationContextId: ORG,
      expectedUserId: USER,
      targetConnectionId: "connection-contacts",
      capabilityKey: "contacts",
    },
  );
});

it("exchanges the exact product selection and account through the canonical service", async () => {
  seedProductsPending();
  mockFetch.mockResolvedValue(jsonResponse({ valid: true, userId: USER }, 200));
  mockConnectGoogle.mockImplementation(() => new Promise(() => undefined));
  await renderCallback();
  expect(mockConnectGoogle).toHaveBeenCalledWith("google-code", { type: "user" },
    "google_products", expect.objectContaining({
      targetConnectionId: "review-mailbox",
      capabilityKeys: ["gmail_modify"],
      organizationContextId: ORG,
      expectedUserId: USER,
      redirectUri: window.location.origin,
    }));
});

it("does not exchange a tampered product selection", async () => {
  seedProductsPending();
  const key = `mx-google-oauth-redirect:${STATE}`;
  const pending = JSON.parse(window.sessionStorage.getItem(key)!);
  window.sessionStorage.setItem(key, JSON.stringify({ ...pending, capabilityKeys: [] }));
  await renderCallback();
  expect(host.textContent).toContain("missing or expired");
  expect(mockConnectGoogle).not.toHaveBeenCalled();
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
