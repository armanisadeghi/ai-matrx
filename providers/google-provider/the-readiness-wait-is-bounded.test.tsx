/**
 * 🚨 THE READINESS WAIT IS BOUNDED, AND ITS END IS HONEST
 * (V-24 NEW-4, lane F-111).
 *
 * The defect: `checkGoogleLoaded()` re-scheduled itself every 100 ms with no
 * timeout and no attempt bound, and `script.onerror` only fires when the
 * REQUEST errors. A Google Identity Services script that is served but never
 * defines `window.google.accounts` — a content blocker, a corporate filter, an
 * outage — left `?panels=google_connect` at "Loading Google API…" past 120 s
 * with no Connect control, no error and no remedy.
 *
 * What this pins, against the REAL provider with a script stub that never
 * defines `window.google`:
 *
 *   1. the wait ENDS at the bound — `isInitializing` goes false;
 *   2. its end is the named sentence, not silence and not a stack;
 *   3. Retry RE-INSERTS the script and restarts the bound;
 *   4. a late arrival after the bound does not resurrect the abandoned wait.
 *
 * On the bytes before the fix this test cannot pass: the poll never stops, so
 * the provider is still initializing with `error === null` at the assertion.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID =
  "test-client-id.apps.googleusercontent.com";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const GoogleAPIProvider = require("./GoogleApiProvider")
  .default as React.ComponentType<{ children: React.ReactNode }>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useGoogleAPI } = require("./GoogleApiProvider") as {
  useGoogleAPI: () => {
    isGoogleLoaded: boolean;
    isInitializing: boolean;
    error: string | null;
    retryGoogleIdentityLoad?: () => void;
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  GOOGLE_IDENTITY_READY_TIMEOUT_MS,
  GOOGLE_IDENTITY_SCRIPT_SRC,
  GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE,
} = require("./googleIdentityReadiness") as {
  GOOGLE_IDENTITY_READY_TIMEOUT_MS: number;
  GOOGLE_IDENTITY_SCRIPT_SRC: string;
  GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE: string;
};

type Seen = {
  isGoogleLoaded: boolean;
  isInitializing: boolean;
  error: string | null;
  retry: (() => void) | undefined;
};

let seen: Seen = {
  isGoogleLoaded: false,
  isInitializing: true,
  error: null,
  retry: undefined,
};

function Probe() {
  const google = useGoogleAPI();
  seen = {
    isGoogleLoaded: google.isGoogleLoaded,
    isInitializing: google.isInitializing,
    error: google.error,
    retry: google.retryGoogleIdentityLoad,
  };
  return null;
}

function scriptTags(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`,
    ),
  );
}

describe("the Google Identity readiness wait is bounded and its end is honest", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    jest.useFakeTimers();
    // The stub: the script tag is inserted (jsdom never fetches it), so
    // `window.google` is never defined — exactly the blocked/stripped/outage
    // case. Nothing ever fires `load` or `error`.
    delete (window as { google?: unknown }).google;
    for (const tag of scriptTags()) tag.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <GoogleAPIProvider>
          <Probe />
        </GoogleAPIProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it("stops waiting at the bound and says what happened, with a remedy", () => {
    // Inside the bound it is honestly still loading.
    act(() => {
      jest.advanceTimersByTime(GOOGLE_IDENTITY_READY_TIMEOUT_MS - 1_000);
    });
    expect(seen.isInitializing).toBe(true);
    expect(seen.error).toBeNull();

    // Past the bound it is honestly failed.
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(seen.isInitializing).toBe(false);
    expect(seen.isGoogleLoaded).toBe(false);
    expect(seen.error).toBe(GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE);
  });

  it("Retry re-inserts the script and restarts the bound", () => {
    act(() => {
      jest.advanceTimersByTime(GOOGLE_IDENTITY_READY_TIMEOUT_MS + 1_000);
    });
    expect(seen.error).toBe(GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE);

    const before = scriptTags();
    expect(before).toHaveLength(1);
    expect(typeof seen.retry).toBe("function");

    act(() => seen.retry?.());

    const after = scriptTags();
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(before[0]); // a NEW tag, not the dead one
    expect(seen.isInitializing).toBe(true);
    expect(seen.error).toBeNull();

    // And the restarted wait is bounded too.
    act(() => {
      jest.advanceTimersByTime(GOOGLE_IDENTITY_READY_TIMEOUT_MS + 1_000);
    });
    expect(seen.isInitializing).toBe(false);
    expect(seen.error).toBe(GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE);
  });

  it("a late arrival after the bound does not resurrect the abandoned wait", () => {
    act(() => {
      jest.advanceTimersByTime(GOOGLE_IDENTITY_READY_TIMEOUT_MS + 1_000);
    });
    expect(seen.error).toBe(GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE);

    // Google finally answers the ABANDONED attempt.
    (window as { google?: unknown }).google = { accounts: { oauth2: {} } };
    act(() => {
      scriptTags()[0]?.dispatchEvent(new Event("load"));
      jest.advanceTimersByTime(5_000);
    });

    // The failed state stands until the person presses Retry.
    expect(seen.isGoogleLoaded).toBe(false);
    expect(seen.error).toBe(GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE);

    // Retry is what picks the late arrival up.
    act(() => seen.retry?.());
    expect(seen.isGoogleLoaded).toBe(true);
    expect(seen.isInitializing).toBe(false);
    expect(seen.error).toBeNull();
  });
});
