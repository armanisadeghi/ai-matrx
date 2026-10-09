// A send while the page is still checking organizations waits for them, then goes (lane F18) —
// never a dropped press. Only the "still checking" refusal waits; any other refusal is real.
const STILL_CHECKING = /still checking your organizations/i;

export async function whenOrgReady(
  ensure: () => Promise<string>,
  opts: { tries?: number; pauseMs?: number } = {},
): Promise<string> {
  const tries = opts.tries ?? 6;
  const pauseMs = opts.pauseMs ?? 1_000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await ensure();
    } catch (err) {
      const waiting = err instanceof Error && STILL_CHECKING.test(err.message);
      if (!waiting || attempt >= tries) throw err;
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }
}
