import { resolveEndedClean } from "../followEndedClean";

type FollowFn = NonNullable<Parameters<typeof resolveEndedClean>[0]["follow"]>;

const transport = {} as never;
const DOC = "doc-1";

function follower(status: string, error: Record<string, unknown> | null = null) {
  return jest.fn(async (_t: unknown, opts: { reloadSavedResult: (o: never) => Promise<void> | void }) => {
    await opts.reloadSavedResult({ status, operation: null } as never);
    return { status, error, settled: true, aborted: false } as never;
  }) as unknown as jest.Mock & FollowFn;
}

describe("resolveEndedClean — a stream that ended early resolves to the run's terminal status", () => {
  it("completed: reloads the saved doc exactly once and returns it", async () => {
    const follow = follower("completed");
    const reload = jest.fn().mockResolvedValue({ id: DOC, cleanContent: "text" });
    const r = await resolveEndedClean({ transport, docId: DOC, requestId: "req-1", reload, follow });
    expect(r).toEqual({ kind: "completed", document: { id: DOC, cleanContent: "text" } });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(follow.mock.calls[0][1]).toMatchObject({ target: { requestId: "req-1" } });
  });

  it("falls back to the doc's own link when the stream never gave a request id", async () => {
    const follow = follower("completed");
    await resolveEndedClean({ transport, docId: DOC, requestId: null, reload: async () => null, follow });
    expect(follow.mock.calls[0][1]).toMatchObject({
      target: { linkKind: "processed_document", linkId: DOC },
    });
  });

  it("failed: surfaces the run's reason and never reloads", async () => {
    const follow = follower("failed", { message: "pdfclean_error: model refused" });
    const reload = jest.fn();
    const r = await resolveEndedClean({ transport, docId: DOC, requestId: "r", reload, follow });
    expect(r).toEqual({ kind: "failed", message: "AI cleanup failed: model refused" });
    expect(reload).not.toHaveBeenCalled();
  });

  it("failed with no readable reason is still an honest failure", async () => {
    const r = await resolveEndedClean({
      transport, docId: DOC, requestId: "r", reload: jest.fn(), follow: follower("failed"),
    });
    expect(r).toEqual({ kind: "failed", message: "AI cleanup failed" });
  });

  it("cancelled / no run: unresolved with the true status, no reload", async () => {
    const reload = jest.fn();
    const r = await resolveEndedClean({
      transport, docId: DOC, requestId: "r", reload, follow: follower("cancelled"),
    });
    expect(r).toEqual({ kind: "unresolved", status: "cancelled" });
    expect(reload).not.toHaveBeenCalled();
  });
});
