import { NextRequest } from "next/server";
import { POST } from "./route";
import { createAdminClient } from "@/utils/supabase/adminClient";

jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: jest.fn() }));

type DbResult = { data: unknown; error: unknown };
const future = "2099-01-01T00:00:00.000Z";
const liveCode = { created_by: "member-7", expires_at: future, used: false };

function chain(result: DbResult, first: "select" | "update" | "delete") {
  const builder: Record<string, jest.Mock> = {};
  for (const name of ["select", "update", "eq", "is", "gt", "delete", "lt"]) {
    builder[name] = jest.fn(() => builder);
  }
  builder[first] = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(async () => result);
  return builder;
}

function client(read: DbResult, claim: DbResult) {
  const readBuilder = chain(read, "select");
  const claimBuilder = chain(claim, "update");
  const cleanupBuilder = chain({ data: null, error: null }, "delete");
  const from = jest.fn()
    .mockReturnValueOnce(readBuilder)
    .mockReturnValueOnce(claimBuilder)
    .mockReturnValueOnce(cleanupBuilder);
  const generateLink = jest.fn(async () => ({ data: { properties: { action_link: "https://safe.test/link" } }, error: null }));
  return {
    schema: jest.fn(() => ({ from })),
    auth: { admin: { getUserById: jest.fn(async () => ({ data: { user: { id: "member-7", email: "member@example.test" } }, error: null })), generateLink } },
    from,
    claimBuilder,
    generateLink,
  };
}

function request(code = "A".repeat(32)) {
  return new NextRequest("http://localhost/api/auth/extension/exchange", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

describe("extension auth-code exchange", () => {
  beforeEach(() => jest.clearAllMocks());

  it("never mints for a soft-deleted code", async () => {
    const db = client({ data: null, error: null }, { data: null, error: null });
    jest.mocked(createAdminClient).mockReturnValue(db as never);

    expect((await POST(request())).status).toBe(401);
    expect(db.generateLink).not.toHaveBeenCalled();
  });

  it("rejects an already-used code before attempting a claim", async () => {
    const db = client({ data: { ...liveCode, used: true }, error: null }, { data: null, error: null });
    jest.mocked(createAdminClient).mockReturnValue(db as never);

    expect((await POST(request())).status).toBe(401);
    expect(db.claimBuilder.update).not.toHaveBeenCalled();
    expect(db.generateLink).not.toHaveBeenCalled();
  });

  it("rejects an expired code before attempting a claim", async () => {
    const db = client({ data: { ...liveCode, expires_at: "2000-01-01T00:00:00.000Z" }, error: null }, { data: null, error: null });
    jest.mocked(createAdminClient).mockReturnValue(db as never);

    expect((await POST(request())).status).toBe(401);
    expect(db.claimBuilder.update).not.toHaveBeenCalled();
    expect(db.generateLink).not.toHaveBeenCalled();
  });

  it("lets exactly the atomic winner mint when concurrent exchanges read the same live code", async () => {
    const winner = client({ data: liveCode, error: null }, { data: liveCode, error: null });
    const loser = client({ data: liveCode, error: null }, { data: null, error: null });
    jest.mocked(createAdminClient).mockReturnValueOnce(winner as never).mockReturnValueOnce(loser as never);

    const [first, second] = await Promise.all([POST(request()), POST(request())]);

    expect([first.status, second.status].sort()).toEqual([200, 401]);
    expect(winner.generateLink).toHaveBeenCalledTimes(1);
    expect(loser.generateLink).not.toHaveBeenCalled();
    expect(loser.claimBuilder.eq).toHaveBeenCalledWith("used", false);
    expect(loser.claimBuilder.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("fails closed when the conditional claim errors", async () => {
    const db = client({ data: liveCode, error: null }, { data: null, error: { message: "write failed" } });
    jest.mocked(createAdminClient).mockReturnValue(db as never);

    expect((await POST(request())).status).toBe(401);
    expect(db.generateLink).not.toHaveBeenCalled();
  });

  it("claims by the live table's columns and mints for the person who generated the code", async () => {
    const db = client({ data: liveCode, error: null }, { data: liveCode, error: null });
    jest.mocked(createAdminClient).mockReturnValue(db as never);

    expect((await POST(request())).status).toBe(200);
    // extend.extension_auth_codes has no user_id column: the person is created_by.
    expect(db.claimBuilder.select).toHaveBeenCalledWith("created_by, expires_at");
    expect(db.auth.admin.getUserById).toHaveBeenCalledWith("member-7");
  });

  it("fails closed for a claimed code that names nobody", async () => {
    const orphan = { ...liveCode, created_by: null };
    const db = client({ data: orphan, error: null }, { data: orphan, error: null });
    jest.mocked(createAdminClient).mockReturnValue(db as never);

    expect((await POST(request())).status).toBe(401);
    expect(db.generateLink).not.toHaveBeenCalled();
  });
});
