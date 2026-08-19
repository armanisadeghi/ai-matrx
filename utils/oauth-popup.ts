export type OAuthPopupOutcome<T extends string> =
  { ok: true; value: T } | { ok: false; error: string; cancelled: boolean };

interface OAuthPopupOptions<T extends string> {
  url: string;
  target: string;
  successType: string;
  errorType: string;
  readSuccessValue: (data: Record<string, unknown>) => T | null;
}

const POPUP_FEATURES = "width=600,height=700,popup=yes";
const CLOSE_POLL_MS = 500;

/**
 * Opens a same-origin OAuth completion popup and settles on success, failure,
 * popup blocking, or user cancellation. Provider callbacks must post a result
 * message from this app's origin.
 */
export function startOAuthPopup<T extends string>({
  url,
  target,
  successType,
  errorType,
  readSuccessValue,
}: OAuthPopupOptions<T>): Promise<OAuthPopupOutcome<T>> {
  if (typeof window === "undefined") {
    return Promise.resolve({
      ok: false,
      error: "OAuth can only start in the browser",
      cancelled: false,
    });
  }

  const popup = window.open(url, target, POPUP_FEATURES);
  if (!popup) {
    return Promise.resolve({
      ok: false,
      error:
        "The sign-in window was blocked. Allow pop-ups for this site and try again.",
      cancelled: false,
    });
  }

  return new Promise<OAuthPopupOutcome<T>>((resolve) => {
    let settled = false;

    const finish = (outcome: OAuthPopupOutcome<T>) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(closeTimer);
      resolve(outcome);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data =
        typeof event.data === "object" && event.data !== null
          ? (event.data as Record<string, unknown>)
          : null;
      if (!data || typeof data.type !== "string") return;

      if (data.type === successType) {
        const value = readSuccessValue(data);
        if (value !== null) finish({ ok: true, value });
      } else if (data.type === errorType) {
        finish({
          ok: false,
          error:
            typeof data.error === "string"
              ? data.error
              : "OAuth connection failed",
          cancelled: false,
        });
      }
    };

    const closeTimer = window.setInterval(() => {
      if (popup.closed) {
        finish({
          ok: false,
          error: "Connection cancelled",
          cancelled: true,
        });
      }
    }, CLOSE_POLL_MS);

    window.addEventListener("message", onMessage);
  });
}
