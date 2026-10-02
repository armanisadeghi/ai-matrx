import { settleFrames } from "./settle-frames";

describe("settleFrames", () => {
  const realRaf = global.requestAnimationFrame;
  afterEach(() => {
    global.requestAnimationFrame = realRaf;
    jest.useRealTimers();
  });

  it("settles in a background tab, where animation frames never run", async () => {
    jest.useFakeTimers();
    // A hidden tab: frame callbacks are queued and never called.
    global.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
    let settled = false;
    void settleFrames(50).then(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(49);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("settles on the second frame when frames run", async () => {
    const queue: FrameRequestCallback[] = [];
    global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    }) as typeof requestAnimationFrame;
    let settled = false;
    void settleFrames(10_000).then(() => {
      settled = true;
    });
    queue.shift()!(0);
    await Promise.resolve();
    expect(settled).toBe(false);
    queue.shift()!(16);
    await Promise.resolve();
    expect(settled).toBe(true);
  });
});
