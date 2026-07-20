import {
  clearTraySnapshot,
  getTraySnapshot,
  setTraySnapshot,
  subscribeTraySnapshotMap,
} from "@/features/window-panels/WindowTray/traySnapshotMap";

describe("traySnapshotMap", () => {
  const created: string[] = [];
  const revoked: string[] = [];

  beforeAll(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => {
        const next = `blob:tray-${created.length}`;
        created.push(next);
        return next;
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn((url: string) => revoked.push(url)),
    });
  });

  afterEach(() => {
    for (let index = 0; index < 20; index += 1) {
      clearTraySnapshot(`window-${index}`);
    }
    created.length = 0;
    revoked.length = 0;
  });

  it("stores local object URLs and revokes them when cleared", () => {
    setTraySnapshot("window-0", new Blob(["preview"]));
    expect(getTraySnapshot("window-0")).toBe("blob:tray-0");

    clearTraySnapshot("window-0");
    expect(getTraySnapshot("window-0")).toBeNull();
    expect(revoked).toEqual(["blob:tray-0"]);
  });

  it("replaces and revokes an older snapshot for the same window", () => {
    setTraySnapshot("window-0", new Blob(["first"]));
    setTraySnapshot("window-0", new Blob(["second"]));

    expect(getTraySnapshot("window-0")).toBe("blob:tray-1");
    expect(revoked).toContain("blob:tray-0");
  });

  it("bounds the cache to 16 snapshots and evicts the oldest", () => {
    for (let index = 0; index < 17; index += 1) {
      setTraySnapshot(`window-${index}`, new Blob([String(index)]));
    }

    expect(getTraySnapshot("window-0")).toBeNull();
    expect(getTraySnapshot("window-16")).toBe("blob:tray-16");
    expect(revoked).toContain("blob:tray-0");
  });

  it("notifies subscribers on set and clear", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeTraySnapshotMap(listener);

    setTraySnapshot("window-0", new Blob(["preview"]));
    clearTraySnapshot("window-0");
    unsubscribe();
    setTraySnapshot("window-1", new Blob(["ignored"]));

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
