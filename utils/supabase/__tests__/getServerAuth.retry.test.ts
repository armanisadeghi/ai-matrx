/**
 * @jest-environment node
 *
 * The door waits and retries ONCE before it hands anyone "could not verify",
 * and it verifies against the pinned public key so a cold function makes no
 * JWKS fetch (lane SESSION-VERDICT, 2026-09-24).
 */
import { AuthRetryableFetchError } from "@supabase/supabase-js";

const createClient = jest.fn(async () => ({ auth: { getClaims: jest.fn() } }));
jest.mock("../server", () => ({ createClient: () => createClient() }));

const getClaimsUser = jest.fn();
jest.mock("../claimsUser", () => {
  const actual = jest.requireActual("../claimsUser");
  return { ...actual, getClaimsUser: (...args: unknown[]) => getClaimsUser(...args) };
});

jest.mock("react", () => ({ ...jest.requireActual("react"), cache: (fn: unknown) => fn }));

import { getServerAuth } from "../getServerAuth";
import { PROJECT_SIGNING_KEYS } from "../projectSigningKeys";

const user = { id: "u-1", app_metadata: {}, user_metadata: {} };
const timeout = () => ({
  data: { user: null },
  error: new AuthRetryableFetchError("The operation was aborted due to timeout", 0),
});

beforeEach(() => {
  createClient.mockClear();
  getClaimsUser.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

it("a spent budget on the first attempt is answered by the retry, on a fresh client", async () => {
  getClaimsUser.mockResolvedValueOnce(timeout()).mockResolvedValueOnce({ data: { user }, error: null });
  const auth = await getServerAuth();
  expect(auth).toEqual({ isAuthenticated: true, user, authUnavailable: false });
  expect(createClient).toHaveBeenCalledTimes(2);
});

it("still unverified after the retry stays the third state, never 'signed out'", async () => {
  getClaimsUser.mockResolvedValue(timeout());
  const auth = await getServerAuth();
  expect(auth).toEqual({ isAuthenticated: false, user: null, authUnavailable: true });
  expect(getClaimsUser).toHaveBeenCalledTimes(2);
});

it("a settled guest is answered once, with no retry", async () => {
  getClaimsUser.mockResolvedValueOnce({ data: { user: null }, error: null });
  const auth = await getServerAuth();
  expect(auth.authUnavailable).toBe(false);
  expect(getClaimsUser).toHaveBeenCalledTimes(1);
});

it("verifies against the pinned public key so a cold render fetches no JWKS", async () => {
  getClaimsUser.mockResolvedValueOnce({ data: { user }, error: null });
  await getServerAuth();
  expect(getClaimsUser.mock.calls[0][2]).toEqual({ jwks: { keys: PROJECT_SIGNING_KEYS } });
});
