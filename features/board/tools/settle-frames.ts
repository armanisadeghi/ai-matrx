/**
 * Resolve after two animation frames — or after `fallbackMs`, whichever comes
 * first. Browsers pause animation frames in a background tab, so a promise
 * that waits on frames alone never settles while the person is on another
 * tab; an agent tool call awaiting it then stalls until they come back.
 */
export function settleFrames(fallbackMs = 50): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, fallbackMs);
    requestAnimationFrame(() => requestAnimationFrame(finish));
  });
}
