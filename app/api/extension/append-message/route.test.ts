/** @jest-environment node */

import { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  createCxMessage,
  getCxConversation,
} from "@/features/public-chat/services/cx-chat";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { POST } from "./route";

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/features/public-chat/services/cx-chat", () => ({
  createCxMessage: jest.fn(),
  getCxConversation: jest.fn(),
}));
jest.mock("@/utils/supabase/env", () => ({
  requireEnv: (_name: string, value: string | undefined) =>
    value ?? "test-env-value",
}));

const conversationId = "11111111-1111-4111-8111-111111111111";

function positionClient(userResult: {
  data: { user: { id: string } | null };
  error: { message: string } | null;
}) {
  interface PositionQuery {
    select: jest.Mock<PositionQuery, [string]>;
    eq: jest.Mock<PositionQuery, [string, string]>;
    is: jest.Mock<PositionQuery, [string, null]>;
    order: jest.Mock<PositionQuery, [string, { ascending: boolean }]>;
    limit: jest.Mock<
      Promise<{ data: Array<{ position: number }>; error: null }>,
      [number]
    >;
  }
  const query = {} as PositionQuery;
  query.select = jest.fn<PositionQuery, [string]>(() => query);
  query.eq = jest.fn<PositionQuery, [string, string]>(() => query);
  query.is = jest.fn<PositionQuery, [string, null]>(() => query);
  query.order = jest.fn<PositionQuery, [string, { ascending: boolean }]>(
    () => query,
  );
  query.limit = jest.fn<
    Promise<{ data: Array<{ position: number }>; error: null }>,
    [number]
  >(async () => ({ data: [], error: null }));
  return {
    auth: { getUser: jest.fn(async () => userResult) },
    schema: jest.fn(() => ({ from: jest.fn(() => query) })),
  };
}

function request(headers?: HeadersInit) {
  return new NextRequest(
    "https://demos.aimatrx.com/api/extension/append-message",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        conversationId,
        role: "user",
        content: "bridge contract test",
      }),
    },
  );
}

describe("POST /api/extension/append-message", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getCxConversation).mockResolvedValue({
      id: conversationId,
      organization_id: "22222222-2222-4222-8222-222222222222",
    } as Awaited<ReturnType<typeof getCxConversation>>);
    jest.mocked(createCxMessage).mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      conversation_id: conversationId,
      role: "user",
      content: [{ type: "text", text: "bridge contract test" }],
      metadata: {},
      position: 0,
      source: "extension",
      agent_id: null,
      created_at: "2026-08-08T18:00:00Z",
    } as Awaited<ReturnType<typeof createCxMessage>>);
  });

  it("uses the extension's Supabase bearer token for auth and every RLS query", async () => {
    const cookieClient = positionClient({
      data: { user: null },
      error: { message: "no cookie session" },
    });
    const bearerClient = positionClient({
      data: { user: { id: "user-123" } },
      error: null,
    });
    jest
      .mocked(createServerClient)
      .mockResolvedValue(
        cookieClient as unknown as Awaited<
          ReturnType<typeof createServerClient>
        >,
      );
    jest
      .mocked(createSupabaseClient)
      .mockReturnValue(
        bearerClient as unknown as ReturnType<typeof createSupabaseClient>,
      );

    const response = await POST(
      request({ Authorization: "Bearer extension-supabase-token" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(createSupabaseClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        global: {
          headers: { Authorization: "Bearer extension-supabase-token" },
        },
      }),
    );
    expect(bearerClient.auth.getUser).toHaveBeenCalledWith(
      "extension-supabase-token",
    );
    expect(getCxConversation).toHaveBeenCalledWith(
      conversationId,
      bearerClient,
    );
    expect(createCxMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: conversationId,
        source: "extension",
      }),
      bearerClient,
    );
  });

  it("keeps the browser cookie session as the first-priority auth mode", async () => {
    const cookieClient = positionClient({
      data: { user: { id: "user-cookie" } },
      error: null,
    });
    jest
      .mocked(createServerClient)
      .mockResolvedValue(
        cookieClient as unknown as Awaited<
          ReturnType<typeof createServerClient>
        >,
      );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(createSupabaseClient).not.toHaveBeenCalled();
    expect(getCxConversation).toHaveBeenCalledWith(
      conversationId,
      cookieClient,
    );
  });

  it("rejects an invalid bearer before reading or writing conversations", async () => {
    const cookieClient = positionClient({
      data: { user: null },
      error: { message: "no cookie session" },
    });
    const bearerClient = positionClient({
      data: { user: null },
      error: { message: "invalid token" },
    });
    jest
      .mocked(createServerClient)
      .mockResolvedValue(
        cookieClient as unknown as Awaited<
          ReturnType<typeof createServerClient>
        >,
      );
    jest
      .mocked(createSupabaseClient)
      .mockReturnValue(
        bearerClient as unknown as ReturnType<typeof createSupabaseClient>,
      );

    const response = await POST(request({ Authorization: "Bearer invalid" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(getCxConversation).not.toHaveBeenCalled();
    expect(createCxMessage).not.toHaveBeenCalled();
  });
});
