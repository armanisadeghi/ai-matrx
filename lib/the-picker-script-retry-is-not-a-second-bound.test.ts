/**
 * 🚨 A RETRY IS NOT A SECOND 20-SECOND WAIT
 * (V-24 NEW-4, lane F-111; Bugbot review 5247021300 on 19d… the F-111 commit).
 *
 * F-111 bounded the Picker's `api.js` wait, which turned an infinite hang into
 * a finite one — but the dead tag stayed in the document, so the NEXT pick
 * reused it, and a tag that already errored (or loaded without defining
 * `window.gapi`) never fires `load` again. Every retry therefore sat out the
 * whole bound and failed identically: the screen was honest and the remedy was
 * useless. The provider re-inserts its GIS script for exactly this reason.
 *
 * What this pins, against the REAL loader under fake timers (jsdom never
 * fetches a tag, so nothing fires unless this test fires it):
 *
 *   1. the first attempt fails at the bound, and the SECOND attempt inserts a
 *      NEW tag and lands as soon as that tag defines `gapi` — it does not sit
 *      out the bound again;
 *   2. a tag that fires `error` is REMOVED on the way out, and the next attempt
 *      re-inserts rather than waiting on the corpse;
 *   3. two picks during ONE in-flight attempt share it — one tag, not a race.
 */

process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID =
  "test-client-id.apps.googleusercontent.com";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadGooglePickerScript } = require("./googlePicker") as {
  loadGooglePickerScript: () => Promise<void>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  GOOGLE_IDENTITY_READY_TIMEOUT_MS,
  GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE,
} = require("@/providers/google-provider/googleIdentityReadiness") as {
  GOOGLE_IDENTITY_READY_TIMEOUT_MS: number;
  GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE: string;
};

const PICKER_SCRIPT = "https://apis.google.com/js/api.js";

function tags(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      `script[src="${PICKER_SCRIPT}"]`,
    ),
  );
}

/** Run the timers the loader is waiting on, letting its microtasks settle. */
async function advance(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

describe("the Picker script retry is not a second bound", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    delete (window as { gapi?: unknown }).gapi;
    for (const tag of tags()) tag.remove();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("a second pick after a timed-out first one inserts a NEW tag and lands without waiting the bound again", async () => {
    const first = loadGooglePickerScript();
    const firstFailure = first.catch((error: Error) => error.message);
    const firstTag = tags()[0];
    expect(firstTag).toBeDefined();

    await advance(GOOGLE_IDENTITY_READY_TIMEOUT_MS + 1_000);
    await expect(firstFailure).resolves.toBe(
      GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE,
    );
    // The dead tag went out with the failure.
    expect(tags()).toHaveLength(0);

    const second = loadGooglePickerScript();
    const secondTag = tags()[0];
    expect(secondTag).toBeDefined();
    expect(secondTag).not.toBe(firstTag);

    // This time the script answers — and the wait ends there, not at the bound.
    (window as { gapi?: unknown }).gapi = { load: () => {} };
    secondTag.dispatchEvent(new Event("load"));
    await advance(200);
    await expect(second).resolves.toBeUndefined();
  });

  it("a tag that errors is removed, and the next pick re-inserts", async () => {
    const first = loadGooglePickerScript();
    const firstFailure = first.catch((error: Error) => error.message);
    const firstTag = tags()[0];

    firstTag.dispatchEvent(new Event("error"));
    await advance(0);
    await expect(firstFailure).resolves.toBe(
      GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE,
    );
    expect(tags()).toHaveLength(0);

    const second = loadGooglePickerScript();
    const secondFailure = second.catch((error: Error) => error.message);
    const secondTag = tags()[0];
    expect(secondTag).toBeDefined();
    expect(secondTag).not.toBe(firstTag);

    // And the fresh attempt is bounded too, not waiting on a corpse.
    await advance(GOOGLE_IDENTITY_READY_TIMEOUT_MS + 1_000);
    await expect(secondFailure).resolves.toBe(
      GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE,
    );
  });

  it("two picks during one in-flight attempt share it — one tag, not a race", async () => {
    const a = loadGooglePickerScript();
    const b = loadGooglePickerScript();
    const failures = Promise.all([
      a.catch((error: Error) => error.message),
      b.catch((error: Error) => error.message),
    ]);

    expect(tags()).toHaveLength(1);
    expect(a).toBe(b);

    await advance(GOOGLE_IDENTITY_READY_TIMEOUT_MS + 1_000);
    await expect(failures).resolves.toEqual([
      GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE,
      GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE,
    ]);
    expect(tags()).toHaveLength(0);
  });
});
