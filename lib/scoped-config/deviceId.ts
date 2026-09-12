// lib/scoped-config/deviceId.ts
//
// The DEVICE rung's identity on the web (USD-9: precedence 110, below `user`).
//
// A desktop install has a real instance id (matrx-local's `app_instances`) and
// a kiosk has a paired device row. A browser has neither, so the web client
// mints ONE uuid per browser profile and keeps it in localStorage under a name
// that says exactly what it is. It is deliberately NOT a fingerprint: clearing
// site data forgets the device, which is the honest answer ("this browser" is
// gone). It never leaves the client except as `p_device_id` on the settings
// read and `scope_id` on a device-rung write.
//
// Named clearly so the next agent replacing it with a platform-issued device
// identity (the same one matrx-local and matrx-extend carry) can grep for it.

export const WEB_DEVICE_ID_STORAGE_KEY = "matrx.settings.web_device_id";

let memo: string | null = null;

/** The stable per-browser device id, or null when storage is unavailable (SSR, blocked). */
export function getWebDeviceId(): string | null {
  if (memo) return memo;
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(WEB_DEVICE_ID_STORAGE_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
      memo = existing;
      return existing;
    }
    const minted = crypto.randomUUID();
    window.localStorage.setItem(WEB_DEVICE_ID_STORAGE_KEY, minted);
    memo = minted;
    return minted;
  } catch {
    // Private mode / storage blocked: the device rung is simply not addressed.
    return null;
  }
}
