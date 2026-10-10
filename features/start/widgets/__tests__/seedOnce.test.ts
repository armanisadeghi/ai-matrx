// Fails before 1a437f4d30's successor: the old per-mount ref let a remount, StrictMode's double effect and
// a second tab each write the starting layout again. Now: exactly one write.
import { __resetSeedOnceForTests, seedStartLayoutOnce, type SeedOnceDeps } from "../seedOnce";

function world() {
  let rows = 0;
  let writes = 0;
  let held: Promise<void> = Promise.resolve();
  const lock: SeedOnceDeps["lock"] = (_name, fn) => {
    const next = held.then(fn);
    held = next.catch(() => undefined);
    return next;
  };
  const deps = (): SeedOnceDeps => ({
    userId: "u1",
    lock,
    hasRow: async () => rows > 0,
    write: async () => {
      await new Promise((r) => setTimeout(r, 5));
      writes += 1;
      rows += 1;
      return { ok: true };
    },
  });
  return { deps, writes: () => writes };
}

beforeEach(__resetSeedOnceForTests);

it("StrictMode double effect in one tab writes once", async () => {
  const w = world();
  const [a, b] = await Promise.all([seedStartLayoutOnce(w.deps()), seedStartLayoutOnce(w.deps())]);
  expect([a, b].sort()).toEqual(["skipped", "wrote"]);
  expect(w.writes()).toBe(1);
});

it("a remount after the write writes nothing", async () => {
  const w = world();
  await seedStartLayoutOnce(w.deps());
  expect(await seedStartLayoutOnce(w.deps())).toBe("skipped");
  expect(w.writes()).toBe(1);
});

it("a second tab (no shared memo, shared lock) re-reads inside the lock and writes nothing", async () => {
  const w = world();
  const first = seedStartLayoutOnce(w.deps());
  __resetSeedOnceForTests(); // the other tab has its own module memory
  const second = seedStartLayoutOnce(w.deps());
  expect(await first).toBe("wrote");
  expect(await second).toBe("skipped");
  expect(w.writes()).toBe(1);
});

it("a failed write is reported and retried on the next mount, never marked done", async () => {
  let attempts = 0;
  const deps = (ok: boolean): SeedOnceDeps => ({
    userId: "u2",
    lock: (_n, fn) => fn(),
    hasRow: async () => false,
    write: async () => {
      attempts += 1;
      return { ok };
    },
  });
  expect(await seedStartLayoutOnce(deps(false))).toBe("failed");
  expect(await seedStartLayoutOnce(deps(true))).toBe("wrote");
  expect(attempts).toBe(2);
});
