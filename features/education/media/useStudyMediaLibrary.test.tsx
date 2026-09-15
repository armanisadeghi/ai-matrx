import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { StudyMediaRow } from "./types";

const listByKind = jest.fn();

jest.mock("./service", () => ({
  studyMediaService: { listByKind: (...args: unknown[]) => listByKind(...args) },
}));

import { useStudyMediaLibrary } from "./useStudyMediaLibrary";

const row = (id: string) => ({ id, title: id } as StudyMediaRow);

type Result = ReturnType<typeof useStudyMediaLibrary>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("study-media library identity lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest!: Result;
  let kind: "audio" | "memory_aid";
  let loadKey: string | null;

  function Probe() {
    latest = useStudyMediaLibrary(kind, loadKey);
    return null;
  }

  async function render(nextKind = kind, nextLoadKey = loadKey) {
    kind = nextKind;
    loadKey = nextLoadKey;
    await act(async () => {
      root.render(<Probe />);
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    kind = "audio";
    loadKey = null;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps both Audio Study and Memory Aids idle until a usable session exists", async () => {
    await render("audio", null);
    expect(latest.rows).toEqual([]);
    expect(latest.loaded).toBe(false);
    expect(listByKind).not.toHaveBeenCalled();

    await render("memory_aid", null);
    expect(latest.rows).toEqual([]);
    expect(listByKind).not.toHaveBeenCalled();
  });

  it("clears Account A rows synchronously for hydration, sign-out, and Account B", async () => {
    const accountA = deferred<{ data: StudyMediaRow[]; error: null }>();
    listByKind.mockReturnValueOnce(accountA.promise);
    await render("audio", "account-a");
    expect(latest.loading).toBe(true);
    expect(latest.rows).toEqual([]);

    await act(async () => accountA.resolve({ data: [row("a-only")], error: null }));
    expect(latest.rows.map(({ id }) => id)).toEqual(["a-only"]);
    expect(latest.loaded).toBe(true);

    await render("audio", null);
    expect(latest.rows).toEqual([]);
    expect(latest.loaded).toBe(false);

    const accountB = deferred<{ data: StudyMediaRow[]; error: null }>();
    listByKind.mockReturnValueOnce(accountB.promise);
    await render("audio", "account-b");
    expect(latest.loading).toBe(true);
    expect(latest.rows).toEqual([]);

    await act(async () => accountB.resolve({ data: [row("b-only")], error: null }));
    expect(latest.rows.map(({ id }) => id)).toEqual(["b-only"]);
  });

  it("ignores an Account A request that finishes after Account B takes over", async () => {
    const lateAccountA = deferred<{ data: StudyMediaRow[]; error: null }>();
    const accountB = deferred<{ data: StudyMediaRow[]; error: null }>();
    listByKind
      .mockReturnValueOnce(lateAccountA.promise)
      .mockReturnValueOnce(accountB.promise);

    await render("audio", "account-a");
    await render("audio", "account-b");
    await act(async () => lateAccountA.resolve({ data: [row("a-late")], error: null }));
    expect(latest.rows).toEqual([]);
    expect(latest.loading).toBe(true);

    await act(async () => accountB.resolve({ data: [row("b-current")], error: null }));
    expect(latest.rows.map(({ id }) => id)).toEqual(["b-current"]);
  });

  it("shows a real query failure and retries to a successful memory-aid library", async () => {
    listByKind
      .mockResolvedValueOnce({ data: null, error: "Could not load memory aids." })
      .mockResolvedValueOnce({ data: [row("memory-b")], error: null });
    await render("memory_aid", "account-b");
    await act(async () => Promise.resolve());

    expect(latest.rows).toEqual([]);
    expect(latest.error).toBe("Could not load memory aids.");
    expect(latest.loaded).toBe(false);

    await act(async () => latest.retry());
    await act(async () => Promise.resolve());
    expect(listByKind).toHaveBeenCalledTimes(2);
    expect(listByKind).toHaveBeenNthCalledWith(1, "memory_aid");
    expect(listByKind).toHaveBeenNthCalledWith(2, "memory_aid");
    expect(latest.error).toBeNull();
    expect(latest.rows.map(({ id }) => id)).toEqual(["memory-b"]);
    expect(latest.loaded).toBe(true);
  });
});
