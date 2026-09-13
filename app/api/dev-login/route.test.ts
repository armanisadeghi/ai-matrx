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
// A nonce belongs to a HOST (W56c). One shared `.dev-login-nonce` meant any
// agent's failed navigation consumed the nonce another agent had just minted.
// Keyed by HOSTNAME, not host:port — ports never separate cookie jars either,
// so the nonce boundary is deliberately the same boundary as the session's.
const nonceFile = (hostname: string) =>
  join(FAKE_CWD, `.dev-login-nonce.${hostname}`);
const NONCE_FILE = nonceFile("localhost");

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

function get(query: string, host = "localhost:3000") {
  // NextRequest is imported lazily for the same reason the route is: nothing
  // may load before process.cwd() is patched.
  const { NextRequest: Ctor } =
    require("next/server") as typeof import("next/server");
  return new Ctor(
    `http://${host}/api/dev-login${query}`,
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
    expect(message).toContain("pnpm dev-login");
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

  it("refuses a non-loopback host before anything else", async () => {
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

/**
 * W56 — ONE MACHINE, MANY AGENTS, ONE COOKIE JAR.
 *
 * On 2026-09-12 five agent sessions drove this app on localhost at once.
 * Cookies are scoped to a HOST and ignore the port, so every tab shared one
 * jar: one session's dev-login signed every other session in as somebody else
 * mid-form. The fix is a hostname per session — `<label>.localhost`, which is
 * loopback by definition and is cookie-isolated by every browser.
 *
 * Run these against the pre-W56 route and every one of them fails: it 403s on
 * any host that is not exactly `localhost`, and it reads ONE shared nonce file
 * that any host could burn.
 */
describe("each agent session gets its own hostname and its own nonce", () => {
  const HOST_A = "sa1b2c3d4.localhost";
  const HOST_B = "sf9e8d7c6.localhost";
  const PORT = ":3001";

  it("accepts a *.localhost session host", async () => {
    writeFileSync(nonceFile(HOST_A), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
    const response = await GET(
      get("?nonce=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&next=/tasks", HOST_A + PORT),
    );
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
  });

  it("redirects back to the SAME host, never rewritten to localhost", async () => {
    writeFileSync(nonceFile(HOST_A), "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n");
    const response = await GET(
      get("?nonce=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&next=/dashboard", HOST_A + PORT),
    );
    // A redirect to localhost would set the session cookie on a host the
    // caller is not on: a sign-in that silently did nothing, and an eviction
    // of whoever owned localhost.
    expect(response.headers.get("location")).toBe(`http://${HOST_A}${PORT}/dashboard`);
  });

  it("host B cannot spend host A's nonce, and cannot burn its file", async () => {
    writeFileSync(nonceFile(HOST_A), "cccccccccccccccccccccccccccccccc\n");
    const stolen = await GET(
      get("?nonce=cccccccccccccccccccccccccccccccc&next=/tasks", HOST_B + PORT),
    );
    expect(stolen.status).toBe(401);
    // THE ACTUAL DEFECT: A's handshake must still be live afterwards.
    expect(existsSync(nonceFile(HOST_A))).toBe(true);

    const owner = await GET(
      get("?nonce=cccccccccccccccccccccccccccccccc&next=/tasks", HOST_A + PORT),
    );
    expect(owner.status).toBeGreaterThanOrEqual(300);
    expect(owner.status).toBeLessThan(400);
    expect(existsSync(nonceFile(HOST_A))).toBe(false);
  });

  it("names the host and the per-host file when a nonce is missing", async () => {
    const response = await GET(get("?nonce=dddddddddddddddddddddddddddddddd", HOST_B + PORT));
    const body = (await response.json()) as { error?: string };
    expect(response.status).toBe(401);
    expect(body.error ?? "").toContain(`.dev-login-nonce.${HOST_B}`);
    expect(body.error ?? "").toContain("pnpm dev-login");
  });

  it("never writes or reads outside the checkout, whatever the host looks like", () => {
    const source = require("node:fs").readFileSync(
      join(__dirname, "route.ts"),
      "utf8",
    ) as string;
    // The host becomes part of a PATH; it is re-validated, not trusted.
    expect(source).toContain('/^[a-z0-9.-]{1,253}$/');
    expect(source).toContain('!hostname.includes("..")');
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
