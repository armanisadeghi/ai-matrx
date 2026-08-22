import { classifyEcho } from "../realtime-echo";

const T1 = "2026-08-21T10:00:00.000Z";
const T2 = "2026-08-21T10:00:05.000Z";

const body = (v: unknown) => ({ name: "Ada", status: v });

describe("classifyEcho", () => {
  // THE BUG THIS EXISTS TO KILL: our own write comes back 50–500ms later and
  // used to trigger a full-table refetch, so the grid flashed and lost the
  // user's place a beat after every save.
  it("drops our own echo — same instant, same body", () => {
    expect(
      classifyEcho({
        localUpdatedAt: T1,
        incomingUpdatedAt: T1,
        localData: body("active"),
        incomingData: body("active"),
      }),
    ).toBe("drop-own-echo");
  });

  it("drops a strictly older payload — it carries no information", () => {
    expect(
      classifyEcho({
        localUpdatedAt: T2,
        incomingUpdatedAt: T1,
        localData: body("new"),
        incomingData: body("old"),
      }),
    ).toBe("drop-stale");
  });

  it("delivers anything newer", () => {
    expect(
      classifyEcho({
        localUpdatedAt: T1,
        incomingUpdatedAt: T2,
        localData: body("mine"),
        incomingData: body("theirs"),
      }),
    ).toBe("deliver");
  });

  // The case a naive "same timestamp → drop" would silently eat.
  it("DELIVERS a same-millisecond collaborator write with different content", () => {
    expect(
      classifyEcho({
        localUpdatedAt: T1,
        incomingUpdatedAt: T1,
        localData: body("mine"),
        incomingData: body("theirs"),
      }),
    ).toBe("deliver");
  });

  describe("degrades toward DELIVERING, never toward hiding", () => {
    it("falls back to content when our timestamp is missing", () => {
      expect(
        classifyEcho({
          localUpdatedAt: undefined,
          incomingUpdatedAt: T1,
          localData: body("x"),
          incomingData: body("y"),
        }),
      ).toBe("deliver");
    });

    it("still recognises our echo by content when timestamps are missing", () => {
      expect(
        classifyEcho({
          localUpdatedAt: null,
          incomingUpdatedAt: null,
          localData: body("x"),
          incomingData: body("x"),
        }),
      ).toBe("drop-own-echo");
    });

    it("delivers when a timestamp is unparseable garbage", () => {
      expect(
        classifyEcho({
          localUpdatedAt: "not-a-date",
          incomingUpdatedAt: T1,
          localData: body("x"),
          incomingData: body("y"),
        }),
      ).toBe("deliver");
    });

    it("delivers rather than suppressing into an empty render", () => {
      expect(
        classifyEcho({
          localUpdatedAt: T1,
          incomingUpdatedAt: T1,
          localData: null,
          incomingData: body("y"),
        }),
      ).toBe("deliver");
    });
  });

  describe("body comparison", () => {
    it("is order-independent across keys", () => {
      expect(
        classifyEcho({
          localUpdatedAt: T1,
          incomingUpdatedAt: T1,
          localData: { a: 1, b: 2 },
          incomingData: { b: 2, a: 1 },
        }),
      ).toBe("drop-own-echo");
    });

    it("notices an added key", () => {
      expect(
        classifyEcho({
          localUpdatedAt: T1,
          incomingUpdatedAt: T1,
          localData: { a: 1 },
          incomingData: { a: 1, b: 2 },
        }),
      ).toBe("deliver");
    });

    it("notices a changed nested value", () => {
      expect(
        classifyEcho({
          localUpdatedAt: T1,
          incomingUpdatedAt: T1,
          localData: { a: { deep: 1 } },
          incomingData: { a: { deep: 2 } },
        }),
      ).toBe("deliver");
    });

    it("treats null and empty-string values as distinct", () => {
      expect(
        classifyEcho({
          localUpdatedAt: T1,
          incomingUpdatedAt: T1,
          localData: { a: null },
          incomingData: { a: "" },
        }),
      ).toBe("deliver");
    });
  });
});
