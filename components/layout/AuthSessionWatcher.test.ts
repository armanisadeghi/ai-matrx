import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "AuthSessionWatcher.tsx"),
  "utf8",
);

describe("AuthSessionWatcher diagnostics", () => {
  it("keeps handled identity drift out of the system-error queue", () => {
    expect(source).toContain("IDENTITY DRIFT");
    expect(source).toContain("console.warn(");
    expect(source).not.toContain("console.error(");
  });

  it("cuts off Redux authority when the booted Supabase session is gone", () => {
    expect(source).toContain('event === "SIGNED_OUT"');
    expect(source).toContain('event === "INITIAL_SESSION"');
    expect(source).toContain("dispatch(clearUserAuth());");
    expect(source.indexOf("dispatch(clearUserAuth());")).toBeLessThan(
      source.indexOf("dispatch(clearContext());"),
    );
  });
});

describe("AuthSessionWatcher blocked-tab recovery", () => {
  it("never treats a stop as terminal: the reconcile loop, activity listeners, fast poll and cross-tab nudge are all wired", () => {
    expect(source).toContain("decideBlockedTabReconcile(");
    expect(source).toContain('"pointermove"');
    expect(source).toContain("BLOCKED_RECHECK_INTERVAL_MS");
    expect(source).toContain('new BroadcastChannel(AUTH_BROADCAST_CHANNEL)');
    expect(source).toContain("window.location.reload()");
  });

  it("stops the pre-block check once an overlay is up so drafts are not re-snapshotted every tick", () => {
    const checkStart = source.indexOf("const checkIdentity = useCallback");
    const guard = source.indexOf("if (blockedRef.current) return;", checkStart);
    const snapshot = source.indexOf("snapshotUnsavedWork(booted, current.id)", checkStart);
    expect(guard).toBeGreaterThan(checkStart);
    expect(guard).toBeLessThan(snapshot);
  });
});
