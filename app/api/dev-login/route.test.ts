/** @jest-environment node */

/**
 * THE NONCE HANDSHAKE IS THE ONLY DOOR.
 *
 * `?token=` authenticated from DEV_LOGIN_TOKEN — a durable credential — which
 * meant every use wrote that credential into browser history, dev-server logs
 * and, when an agent drove the browser, the agent's own transcript. It leaked
 * that way on 2026-08-31 (rotated) and AGAIN on 2026-09-11 (read out of
 * .env.local, printed, then passed in a navigate URL). The nonce handshake was
 * built after the first leak; the unsafe door was left standing beside it.
 *
 * This guard fails the moment anything re-opens it: the token path must be
 * refused with a 401 that NAMES the replacement, and the nonce path must still
 * work. Run it against the pre-2026-09-11 route and the first two cases fail.
 */

import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest } from "next/server";

// The route resolves its nonce file from process.cwd() AT MODULE LOAD. Point
// that at a throwaway directory before importing it, so the suite can never
// consume (the route deletes it) a real .dev-login-nonce another agent is
// mid-handshake with in this shared checkout.
const FAKE_CWD = mkdtempSync(join(tmpdir(), "dev-login-guard-"));
const NONCE_FILE = join(FAKE_CWD, ".dev-login-nonce");

const signInWithPassword = jest.fn(async () => ({ error: null }));
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      signOut: async () => ({}),
      signInWithPassword,
    },
  })),
}));

type Route = typeof import("./route");
let GET: Route["GET"];

function get(query: string) {
  // NextRequest is imported lazily for the same reason the route is: nothing
  // may load before process.cwd() is patched.
  const { NextRequest: Ctor } =
    require("next/server") as typeof import("next/server");
  return new Ctor(
    `http://localhost:3000/api/dev-login${query}`,
  ) as unknown as NextRequest;
}

beforeAll(async () => {
  jest.spyOn(process, "cwd").mockReturnValue(FAKE_CWD);
  // Values invented for this suite only — never a real credential. The token
  // one exists so the refusal case presents a token that WOULD have matched.
  process.env.DEV_LOGIN_TOKEN = "guard-suite-not-a-real-token";
  process.env.AI_ADMIN_USERNAME = "guard@example.invalid";
  process.env.AI_ADMIN_PASSWORD = "guard-suite-not-a-real-password";
  ({ GET } = await import("./route"));
});

afterAll(() => {
  rmSync(FAKE_CWD, { recursive: true, force: true });
});

describe("dev-login accepts ONLY the nonce handshake", () => {
  it("refuses ?token= even when it matches DEV_LOGIN_TOKEN", async () => {
    const response = await GET(
      get(`?token=${process.env.DEV_LOGIN_TOKEN}&next=/tasks`),
    );
    expect(response.status).toBe(401);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("tells the caller WHY and hands them the two-step replacement", async () => {
    const response = await GET(get("?token=anything-at-all"));
    const body = (await response.json()) as { error?: string };
    const message = body.error ?? "";
    expect(response.status).toBe(401);
    // Someone hitting the old door lands on the new one, not on a mystery.
    expect(message).toMatch(/leak/i);
    expect(message).toContain("openssl rand -hex 16 > .dev-login-nonce");
    expect(message).toContain("/api/dev-login?nonce=");
  });

  it("accepts a valid ?nonce= and consumes the file", async () => {
    writeFileSync(NONCE_FILE, "0123456789abcdef0123456789abcdef\n");
    const response = await GET(
      get("?nonce=0123456789abcdef0123456789abcdef&next=/tasks"),
    );
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toBe("http://localhost:3000/tasks");
    expect(signInWithPassword).toHaveBeenCalled();
    expect(existsSync(NONCE_FILE)).toBe(false);
  });

  it("refuses a wrong ?nonce= and burns the file anyway", async () => {
    writeFileSync(NONCE_FILE, "0123456789abcdef0123456789abcdef\n");
    const response = await GET(get("?nonce=ffffffffffffffffffffffffffffffff"));
    expect(response.status).toBe(401);
    expect(existsSync(NONCE_FILE)).toBe(false);
  });

  it("refuses a non-localhost host before anything else", async () => {
    const { NextRequest: Ctor } =
      require("next/server") as typeof import("next/server");
    const response = await GET(
      new Ctor(
        "https://app.aimatrx.com/api/dev-login?nonce=x",
      ) as unknown as NextRequest,
    );
    expect(response.status).toBe(403);
  });
});

it("no longer reads DEV_LOGIN_TOKEN at all", () => {
  // The point of deleting the path rather than disabling it: the leaked value
  // is inert, so nobody has to rotate anything.
  const source = require("node:fs").readFileSync(
    join(__dirname, "route.ts"),
    "utf8",
  ) as string;
  expect(source).not.toContain("env.DEV_LOGIN_TOKEN");
});
