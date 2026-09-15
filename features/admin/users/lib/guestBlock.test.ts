/**
 * @jest-environment node
 */
/**
 * features/admin/users/lib/guestBlock.ts — the client half of
 * public.admin_set_guest_block.
 *
 * What it OWNS and this suite forces:
 *   * the exact RPC and argument body PostgREST receives for block and unblock
 *     (an unblock never carries a reason or end time; a block carries both);
 *   * the decode of the RPC's jsonb reply (a malformed reply is a named
 *     failure, never a silent "allowed");
 *   * the mapping of database refusals (42501 / P0002 / 22023) to codes the
 *     UI states honestly;
 *   * guestAccessFromRow — the same "block holds while blocked_until is unset
 *     or in the future" rule aidream and check_guest_execution_limit enforce.
 *
 * The Supabase client is REAL supabase-js; only the network is a recorder.
 * Row fixtures are complete generated users.guest_executions rows.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { blockGuest, GuestBlockError, unblockGuest } from "./guestBlock";
import { guestAccessFromRow, guestAccessState } from "./guestAccess";

jest.mock("@/utils/supabase/client", () => ({ supabase: null }));

type GuestRow = Database["users"]["Tables"]["guest_executions"]["Row"];

interface Recorded {
  path: string;
  method: string;
  body: unknown;
}

const requests: Recorded[] = [];
const replies: { status: number; json: Json }[] = [];

const client = createClient<Database>("http://localhost:54321", "sb_publishable_test", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(
        input instanceof URL ? input.href : typeof input === "string" ? input : input.url,
      );
      requests.push({
        path: url.pathname,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });
      const reply = replies.shift();
      if (!reply) throw new Error(`No reply queued for ${url.pathname}`);
      return new Response(JSON.stringify(reply.json), {
        status: reply.status,
        headers: { "content-type": "application/json" },
      });
    },
  },
});

const GUEST_ID = "5b0f7c1e-2a4d-4f1b-9a7e-3c2d1e0f9a8b";

function guestRow(overrides: Partial<GuestRow>): GuestRow {
  return {
    auth_user_id: null,
    blocked_reason: null,
    blocked_until: null,
    converted_at: null,
    converted_to_user_id: null,
    created_at: "2026-09-01T10:00:00+00:00",
    daily_executions: 3,
    daily_reset_at: "2026-09-15T00:00:00+00:00",
    fingerprint: "fp-captured-shape-0001",
    first_execution_at: "2026-09-01T10:00:00+00:00",
    id: GUEST_ID,
    ip_address: "203.0.113.9",
    is_blocked: false,
    last_execution_at: "2026-09-15T09:00:00+00:00",
    metadata: { acquisition: { captured_at: "2026-09-01T10:00:00Z" } },
    total_executions: 41,
    updated_at: "2026-09-15T09:00:00+00:00",
    user_agent: "Mozilla/5.0",
    ...overrides,
  } satisfies GuestRow;
}

beforeEach(() => {
  requests.length = 0;
  replies.length = 0;
});

describe("blockGuest / unblockGuest — the wire contract", () => {
  it("sends a block with its reason and end time to admin_set_guest_block and returns the database's state", async () => {
    replies.push({
      status: 200,
      json: {
        guest_id: GUEST_ID,
        is_blocked: true,
        block_active: true,
        blocked_until: "2026-09-22T12:00:00+00:00",
        blocked_reason: "scripted abuse",
        updated_at: "2026-09-15T12:00:01+00:00",
      },
    });

    const result = await blockGuest(
      { guestId: GUEST_ID, reason: "scripted abuse", blockedUntil: "2026-09-22T12:00:00.000Z" },
      client,
    );

    expect(requests).toEqual([
      {
        path: "/rest/v1/rpc/admin_set_guest_block",
        method: "POST",
        body: {
          p_guest_id: GUEST_ID,
          p_blocked: true,
          p_reason: "scripted abuse",
          p_blocked_until: "2026-09-22T12:00:00.000Z",
        },
      },
    ]);
    expect(result).toEqual({
      guest_id: GUEST_ID,
      is_blocked: true,
      block_active: true,
      blocked_until: "2026-09-22T12:00:00+00:00",
      blocked_reason: "scripted abuse",
    });
  });

  it("sends an indefinite block with no end time and no reason when none is given", async () => {
    replies.push({
      status: 200,
      json: {
        guest_id: GUEST_ID,
        is_blocked: true,
        block_active: true,
        blocked_until: null,
        blocked_reason: null,
        updated_at: null,
      },
    });

    await blockGuest({ guestId: GUEST_ID, reason: null, blockedUntil: null }, client);

    expect(requests[0]?.body).toEqual({ p_guest_id: GUEST_ID, p_blocked: true });
  });

  it("sends an unblock carrying only the guest id and the false flag", async () => {
    replies.push({
      status: 200,
      json: {
        guest_id: GUEST_ID,
        is_blocked: false,
        block_active: false,
        blocked_until: null,
        blocked_reason: null,
        updated_at: "2026-09-15T12:05:00+00:00",
      },
    });

    const result = await unblockGuest({ guestId: GUEST_ID }, client);

    expect(requests[0]?.body).toEqual({ p_guest_id: GUEST_ID, p_blocked: false });
    expect(result.is_blocked).toBe(false);
    expect(result.block_active).toBe(false);
  });

  it.each([
    ["42501", "forbidden", 403, "Forbidden: Super Admin required"],
    ["P0002", "not_found", 404, "Guest not found"],
    ["22023", "invalid", 400, "A block must end in the future"],
  ] as const)(
    "maps a database refusal %s to the %s code with the database's message",
    async (pgCode, code, status, message) => {
      replies.push({ status, json: { code: pgCode, message, details: null, hint: null } });

      const failure = blockGuest(
        { guestId: GUEST_ID, reason: null, blockedUntil: null },
        client,
      );

      await expect(failure).rejects.toBeInstanceOf(GuestBlockError);
      await failure.catch((error: GuestBlockError) => {
        expect(error.code).toBe(code);
        expect(error.message).toBe(message);
      });
    },
  );

  it("refuses to report a state it cannot read instead of assuming the guest is allowed", async () => {
    replies.push({ status: 200, json: { guest_id: GUEST_ID, is_blocked: "yes" } });

    await expect(unblockGuest({ guestId: GUEST_ID }, client)).rejects.toMatchObject({
      code: "failed",
    });
  });
});

describe("guestAccessFromRow — the enforcement rule", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  it.each([
    ["never blocked (null flag)", guestRow({ is_blocked: null }), false, false, "allowed"],
    ["blocked indefinitely", guestRow({ is_blocked: true, blocked_reason: "abuse" }), true, true, "blocked"],
    [
      "blocked until a future time",
      guestRow({ is_blocked: true, blocked_until: "2026-09-15T12:00:01+00:00" }),
      true,
      true,
      "blocked",
    ],
    [
      "blocked until a time that has passed",
      guestRow({ is_blocked: true, blocked_until: "2026-09-15T11:59:59+00:00" }),
      true,
      false,
      "block_expired",
    ],
    [
      "an end time left on an unblocked row",
      guestRow({ is_blocked: false, blocked_until: "2026-09-20T00:00:00+00:00" }),
      false,
      false,
      "allowed",
    ],
  ] as const)("%s", (_label, row, isBlocked, active, state) => {
    const access = guestAccessFromRow(row, now);
    expect(access.guest_id).toBe(GUEST_ID);
    expect(access.is_blocked).toBe(isBlocked);
    expect(access.block_active).toBe(active);
    expect(access.blocked_until).toBe(row.blocked_until);
    expect(access.blocked_reason).toBe(row.blocked_reason);
    expect(guestAccessState(access)).toBe(state);
  });
});
