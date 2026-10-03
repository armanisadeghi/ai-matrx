/** @jest-environment node */
import { GET, PUT, DELETE } from "./route";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import type { NextRequest } from "next/server";

jest.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({
    status: init?.status ?? 200, json: async () => body,
  }) },
}));
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/utils/supabase/resolveUser", () => ({ getClaimsUser: jest.fn() }));

const conversationId = "d5000000-0000-4000-8000-000000000005";
const userId = "d2000000-0000-4000-8000-000000000002";
const params = { params: Promise.resolve({ id: conversationId }) };
type Result = { data: unknown; error: { code: string; message: string; details: string; hint: string } | null };

type Builder = {
  select: jest.Mock<Builder, []>;
  eq: jest.Mock<Builder, []>;
  is: jest.Mock<Builder, []>;
  update: jest.Mock<Builder, []>;
  single: jest.Mock<Promise<Result>, []>;
  then: (resolve: (value: Result) => unknown) => Promise<unknown>;
};

function setup(write: Result) {
  let writing = false;
  const builder: Builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    update: jest.fn(() => { writing = true; return builder; }),
    single: jest.fn(async () => ({ data: { id: conversationId, role: "member", type: "direct", created_by: "another-person", organization_id: "org-b" }, error: null })),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(resolve(writing ? write : { data: [], error: null })),
  };
  jest.mocked(createClient).mockResolvedValue({
    schema: () => ({ from: () => builder }),
  } as never);
  jest.mocked(getClaimsUser).mockResolvedValue({ data: { user: { id: userId } }, error: null } as never);
  return builder;
}

const request = { json: async () => ({ is_muted: true }) } as NextRequest;
const handlers = [["preferences", PUT], ["archive", DELETE]] as const;

describe.each(handlers)("%s participant write", (_name, handler) => {
  it("returns the database refusal instead of claiming success", async () => {
    setup({ data: null, error: { code: "42501", message: "Participant update refused", details: "Membership ended", hint: "Restore membership" } });
    const response = await handler(request, params);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, msg: "Participant update refused",
      code: "42501", details: "Membership ended", hint: "Restore membership", conversationId });
  });
  it("refuses zero affected rows instead of claiming success", async () => {
    setup({ data: [], error: null });
    const response = await handler(request, params);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false });
  });
  it("succeeds only after a live participant row was confirmed", async () => {
    const builder = setup({ data: [{ id: "participant-ada" }], error: null });
    const response = await handler(request, params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(builder.is).toHaveBeenCalledWith("deleted_at", null);
    // The row is FOUND by conversation + user only: a participant left in a stale
    // organization must match (and be re-stamped), never become a zero-row write.
    expect(builder.eq).toHaveBeenCalledWith("conversation_id", conversationId);
    expect(builder.eq).toHaveBeenCalledWith("user_id", userId);
    expect(builder.eq).not.toHaveBeenCalledWith("organization_id", expect.anything());
    expect(builder.select).toHaveBeenCalledWith("id");
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ organization_id: "org-b" }));
  });
});


it("does not mark messages read when only conversation metadata was requested", async () => {
  const builder = setup({ data: [], error: null });
  const response = await GET(request, params);
  expect(response.status).toBe(200);
  expect(builder.update).not.toHaveBeenCalled();
});
