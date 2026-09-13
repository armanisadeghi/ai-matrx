import { useUserPersistence } from "@/hooks/sandbox/use-user-persistence";
import { renderHook } from "@/test-utils/renderHook";
import type { UserPersistenceResponse } from "@/types/sandbox";

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "test response",
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function persistenceResponse(
  hostedBytes: number | null,
  ec2Bytes: number | null,
): UserPersistenceResponse {
  return {
    user_id: "admin-user",
    total_size_bytes: (hostedBytes ?? 0) + (ec2Bytes ?? 0),
    partial: hostedBytes === null || ec2Bytes === null,
    tiers: [
      {
        user_id: "admin-user",
        tier: "hosted",
        status: "available",
        volume_name: "matrx-user-admin-user",
        current_size_bytes: hostedBytes,
        sandbox_count: 1,
        active_sandbox_count: 1,
      },
      {
        user_id: "admin-user",
        tier: "ec2",
        status: "available",
        current_size_bytes: ec2Bytes,
        sandbox_count: 1,
        active_sandbox_count: 1,
      },
    ],
  };
}

describe("useUserPersistence successful hosted delete", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
      writable: true,
    });
  });

  it("refreshes the configured all-tier scope after success without inventing sandbox counts", async () => {
    const beforeDelete = persistenceResponse(1024, 4096);
    const afterDelete = persistenceResponse(null, 4096);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(beforeDelete))
      .mockResolvedValueOnce(
        response({
          ok: true,
          results: [{ tier: "hosted", ok: true, status: 204 }],
        }),
      )
      .mockResolvedValueOnce(response(afterDelete));
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
      writable: true,
    });

    const hook = await renderHook(() => useUserPersistence({ skip: true }));
    await hook.act(async () => {
      await hook.current.refresh();
    });
    await hook.act(async () => {
      await expect(hook.current.deleteVolume("hosted")).resolves.toEqual({
        ok: true,
      });
    });

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/sandbox/persistence",
      "/api/sandbox/persistence?tier=hosted",
      "/api/sandbox/persistence",
    ]);
    expect(hook.current.info).toEqual(afterDelete);
    expect(hook.current.info?.tiers).toHaveLength(2);
    expect(hook.current.info?.tiers[0]).toMatchObject({
      tier: "hosted",
      current_size_bytes: null,
      sandbox_count: 1,
      active_sandbox_count: 1,
    });
    expect(hook.current.info?.tiers[1]).toMatchObject({
      tier: "ec2",
      current_size_bytes: 4096,
      sandbox_count: 1,
      active_sandbox_count: 1,
    });
    await hook.unmount();
  });
});
