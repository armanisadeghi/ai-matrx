/** @jest-environment node */

/**
 * A CREDENTIAL DOOR ANSWERS A fetch() AND NOTHING ELSE.
 *
 * 🚨 WHAT THIS GUARD EXISTS TO CATCH (2026-09-17). `/api/session-token`
 * answered a top-level browser navigation exactly as it answered the SSO
 * bridge's `fetch()`, so opening the URL in a signed-in browser RENDERED a live
 * Supabase access token as page text. A reviewer did exactly that to check
 * which identity its browser held, and a working `admin@admin.com` token — good
 * for days — landed in an agent transcript. `?token=` dev-login had already
 * cost this repo two credentials the same way (2026-08-31, 2026-09-11).
 *
 * Run the first four cases against the pre-fix route and they FAIL: it returns
 * 200 with the token in the body for every one of them.
 *
 * The last four cases are the other half of the contract, and they matter just
 * as much: the bridge in `aidream/apps/{workflow-studio,dashboard}` and every
 * same-origin script fetch MUST keep working. A guard that closes the door on
 * its legitimate caller is an outage wearing a fix's clothes.
 */

import type { NextRequest } from "next/server";

// Invented for this suite. Shaped like a JWT so a leak-check that greps for
// "eyJ" would see it, but it is not a credential and never was one.
const FAKE_TOKEN = "eyJ-guard-suite.not-a-real-token.aaaa";

const getClaims = jest.fn(async () => ({
  data: { claims: { sub: "guard-suite-user" } },
}));
const getSession = jest.fn(async () => ({
  data: {
    session: {
      access_token: FAKE_TOKEN,
      expires_at: 4102444800,
      user: { id: "guard-suite-user" },
    },
  },
}));

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getClaims, getSession },
  })),
}));

type Route = typeof import("./route");
let GET: Route["GET"];

/** Build a request with an explicit header set — `Sec-Fetch-*` are forbidden
 *  header names in a browser, which is exactly why the route can trust them;
 *  here we set them directly to play each caller shape. */
function req(headers: Record<string, string>): NextRequest {
  const { NextRequest: Ctor } =
    require("next/server") as typeof import("next/server");
  return new Ctor("https://www.aimatrx.com/api/session-token", {
    headers,
  }) as unknown as NextRequest;
}

/** The whole point: the token must appear NOWHERE in what we send back. */
async function bodyText(res: Response): Promise<string> {
  return JSON.stringify(await res.json());
}

beforeAll(async () => {
  ({ GET } = await import("./route"));
});

describe("a browser navigation NEVER receives a token", () => {
  it("refuses a top-level navigation (address bar, link, redirect)", async () => {
    const res = await GET(
      req({
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
      }),
    );
    expect(res.status).toBe(400);
    const body = await bodyText(res);
    expect(body).not.toContain(FAKE_TOKEN);
    expect(body).toContain("navigation_not_allowed");
  });

  it("names the remedy — /api/whoami — instead of just saying no", async () => {
    const res = await GET(
      req({ "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }),
    );
    // The fourth law: a refusal that does not hand over the way forward sends
    // the next reader straight back to the token endpoint.
    expect(await bodyText(res)).toContain("/api/whoami");
  });

  it("refuses subresource loads (<iframe>, <img>, prefetch) too", async () => {
    for (const dest of ["iframe", "image", "script", "object", "embed"]) {
      const res = await GET(req({ "sec-fetch-dest": dest }));
      expect(res.status).toBe(400);
      expect(await bodyText(res)).not.toContain(FAKE_TOKEN);
    }
  });

  it("refuses before it ever reads the session, and never caches", async () => {
    getSession.mockClear();
    const res = await GET(
      req({ "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" }),
    );
    expect(res.status).toBe(400);
    expect(getSession).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("the SSO bridge and same-origin scripts keep working", () => {
  it("serves the cross-origin bridge fetch from an allowed subdomain", async () => {
    const res = await GET(
      req({
        origin: "https://workflows.aimatrx.com",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { access_token?: string };
    expect(data.access_token).toBe(FAKE_TOKEN);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://workflows.aimatrx.com",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("serves a same-origin script fetch (no Origin header is sent)", async () => {
    const res = await GET(
      req({ "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin" }),
    );
    expect(res.status).toBe(200);
  });

  it("still serves a client that sends no Sec-Fetch-* at all (curl, server-side)", async () => {
    // Deliberate, documented in lib/api/credential-door.ts: such a caller must
    // already hold the httpOnly cookie, and refusing it proves nothing.
    const res = await GET(req({}));
    expect(res.status).toBe(200);
  });

  it("still refuses an origin that is not on the allow-list", async () => {
    const res = await GET(
      req({ origin: "https://evil.example", "sec-fetch-dest": "empty" }),
    );
    expect(res.status).toBe(403);
    expect(await bodyText(res)).not.toContain(FAKE_TOKEN);
  });
});
